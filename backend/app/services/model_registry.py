"""
Single source of truth for which Gemini model to call.

The model name was previously hardcoded in six places as 'gemini-1.5-flash',
which Google retired. Every AI feature then failed with a 404 and silently
fell back to the local rule engine, so the app looked like it was working
while doing nothing intelligent.

One place to change it, and a probe so a bad name is obvious at startup rather
than swallowed by a try/except.
"""

import logging
import os

logger = logging.getLogger("smart_email_assistant")

# gemini-1.5-flash and gemini-2.5-flash are both retired; gemini-3-flash-preview
# is the stable choice for this project.
DEFAULT_MODEL = "gemini-3-flash-preview"

# Tried in order when the configured model is unavailable, so a rename on
# Google's side degrades to a working model instead of no model.
FALLBACK_MODELS = ("gemini-3-flash-preview", "gemini-flash-latest")


def model_name() -> str:
    """The configured model, or the default when unset or blank."""
    for candidate in (
        os.getenv("GEMINI_MODEL", "").strip(),
        DEFAULT_MODEL,
    ):
        if candidate:
            return candidate
    return DEFAULT_MODEL


def build_model():
    """Return a GenerativeModel on the first name that loads, or None.

    None means no usable model, and the caller should use the local rules
    rather than pretending an AI answer came back.
    """
    try:
        import google.generativeai as genai
    except Exception as exc:  # pragma: no cover - dependency missing
        logger.warning("google-generativeai unavailable: %s", exc)
        return None

    wanted = model_name()
    order = [wanted] + [m for m in FALLBACK_MODELS if m != wanted]
    last = None
    for name in order:
        try:
            return genai.GenerativeModel(name)
        except Exception as exc:
            last = exc
            logger.warning("Gemini model %r unavailable: %s", name, exc)
    logger.error("No usable Gemini model (last error: %s)", last)
    return None
