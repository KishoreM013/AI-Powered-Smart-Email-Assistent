"""Tests for the Gmail API (OAuth) ingestion path.

This path originally shipped broken: ``_fetch_via_api`` called
``asyncio.to_thread`` without importing ``asyncio``, so every OAuth sync raised
``NameError`` and the app silently showed an empty mailbox. The demo and IMAP
paths did not touch that code, so nothing caught it.

The Gmail client is stubbed here -- no network -- but the real parsing,
classification and storage code all run.
"""

import pytest

from app.database.db import db
from app.models.schemas import EmailItem
from app.services.gmail_service import GmailService


def _gmail_message(msg_id="msg-1", thread="thread-1", subject="Q3 plan review",
                   sender="Boss <boss@corp.test>", snippet="Please review the plan",
                   body="Please review the plan before Friday.", labels=("INBOX",)):
    """Build a message in the shape the Gmail API returns."""
    return {
        "id": msg_id,
        "threadId": thread,
        "snippet": snippet,
        "labelIds": list(labels),
        "payload": {
            "mimeType": "text/plain",
            "headers": [
                {"name": "Subject", "value": subject},
                {"name": "From", "value": sender},
                {"name": "Date", "value": "Tue, 16 Sep 2026 09:30:00 +0000"},
            ],
            "body": {"data": None},
            "parts": [
                {
                    "mimeType": "text/plain",
                    "headers": [],
                    "body": {"data": __import__("base64").urlsafe_b64encode(
                        body.encode()).decode(), "size": len(body)},
                }
            ],
        },
    }


class _Request:
    """The googleapiclient pattern: build a request, then .execute() it."""

    def __init__(self, payload):
        self._payload = payload

    def execute(self):
        return self._payload


class _StubMessages:
    def __init__(self, messages):
        self._messages = messages

    def list(self, userId=None, maxResults=None):
        return _Request({"messages": [{"id": m["id"]} for m in self._messages]})

    def get(self, userId=None, id=None, format=None):
        for m in self._messages:
            if m["id"] == id:
                return _Request(m)
        raise KeyError(id)


class _StubUsers:
    def __init__(self, messages):
        self._messages = messages

    def messages(self):
        return _StubMessages(self._messages)


class _StubService:
    """Mimics the googleapiclient chain: users().messages().list().execute()."""

    def __init__(self, messages):
        self._users = _StubUsers(messages)

    def users(self):
        return self._users


@pytest.fixture
def gmail(monkeypatch):
    """A GmailService whose HTTP client is replaced by a stub."""
    svc = GmailService()
    monkeypatch.setattr(
        svc, "_service", lambda creds: _StubService([_gmail_message()])
    )
    return svc


class TestGmailParsing:
    def test_parses_a_message_into_an_owned_email(self, gmail):
        parsed = gmail._parse(_gmail_message(), "alice@test.local")

        assert isinstance(parsed, EmailItem)
        assert parsed.id == "msg-1"
        assert parsed.user_email == "alice@test.local"
        assert parsed.subject == "Q3 plan review"
        assert parsed.sender_name == "Boss"
        assert parsed.sender_email == "boss@corp.test"
        assert "review the plan" in parsed.body
        assert parsed.folder == "inbox"
        # A message carrying INBOX but no UNREAD label has been read.
        assert parsed.is_read is True

    def test_maps_gmail_labels_onto_folders(self, gmail):
        cases = {
            ("INBOX",): "inbox",
            ("SENT",): "sent",
            ("SPAM",): "spam",
            ("TRASH",): "trash",
            ("ARCHIVE",): "archive",
        }
        for labels, expected in cases.items():
            parsed = gmail._parse(
                _gmail_message(msg_id=f"m-{expected}", labels=labels), "u@test.local"
            )
            assert parsed.folder == expected, f"labels {labels} -> {parsed.folder}"

    def test_read_state_follows_the_unread_label(self, gmail):
        unread = gmail._parse(_gmail_message(msg_id="a", labels=("INBOX", "UNREAD")), "u@test.local")
        read = gmail._parse(_gmail_message(msg_id="b", labels=("INBOX",)), "u@test.local")
        assert unread.is_read is False
        assert read.is_read is True

    def test_attachments_are_collected_with_usable_ids(self, gmail):
        import base64

        msg = _gmail_message()
        msg["payload"]["parts"].append({
            "mimeType": "application/pdf",
            "filename": "plan.pdf",
            "body": {
                "data": base64.urlsafe_b64encode(b"%PDF-1.4").decode(),
                "size": 8,
                "attachmentId": "ATTACH-1",
            },
            "headers": [],
        })
        parsed = gmail._parse(msg, "u@test.local")
        assert parsed.has_attachments is True
        assert parsed.attachments[0].filename == "plan.pdf"
        # The id must be usable for a follow-up request, not a bare index.
        assert parsed.attachments[0].id.startswith("att-")


