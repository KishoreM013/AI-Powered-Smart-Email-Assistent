import logging
import base64
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, status
from pydantic import BaseModel
from app.config import settings
from app.auth.jwt import get_current_user_token
from app.database.connection import get_database
from app.services.gmail import fetch_emails_from_gmail, send_gmail_reply, generate_mock_emails, get_gmail_service
from app.services.gemini import analyze_email_ai, generate_smart_reply_ai, check_is_spam_ai
from app.services.ocr import extract_and_summarize_attachment

logger = logging.getLogger("smart_email_assistant")
router = APIRouter(prefix="/api/emails", tags=["emails"])

class ReplyRequest(BaseModel):
    reply_body: str

class ScheduleReplyRequest(BaseModel):
    recipient: str
    subject: str
    reply_body: str
    tone: str
    send_at: str # ISO timestamp or custom shortcut

# 1. Sync Emails Endpoint
@router.post("/sync")
async def sync_emails(current_user: dict = Depends(get_current_user_token)):
    db = get_database()
    user_email = current_user["email"]
    
    # Check if user details exist
    user_record = await db["users"].find_one({"email": user_email})
    
    sync_source_emails = []
    
    # Determine Sync Engine: Real Gmail vs Mock Demo
    if settings.is_demo or not user_record or "gmail_credentials" not in user_record or not user_record["gmail_credentials"]:
        logger.info(f"Running mock sync for user {user_email}")
        sync_source_emails = generate_mock_emails(user_email)
    else:
        logger.info(f"Running Gmail API sync for user {user_email}")
        sync_source_emails = await fetch_emails_from_gmail(user_email, user_record["gmail_credentials"])
        # Increment analytics api counter
        await db["analytics"].update_one(
            {"_id": "api_usage"},
            {"$inc": {"gmail_calls": len(sync_source_emails) or 1}},
            upsert=True
        )


    # Check and remove deleted/trashed emails from local database
    if not (settings.is_demo or not user_record or "gmail_credentials" not in user_record or not user_record["gmail_credentials"]):
        if sync_source_emails:
            try:
                from googleapiclient.errors import HttpError
                service = get_gmail_service(user_record["gmail_credentials"])
                if service:
                    dates = [email["date"] for email in sync_source_emails if isinstance(email.get("date"), datetime)]
                    if dates:
                        oldest_fetched_date = min(dates)
                        local_emails = await db["emails"].find({
                            "user_email": user_email,
                            "date": {"$gte": oldest_fetched_date}
                        }).to_list(1000)
                        
                        fetched_ids = {email["_id"] for email in sync_source_emails}
                        
                        for local_email in local_emails:
                            email_id = local_email["_id"]
                            if email_id not in fetched_ids:
                                try:
                                    msg = service.users().messages().get(userId='me', id=email_id, format='minimal').execute()
                                    label_ids = msg.get("labelIds", [])
                                    if "TRASH" in label_ids or "SPAM" in label_ids:
                                        logger.info(f"Email {email_id} is in TRASH/SPAM on Gmail. Deleting locally.")
                                        await db["emails"].delete_one({"_id": email_id})
                                except HttpError as he:
                                    if he.resp.status == 404:
                                        logger.info(f"Email {email_id} not found on Gmail. Deleting locally.")
                                        await db["emails"].delete_one({"_id": email_id})
                                    else:
                                        logger.error(f"Error checking message {email_id} status: {he}")
                                except Exception as ex:
                                    logger.error(f"Error checking message {email_id} status: {ex}")
            except Exception as e:
                logger.error(f"Error checking for deleted emails: {e}")

    synced_count = 0
    new_notifications = []

    for email_data in sync_source_emails:
        email_id = email_data["_id"]
        
        # Check if already synced
        exists = await db["emails"].find_one({"_id": email_id})
        if exists:
            continue
            
        # Perform AI analysis on new email
        subject = email_data["subject"]
        body = email_data["body_full"]
        sender = email_data["sender_email"]
        
        # 1. Check Spam
        spam_res = await check_is_spam_ai(subject, body, sender)
        
        if spam_res["is_spam"]:
            email_data["category"] = "Spam"
            email_data["category_score"] = spam_res["spam_score"]
            email_data["priority"] = "Low"
            
            # Log Spam Details
            spam_log = {
                "user_email": user_email,
                "email_id": email_id,
                "sender_email": sender,
                "subject": subject,
                "spam_score": spam_res["spam_score"],
                "matched_keywords": spam_res.get("matched_keywords", []),
                "action_taken": "moved_to_spam",
                "logged_at": datetime.now(timezone.utc)
            }
            await db["spam_logs"].insert_one(spam_log)
            await db["analytics"].update_one(
                {"_id": "api_usage"},
                {"$inc": {"error_count": 1}}, # simple metric increase
                upsert=True
            )
        else:
            # 2. Run AI Categorizer & Priorities
            ai_meta = await analyze_email_ai(subject, body, sender)
            email_data["category"] = ai_meta.get("category", "Updates")
            email_data["category_score"] = ai_meta.get("category_score", 0.9)
            email_data["priority"] = ai_meta.get("priority", "Low")
            email_data["priority_reason"] = ai_meta.get("priority_reason")
            email_data["sentiment"] = ai_meta.get("sentiment", "Neutral")
            
            # Save AI summary block
            sum_data = ai_meta.get("summary", {})
            email_data["ai_analysis"] = {
                "short_summary": sum_data.get("short_summary", "No summary generated."),
                "key_points": sum_data.get("key_points", []),
                "action_required": sum_data.get("action_required", False),
                "deadlines": sum_data.get("deadlines", []),
                "meetings": sum_data.get("meetings", [])
            }

            critical_contacts = ["boss@company.com"]
            if user_record and user_record.get("settings"):
                critical_contacts = user_record["settings"].get("critical_contacts") or ["boss@company.com"]
            is_boss = sender in critical_contacts
            is_urgent = email_data["priority"] == "High" or email_data["sentiment"] == "Urgent"
            
            if is_boss:
                new_notifications.append({
                    "user_email": user_email,
                    "email_id": email_id,
                    "type": "boss",
                    "title": "Critical Mail from Boss",
                    "message": f"New email from critical contact '{sender}': {subject}",
                    "is_read": False,
                    "created_at": datetime.now(timezone.utc)
                })
            elif is_urgent:
                new_notifications.append({
                    "user_email": user_email,
                    "email_id": email_id,
                    "type": "urgent",
                    "title": "Urgent Email Arrived",
                    "message": f"AI flagged urgent subject: '{subject}'",
                    "is_read": False,
                    "created_at": datetime.now(timezone.utc)
                })
                
            # Meeting and deadline notifications
            if sum_data.get("meetings"):
                new_notifications.append({
                    "user_email": user_email,
                    "email_id": email_id,
                    "type": "meeting",
                    "title": "Meeting Scheduled / Requested",
                    "message": f"Meeting event details extracted: '{', '.join(sum_data['meetings'])}'",
                    "is_read": False,
                    "created_at": datetime.now(timezone.utc)
                })
            if sum_data.get("deadlines"):
                new_notifications.append({
                    "user_email": user_email,
                    "email_id": email_id,
                    "type": "deadline",
                    "title": "Deadline Approaching",
                    "message": f"Calendar deadline extracted: '{', '.join(sum_data['deadlines'])}'",
                    "is_read": False,
                    "created_at": datetime.now(timezone.utc)
                })

        # Save email to database
        await db["emails"].insert_one(email_data)
        synced_count += 1

    # Insert notifications
    if new_notifications:
        for notif in new_notifications:
            await db["notifications"].insert_one(notif)

    return {"status": "success", "synced": synced_count, "notifications_triggered": len(new_notifications)}

