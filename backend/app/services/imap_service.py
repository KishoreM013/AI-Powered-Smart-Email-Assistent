import imaplib
import email
from email.header import decode_header
from email.utils import parsedate_to_datetime
import time
import re
import html
from typing import List, Dict, Any, Optional
from app.models.schemas import EmailItem, CategoryEnum, PriorityEnum, EmailSummary, ActionItem, AttachmentInfo
from app.database.db import db
from app.services.gemini_service import gemini_service

class IMAPService:
    def __init__(self):
        self.host = "imap.gmail.com"
        self.port = 993

    def decode_mime_header(self, header_val: str) -> str:
        if not header_val:
            return ""
        decoded_parts = decode_header(header_val)
        result = []
        for content, encoding in decoded_parts:
            if isinstance(content, bytes):
                try:
                    result.append(content.decode(encoding or "utf-8", errors="ignore"))
                except Exception:
                    result.append(content.decode("latin1", errors="ignore"))
            else:
                result.append(str(content))
        return "".join(result)

    def clean_html(self, raw_html: str) -> str:
        if not raw_html:
            return ""
        # Strip style/script blocks
        clean = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', raw_html, flags=re.DOTALL | re.IGNORECASE)
        # Strip HTML tags
        clean = re.sub(r'<[^>]+>', ' ', clean)
        clean = html.unescape(clean)
        # Collapse whitespace
        clean = re.sub(r'\s+', ' ', clean).strip()
        return clean

    async def fetch_real_emails_via_imap(
        self,
        user_email: str,
        app_password: str,
        folder_name: str = "INBOX",
        max_emails: int = 30
    ) -> Dict[str, Any]:
        clean_email = user_email.strip().lower()
        clean_password = app_password.replace(" ", "").strip()

        try:
            # Connect to Gmail IMAP SSL
            mail = imaplib.IMAP4_SSL(self.host, self.port)
            mail.login(clean_email, clean_password)
        except Exception as e:
            err_msg = str(e)
            if "AUTHENTICATIONFAILED" in err_msg or "Invalid credentials" in err_msg:
                raise Exception("Authentication failed. Please verify your Gmail address and 16-character App Password.")
            raise Exception(f"Failed to connect to Gmail IMAP: {err_msg}")

        try:
            status, _ = mail.select(folder_name)
            if status != "OK":
                mail.select("INBOX")

            # Search ALL messages
            status, data = mail.search(None, "ALL")
            if status != "OK" or not data or not data[0]:
                mail.logout()
                return {"status": "success", "synced_count": 0, "message": "No messages found in folder."}

            msg_ids = data[0].split()
            # Fetch latest max_emails
            latest_ids = msg_ids[-max_emails:]
            latest_ids.reverse()

            added_count = 0
            # Clear old mock/generated emails for this user before saving real emails
            db.clear_fake_emails_for_user(clean_email)

            for msg_id in latest_ids:
                status, msg_data = mail.fetch(msg_id, "(RFC822)")
                if status != "OK" or not msg_data:
                    continue

                raw_msg = None
                for response_part in msg_data:
                    if isinstance(response_part, tuple) and len(response_part) > 1:
                        raw_msg = response_part[1]
                        break

                if not raw_msg:
                    continue

                msg = email.message_from_bytes(raw_msg)
                
                subject_raw = msg.get("Subject", "(No Subject)")
                subject = self.decode_mime_header(subject_raw) or "(No Subject)"

                from_raw = msg.get("From", "Unknown Sender")
                from_decoded = self.decode_mime_header(from_raw)

                sender_name = from_decoded
                sender_email = from_decoded
                if "<" in from_decoded and ">" in from_decoded:
                    parts = from_decoded.split("<")
                    sender_name = parts[0].strip(' "\'')
                    sender_email = parts[1].replace(">", "").strip()
                if not sender_name:
                    sender_name = sender_email.split("@")[0].capitalize()

                date_raw = msg.get("Date", "")
                try:
                    dt = parsedate_to_datetime(date_raw)
                    date_str = dt.strftime("%b %d, %H:%M")
                    ts = dt.timestamp()
                except Exception:
                    date_str = time.strftime("%b %d, %H:%M")
                    ts = time.time()

                body_text = ""
                body_html = ""
                attachments = []

                if msg.is_multipart():
                    for part in msg.walk():
                        content_type = part.get_content_type()
                        content_disposition = str(part.get("Content-Disposition", ""))
                        filename = part.get_filename()

                        if filename:
                            decoded_filename = self.decode_mime_header(filename)
                            size_bytes = len(part.get_payload(decode=True) or b"")
                            size_str = f"{round(size_bytes / 1024, 1)} KB" if size_bytes < 1048576 else f"{round(size_bytes / 1048576, 1)} MB"
                            attachments.append(AttachmentInfo(
                                id=f"att-{added_count}-{len(attachments)}",
                                filename=decoded_filename,
                                size=size_str,
                                content_type=content_type
                            ))
                        elif "attachment" in content_disposition:
                            continue
                        elif content_type == "text/plain" and not body_text:
                            payload = part.get_payload(decode=True)
                            if payload:
                                charset = part.get_content_charset() or "utf-8"
                                body_text = payload.decode(charset, errors="ignore")
                        elif content_type == "text/html" and not body_html:
                            payload = part.get_payload(decode=True)
                            if payload:
                                charset = part.get_content_charset() or "utf-8"
                                body_html = payload.decode(charset, errors="ignore")
                else:
                    payload = msg.get_payload(decode=True)
                    if payload:
                        charset = msg.get_content_charset() or "utf-8"
                        body_text = payload.decode(charset, errors="ignore")

                final_body = body_text.strip() if body_text.strip() else self.clean_html(body_html)
                if not final_body:
                    final_body = subject

                email_unique_id = f"em-real-imap-{clean_email}-{msg_id.decode()}"

                # Run Gemini AI Summarization & Classification
                analysis = await gemini_service.analyze_and_summarize_email(
                    subject=subject,
                    body=final_body[:2000],
                    sender=sender_name
                )

                cat_val = analysis.get("category", CategoryEnum.WORK)
                prio_val = analysis.get("priority", PriorityEnum.MEDIUM)

                email_item = EmailItem(
                    id=email_unique_id,
                    sender_name=sender_name,
                    sender_email=sender_email,
                    recipient_email=clean_email,
                    subject=subject,
                    snippet=final_body[:160] + ("..." if len(final_body) > 160 else ""),
                    body=final_body,
                    category=cat_val,
                    priority=prio_val,
                    date=date_str,
                    timestamp=ts,
                    is_read=True,
                    is_starred=prio_val == PriorityEnum.HIGH,
                    has_attachments=bool(attachments),
                    attachments=attachments,
                    summary=EmailSummary(
                        bullet_points=analysis.get("bullet_points", [subject]),
                        one_liner=analysis.get("one_liner", subject),
                        urgency_reason=analysis.get("urgency_reason"),
                        sentiment=analysis.get("sentiment", "Neutral"),
                        key_deadlines=analysis.get("deadlines", [])
                    ),
                    action_items=[
                        ActionItem(task=item.get("task", ""), due_date=item.get("due_date"))
                        for item in analysis.get("action_items", [])
                    ],
                    folder="inbox"
                )

                db.add_email(email_item)
                added_count += 1

            mail.logout()
            # Store credentials for user
            db.set_user_credentials(clean_email, {"imap_pass": clean_password, "type": "imap"})

            return {
                "status": "success",
                "synced_count": added_count,
                "message": f"Successfully connected to Gmail IMAP! Synced {added_count} real emails with AI analysis."
            }
        except Exception as e:
            try:
                mail.logout()
            except Exception:
                pass
            raise e

imap_service = IMAPService()
