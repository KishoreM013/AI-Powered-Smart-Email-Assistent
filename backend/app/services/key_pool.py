"""A rotating pool of Gemini API keys with per-key cooldown.

Why this exists
---------------
Gemini enforces quota per Google Cloud *project*, not per key. Rotating between
several keys from the same project therefore gains nothing -- they all draw on
one bucket. Rotation only helps when the keys belong to different projects (or
different accounts on the free tier), where each has its own quota.

This pool does not pretend otherwise: it tracks which key is serving traffic and
how often each one is rate-limited, so the effect is observable.

Behaviour on a transient failure
--------------------------------
A key that returns 429/503 is put into a cooldown window and the next attempt
uses a different key. This is meaningfully better than hammering one key, which
just burns the quota window faster.
"""

import logging
import threading
import time
from typing import List, Optional

logger = logging.getLogger("smart_email_assistant")

# How long a key sits out after a rate-limit response. Short: the quota window
# is on the order of a minute.
DEFAULT_COOLDOWN_SECONDS = 45.0
# A non-transient failure (invalid key, billing disabled) will not self-heal, so
# the key is quarantined for effectively the rest of the process lifetime.
PERMANENT_COOLDOWN_SECONDS = 3600.0
# Give up rotating after this many distinct keys.
MAX_KEY_ATTEMPTS = 4


class KeyPool:
    """Thread-safe round-robin pool with cooldown on transient failures."""

    def __init__(self, keys: List[str], cooldown: float = DEFAULT_COOLDOWN_SECONDS):
        self._keys = [k.strip() for k in keys if k and k.strip()]
        self._cooldown = cooldown
        self._lock = threading.Lock()
        self._cursor = 0
        # key -> unix timestamp when it may be used again
        self._blocked_until: dict[str, float] = {}
        # key -> counters, for observability
        self._stats: dict[str, dict[str, int]] = {
            k: {"success": 0, "limited": 0, "failed": 0} for k in self._keys
        }

    # ------------------------------------------------------------------ core
    @property
    def keys(self) -> List[str]:
        """The configured keys, in rotation order."""
        return list(self._keys)

    def __len__(self) -> int:
        return len(self._keys)

    def acquire(self) -> Optional[str]:
        """Return the next usable key, or None when every key is cooling down."""
        with self._lock:
            now = time.monotonic()
            total = len(self._keys)
            for offset in range(min(total, MAX_KEY_ATTEMPTS)):
                index = (self._cursor + offset) % total
                key = self._keys[index]
                if self._blocked_until.get(key, 0.0) <= now:
                    self._cursor = (index + 1) % total
                    return key
            return None

    def report(self, key: str, outcome: str) -> None:
        """Record the result of a call: 'success' | 'limited' | 'failed'.

        ``limited`` means a quota/availability problem, which clears on its own
        after a short cooldown. ``failed`` means a permanent problem such as an
        invalid key or disabled billing, so the key is quarantined long-term
        rather than retried on every request.
        """
        with self._lock:
            stats = self._stats.setdefault(key, {"success": 0, "limited": 0, "failed": 0})
            stats[outcome] = stats.get(outcome, 0) + 1
            label = _label(self._keys.index(key) if key in self._keys else -1, key)

            if outcome == "limited":
                self._blocked_until[key] = time.monotonic() + self._cooldown
                logger.info(
                    "Gemini key %s is rate limited; cooling down for %.0fs. Trying another key.",
                    label, self._cooldown,
                )
            elif outcome == "failed":
                self._blocked_until[key] = time.monotonic() + PERMANENT_COOLDOWN_SECONDS
                logger.error(
                    "Gemini key %s failed permanently and has been disabled for this "
                    "session. Check the key, its project, and billing. %d failure(s) so far.",
                    label, stats["failed"],
                )

    def unblock_all(self) -> None:
        with self._lock:
            self._blocked_until.clear()

    # ------------------------------------------------------------ telemetry
    def snapshot(self) -> List[dict]:
        """Per-key usage, labelled by position. Never exposes key material."""
        with self._lock:
            now = time.monotonic()
            out = []
            for index, key in enumerate(self._keys):
                stats = self._stats.get(key, {})
                remaining = max(0.0, self._blocked_until.get(key, 0.0) - now)
                out.append({
                    "index": index,
                    "label": _label(index, key),
                    "success": stats.get("success", 0),
                    "limited": stats.get("limited", 0),
                    "failed": stats.get("failed", 0),
                    "cooling_down": round(remaining, 1),
                    # Distinguish a short rate-limit pause from a dead key.
                    "disabled": remaining > PERMANENT_COOLDOWN_SECONDS / 2,
                })
            return out

    def summary(self) -> dict:
        snap = self.snapshot()
        return {
            "key_count": len(snap),
            "usable_now": sum(1 for s in snap if not s["disabled"] and s["cooling_down"] == 0),
            "disabled": sum(1 for s in snap if s["disabled"]),
            "total_success": sum(s["success"] for s in snap),
            "total_rate_limited": sum(s["limited"] for s in snap),
            "keys": snap,
        }

    def __repr__(self) -> str:  # pragma: no cover - defensive
        return f"<KeyPool keys={len(self._keys)}>"


def _label(index: int, key: str) -> str:
    """A safe identifier: pool position plus at most the last 4 characters."""
    if len(key) <= 4:
        return f"key{index}"
    return f"key{index} (…{key[-4:]})"


def build_pool(raw: str, cooldown: float = DEFAULT_COOLDOWN_SECONDS) -> KeyPool:
    """Build a pool from a comma-separated list of keys.

    Tolerates a single key, a JSON array, or blank/placeholder entries.
    """
    text = (raw or "").strip()
    if not text:
        return KeyPool([], cooldown)

    if text.startswith("["):
        import json
        try:
            text = ",".join(json.loads(text))
        except (ValueError, TypeError):
            pass

    keys: List[str] = []
    seen = set()
    for part in text.split(","):
        candidate = part.strip()
        # Placeholder values are filtered out centrally by the service; skip
        # obvious duplicates here so they do not consume pool slots.
        if candidate and candidate not in seen:
            seen.add(candidate)
            keys.append(candidate)
    return KeyPool(keys, cooldown)
