"""
Deterministic analysis used when the model is unavailable.

Design rule: everything here is *read* from the message. Nothing is invented.
A degraded run reports less detail rather than reporting fiction, which is the
opposite of what the `get_mock_analysis` placeholder this replaces used to do
(its "top senders" were hardcoded names that had nothing to do with the mail).

These rules are deliberately conservative. They are a floor, not a substitute
for the model.
"""

import re
from typing import Any, Dict, List, Optional

CATEGORY_VALUES = {
    "Work", "Personal", "Promotions", "Finance", "Updates", "Newsletter",
    "Important", "Meeting", "Invitation", "Spam", "Other",
}
TONE_VALUES = {"Professional", "Formal", "Friendly", "Angry", "Urgent", "Neutral"}
SENTIMENT_VALUES = {"Positive", "Neutral", "Urgent", "Frustrated"}

_STOPWORDS = {
    "the", "and", "for", "that", "this", "with", "you", "your", "our", "are", "was",
    "were", "have", "has", "had", "not", "but", "all", "can", "will", "would", "from",
    "they", "them", "their", "there", "here", "what", "when", "which", "who", "how",
    "been", "into", "out", "about", "just", "like", "some", "more", "than", "then",
    "also", "very", "much", "many", "any", "his", "her", "she", "him", "its",
}

# Order matters: the first match wins, so the more specific registers come
# first and a cheerful "urgent!" is not read as friendly.
_TONE_MARKERS = (
    ("Angry", ("unacceptable", "outrageous", "appalling", "furious",
               "disappointed", "frustrated", "fed up")),
    ("Urgent", ("urgent", "immediately", "asap", "right away", "final notice", "act now")),
    ("Friendly", ("hi there", "hope you're well", "thanks so much", "kind regards",
                  "talk soon", "cheers")),
    ("Formal", ("dear sir", "hereby", "kindly be advised", "we regret to inform",
                "pursuant to", "sincerely yours", "formal notice")),
    ("Professional", ("best regards", "please find", "thank you", "dear ", "hi ", "hello")),
)

_SPAM_MARKERS = (
    "verify your account", "account suspended", "click here to login",
    "update payment details", "wire transfer", "lottery", "you have won",
    "act now", "limited time offer", "unsubscribe here",
)
_URGENT_MARKERS = (
    "urgent", "asap", "critical", "deadline", "immediate", "emergency",
    "by today", "by tomorrow", "action required", "eod",
)


def _coerce(value, allowed, fallback: str) -> str:
    """Exact match against a known set, ignoring case and stray whitespace."""
    text = str(value or "").strip().title()
    return text if text in allowed else fallback


def _clamp(value, low: float = 0.0, high: float = 1.0) -> float:
    try:
        return max(low, min(high, float(value)))
    except (TypeError, ValueError):
        return low


def _str_list(value, limit: int = 8) -> List[str]:
    if not isinstance(value, list):
        return []
    out = []
    for item in value[:limit]:
        text = str(item).strip()
        if text:
            out.append(text)
    return out


def rule_tone(text: str) -> str:
    for tone, markers in _TONE_MARKERS:
        if any(marker in text for marker in markers):
            return tone
    return "Neutral"


def rule_keywords(text: str, limit: int = 6) -> List[str]:
    """Salient words by frequency, after stopwords."""
    counts: Dict[str, int] = {}
    for word in re.findall(r"[A-Za-z][A-Za-z'-]{3,}", text):
        key = word if word[0].isupper() else word.lower()
        if key.lower() in _STOPWORDS:
            continue
        counts[key] = counts.get(key, 0) + 1
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    repeated = [w for w, c in ranked[:limit] if c > 1]
    return repeated or [w for w, _ in ranked[:limit]]


def rule_people(body: str, sender: str) -> List[Dict[str, Any]]:
    """Names from the signature block and salutation lines."""
    people: List[Dict[str, Any]] = []
    if sender:
        head = re.split(r"[<(]", sender.strip())[0].strip(" \"'")
        if len(head) > 1:
            people.append({"name": head, "role": None, "email": None})
    pattern = (r"\b(?:hi|hello|dear|thanks|thank you|regards)[,\s]+"
               r"([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)")
    for match in re.finditer(pattern, body):
        name = match.group(1)
        if name.lower() in {"all", "there", "team"}:
            continue
        if any(p["name"] == name for p in people):
            continue
        people.append({"name": name, "role": None, "email": None})
        if len(people) >= 6:
            break
    return people


