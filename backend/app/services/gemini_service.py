import os
import json
import re
import asyncio
from typing import Dict, Any, List, Optional
from app.models.schemas import EmailSummary, ActionItem, CategoryEnum, PriorityEnum
from app.config import settings

try:
    import google.generativeai as genai
    HAS_GENAI = True
except ImportError:
    HAS_GENAI = False

class GeminiAIService:
    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY
        self.model = None
        self._init_model()

    def _init_model(self):
        if HAS_GENAI and self.api_key and len(self.api_key.strip()) > 5:
            try:
                genai.configure(api_key=self.api_key.strip())
                self.model = genai.GenerativeModel("gemini-1.5-flash")
            except Exception as e:
                print(f"[GeminiAIService] Error initializing Gemini API: {e}")
                self.model = None

    def update_api_key(self, new_key: str):
        self.api_key = new_key
        self._init_model()

    def _sync_generate_analysis(self, prompt: str) -> str:
        response = self.model.generate_content(prompt)
        return response.text

    async def analyze_and_summarize_email(self, subject: str, body: str, sender: str = "") -> Dict[str, Any]:
        """Analyzes an email to extract summary, action items, category, priority, and sentiment with max 2.5s latency."""
        if self.model and self.api_key and not self.api_key.startswith("mock") and len(self.api_key.strip()) > 15:
            try:
                prompt = f"""You are an elite AI Executive Email Assistant. Analyze the following incoming email and output ONLY valid JSON matching this schema:
{{
  "category": "Work" | "Finance" | "Personal" | "Promotions" | "Updates" | "Newsletter" | "Spam",
  "priority": "High" | "Medium" | "Low",
  "urgency_reason": "brief reason for priority",
  "sentiment": "Urgent" | "Positive" | "Neutral" | "Frustrated",
  "one_liner": "A 1-sentence executive summary",
  "bullet_points": ["bullet 1", "bullet 2", "bullet 3"],
  "deadlines": ["string list of detected deadlines or meeting times"],
  "action_items": [
    {{"task": "specific task description", "due_date": "date or null", "is_meeting": false, "meeting_time": "time or null"}}
  ]
}}

Sender: {sender}
Subject: {subject}
Body:
{body}
"""
                # Run with strict 2.5 second timeout for rapid action speed
                raw_text = await asyncio.wait_for(
                    asyncio.to_thread(self._sync_generate_analysis, prompt),
                    timeout=2.5
                )
                clean_json = raw_text.replace("```json", "").replace("```", "").strip()
                parsed = json.loads(clean_json)
                return parsed
            except Exception as ex:
                print(f"[GeminiAIService] Gemini API call timeout/fallback to smart fast NLP: {ex}")

        # Intelligent High-Speed NLP Engine (<2ms response)
        return self._nlp_rule_engine(subject, body, sender)


    def _nlp_rule_engine(self, subject: str, body: str, sender: str) -> Dict[str, Any]:
        text = f"{subject} {body}".lower()
        
        # 1. Determine Spam / Phishing
        spam_keywords = ["unauthorized access", "permanently deleted", "click here immediately", "verify your account", "winner", "lottery", "crypto profit", "wire money", "nigerian prince"]
        if any(kw in text for kw in spam_keywords) or ".xyz" in sender.lower() or "suspicious" in text:
            return {
                "category": "Spam",
                "priority": "High",
                "urgency_reason": "Detected phishing / spam pattern with coercive language or untrusted domain.",
                "sentiment": "Urgent",
                "one_liner": "Suspicious email flagged as phishing or unwanted spam.",
                "bullet_points": [
                    "Potentially deceptive links or security threats detected.",
                    "Isolated into Spam folder to protect credentials."
                ],
                "deadlines": [],
                "action_items": []
            }

        # 2. Determine Category
        category = "Work"
        if any(k in text for k in ["invoice", "receipt", "billing", "payment", "subscription", "$", "usd", "eur"]):
            category = "Finance"
        elif any(k in text for k in ["newsletter", "daily brew", "digest", "roundup", "weekly recap"]):
            category = "Newsletter"
        elif any(k in text for k in ["github", "pr", "pull request", "build status", "ci/cd", "deployed", "notification"]):
            category = "Updates"
        elif any(k in text for k in ["sale", "discount", "offer", "coupon", "limited time"]):
            category = "Promotions"
        elif any(k in text for k in ["family", "mom", "dad", "weekend", "dinner", "vacation"]):
            category = "Personal"

        # 3. Determine Priority & Deadlines
        priority = "Medium"
        urgency_reason = "Standard inbox communication."
        sentiment = "Neutral"
        
        high_urgency_kw = ["urgent", "asap", "critical", "deadline", "immediate", "emergency", "by today", "by tomorrow", "cutover", "migration"]
        if any(k in text for k in high_urgency_kw) or "vp" in sender.lower() or "lead" in sender.lower():
            priority = "High"
            urgency_reason = "Contains urgent operational deadlines or executive communication."
            sentiment = "Urgent"
        elif category in ["Newsletter", "Promotions", "Updates"]:
            priority = "Low"
            urgency_reason = "Informational update or newsletter."
            sentiment = "Positive"

        # 4. Extract action items & deadlines
        action_items = []
        deadlines = []
        
        # Regex search for common deadline patterns
        time_matches = re.findall(r"(by\s+[A-Za-z]+\s+\d+(?::\d+)?\s*(?:am|pm|est|pst|ist)?|on\s+[A-Za-z]+\s+at\s+\d+(?::\d+)?\s*(?:am|pm)?|before\s+[A-Za-z]+)", text)
        for tm in time_matches[:3]:
            deadlines.append(tm.capitalize())

        lines = [l.strip() for l in body.split("\n") if l.strip() and len(l.strip()) > 10]
        for line in lines:
            if any(verb in line.lower() for verb in ["please review", "let me know", "sign", "verify", "sync", "attend", "confirm", "complete"]):
                cleaned_task = re.sub(r"^(hi|hello|please|kindly|could you)\s*", "", line, flags=re.IGNORECASE).strip()
                if len(cleaned_task) > 100:
                    cleaned_task = cleaned_task[:97] + "..."
                is_meet = "meet" in line.lower() or "call" in line.lower() or "session" in line.lower()
                action_items.append({
                    "task": cleaned_task.capitalize(),
                    "due_date": deadlines[0] if deadlines else None,
                    "is_meeting": is_meet,
                    "meeting_time": deadlines[0] if is_meet and deadlines else None
                })
                if len(action_items) >= 3:
                    break

        # If no explicit action items found, synthesize one
        if not action_items and priority == "High":
            action_items.append({
                "task": f"Review and respond to: {subject}",
                "due_date": "Today",
                "is_meeting": False,
                "meeting_time": None
            })

        # Generate bullet points
        bullets = []
        if lines:
            bullets.append(lines[0])
        if len(lines) > 1:
            bullets.append(lines[1])
        if len(lines) > 2 and len(bullets) < 3:
            bullets.append(lines[2])
        if not bullets:
            bullets = [subject]

        one_liner = f"{subject} - {bullets[0][:80]}..."

        return {
            "category": category,
            "priority": priority,
            "urgency_reason": urgency_reason,
            "sentiment": sentiment,
            "one_liner": one_liner,
            "bullet_points": bullets[:3],
            "deadlines": deadlines,
            "action_items": action_items
        }

    async def generate_smart_reply(
        self,
        subject: str,
        body: str,
        sender_name: str,
        tone: str = "Professional",
        custom_instructions: Optional[str] = None,
        user_name: Optional[str] = None
    ) -> Dict[str, str]:
        """Generates contextual AI email reply based on tone and intent."""
        my_name = user_name or "User"
        # If Gemini model is active with real API key
        if self.model and self.api_key and not self.api_key.startswith("mock") and len(self.api_key.strip()) > 15:
            try:
                prompt = f"""You are an AI Smart Email Assistant. Draft an email reply with the tone: '{tone}'.
Sender: {sender_name}
Subject: {subject}
Received Email Body:
{body}

Additional user instruction: {custom_instructions or 'None'}

Rules:
- Write in a natural, polished human manner.
- Be concise and actionable.
- Sign off cleanly with Best regards, {my_name}.
- Output ONLY the body text of the reply.
"""
                raw_text = await asyncio.wait_for(
                    asyncio.to_thread(self._sync_generate_analysis, prompt),
                    timeout=2.5
                )
                return {
                    "reply_text": raw_text.strip(),
                    "tone": tone,
                    "suggested_subject": f"Re: {subject.replace('Re: ', '')}"
                }
            except Exception as e:
                print(f"[GeminiAIService] Gemini reply timeout/error fallback to template: {e}")


        # Intelligent Tone-based Template Engine
        salutation = f"Hi {sender_name.split()[0]}," if sender_name else "Hi,"
        suggested_subject = f"Re: {subject.replace('Re: ', '')}"
        
        custom_clause = f"\n\nRegarding your note: {custom_instructions}" if custom_instructions else ""

        if tone.lower() == "friendly":
            reply_text = f"""{salutation}

Thanks so much for reaching out and sharing this update!

I've gone through the details and everything looks great on my end. I will make sure we stay aligned on these points and keep you posted on our progress.{custom_clause}

Let's catch up soon if anything else pops up!

Best regards,
{my_name}"""

        elif tone.lower() == "direct" or tone.lower() == "formal":
            reply_text = f"""{salutation}

I have received your message regarding '{subject}'.

I have reviewed the requirements and confirmed the timeline. All scheduled checkpoints and deliverables are currently on track.{custom_clause}

I will share the finalized update as soon as the next phase completes.

Sincerely,
{my_name}"""

        elif "decline" in tone.lower():
            reply_text = f"""{salutation}

Thank you for the invitation and for thinking of me regarding this initiative.

Unfortunately, due to current high-priority commitments and upcoming deployment schedules, I will not be able to take this on at this time.{custom_clause}

I appreciate your understanding and hope we can collaborate on future cycles.

Warm regards,
{my_name}"""

        elif "urgent" in tone.lower():
            reply_text = f"""{salutation}

Acknowledged with highest priority.

I am immediately looking into this and verifying the staging/production parameters right now. I will provide a status report within the next 30 minutes.{custom_clause}

Thanks,
{my_name}"""

        else: # Default Professional
            reply_text = f"""{salutation}

Thank you for sending over this information.

I have reviewed the email details and action items. Everything is clear, and I am proceeding with the necessary preparations according to the discussed schedule.{custom_clause}

Please let me know if you need any additional documentation or sign-offs.

Best regards,
{my_name}"""

        return {
            "reply_text": reply_text.strip(),
            "tone": tone,
            "suggested_subject": suggested_subject
        }

gemini_service = GeminiAIService()