class TestGmailFetch:
    @pytest.mark.asyncio
    async def test_fetch_via_api_actually_runs(self, gmail, monkeypatch):
        """Regression: this raised NameError('asyncio') and yielded nothing."""
        monkeypatch.setattr(
            "app.services.gemini_service.gemini_service.analyze_and_summarize_email",
            _stub_analysis,
        )
        out = await gmail._fetch_via_api("alice@test.local", {"access_token": "x"})
        assert len(out) == 1
        assert out[0].subject == "Q3 plan review"
        assert out[0].summary is not None, "analysis must be attached"

    @pytest.mark.asyncio
    async def test_sync_stores_the_messages_it_fetched(self, gmail, monkeypatch):
        monkeypatch.setattr(
            "app.services.gemini_service.gemini_service.analyze_and_summarize_email",
            _stub_analysis,
        )
        from app.services.credential_store import secrets_store

        db.clear_user("alice@test.local")
        secrets_store.set("alice@test.local", {
            "type": "oauth", "access_token": "x", "refresh_token": "r",
        })

        result = await gmail.sync_inbox(user_email="alice@test.local")

        assert result["status"] == "success", result
        assert result["source"] == "gmail_api"
        assert result["synced_emails_count"] == 1
        stored = db.get_emails(folder="all", user_email="alice@test.local")
        assert len(stored) == 1
        assert stored[0].id == "msg-1"

    @pytest.mark.asyncio
    async def test_an_empty_mailbox_is_reported_not_faked(self, gmail, monkeypatch):
        monkeypatch.setattr(
            "app.services.gemini_service.gemini_service.analyze_and_summarize_email",
            _stub_analysis,
        )
        gmail._service = lambda creds: _StubService([])
        from app.services.credential_store import secrets_store

        db.clear_user("alice@test.local")
        secrets_store.set("alice@test.local", {"type": "oauth", "access_token": "x"})
        result = await gmail.sync_inbox(user_email="alice@test.local")

        assert result["status"] == "success"
        assert result["synced_emails_count"] == 0
        assert db.get_emails(folder="all", user_email="alice@test.local") == []

    @pytest.mark.asyncio
    async def test_an_api_failure_is_reported_not_swallowed(self, monkeypatch):
        """A broken sync must say so, not return a cheerful empty success."""
        from app.services.credential_store import secrets_store

        svc = GmailService()

        def _boom(_creds):
            raise RuntimeError("Gmail API has not been used in project 123 or it is disabled")

        monkeypatch.setattr(svc, "_service", _boom)
        secrets_store.set("bob@test.local", {"type": "oauth", "access_token": "x"})

        result = await svc.sync_inbox(user_email="bob@test.local")
        assert result["status"] == "error"
        assert "not been used" in result["message"] or "disabled" in result["message"]

    @pytest.mark.asyncio
    async def test_disconnected_account_is_not_given_fake_mail(self, monkeypatch):
        """With no credentials the old code seeded synthetic messages."""
        from app.services.credential_store import secrets_store

        db.clear_user("alice@test.local")
        secrets_store.clear("nobody@test.local")
        svc = GmailService()

        result = await svc.sync_inbox(user_email="nobody@test.local")
        assert result["status"] == "disconnected"
        assert result["synced_emails_count"] == 0
        assert db.get_emails(folder="all", user_email="nobody@test.local") == []


class TestTokenLifecycle:
    """A stored credential must be enough to keep syncing."""

    def test_credentials_carry_the_refresh_token_through(self):
        creds = GmailService()._credentials({
            "access_token": "at", "refresh_token": "rt",
            "client_id": "cid", "client_secret": "sec",
        })
        assert creds.token == "at"
        assert creds.refresh_token == "rt"
        assert creds.client_id == "cid"

    def test_a_refreshed_token_is_written_back_to_the_store(self):
        """A renewed token must be persisted or every sync re-authenticates."""
        from app.services.credential_store import secrets_store

        class _Creds:
            token = "new-access-token"
            refresh_token = "new-refresh-token"
            valid = False

        secrets_store.set("alice@test.local", {
            "type": "oauth", "access_token": "old", "refresh_token": "rt",
        })

        GmailService._persist_refreshed(
            {"_user_email": "alice@test.local", "type": "oauth", "access_token": "old"},
            _Creds(),
        )

        stored = secrets_store.get("alice@test.local")
        assert stored["access_token"] == "new-access-token"
        assert stored["refresh_token"] == "new-refresh-token"
        assert stored["type"] == "oauth"
        # The internal routing key must not be persisted as a credential.
        assert "_user_email" not in stored

    def test_expired_credential_without_a_refresh_token_fails_clearly(self, monkeypatch):
        """The error must say how to fix it, not raise something opaque."""
        svc = GmailService()

        class _Expired:
            valid = False
            refresh_token = None
            token = None

        monkeypatch.setattr(svc, "_credentials", lambda creds: _Expired())
        with pytest.raises(RuntimeError, match="refresh token"):
            svc._service({"access_token": "stale"})


async def _stub_analysis(subject, body, sender):
    """Deterministic stand-in for the Gemini call."""
    return {
        "category": "Work",
        "priority": "High",
        "urgency_reason": "test",
        "sentiment": "Urgent",
        "one_liner": f"About {subject}",
        "bullet_points": ["first point", "second point"],
        "deadlines": ["Friday"],
        "action_items": [{"task": "Reply", "due_date": "Friday"}],
    }