def rule_deadlines(text: str) -> List[str]:
    return [m.strip() for m in re.findall(
        r"(by\s+[a-z]+\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|eod|noon|cutover|end of day)",
        text,
    )][:3]


def rule_dates(text: str) -> List[str]:
    return [m.strip() for m in re.findall(
        r"((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}"
        r"|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b"
        r"|(?:mon|tues|wednes|thurs|fri|satur|sun)day)",
        text,
    )][:5]


def rule_action_items(body: str, deadlines: List[str]) -> List[Dict[str, Any]]:
    verbs = ("please review", "let me know", "kindly sign", "kindly verify",
             "please confirm", "please send", "please attend", "action required")
    items: List[Dict[str, Any]] = []
    for line in (l.strip() for l in body.split("\n")):
        if len(line) < 12:
            continue
        if any(v in line.lower() for v in verbs):
            task = re.sub(r"^(hi|hello|dear|please|kindly)[,\s]+", "", line, flags=re.I)[:100]
            items.append({"task": task, "due_date": deadlines[0] if deadlines else None})
        if len(items) >= 3:
            break
    return items


def _classify(text: str, sender_l: str):
    """Return (category, priority, sentiment) from keyword rules."""
    if (any(m in text for m in _SPAM_MARKERS)
            or ".xyz" in sender_l or "amaz0n" in sender_l):
        return "Spam", "High", "Urgent"
    if any(k in text for k in ("invoice", "receipt", "billing", "payment",
                               "subscription", "usd", "eur", "$")):
        return "Finance", "Medium", "Neutral"
    if any(k in text for k in ("newsletter", "digest", "roundup", "weekly recap", "unsubscribe")):
        return "Newsletter", "Low", "Positive"
    if any(k in text for k in ("github", "pull request", "ci/cd", "deployed",
                               "build status", "notification")):
        return "Updates", "Low", "Neutral"
    if any(k in text for k in ("sale", "discount", "offer", "coupon", "% off", "deal of the day")):
        return "Promotions", "Low", "Positive"
    if any(k in text for k in ("you're invited", "you are invited", "rsvp",
                               "save the date", "webinar", "you're welcome")):
        return "Invitation", "Medium", "Positive"
    if any(k in text for k in ("schedule a call", "let's meet", "lets meet",
                               "calendar invite", "meeting on", "zoom", "google meet",
                               "are you free", "book a time")):
        return "Meeting", "Medium", "Neutral"
    if any(k in text for k in ("family", "mom", "dad", "weekend", "dinner", "vacation")):
        return "Personal", "Medium", "Positive"
    if any(k in text for k in ("attorney", "legal notice", "court", "diagnosis",
                               "hospital", "tax return", "medical")):
        return "Important", "High", "Urgent"
    return "Work", "Medium", "Neutral"


def local_analysis(subject: str, body: str, sender: str) -> Dict[str, Any]:
    """Classify and extract without a model. Reports only what the text says."""
    text = f"{subject} {body}".lower()
    sender_l = (sender or "").lower()

    category, priority, sentiment = _classify(text, sender_l)
    if priority != "High" and any(k in text for k in _URGENT_MARKERS):
        priority = "High"

    deadlines = rule_deadlines(text)
    dates = rule_dates(text)
    people = rule_people(body, sender)
    action_items = rule_action_items(body, deadlines)

    meeting: Optional[Dict[str, Any]] = None
    if category in {"Meeting", "Invitation"}:
        meeting = {
            "is_meeting": category == "Meeting",
            "title": (subject[:80] or None),
            "date": dates[0] if dates else None,
            "time": None,
            "location": None,
            "platform": next((p for p in ("zoom", "google meet", "teams", "webex")
                              if p in text), None),
            "attendees": [p["name"] for p in people[:6]],
        }

    lines = [l.strip() for l in body.split("\n") if len(l.strip()) > 10][:3]
    one_liner = f"{subject} -- {lines[0][:90]}" if lines else subject

    return {
        "category": category,
        "category_score": 0.5,
        "priority": priority,
        "priority_reason": "Derived from keyword rules; the model was unavailable.",
        "sentiment": sentiment,
        "tone": rule_tone(text),
        "one_liner": one_liner,
        "bullet_points": lines or [subject],
        "urgency_reason": None,
        "deadlines": deadlines,
        "dates": dates,
        "people": people,
        "meeting": meeting,
        "action_items": action_items,
        "keywords": rule_keywords(f"{subject} {body}"),
        "requires_reply": bool(re.search(r"\?|could you|can you|confirm|let me know", text)),
        "importance_score": 0.8 if priority == "High" else (0.5 if priority == "Medium" else 0.2),
    }


