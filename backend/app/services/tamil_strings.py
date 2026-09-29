"""
Tamil strings used by the AI reply generator.

Kept in their own module for two reasons. The reply templates stay readable,
and the literals live in one place that can be checked at a glance rather
than buried in escape sequences inside a function.

The English path is the default; these are used when the interface is set to
Tamil.
"""

GREETING = "வணக்கம்"          # vanakkam - hello
CLOSER = "நன்றி"              # nanri - thank you
BODY_TEMPLATE = "'{subject}' பற்றிய உங்கள் மின்னஞ்சலைப் பெற்றுள்ளேன். விவரங்களை மதிப்பாய்வு செய்து விரைவில் பதிலளிப்பேன்."
SHORT_BODY_TEMPLATE = "'{subject}' பற்றி இப்போது பார்க்கிறேன், விரைவில் உறுதிப்படுத்துகிறேன்."
FRIENDLY_BODY = "தொடர்புபடுத்தியதற்கு நன்றி, இதைப் பார்த்துள்ளேன், எனக்கு இது சரியாகப் படிக்கிறது."
PHRASING_HINT = "Write the reply in Tamil."

# Shown in the UI, so a reader can tell what the model was asked for.
EXTRACTION_LABELS = {
    "people": "பெயர்கள்",
    "dates": "தேதிகள்",
    "deadlines": "காலகட்டு",
    "meeting": "கூட்ட விவரங்கள்",
    "tasks": "செயல்கள்",
    "keywords": "முக்கிய வார்த்தைகள்",
    "tone": "நடம்",
    "phishing": "பாதுகாப்பு எச்சரிக்கை",
}
