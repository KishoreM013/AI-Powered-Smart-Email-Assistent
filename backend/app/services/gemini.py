import json
import logging
import re
from typing import Dict, Any, List
import google.generativeai as genai
from app.config import settings

logger = logging.getLogger("smart_email_assistant")

# Configure Gemini if key is provided
if not settings.is_demo and settings.GEMINI_API_KEY:
    try:
        genai.configure(api_key=settings.GEMINI_API_KEY)
    except Exception as e:
        logger.error(f"Error configuring Gemini API: {e}")

async def increment_analytics_counter(field: str):
    try:
        from app.database.connection import get_database
        db = get_database()
        await db["analytics"].update_one(
            {"_id": "api_usage"},
            {"$inc": {field: 1}},
            upsert=True
        )
    except Exception as e:
        logger.error(f"Failed to increment analytic counter: {e}")

async def analyze_email_ai(subject: str, body: str, sender: str) -> Dict[str, Any]:
    await increment_analytics_counter("gemini_calls")
    
    if settings.is_demo or not settings.GEMINI_API_KEY:
        return get_mock_analysis(subject, body, sender)

    prompt = f"""
    Analyze the following email from "{sender}" and provide a structured JSON response.
    
    Subject: {subject}
    Body:
    {body}

    Respond ONLY with a valid JSON object matching this schema (do not include markdown codeblocks or other text):
    {{
        "category": "Work | College | Personal | Finance | Shopping | Social | Promotions | Important | Spam",
        "category_score": 0.0 to 1.0,
        "priority": "High | Medium | Low",
        "priority_reason": "Brief explanation",
        "sentiment": "Positive | Negative | Neutral | Urgent | Happy | Angry | Complaint",
        "summary": {{
            "short_summary": "One sentence summary of the email",
            "key_points": ["Point 1", "Point 2", ...],
            "action_required": true/false,
            "deadlines": ["Detected date string or deadline detail", ...],
            "meetings": ["Detected meeting date/time or scheduled reminder", ...]
        }}
    }}
    """
    
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        response = model.generate_content(prompt)
        text = response.text.strip()
        
        # Clean JSON markdown if model includes it
        if text.startswith("```json"):
            text = text[7:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
        
        data = json.loads(text)
        return data
    except Exception as e:
        logger.error(f"Gemini API call failed: {e}. Using mock analysis.")
        return get_mock_analysis(subject, body, sender)

async def analyze_phishing_ai(subject: str, body: str, sender: str, language: str = "en") -> Dict[str, Any]:
    await increment_analytics_counter("gemini_calls")
    
    sender_lower = sender.lower()
    body_lower = body.lower()
    subj_lower = subject.lower()
    
    # 1. Domain/Keyword checks
    phishing_keywords = ["verify your account", "account suspended", "click here to login", "unusual sign-in activity", "urgent action required", "update payment details", "bank verification", "amaz0n", "paypa1", "g00gle"]
    matched_kws = [kw for kw in phishing_keywords if kw in body_lower or kw in subj_lower]
    
    suspicious_domains = ["amaz0n", "paypa1", "g00gle", "security-verify", "cash-rewards", "update-login", "bank-secure"]
    matched_suspicious_domain = any(dom in sender_lower for dom in suspicious_domains)
    
    status = "Safe"
    reason = "Email passed security signature checks." if language == "en" else "மின்னஞ்சல் பாதுகாப்பு சோதனைகளில் தேர்ச்சி பெற்றது."
    
    if matched_suspicious_domain or len(matched_kws) >= 2 or "suspend" in subj_lower:
        status = "Phishing"
        reason = "Uses a lookalike domain and creates urgent pressure to reveal credentials." if language == "en" else "போலி டொமைனைப் பயன்படுத்தி கணக்கு இடைநிறுத்த அச்சுறுத்தலை ஏற்படுத்துகிறது."
    elif len(matched_kws) == 1 or "verify" in body_lower or "login" in body_lower:
        status = "Suspicious"
        reason = "Contains account verification requests or external login links." if language == "en" else "கணக்கு சரிபார்ப்பு கோரிக்கை அல்லது வெளிப்புற உள்நுழைவு இணைப்புகளைக் கொண்டுள்ளது."

    if not settings.is_demo and settings.GEMINI_API_KEY:
        prompt = f"""
        Analyze this email for phishing/scam risk.
        Subject: {subject}
        Body: {body}
        Sender: {sender}
        Language for reason: {"Tamil" if language == "ta" else "English"}

        Respond ONLY in JSON format:
        {{
            "status": "Safe" | "Suspicious" | "Phishing",
            "reason": "Short one-line reason in {"Tamil" if language == "ta" else "English"}"
        }}
        """
        try:
            model = genai.GenerativeModel('gemini-1.5-flash')
            res = model.generate_content(prompt)
            txt = res.text.strip()
            if txt.startswith("```json"):
                txt = txt[7:]
            if txt.endswith("```"):
                txt = txt[:-3]
            data = json.loads(txt.strip())
            return data
        except Exception as e:
            logger.error(f"Gemini phishing analysis failed: {e}")

    return {
        "status": status,
        "reason": reason
    }

async def generate_smart_reply_ai(subject: str, body: str, sender: str, tone: str = "Professional", language: str = "en") -> str:
    await increment_analytics_counter("gemini_calls")
    
    if settings.is_demo or not settings.GEMINI_API_KEY:
        return get_mock_reply(subject, body, sender, tone, language)
        
    prompt = f"""
    Write a reply to the following email from "{sender}".
    Subject: {subject}
    Email body:
    {body}

    Tone: {tone} (Options: Professional, Friendly, Short)
    Language: {"Tamil" if language == "ta" else "English"}

    Keep it concise, helpful, and realistic. Return ONLY the body text of the reply in {"Tamil" if language == "ta" else "English"}.
    """
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        logger.error(f"Gemini reply generation failed: {e}. Using mock reply.")
        return get_mock_reply(subject, body, sender, tone, language)

async def check_is_spam_ai(subject: str, body: str, sender: str) -> Dict[str, Any]:
    await increment_analytics_counter("gemini_calls")
    
    # Spam list keywords check
    spam_keywords = ["lottery", "prize", "jackpot", "cash bonus", "wire money", "bitcoin double", "viagra", "replica watch"]
    matched_kws = [kw for kw in spam_keywords if kw in body.lower() or kw in subject.lower()]
    
    # Simple sender check
    sender_lower = sender.lower()
    suspicious_domains = ["@no-reply-security-verify", "@lottery-winner", "@cash-rewards", "@cheapdeals"]
    matched_suspicious = any(domain in sender_lower for domain in suspicious_domains)
    
    # AI trigger
    if not settings.is_demo and settings.GEMINI_API_KEY:
        prompt = f"""
        Determine if the following email is Spam. Return a JSON object with:
        {{
            "is_spam": true/false,
            "spam_score": 0.0 to 1.0,
            "reason": "Brief reason explaining spam keywords, scam style, or sender patterns"
        }}
        Subject: {subject}
        Body: {body}
        Sender: {sender}
        """
        try:
            model = genai.GenerativeModel('gemini-1.5-flash')
            res = model.generate_content(prompt)
            txt = res.text.strip()
            if txt.startswith("```json"):
                txt = txt[7:]
            if txt.endswith("```"):
                txt = txt[:-3]
            data = json.loads(txt.strip())
            
            # Combine AI & rule check
            if len(matched_kws) > 0 or matched_suspicious:
                data["is_spam"] = True
                data["spam_score"] = max(data["spam_score"], 0.85)
                data["matched_keywords"] = list(set(data.get("matched_keywords", []) + matched_kws))
            else:
                data["matched_keywords"] = []
                
            return data
        except Exception:
            pass
            
    # Default rule-based fallback
    is_spam = len(matched_kws) > 0 or matched_suspicious or "spam" in subject.lower() or "free cash" in body.lower()
    score = 0.95 if is_spam else (0.45 if "discount" in subject.lower() else 0.05)
    
    return {
        "is_spam": is_spam,
        "spam_score": score,
        "reason": "Flagged by spam keyword check or domain reputation filter." if is_spam else "Normal sender signature.",
        "matched_keywords": matched_kws
    }

def get_mock_analysis(subject: str, body: str, sender: str) -> Dict[str, Any]:
    # Custom simulation logic based on keywords
    subj_lower = subject.lower()
    body_lower = body.lower()
    
    category = "Personal"
    priority = "Low"
    priority_reason = "No urgent request detected."
    sentiment = "Neutral"
    action_required = False
    deadlines = []
    meetings = []
    points = ["Received email correspondence."]
    
    # Classify
    if "interview" in subj_lower or "job" in subj_lower or "offer" in subj_lower:
        category = "Work"
        priority = "High"
        priority_reason = "Contains interview scheduling or job offer detail."
        sentiment = "Positive"
        action_required = True
        deadlines = ["Confirm schedule by tomorrow"]
        meetings = ["Interview meeting requested"]
        points = ["Company reached out regarding application.", "Requires active confirmation of interview time slots."]
    elif "meeting" in subj_lower or "synch" in subj_lower or "discussion" in subj_lower:
        category = "Work"
        priority = "Medium"
        priority_reason = "Calendar coordination requested."
        sentiment = "Neutral"
        meetings = ["Synch scheduled this week"]
        points = ["Invitation to collaborative sync/meeting.", "Coordinate calendar availability."]
    elif "assignment" in subj_lower or "exam" in subj_lower or "homework" in subj_lower or "class" in subj_lower:
        category = "College"
        priority = "High"
        priority_reason = "Academic timeline & assignment deadlines detected."
        action_required = True
        deadlines = ["Friday at 11:59 PM"]
        points = ["New assignment posted in portal.", "Ensure submission before the deadline."]
    elif "invoice" in subj_lower or "payment" in subj_lower or "bill" in subj_lower or "receipt" in subj_lower:
        category = "Finance"
        priority = "High"
        priority_reason = "Pending financial payment or transaction warning."
        sentiment = "Urgent"
        action_required = True
        deadlines = ["Payment due within 3 days"]
        points = ["Invoice generated for review.", "Requires clearing pending balance."]
    elif "order" in subj_lower or "amazon" in subj_lower or "shipping" in subj_lower or "delivery" in subj_lower:
        category = "Shopping"
        priority = "Low"
        sentiment = "Positive"
        points = ["Package order confirmation.", "Tracking details included in description."]
    elif "sale" in subj_lower or "discount" in subj_lower or "off" in subj_lower or "promo" in subj_lower:
        category = "Promotions"
        priority = "Low"
        points = ["Promotional code and discount coupon details.", "Valid for limited time only."]
    elif "boss" in sender.lower() or "manager" in sender.lower() or "ceo" in sender.lower():
        category = "Work"
        priority = "High"
        priority_reason = "Email sent by critical organizational contact."
        sentiment = "Urgent"
        action_required = True
        points = ["Project direction review.", "Requires direct attention and reply."]
    
    # Generic extraction if lists empty
    if not points:
        points = [f"Brief description: {subject}"]

    return {
        "category": category,
        "category_score": 0.92,
        "priority": priority,
        "priority_reason": priority_reason,
        "sentiment": sentiment,
        "summary": {
            "short_summary": f"Discussion regarding {subject}.",
            "key_points": points,
            "action_required": action_required,
            "deadlines": deadlines,
            "meetings": meetings
        }
    }

def get_mock_reply(subject: str, body: str, sender: str, tone: str = "Professional", language: str = "en") -> str:
    sender_clean = sender.split('<')[0].strip()
    if language == "ta":
        if tone == "Professional":
            return f"வணக்கம் {sender_clean},\n\nஉங்கள் மின்னஞ்சல் கிடைத்தது. '{subject}' தொடர்பான விவரங்களை மதிப்பாய்வு செய்து விரைவில் தகுந்த பதில் அனுப்புகிறேன்.\n\nநன்றி,\nகரன்"
        elif tone == "Friendly":
            return f"வணக்கம்!\n\nதகவலுக்கு மிக்க நன்றி. நான் உடனடியாக இதைச் சரிபார்த்துவிட்டுப் பதில் அளிக்கிறேன். நல்ல நாளாக அமையட்டும்!\n\nஅன்புடன்,\nகரன்"
        elif tone == "Short":
            return "செய்தி கிடைத்தது, நன்றி. விரைவில் தொடர்பு கொள்கிறேன்."
        else:
            return f"வணக்கம் {sender_clean},\n\nஉங்கள் மின்னஞ்சல் '{subject}' கிடைத்தது. விவரங்களைச் சரிபார்த்து விரைவில் பதில் அனுப்புகிறேன்.\n\nநன்றி."
    else:
        if tone == "Professional":
            return f"Hi {sender_clean},\n\nThank you for reaching out. I have received your message regarding '{subject}' and will review the details. I will get back to you with a comprehensive response shortly.\n\nBest regards,\nKaran"
        elif tone == "Friendly":
            return f"Hi there!\n\nThanks for sending this over. I'll take a look at it right away and get back to you. Hope you have a great day!\n\nCheers,\nKaran"
        elif tone == "Short":
            return "Received, thank you. I'll follow up shortly."
        else:
            return f"Hi {sender_clean},\n\nThank you for your email regarding '{subject}'. I have noted the details and will follow up with you as soon as possible.\n\nBest regards,\nKaran"
