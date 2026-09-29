"""Learns the account owner's writing style from their sent replies.

How it works
------------
There is no fine-tuning here, and none is needed. The user's own past replies
are the few-shot examples: a small, directly-quoted sample of how they
actually write is far more reliable instruction than describing their style in
adjectives.

The profile is a cheap statistical summary of that corpus, used to (a) pick
representative examples and (b) give the model explicit guidance about length,
greeting, sign-off and language.

Design constraints
------------------
* **Local by default.** Most signals are simple statistics, computed without
  any API call, so the profile is available even with no Gemini key.
* **Honest about sample size.** A profile built from two replies is not a style;
  it is noise. ``ready`` stays false until there is enough material, and the
  caller is expected to say so rather than pretend.
* **Opt-in.** Nothing is inferred from incoming mail, only from mail the user
  actually sent. Incoming text is the other party's writing, not theirs.
"""

import logging
import re
from collections import Counter
from typing import Any, Dict, List, Optional

from app.models.schemas import StyleProfile

logger = logging.getLogger("smart_email_assistant")

# Below this, the corpus is too small to describe as a style.
MIN_SAMPLES_FOR_STYLE = 5

_GREETINGS = ("hi", "hello", "hey", "dear", "good morning", "good afternoon", "good evening")
_SIGNOFFS = (
    "best regards", "kind regards", "warm regards", "regards", "thanks", "thank you",
    "cheers", "best", "sincerely", "yours", "talk soon", "all the best", "br",
    "thanks and regards", "many thanks", "appreciate it",
)
_FORMAL_MARKERS = (
    "dear", "sincerely", "hereby", "pursuant", "kindly", "further to", "with respect to",
    "i would like to", "we regret", "please do not hesitate", "yours faithfully",
)
_CASUAL_MARKERS = (
    "hey", "cool", "sure thing", "no worries", "sounds good", "yeah", "btw", "fyi",
    "🙂", "😊", "👍", "cheers", "ta", "gotcha", "ping me", "speak soon",
)

_TAMILI = re.compile(r"[\u0b80-\u0bff]")