# 2. List Emails Endpoint
@router.get("")
async def list_emails(
    category: Optional[str] = None,
    priority: Optional[str] = None,
    is_read: Optional[bool] = None,
    search: Optional[str] = None,
    limit: int = 50,
    current_user: dict = Depends(get_current_user_token)
):
    db = get_database()
    user_email = current_user["email"]
    
    query = {"user_email": user_email}
    if category:
        query["category"] = category
    if priority:
        query["priority"] = priority
    if is_read is not None:
        query["is_read"] = is_read
        
    if search:
        # Match standard title or content search
        query["$or"] = [
            {"subject": {"$regex": search, "$options": "i"}},
            {"sender_name": {"$regex": search, "$options": "i"}},
            {"sender_email": {"$regex": search, "$options": "i"}},
            {"body_full": {"$regex": search, "$options": "i"}}
        ]
        
    cursor = db["emails"].find(query, sort=[("date", -1)])
    emails = await cursor.to_list(limit)
    return emails

# 3. Smart Natural Language Search Endpoint
@router.get("/search")
async def smart_search(
    q: str = Query(..., description="Natural language search query"),
    current_user: dict = Depends(get_current_user_token)
):
    db = get_database()
    user_email = current_user["email"]
    
    # Process queries using a rule parser
    query = {"user_email": user_email}
    q_lower = q.lower()
    
    # Check simple rules
    if "from hr" in q_lower or "emails from hr" in q_lower:
        query["$or"] = [
            {"sender_email": {"$regex": "hr@", "$options": "i"}},
            {"sender_name": {"$regex": "hr", "$options": "i"}}
        ]
    elif "interview" in q_lower:
        query["$or"] = [
            {"subject": {"$regex": "interview", "$options": "i"}},
            {"body_full": {"$regex": "interview", "$options": "i"}}
        ]
    elif "amazon" in q_lower or "orders" in q_lower:
        query["$or"] = [
            {"sender_email": {"$regex": "amazon", "$options": "i"}},
            {"subject": {"$regex": "order", "$options": "i"}}
        ]
    elif "meeting" in q_lower or "schedule" in q_lower:
        query["category"] = "Work"
        query["$or"] = [
            {"subject": {"$regex": "meeting", "$options": "i"}},
            {"subject": {"$regex": "sync", "$options": "i"}},
            {"ai_analysis.meetings": {"$ne": []}}
        ]
    elif "deadline" in q_lower or "due" in q_lower:
        query["$or"] = [
            {"subject": {"$regex": "deadline", "$options": "i"}},
            {"subject": {"$regex": "due", "$options": "i"}},
            {"ai_analysis.deadlines": {"$ne": []}}
        ]
    else:
        # Fallback to general keyword
        query["$or"] = [
            {"subject": {"$regex": q, "$options": "i"}},
            {"body_full": {"$regex": q, "$options": "i"}},
            {"sender_name": {"$regex": q, "$options": "i"}}
        ]
        
    cursor = db["emails"].find(query, sort=[("date", -1)])
    emails = await cursor.to_list(20)
    return emails

