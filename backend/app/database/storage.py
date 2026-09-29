"""Durable storage for analysed emails, sent replies, and learned style.

Why SQLite
-----------
The previous store was a plain dict, so every analysed email vanished on
restart. "Review previously analysed emails" is a stated requirement, and
personalised replies need a corpus of the owner's sent mail to learn from --
neither is possible without persistence.

``sqlite3`` ships with Python, so this adds no dependency. A single file holds
the whole database, which is easy to back up and easy to delete.

Concurrency
------------
SQLite connections are not thread-safe, and FastAPI runs handlers on a thread
pool. One connection guarded by a lock is adequate here: writes are small and
the workload is a single user's mailbox. WAL mode keeps readers from blocking
the writer.

Ownership
---------
Every row carries ``user_email`` and every query filters on it. This is the
same isolation guarantee the in-memory store had, and it is enforced in the SQL
rather than in Python.
"""

import json
import logging
import os
import sqlite3
import threading
import time
import uuid
from typing import Any, Dict, List, Optional

logger = logging.getLogger("smart_email_assistant")

DEFAULT_DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data",
    "smart_email.db",
)

# Locally-composed folders that a server sync must not resurrect or delete.
_LOCAL_FOLDERS = ("sent", "drafts", "trash")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS emails (
    id            TEXT NOT NULL,
    user_email    TEXT NOT NULL,
    folder        TEXT NOT NULL DEFAULT 'inbox',
    category      TEXT NOT NULL DEFAULT 'Work',
    priority      TEXT NOT NULL DEFAULT 'Medium',
    tone          TEXT NOT NULL DEFAULT 'Neutral',
    sender_email  TEXT NOT NULL DEFAULT '',
    sender_name   TEXT NOT NULL DEFAULT '',
    subject       TEXT NOT NULL DEFAULT '',
    snippet       TEXT NOT NULL DEFAULT '',
    body          TEXT NOT NULL DEFAULT '',
    timestamp     REAL NOT NULL DEFAULT 0,
    is_read       INTEGER NOT NULL DEFAULT 0,
    is_starred    INTEGER NOT NULL DEFAULT 0,
    is_spam       INTEGER NOT NULL DEFAULT 0,
    is_trash      INTEGER NOT NULL DEFAULT 0,
    has_attachments INTEGER NOT NULL DEFAULT 0,
    importance    REAL NOT NULL DEFAULT 0,
    data          TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (id, user_email)
);