class StyleLearner:
    def __init__(self, storage, user_email: str):
        self._storage = storage
        self._user = user_email

    # -------------------------------------------------------------- building
    def _bodies(self) -> List[str]:
        """The user's sent reply bodies, newest first."""
        replies = self._storage.list_sent_replies(self._user, limit=200)
        return [r["body"] for r in replies if (r.get("body") or "").strip()]

    def build_profile(self) -> StyleProfile:
        """Compute a style profile from the user's sent replies."""
        bodies = self._bodies()

        if not bodies:
            return StyleProfile()

        word_counts = [len(b.split()) for b in bodies]
        avg_words = round(sum(word_counts) / len(word_counts), 1)

        greeting = self._most_common_opener(bodies)
        sign_off = self._most_common_closer(bodies)

        formality_markers = sum(
            1 for b in bodies
            if any(m in b.lower() for m in _FORMAL_MARKERS)
        )
        casual_markers = sum(
            1 for b in bodies
            if any(m in b.lower() for m in _CASUAL_MARKERS)
        )
        total = len(bodies)
        # 0.5 is neutral; the markers pull in either direction.
        formality = max(0.0, min(1.0, 0.5 + (formality_markers - casual_markers) / (2 * total)))

        sentences = [s for b in bodies for s in re.split(r"[.!?]+\s", b) if s.strip()]
        avg_sentence = round(
            sum(len(s.split()) for s in sentences) / len(sentences), 1
        ) if sentences else 0.0

        tamili_share = sum(1 for b in bodies if _TAMILI.search(b)) / total

        return StyleProfile(
            reply_count=total,
            average_words=avg_words,
            formality=round(formality, 2),
            greeting=greeting,
            sign_off=sign_off,
            uses_emoji=any(re.search(r"[\U0001F300-\U0001FAFF\u2600-\u27BF]", b) for b in bodies),
            uses_bullets=sum(1 for b in bodies if re.search(r"^\s*[-*\u2022]\s", b, re.M)) > total / 2,
            average_sentence_length=avg_sentence,
            common_phrases=self._common_phrases(bodies),
            language="ta" if tamili_share > 0.5 else "en",
            ready=total >= MIN_SAMPLES_FOR_STYLE,
        )

    @staticmethod
    def _most_common_opener(bodies: List[str]) -> Optional[str]:
        found = Counter()
        for body in bodies:
            first = body.strip().split("\n", 1)[0].lower().strip()
            for greeting in _GREETINGS:
                if first.startswith(greeting):
                    found[greeting] += 1
                    break
        return found.most_common(1)[0][0] if found else None

    @staticmethod
    def _most_common_closer(bodies: List[str]) -> Optional[str]:
        """Find the sign-off in the final lines of a message.

        A real email ends with the sign-off *followed by* the sender's name, so
        matching the last few lines is what works. Inspecting the character
        tail would only ever find a bare name.
        """
        found = Counter()
        for body in bodies:
            lines = [ln.strip().lower().strip(",.") for ln in body.strip().split("\n") if ln.strip()]
            for line in reversed(lines[-2:]):
                matched = False
                for sign_off in _SIGNOFFS:
                    if (line == sign_off
                            or line.startswith(sign_off + " ")
                            or line.endswith(" " + sign_off)):
                        found[sign_off] += 1
                        matched = True
                        break
                if matched:
                    break
        return found.most_common(1)[0][0] if found else None

    @staticmethod
    def _common_phrases(bodies: List[str], limit: int = 4) -> List[str]:
        """Recurring 3-word sequences -- a decent proxy for stock phrasing."""
        counts: Counter = Counter()
        for body in bodies:
            words = re.findall(r"[a-zA-Z']+", body.lower())
            for i in range(len(words) - 2):
                counts[tuple(words[i:i + 3])] += 1
        repeated = [(tuple_, c) for tuple_, c in counts.items() if c >= 2]
        repeated.sort(key=lambda kv: (-kv[1], kv[0]))
        return [" ".join(t) for t, _ in repeated[:limit]]

    # ------------------------------------------------------------- examples
    def representative_examples(self, limit: int = 3) -> List[str]:
        """Pick short, complete replies to quote back as style examples.

        Very long or very short samples skew the model, so the median-ish
        middle of the corpus is preferred.
        """
        bodies = [
            b.strip() for b in self._bodies()
            if 20 <= len(b.strip()) <= 1200
        ]
        if not bodies:
            return []
        bodies.sort(key=len)
        middle = len(bodies) // 2
        # Take a spread rather than three near-identical lengths.
        step = max(1, len(bodies) // max(limit, 1))
        picked = [bodies[(middle + i * step) % len(bodies)] for i in range(limit)]
        # De-duplicate while preserving order.
        seen, unique = set(), []
        for body in picked:
            if body not in seen:
                seen.add(body)
                unique.append(body)
        return unique[:limit]

    # --------------------------------------------------------------- prompt
    def guidance(self, profile: StyleProfile, examples: List[str]) -> str:
        """Render the learned style as explicit instructions for the model."""
        if not profile.ready:
            return ""

        lines = ["Write in the user's own established voice. Follow these observations:"]

        if examples:
            lines.append("")
            lines.append("Examples of how this user actually writes:")
            for i, example in enumerate(examples, 1):
                lines.append(f"--- example {i} ---")
                lines.append(example.strip())
            lines.append("--- end of examples ---")
            lines.append("")

        lines.append(f"- Typical length: about {profile.average_words:.0f} words "
                     f"(average sentence {profile.average_sentence_length:.0f} words).")
        if profile.greeting:
            lines.append(f"- They usually open with '{profile.greeting.title()}'.")
        if profile.sign_off:
            lines.append(f"- They usually close with '{profile.sign_off.title()}'.")
        formality = profile.formality
        if formality >= 0.7:
            lines.append("- Their register is formal and measured. Avoid slang.")
        elif formality <= 0.3:
            lines.append("- Their register is casual and relaxed. Avoid stiff language.")
        else:
            lines.append("- Their register is neutral-professional.")
        if profile.uses_emoji:
            lines.append("- They use emoji occasionally; one or two is fine.")
        else:
            lines.append("- They do not use emoji. Do not add any.")
        if profile.uses_bullets:
            lines.append("- They structure longer replies as bullet points.")
        if profile.common_phrases:
            joined = "; ".join(f'"{p}"' for p in profile.common_phrases)
            lines.append(f"- They habitually use phrases like: {joined}.")
        if profile.language == "ta":
            lines.append("- They write in Tamil. Reply in Tamil.")

        lines.append("")
        lines.append("Keep the content correct and relevant; only the voice should match.")
        return "\n".join(lines)

    def style_notes(self, profile: StyleProfile) -> List[str]:
        """Short human-readable summary for the UI."""
        if not profile.ready:
            needed = max(0, MIN_SAMPLES_FOR_STYLE - profile.reply_count)
            return [f"Send {needed} more reply{'' if needed == 1 else 's'} to personalise drafts."]
        notes = [f"Learned from {profile.reply_count} sent replies",
                 f"Average length ~{profile.average_words:.0f} words"]
        if profile.greeting:
            notes.append(f"Opens with \"{profile.greeting.title()}\"")
        if profile.sign_off:
            notes.append(f"Signs off \"{profile.sign_off.title()}\"")
        notes.append("Formal" if profile.formality >= 0.7 else
                     ("Casual" if profile.formality <= 0.3 else "Neutral-professional"))
        if profile.language == "ta":
            notes.append("Writes in Tamil")
        return notes

    def describe(self) -> Dict[str, Any]:
        profile = self.build_profile()
        return profile.model_dump()