# 4. Email Detail Endpoint
@router.get("/{email_id}")
async def get_email_details(email_id: str, current_user: dict = Depends(get_current_user_token)):
    db = get_database()
    user_email = current_user["email"]
    
    email = await db["emails"].find_one({"_id": email_id, "user_email": user_email})
    if not email:
        raise HTTPException(status_code=404, detail="Email not found.")
        
    # Mark email as read upon fetching details
    if not email.get("is_read", False):
        await db["emails"].update_one({"_id": email_id}, {"$set": {"is_read": True}})
        email["is_read"] = True
        
    return email

# 5. Extract OCR attachment details
@router.post("/{email_id}/attachments/{attachment_id}/ocr")
async def perform_ocr_on_attachment(
    email_id: str,
    attachment_id: str,
    current_user: dict = Depends(get_current_user_token)
):
    db = get_database()
    user_email = current_user["email"]
    
    email = await db["emails"].find_one({"_id": email_id, "user_email": user_email})
    if not email:
        raise HTTPException(status_code=404, detail="Email not found.")
        
    # Find matching attachment reference
    attachments = email.get("attachments", [])
    matching_att = None
    for index, att in enumerate(attachments):
        if att.get("id") == attachment_id:
            matching_att = att
            matching_index = index
            break
            
    if not matching_att:
        raise HTTPException(status_code=404, detail="Attachment reference not found in email.")
        
    # If text is already extracted, return it directly
    if matching_att.get("text_content") and matching_att.get("summary"):
        return matching_att

    # Load file contents (Mock download in Demo, otherwise we download using Gmail attachment API)
    file_bytes = b""
    filename = matching_att["filename"]
    content_type = matching_att["content_type"]
    
    user_record = await db["users"].find_one({"email": user_email})
    if not settings.is_demo and user_record and "gmail_credentials" in user_record:
        # Download from Gmail API
        try:
            service = get_gmail_service(user_record["gmail_credentials"])
            res = service.users().messages().attachments().get(
                userId='me', messageId=email_id, id=attachment_id
            ).execute()
            data = res.get("data")
            if data:
                file_bytes = base64.urlsafe_b64decode(data.encode('UTF-8'))
        except Exception as e:
            logger.error(f"Failed to download attachment {filename} from Gmail: {e}")
            
    # Process OCR
    ocr_res = await extract_and_summarize_attachment(file_bytes, filename, content_type)
    
    # Update Email document in MongoDB
    attachments[matching_index]["text_content"] = ocr_res["text_content"]
    attachments[matching_index]["summary"] = ocr_res["summary"]
    
    await db["emails"].update_one(
        {"_id": email_id},
        {"$set": {"attachments": attachments}}
    )
    
    await db["analytics"].update_one(
        {"_id": "api_usage"},
        {"$inc": {"ocr_calls": 1}},
        upsert=True
    )
    
    return attachments[matching_index]