CREATE INDEX IF NOT EXISTS idx_emails_user_folder ON emails(user_email, folder);
CREATE INDEX IF NOT EXISTS idx_emails_user_time   ON emails(user_email, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_emails_user_cat    ON emails(user_email, category);
CREATE INDEX IF NOT EXISTS idx_emails_user_prio   ON emails(user_email, priority);

-- A pasted-in email is kept for reference and is not overwritten by a sync.
CREATE TABLE IF NOT EXISTS manual_emails (
    id          TEXT NOT NULL,
    user_email  TEXT NOT NULL,
    created_at  REAL NOT NULL,
    subject     TEXT NOT NULL DEFAULT '',
    sender      TEXT NOT NULL DEFAULT '',
    data        TEXT NOT NULL,
    PRIMARY KEY (id, user_email)
);

-- The owner's own outgoing mail: the corpus for style learning.
CREATE TABLE IF NOT EXISTS replies (
    id          TEXT NOT NULL,
    user_email  TEXT NOT NULL,
    recipient   TEXT NOT NULL DEFAULT '',
    subject     TEXT NOT NULL DEFAULT '',
    body        TEXT NOT NULL DEFAULT '',
    sent        INTEGER NOT NULL DEFAULT 1,
    created_at  REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_replies_user ON replies(user_email, created_at DESC);
"""


class Storage:
    def __init__(self, path: Optional[str] = None):
        self._path = path or os.environ.get("STORAGE_PATH") or DEFAULT_DB_PATH
        directory = os.path.dirname(self._path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(self._path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
            self._conn.executescript(_SCHEMA)
            self._conn.commit()
        # The database can contain full email bodies; keep it owner-only.
        try:
            os.chmod(self._path, 0o600)
        except OSError:  # pragma: no cover - platform dependent
            pass
        logger.info("Storage ready at %s", self._path)

    # ------------------------------------------------------------- utilities
    @staticmethod
    def _norm(email: Optional[str]) -> str:
        return (email or "").strip().lower()

    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        doc = dict(row)
        raw = doc.pop("data", "{}")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            logger.warning("Corrupt payload for email %s; skipping", doc.get("id"))
            payload = {}
        payload.update({k: doc[k] for k in ("id", "user_email", "folder") if k in doc})
        return payload

    # ---------------------------------------------------------------- emails
    def upsert_email(self, email) -> None:
        """Insert or replace one message, keyed by (id, user_email)."""
        payload = email.model_dump(mode="json")
        summary = payload.get("summary") or {}
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO emails (id, user_email, folder, category, priority, tone,
                    sender_email, sender_name, subject, snippet, body, timestamp,
                    is_read, is_starred, is_spam, is_trash, has_attachments,
                    importance, data)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id, user_email) DO UPDATE SET
                    folder=excluded.folder, category=excluded.category,
                    priority=excluded.priority, tone=excluded.tone,
                    sender_email=excluded.sender_email, sender_name=excluded.sender_name,
                    subject=excluded.subject, snippet=excluded.snippet,
                    body=excluded.body, timestamp=excluded.timestamp,
                    is_read=excluded.is_read, is_starred=excluded.is_starred,
                    is_spam=excluded.is_spam, is_trash=excluded.is_trash,
                    has_attachments=excluded.has_attachments,
                    importance=excluded.importance, data=excluded.data
                """,
                (
                    email.id, email.user_email, email.folder,
                    email.category.value if hasattr(email.category, "value") else str(email.category),
                    email.priority.value if hasattr(email.priority, "value") else str(email.priority),
                    str(summary.get("tone") or "Neutral"),
                    email.sender_email, email.sender_name, email.subject,
                    email.snippet, email.body, float(email.timestamp or 0),
                    int(bool(email.is_read)), int(bool(email.is_starred)),
                    int(bool(email.is_spam)), int(bool(email.is_trash)),
                    int(bool(email.has_attachments)),
                    float(summary.get("importance_score") or 0),
                    json.dumps(payload, ensure_ascii=False),
                ),
            )
            self._conn.commit()

    def upsert_emails(self, emails) -> int:
        for email in emails:
            self.upsert_email(email)
        return len(emails)

    def get_email(self, email_id: str, user_email: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM emails WHERE id=? AND user_email=?",
                (email_id, self._norm(user_email)),
            ).fetchone()
        return self._row_to_dict(row) if row else None

    def list_emails(
        self,
        user_email: str,
        folder: str = "all",
        category: Optional[str] = None,
        priority: Optional[str] = None,
        tone: Optional[str] = None,
        search: Optional[str] = None,
        unread_only: bool = False,
        starred_only: bool = False,
        has_attachments: Optional[bool] = None,
        from_date: Optional[float] = None,
        to_date: Optional[float] = None,
        limit: int = 2000,
    ) -> List[Dict[str, Any]]:
        user = self._norm(user_email)
        clauses = ["user_email = ?"]
        params: List[Any] = [user]

        f = (folder or "all").strip().lower()
        if f == "inbox":
            clauses.append("folder = 'inbox'")
        elif f in ("sent", "drafts", "spam", "trash", "archive"):
            clauses.append("folder = ?")
            params.append(f)

        if category:
            clauses.append("category = ?")
            params.append(category.strip())
        if priority:
            clauses.append("priority = ?")
            params.append(priority.strip())
        if tone:
            clauses.append("tone = ?")
            params.append(tone.strip())
        if unread_only:
            clauses.append("is_read = 0")
        if starred_only:
            clauses.append("is_starred = 1")
        if has_attachments is not None:
            clauses.append("has_attachments = ?")
            params.append(int(has_attachments))
        if from_date is not None:
            clauses.append("timestamp >= ?")
            params.append(float(from_date))
        if to_date is not None:
            clauses.append("timestamp <= ?")
            params.append(float(to_date))

        where = " AND ".join(clauses)
        with self._lock:
            rows = self._conn.execute(
                f"SELECT * FROM emails WHERE {where} ORDER BY timestamp DESC LIMIT ?",
                (*params, int(limit)),
            ).fetchall()

        out = [self._row_to_dict(r) for r in rows]
        if f in ("all", "important"):
            out = self._apply_virtual_filter(out, f)
        if search:
            needle = search.strip().lower()
            if needle:
                out = [d for d in out if self._matches(d, needle)]
        return out

    @staticmethod
    def _apply_virtual_filter(items: List[Dict[str, Any]], folder: str) -> List[Dict[str, Any]]:
        if folder != "important":
            return items
        return [
            d for d in items
            if (d.get("priority") == "High" or d.get("category") == "Important" or d.get("is_starred"))
        ]

    @staticmethod
    def _matches(doc: Dict[str, Any], needle: str) -> bool:
        haystacks = [doc.get("subject", ""), doc.get("body", ""),
                     doc.get("sender_name", ""), doc.get("sender_email", "")]
        if any(needle in (h or "").lower() for h in haystacks):
            return True
        summary = doc.get("summary") or {}
        for key in ("one_liner",):
            if needle in (summary.get(key) or "").lower():
                return True
        for point in summary.get("bullet_points") or []:
            if needle in (point or "").lower():
                return True
        for word in summary.get("keywords") or []:
            if needle in (word or "").lower():
                return True
        for item in doc.get("action_items") or []:
            if needle in (item.get("task") or "").lower():
                return True
        for person in summary.get("people") or []:
            if needle in (person.get("name") or "").lower():
                return True
        return False

    def update_email(self, email_id: str, user_email: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        current = self.get_email(email_id, user_email)
        if not current:
            return None
        # Ownership and identity are not reassignable.
        current.update(updates)
        current["id"] = current.get("id", email_id)
        current["user_email"] = self._norm(user_email)
        from app.models.schemas import EmailItem

        try:
            item = EmailItem(**current)
        except Exception as exc:
            logger.warning("Rejected update for %s: %s", email_id, exc)
            return None
        self.upsert_email(item)
        return item.model_dump(mode="json")

    def delete_email(self, email_id: str, user_email: str) -> bool:
        current = self.get_email(email_id, user_email)
        if not current:
            return False
        if current.get("folder") == "trash":
            with self._lock:
                self._conn.execute(
                    "DELETE FROM emails WHERE id=? AND user_email=?",
                    (email_id, self._norm(user_email)),
                )
                self._conn.commit()
            return True
        return bool(self.update_email(email_id, user_email,
                                       {"folder": "trash", "is_trash": True}))

    def move_email(self, email_id: str, user_email: str, folder: str) -> bool:
        target = (folder or "inbox").strip().lower()
        if target not in {"inbox", "sent", "drafts", "spam", "trash", "archive"}:
            return False
        return bool(self.update_email(email_id, user_email, {
            "folder": target,
            "is_trash": target == "trash",
            "is_spam": target == "spam",
        }))

    def purge_email(self, email_id: str, user_email: str) -> bool:
        """Remove a message permanently, bypassing the trash.

        Distinct from delete_email, which is the reversible trash transition.
        Removing something from history must actually remove the row.
        """
        with self._lock:
            cur = self._conn.execute(
                "DELETE FROM emails WHERE id=? AND user_email=?",
                (email_id, self._norm(user_email)),
            )
            self._conn.commit()
            return bool(cur.rowcount)

    def restore_email(self, email_id: str, user_email: str) -> bool:
        return bool(self.update_email(email_id, user_email, {
            "folder": "inbox", "is_trash": False, "is_spam": False,
        }))

    def replace_user_emails(self, user_email: str, emails: List[Any]) -> int:
        """Make ``emails`` authoritative for server folders, keeping local ones."""
        user = self._norm(user_email)
        keep = ", ".join("?" * len(_LOCAL_FOLDERS))
        with self._lock:
            # Preserve sent/drafts/trash and any manually pasted emails.
            self._conn.execute(
                f"DELETE FROM emails WHERE user_email=? AND folder NOT IN ({keep})",
                (user, *_LOCAL_FOLDERS),
            )
            self._conn.commit()
        return self.upsert_emails(emails)

    def clear_generated(self, user_email: str, prefix: str = "em-usr-") -> int:
        with self._lock:
            cur = self._conn.execute(
                "DELETE FROM emails WHERE user_email=? AND id LIKE ?",
                (self._norm(user_email), f"{prefix}%"),
            )
            self._conn.commit()
            return cur.rowcount or 0

    # --------------------------------------------------------------- counts
    def counts(self, user_email: str) -> Dict[str, int]:
        user = self._norm(user_email)
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT folder, priority, is_read, is_starred, category, COUNT(*) AS n
                FROM emails WHERE user_email=? GROUP BY
                    folder, priority, is_read, is_starred, category
                """,
                (user,),
            ).fetchall()

        counts = {
            "all": 0, "inbox": 0, "unread": 0, "starred": 0, "sent": 0,
            "drafts": 0, "spam": 0, "trash": 0, "important": 0, "urgent": 0,
        }
        for r in rows:
            n = r["n"]
            folder, priority = r["folder"], r["priority"]
            counts["all"] += n
            if folder == "inbox":
                counts["inbox"] += n
                if not r["is_read"]:
                    counts["unread"] += n
                if priority == "High":
                    counts["urgent"] += n
            elif folder in ("sent", "drafts", "spam", "trash"):
                counts[folder] += n
            if r["is_starred"]:
                counts["starred"] += n
            if priority == "High" or r["category"] == "Important" or r["is_starred"]:
                counts["important"] += n
        return counts

    # ------------------------------------------------------- pasted emails
    def save_manual(self, user_email: str, doc: Dict[str, Any]) -> str:
        entry_id = doc.get("id") or f"manual-{uuid.uuid4().hex[:12]}"
        doc = {**doc, "id": entry_id, "user_email": self._norm(user_email)}
        with self._lock:
            self._conn.execute(
                """INSERT OR REPLACE INTO manual_emails
                   (id, user_email, created_at, subject, sender, data)
                   VALUES (?,?,?,?,?,?)""",
                (entry_id, self._norm(user_email), time.time(),
                 doc.get("subject", ""), doc.get("sender_email", ""),
                 json.dumps(doc, ensure_ascii=False)),
            )
            self._conn.commit()
        return entry_id

    def list_manual(self, user_email: str, limit: int = 200) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT data FROM manual_emails WHERE user_email=? ORDER BY created_at DESC LIMIT ?",
                (self._norm(user_email), int(limit)),
            ).fetchall()
        out = []
        for r in rows:
            try:
                out.append(json.loads(r["data"]))
            except json.JSONDecodeError:
                continue
        return out

    def delete_manual(self, entry_id: str, user_email: str) -> bool:
        with self._lock:
            cur = self._conn.execute(
                "DELETE FROM manual_emails WHERE id=? AND user_email=?",
                (entry_id, self._norm(user_email)),
            )
            self._conn.commit()
            return bool(cur.rowcount)

    # ------------------------------------------------- sent-reply corpus
    def add_reply(self, user_email: str, recipient: str, subject: str,
                  body: str, sent: bool = True) -> Dict[str, Any]:
        record = {
            "id": f"rep-{uuid.uuid4().hex[:12]}",
            "user_email": self._norm(user_email),
            "to": recipient,
            "subject": subject,
            "body": body,
            "sent": bool(sent),
            "created_at": time.time(),
        }
        with self._lock:
            self._conn.execute(
                """INSERT INTO replies (id, user_email, recipient, subject, body, sent, created_at)
                   VALUES (?,?,?,?,?,?,?)""",
                (record["id"], record["user_email"], recipient, subject, body,
                 int(sent), record["created_at"]),
            )
            self._conn.commit()
        return record

    def list_replies(self, user_email: str, limit: int = 100) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                """SELECT * FROM replies WHERE user_email=? AND sent=1
                   ORDER BY created_at DESC LIMIT ?""",
                (self._norm(user_email), int(limit)),
            ).fetchall()
        return [dict(r) for r in rows]

    def reply_count(self, user_email: str) -> int:
        with self._lock:
            row = self._conn.execute(
                "SELECT COUNT(*) AS n FROM replies WHERE user_email=? AND sent=1",
                (self._norm(user_email),),
            ).fetchone()
        return int(row["n"]) if row else 0

    def clear_user(self, user_email: str) -> int:
        """Delete everything belonging to one account.

        Used for sign-out, account deletion, and test isolation.
        """
        user = self._norm(user_email)
        with self._lock:
            removed = 0
            for table in ("emails", "manual_emails", "replies"):
                cur = self._conn.execute(f"DELETE FROM {table} WHERE user_email=?", (user,))
                removed += cur.rowcount or 0
            self._conn.commit()
        return removed

    # ------------------------------------------------------------- lifecycle
    def close(self) -> None:  # pragma: no cover - shutdown helper
        with self._lock:
            self._conn.close()

    def __repr__(self) -> str:  # pragma: no cover - defensive
        return f"<Storage path={self._path!r}>"


_storage: Optional[Storage] = None
_storage_lock = threading.Lock()


def get_storage() -> Storage:
    """Process-wide singleton, created on first use."""
    global _storage
    if _storage is None:
        with _storage_lock:
            if _storage is None:
                _storage = Storage()
    return _storage
