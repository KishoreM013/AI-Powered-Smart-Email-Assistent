"""Process-local secret storage for third-party mail credentials.

Gmail App Passwords are full-mailbox credentials. They used to be parked in a
plain dict on the database singleton, which meant any code path (or a future
persistence layer) could read them in the clear. They are now held here,
encrypted at rest with a key derived from JWT_SECRET, and the object refuses
to be serialised.

This store is intentionally in-process and non-durable: restarting the service
requires the user to re-authenticate. That is the correct trade-off for a
single-user mail client -- durability of a plaintext password is not worth it.
"""

import base64
import hashlib
import threading
from typing import Dict, Optional

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _fernet() -> Fernet:
    # Derive a stable 32-byte key from the configured JWT secret.
    digest = hashlib.sha256(settings.JWT_SECRET.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


class SecretStore:
    """Thread-safe, non-serialisable holder for per-user mail credentials."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._entries: Dict[str, Dict[str, str]] = {}
        self._cipher = _fernet()

    # -- core API ------------------------------------------------------------
    def set(self, user_email: str, payload: Dict[str, str]) -> None:
        """Store credentials for a user, encrypting every value."""
        key = _norm(user_email)
        if not key or not payload:
            return
        encrypted = {k: self._cipher.encrypt(str(v).encode("utf-8")).decode("utf-8")
                     for k, v in payload.items() if v}
        with self._lock:
            self._entries[key] = encrypted

    def get(self, user_email: str) -> Optional[Dict[str, str]]:
        """Return the decrypted credentials for a user, or None."""
        key = _norm(user_email)
        with self._lock:
            stored = self._entries.get(key)
            if not stored:
                return None
            snapshot = dict(stored)

        out: Dict[str, str] = {}
        for name, blob in snapshot.items():
            try:
                out[name] = self._cipher.decrypt(blob.encode("utf-8")).decode("utf-8")
            except (InvalidToken, ValueError):
                # Key rotated or entry corrupted -- treat as absent.
                continue
        return out or None

    def get_field(self, user_email: str, name: str) -> Optional[str]:
        creds = self.get(user_email)
        return creds.get(name) if creds else None

    def clear(self, user_email: str) -> None:
        with self._lock:
            self._entries.pop(_norm(user_email), None)

    def has(self, user_email: str) -> bool:
        with self._lock:
            return _norm(user_email) in self._entries

    # -- safety --------------------------------------------------------------
    def __getstate__(self):
        """Refuse pickling so secrets cannot leak via cache or task queue."""
        raise TypeError("SecretStore is not serialisable")

    def __repr__(self) -> str:  # pragma: no cover - defensive
        return f"<SecretStore users={len(self._entries)}>"


def _norm(email: str) -> str:
    return (email or "").strip().lower()


secrets_store = SecretStore()