# 6. Generate AI Smart Reply
@router.get("/{email_id}/suggest-reply")
async def suggest_reply(
    email_id: str,
    tone: str = "Professional",
    language: str = "en",
    current_user: dict = Depends(get_current_user_token)
):
    db = get_database()
    user_email = current_user["email"]
    
    email = await db["emails"].find_one({"_id": email_id, "user_email": user_email})
    if not email:
        raise HTTPException(status_code=404, detail="Email not found.")
        
    reply_body = await generate_smart_reply_ai(
        email.get("subject", ""),
        email.get("body_full", email.get("preview", "")),
        email.get("sender_email", ""),
        tone,
        language
    )
    
    return {"reply_body": reply_body, "tone": tone, "language": language}

# 6b. Phishing Detection Check Endpoint
@router.get("/{email_id}/phishing-check")
async def check_phishing(
    email_id: str,
    language: str = "en",
    current_user: dict = Depends(get_current_user_token)
):
    from app.services.gemini import analyze_phishing_ai
    db = get_database()
    user_email = current_user["email"]
    
    email = await db["emails"].find_one({"_id": email_id, "user_email": user_email})
    if not email:
        # Fallback for demo emails
        return {
            "status": "Suspicious" if "amaz0n" in email_id or "security" in email_id else "Safe",
            "reason": "Uses a lookalike domain and urgent credentials request." if language == "en" else "போலி டொமைனைப் பயன்படுத்தி அவசர சான்றுகள் கோருகிறது."
        }
        
    res = await analyze_phishing_ai(
        email.get("subject", ""),
        email.get("body_full", email.get("preview", "")),
        email.get("sender_email", ""),
        language
    )
    return res