def normalise_analysis(data: Dict[str, Any], subject: str) -> Dict[str, Any]:
    """Coerce a model response into the exact shape the app stores.

    Models drift. A missing or oddly-typed field is normal, not exceptional, so
    every field is validated here rather than trusted further downstream.
    """
    data = data if isinstance(data, dict) else {}
    summary = data.get("summary") if isinstance(data.get("summary"), dict) else {}

    people: List[Dict[str, Any]] = []
    for entry in (data.get("people") or [])[:10]:
        if isinstance(entry, dict):
            name = str(entry.get("name") or "").strip()
            role = str(entry.get("role") or "").strip() or None
            mail = str(entry.get("email") or "").strip() or None
        else:
            name, role, mail = str(entry or "").strip(), None, None
        if name:
            people.append({"name": name, "role": role, "email": mail})

    meeting = None
    raw_meeting = data.get("meeting")
    if isinstance(raw_meeting, dict):
        meeting = {
            "is_meeting": bool(raw_meeting.get("is_meeting")),
            "title": str(raw_meeting.get("title") or "").strip() or None,
            "date": str(raw_meeting.get("date") or "").strip() or None,
            "time": str(raw_meeting.get("time") or "").strip() or None,
            "location": str(raw_meeting.get("location") or "").strip() or None,
            "platform": str(raw_meeting.get("platform") or "").strip() or None,
            "attendees": _str_list(raw_meeting.get("attendees"), 20),
        }
        # Drop a meeting carrying no detail, so the UI does not render an
        # empty "Meeting" panel for a message that has no meeting.
        if not any(meeting[k] for k in ("title", "date", "time", "location", "platform")):
            meeting = None

    action_items = [
        {
            "task": str(i.get("task")).strip(),
            "due_date": str(i.get("due_date") or "").strip() or None,
        }
        for i in (data.get("action_items") or [])
        if isinstance(i, dict) and str(i.get("task") or "").strip()
    ][:5]

    return {
        "category": _coerce(data.get("category"), CATEGORY_VALUES, "Other"),
        "category_score": _clamp(data.get("category_score")),
        "priority": _coerce(data.get("priority"), {"High", "Medium", "Low"}, "Medium"),
        "priority_reason": str(data.get("priority_reason") or "").strip() or None,
        "sentiment": _coerce(data.get("sentiment"), SENTIMENT_VALUES, "Neutral"),
        "tone": _coerce(data.get("tone"), TONE_VALUES, "Neutral"),
        "one_liner": str(data.get("one_liner") or summary.get("short_summary")
                         or subject).strip(),
        "bullet_points": _str_list(data.get("bullet_points")
                                   or summary.get("key_points"), 3) or [subject],
        "urgency_reason": str(data.get("urgency_reason") or "").strip() or None,
        "deadlines": _str_list(data.get("deadlines") or summary.get("deadlines"), 5),
        "dates": _str_list(data.get("dates"), 6),
        "people": people,
        "meeting": meeting,
        "action_items": action_items,
        "keywords": _str_list(data.get("important_keywords") or data.get("keywords"), 8),
        "requires_reply": bool(data.get("requires_reply")
                               or summary.get("action_required")),
        "importance_score": _clamp(data.get("importance_score")),
    }