# 7. Send Immediate Reply
@router.post("/{email_id}/reply")
async def reply_to_email(
    email_id: str,
    req: ReplyRequest,
    current_user: dict = Depends(get_current_user_token)
):
    db = get_database()
    user_email = current_user["email"]
    
    email = await db["emails"].find_one({"_id": email_id, "user_email": user_email})
    if not email:
        raise HTTPException(status_code=404, detail="Email not found.")
        
    user_record = await db["users"].find_one({"email": user_email})
    
    # Send using real Gmail API or Mock
    if not settings.is_demo and user_record and "gmail_credentials" in user_record:
        try:
            await send_gmail_reply(
                user_record["gmail_credentials"],
                email["thread_id"],
                email["sender_email"],
                email["subject"],
                req.reply_body
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to send email reply: {str(e)}")
            
    # Record reply in DB
    await db["replies"].insert_one({
        "email_id": email_id,
        "user_email": user_email,
        "recipient": email["sender_email"],
        "subject": email["subject"],
        "body": req.reply_body,
        "sent_at": datetime.now(timezone.utc)
    })
    
    # Mark Email as replied
    await db["emails"].update_one(
        {"_id": email_id},
        {"$set": {"is_replied": True}, "$inc": {"replies_count": 1}}
    )
    
    return {"status": "success", "message": "Reply sent successfully!"}

# 8. Schedule Reply
@router.post("/{email_id}/schedule-reply")
async def schedule_reply(
    email_id: str,
    req: ScheduleReplyRequest,
    current_user: dict = Depends(get_current_user_token)
):
    db = get_database()
    user_email = current_user["email"]
    
    # Parse date
    try:
        send_at_dt = datetime.fromisoformat(req.send_at.replace("Z", "+00:00"))
    except ValueError:
        # Resolve shortcut strings: "tomorrow", "next_week"
        now = datetime.now(timezone.utc)
        if req.send_at == "tomorrow":
            send_at_dt = now + timedelta(days=1)
        elif req.send_at == "next_week":
            send_at_dt = now + timedelta(weeks=1)
        else:
            raise HTTPException(status_code=400, detail="Invalid date format or scheduling shortcut.")

    # Record reply schedule task
    task = {
        "email_id": email_id,
        "user_email": user_email,
        "recipient": req.recipient,
        "subject": req.subject,
        "reply_body": req.reply_body,
        "tone": req.tone,
        "send_at": send_at_dt,
        "status": "Pending",
        "created_at": datetime.now(timezone.utc)
    }
    
    await db["scheduled_replies"].insert_one(task)
    return {"status": "success", "message": f"Email scheduled successfully for {send_at_dt.isoformat()}"}

# 9. Perform Actions: Delete, Move to Spam, Archive
@router.post("/{email_id}/action")
async def perform_email_action(
    email_id: str,
    action: str = Query(..., description="Action: delete, spam, archive"),
    current_user: dict = Depends(get_current_user_token)
):
    db = get_database()
    user_email = current_user["email"]
    
    email = await db["emails"].find_one({"_id": email_id, "user_email": user_email})
    if not email:
        raise HTTPException(status_code=404, detail="Email not found.")
        
    user_record = await db["users"].find_one({"email": user_email})
    
    # Real Gmail client operations
    if not settings.is_demo and user_record and "gmail_credentials" in user_record:
        try:
            service = get_gmail_service(user_record["gmail_credentials"])
            if action == "delete":
                service.users().messages().trash(userId='me', id=email_id).execute()
            elif action == "spam":
                service.users().messages().batchModify(
                    userId='me',
                    body={"ids": [email_id], "addLabelIds": ["SPAM"], "removeLabelIds": ["INBOX"]}
                ).execute()
            elif action == "archive":
                service.users().messages().batchModify(
                    userId='me',
                    body={"ids": [email_id], "removeLabelIds": ["INBOX"]}
                ).execute()
        except Exception as e:
            logger.error(f"Gmail action failed: {e}")
            
    # Synchronize database state
    if action == "delete":
        await db["emails"].delete_one({"_id": email_id})
    elif action == "spam":
        await db["emails"].update_one({"_id": email_id}, {"$set": {"category": "Spam", "priority": "Low"}})
    elif action == "archive":
        # Keep in database but toggle out of inbox (could toggle a field or filter)
        await db["emails"].update_one({"_id": email_id}, {"$set": {"category": "Archive"}})
        
    return {"status": "success", "message": f"Email action '{action}' completed successfully."}
