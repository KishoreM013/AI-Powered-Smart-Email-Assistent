"""Regression tests for the security and correctness fixes.

Run from the ``backend`` directory::

    python -m pytest tests -q
"""

import pytest
from fastapi.testclient import TestClient  # noqa: E402

from app.auth.auth_handler import create_token_for_user  # noqa: E402
from app.database.db import db  # noqa: E402
from app.main import app  # noqa: E402
from app.middleware import rate_limit  # noqa: E402
from app.models.schemas import (  # noqa: E402
    ActionItem,
    CategoryEnum,
    EmailItem,
    EmailSummary,
    PriorityEnum,
    UserProfile,
)
from app.services.credential_store import SecretStore  # noqa: E402


@pytest.fixture
def client():
    rate_limit.reset()
    db.clear_user("alice@test.local")
    with TestClient(app) as c:
        yield c


def _token(email: str) -> str:
    return create_token_for_user(
        UserProfile(id=f"usr-{email}", email=email, name=email.split("@")[0], avatar="")
    )


def _headers(email: str) -> dict:
    return {"Authorization": f"Bearer {_token(email)}"}


def _seed(email: str, **overrides) -> EmailItem:
    defaults = dict(
        id=f"seed-{email}-{overrides.get('id', '1')}",
        user_email=email,
        sender_name="Sender",
        sender_email="sender@remote.test",
        recipient_email=email,
        subject="Quarterly planning",
        snippet="Please review the plan",
        body="Please review the attached plan before Friday.",
        category=CategoryEnum.WORK,
        priority=PriorityEnum.MEDIUM,
        date="01 Jan, 09:00",
        timestamp=1_700_000_000.0,
        folder="inbox",
        summary=EmailSummary(bullet_points=["Review plan"], one_liner="Plan review"),
        action_items=[ActionItem(task="Reply to the plan")],
    )
    defaults.update(overrides)
    return db.add_email(EmailItem(**defaults))


# =========================================================== authentication
class TestAuthentication:
    def test_me_requires_a_token(self, client):
        assert client.get("/api/auth/me").status_code == 401

    def test_me_rejects_a_forged_token(self, client):
        bad = {"Authorization": "Bearer not.a.real.token"}
        assert client.get("/api/auth/me", headers=bad).status_code == 401

    def test_me_rejects_a_token_signed_with_another_key(self, client):
        from jose import jwt as jose_jwt
        forged = jose_jwt.encode(
            {"sub": "x", "email": "attacker@evil.test", "typ": "access", "exp": 9_999_999_999},
            "totally-different-signing-key",
            algorithm="HS256",
        )
        resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {forged}"})
        assert resp.status_code == 401

    def test_me_returns_the_caller(self, client):
        resp = client.get("/api/auth/me", headers=_headers("alice@test.local"))
        assert resp.status_code == 200
        assert resp.json()["email"] == "alice@test.local"

    def test_token_without_subject_is_rejected(self, client):
        from jose import jwt as jose_jwt
        from app.config import settings

        no_subject = jose_jwt.encode(
            {"typ": "access", "exp": 9_999_999_999},
            settings.JWT_SECRET,
            algorithm="HS256",
        )
        resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {no_subject}"})
        assert resp.status_code == 401

    def test_impersonation_endpoint_is_gone(self, client):
        """The old /google-login minted a token for any email in the body."""
        resp = client.post("/api/auth/google-login", json={"email": "victim@test.local"})
        assert resp.status_code == 404

    def test_demo_login_is_disabled_outside_demo_mode(self, client):
        assert client.post("/api/auth/demo-login").status_code == 404


# =================================================== per-user isolation
class TestUserIsolation:
    def test_lists_only_the_callers_mail(self, client):
        _seed("alice@test.local")
        _seed("bob@test.local", id="2")

        resp = client.get("/api/emails", headers=_headers("alice@test.local"))
        assert resp.status_code == 200
        emails = resp.json()
        assert len(emails) == 1
        assert emails[0]["user_email"] == "alice@test.local"

    def test_cannot_read_another_users_email_by_id(self, client):
        """IDOR regression: the old route had no owner check."""
        bobs = _seed("bob@test.local")
        resp = client.get(f"/api/emails/{bobs.id}", headers=_headers("alice@test.local"))
        assert resp.status_code == 404

    def test_cannot_star_another_users_email(self, client):
        bobs = _seed("bob@test.local")
        resp = client.post(
            f"/api/emails/{bobs.id}/toggle-star", headers=_headers("alice@test.local")
        )
        assert resp.status_code == 404
        assert db.get_email_by_id(bobs.id, user_email="bob@test.local").is_starred is False

    def test_cannot_delete_another_users_email(self, client):
        bobs = _seed("bob@test.local")
        resp = client.delete(f"/api/emails/{bobs.id}", headers=_headers("alice@test.local"))
        assert resp.status_code == 404
        assert db.get_email_by_id(bobs.id, user_email="bob@test.local") is not None

    def test_cannot_move_another_users_email(self, client):
        bobs = _seed("bob@test.local")
        resp = client.post(
            f"/api/emails/{bobs.id}/move?folder=spam", headers=_headers("alice@test.local")
        )
        assert resp.status_code == 404

    def test_cannot_toggle_another_users_action_items(self, client):
        bobs = _seed("bob@test.local")
        resp = client.post(
            f"/api/emails/{bobs.id}/action-items/0/toggle",
            headers=_headers("alice@test.local"),
        )
        assert resp.status_code == 404

    def test_counts_are_scoped(self, client):
        _seed("alice@test.local")
        _seed("bob@test.local", id="2")

        counts = client.get("/api/emails/counts", headers=_headers("alice@test.local")).json()
        assert counts["all"] == 1

    def test_owner_cannot_be_reassigned_by_update(self, client):
        item = _seed("alice@test.local")
        db.update_email(item.id, "alice@test.local", {"user_email": "bob@test.local"})
        assert db.get_email_by_id(item.id, user_email="alice@test.local") is not None
        assert db.get_email_by_id(item.id, user_email="bob@test.local") is None


# ==================================================== protected endpoints
class TestEndpointsRequireAuth:
    @pytest.mark.parametrize(
        "method,path",
        [
            ("GET", "/api/emails"),
            ("GET", "/api/emails/counts"),
            ("POST", "/api/emails/sync"),
            ("POST", "/api/emails/compose"),
            ("GET", "/api/analytics/summary"),
            ("GET", "/api/settings"),
            ("POST", "/api/settings"),
        ],
    )
    def test_rejects_anonymous_callers(self, client, method, path):
        resp = client.request(method, path)
        assert resp.status_code == 401, f"{method} {path} was reachable without a token"


# ========================================================== compose / reply
class TestCompose:
    def test_rejects_missing_fields(self, client):
        """The old UI posted {recipient, reply_body} and got a silent 422.

        A 4xx rejection is the correct outcome; what matters is that it does
        not report success.
        """
        resp = client.post(
            "/api/emails/compose",
            json={"recipient": "someone@remote.test"},
            headers=_headers("alice@test.local"),
        )
        assert resp.status_code in (400, 422)
        assert db.get_emails(folder="all", user_email="alice@test.local") == []

    def test_rejects_invalid_recipient(self, client):
        resp = client.post(
            "/api/emails/compose",
            json={"recipient": "not-an-email", "subject": "Hi", "body": "Hello"},
            headers=_headers("alice@test.local"),
        )
        assert resp.status_code == 400

    def test_stores_an_outgoing_message_as_a_draft_when_undeliverable(self, client):
        resp = client.post(
            "/api/emails/compose",
            json={"recipient": "someone@remote.test", "subject": "Hi", "body": "Hello"},
            headers=_headers("alice@test.local"),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["user_email"] == "alice@test.local"
        # No mail credentials are configured, so it must not claim to be sent.
        assert body["folder"] == "drafts"
        assert "Not delivered" in body["snippet"]

    def test_reply_to_unknown_thread_is_rejected(self, client):
        resp = client.post(
            "/api/emails/compose",
            json={
                "recipient": "s@remote.test",
                "subject": "Re: x",
                "body": "y",
                "in_reply_to": "does-not-exist",
            },
            headers=_headers("alice@test.local"),
        )
        assert resp.status_code == 404


# ================================================== suggest-reply / phishing
class TestAiEndpoints:
    def test_suggest_reply_returns_a_draft(self, client):
        item = _seed("alice@test.local")
        resp = client.get(
            f"/api/emails/{item.id}/suggest-reply?tone=Friendly",
            headers=_headers("alice@test.local"),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["reply_body"]
        assert body["tone"] == "Friendly"

    def test_suggest_reply_tamilu_responds_in_tamilu_script(self, client):
        item = _seed("alice@test.local")
        resp = client.get(
            f"/api/emails/{item.id}/suggest-reply?language=ta",
            headers=_headers("alice@test.local"),
        )
        assert resp.status_code == 200
        assert any("\u0b80" <= ch <= "\u0bff" for ch in resp.json()["reply_body"])

    def test_phishing_check_flags_lookalike_domain(self, client):
        item = _seed(
            "alice@test.local",
            sender_email="support@amaz0n-verify.example.net",
            subject="Verify your account immediately",
        )
        resp = client.get(
            f"/api/emails/{item.id}/phishing-check", headers=_headers("alice@test.local")
        )
        assert resp.status_code == 200
        assert resp.json()["status"] in {"Phishing", "Suspicious"}

    def test_phishing_check_cannot_probe_other_users_mail(self, client):
        item = _seed("bob@test.local")
        resp = client.get(
            f"/api/emails/{item.id}/phishing-check", headers=_headers("alice@test.local")
        )
        assert resp.status_code == 404


# =============================================================== analytics
class TestAnalytics:
    def test_counts_reflect_stored_mail(self, client):
        _seed("alice@test.local")
        _seed("bob@test.local", id="2")
        _seed("alice@test.local", id="3", category=CategoryEnum.FINANCE, priority=PriorityEnum.HIGH)

        data = client.get("/api/analytics/summary", headers=_headers("alice@test.local")).json()
        assert data["total_emails"] == 2
        assert data["category_distribution"]["Finance"] == 1
        assert data["priority_distribution"]["High"] == 1

    def test_daily_volume_is_derived_not_hardcoded(self, client):
        """Previously returned the same fixed array for every user."""
        _seed("alice@test.local")
        data = client.get("/api/analytics/summary", headers=_headers("alice@test.local")).json()
        assert len(data["daily_volume"]) == 1
        assert data["daily_volume"][0]["received"] == 1

    def test_top_senders_reflect_real_senders(self, client):
        _seed("alice@test.local", sender_name="Alice's Boss", sender_email="boss@corp.test")
        data = client.get("/api/analytics/summary", headers=_headers("alice@test.local")).json()
        assert data["top_senders"][0]["name"] == "Alice's Boss"
        assert data["top_senders"][0]["email"] == "boss@corp.test"

    def test_empty_mailbox_returns_empty_not_invented_data(self, client):
        data = client.get("/api/analytics/summary", headers=_headers("alice@test.local")).json()
        assert data["total_emails"] == 0
        assert data["daily_volume"] == []
        assert data["top_senders"] == []


# ============================================================== folders
class TestFolderFiltering:
    def test_all_mail_includes_sent(self, client):
        _seed("alice@test.local")
        _seed("alice@test.local", id="2", folder="sent")

        all_mail = client.get("/api/emails?folder=all", headers=_headers("alice@test.local")).json()
        assert len(all_mail) == 2

        inbox = client.get("/api/emails?folder=inbox", headers=_headers("alice@test.local")).json()
        assert len(inbox) == 1

    def test_important_is_a_virtual_view(self, client):
        _seed("alice@test.local", priority=PriorityEnum.HIGH)
        _seed("alice@test.local", id="2", priority=PriorityEnum.LOW)

        resp = client.get("/api/emails?folder=important", headers=_headers("alice@test.local"))
        assert len(resp.json()) == 1

    def test_search_matches_subject_and_body(self, client):
        _seed("alice@test.local", subject="Budget approval needed")
        _seed("alice@test.local", id="2", subject="Lunch tomorrow")

        resp = client.get(
            "/api/emails?folder=all&search=budget", headers=_headers("alice@test.local")
        )
        assert len(resp.json()) == 1

    def test_trash_then_delete_purges(self, client):
        item = _seed("alice@test.local")
        client.delete(f"/api/emails/{item.id}", headers=_headers("alice@test.local"))
        assert db.get_email_by_id(item.id, user_email="alice@test.local").folder == "trash"

        client.delete(f"/api/emails/{item.id}", headers=_headers("alice@test.local"))
        assert db.get_email_by_id(item.id, user_email="alice@test.local") is None

    def test_restore_returns_message_to_inbox(self, client):
        item = _seed("alice@test.local")
        client.delete(f"/api/emails/{item.id}", headers=_headers("alice@test.local"))
        resp = client.post(f"/api/emails/{item.id}/restore", headers=_headers("alice@test.local"))
        assert resp.json()["folder"] == "inbox"

    def test_move_rejects_virtual_folders(self, client):
        item = _seed("alice@test.local")
        resp = client.post(
            f"/api/emails/{item.id}/move?folder=important", headers=_headers("alice@test.local")
        )
        assert resp.status_code == 400


# ======================================================== sync semantics
class TestSync:
    def test_sync_without_credentials_reports_disconnected(self, client):
        resp = client.post("/api/emails/sync", headers=_headers("alice@test.local"))
        assert resp.status_code == 200
        assert resp.json()["status"] == "disconnected"

    def test_sync_does_not_invent_emails_in_real_mode(self, client):
        """Regression: production sync seeded 11 fabricated messages."""
        client.post("/api/emails/sync", headers=_headers("alice@test.local"))
        assert db.get_emails(folder="all", user_email="alice@test.local") == []

    def test_replace_preserves_local_folders(self, client):
        _seed("alice@test.local", id="sent-1", folder="sent")
        db.replace_user_emails("alice@test.local", [
            _seed("alice@test.local", id="fresh-1", folder="inbox")
        ])
        kept = db.get_emails(folder="all", user_email="alice@test.local")
        assert {e.folder for e in kept} == {"inbox", "sent"}


class TestDemoMode:
    """Demo mode is a distinct, deliberately different code path."""

    def test_sandbox_inbox_is_produced_and_owns_its_messages(self):
        from app.services.demo_seed import build_demo_inbox

        emails = build_demo_inbox("sandbox@test.local", "Sam")
        assert emails, "the sandbox should not be empty"
        # Every seeded message must be owned, or it would be invisible to the
        # requesting user (or visible to everyone).
        assert all(e.user_email == "sandbox@test.local" for e in emails)
        assert all(e.id.startswith("em-usr-") for e in emails)

    def test_sandbox_messages_clear_on_real_sync(self, client):
        from app.services.demo_seed import build_demo_inbox

        db.add_emails(build_demo_inbox("sandbox@test.local", "Sam"))
        assert len(db.get_emails(folder="all", user_email="sandbox@test.local")) > 0

        # A real sync wipes the synthetic set.
        removed = db.clear_fake_emails_for_user("sandbox@test.local")
        assert removed > 0
        assert db.get_emails(folder="all", user_email="sandbox@test.local") == []

    def test_sandbox_contains_a_deliberate_phishing_sample(self):
        from app.services.demo_seed import build_demo_inbox

        emails = build_demo_inbox("sandbox@test.local", "Sam")
        spam = [e for e in emails if e.folder == "spam"]
        assert spam, "the sandbox should include a phishing example to demo the shield"
        assert all(e.is_spam for e in spam)


# ============================================================ credentials
class TestSecretStore:
    def test_values_are_encrypted_at_rest(self):
        store = SecretStore()
        store.set("User@Test.local", {"imap_pass": "supersecret123"})
        # Stored blob must not contain the plaintext anywhere.
        assert b"supersecret123" not in repr(store._entries).encode()
        assert store.get("User@Test.local")["imap_pass"] == "supersecret123"

    def test_lookup_is_case_insensitive(self):
        store = SecretStore()
        store.set("a@test.local", {"type": "imap"})
        assert store.get("A@TEST.LOCAL") is not None

    def test_clear_removes_the_entry(self):
        store = SecretStore()
        store.set("a@test.local", {"type": "imap"})
        store.clear("a@test.local")
        assert store.get("a@test.local") is None

    def test_refuses_to_be_pickled(self):
        import pickle

        with pytest.raises(TypeError):
            pickle.dumps(SecretStore())


# ============================================================== rate limit
class TestRateLimit:
    def test_login_endpoint_is_throttled(self, client):
        codes = [
            client.post(
                "/api/auth/imap-login",
                json={"email": "x@test.local", "app_password": "short"},
            ).status_code
            for _ in range(15)
        ]
        assert 429 in codes

    def test_limits_are_per_user_not_global(self, client):
        for _ in range(3):
            client.post(
                "/api/auth/imap-login",
                json={"email": "a@test.local", "app_password": "short"},
            )
        # A different user must not inherit the first user's exhausted budget.
        resp = client.post(
            "/api/auth/imap-login",
            json={"email": "b@test.local", "app_password": "short"},
        )
        assert resp.status_code != 429


# ============================================================ hard headers
class TestHardening:
    def test_security_headers_present(self, client):
        resp = client.get("/api/health")
        assert resp.headers["X-Content-Type-Options"] == "nosniff"
        assert resp.headers["X-Frame-Options"] == "DENY"
        assert "Content-Security-Policy" in resp.headers

    def test_health_does_not_leak_secrets(self, client):
        from app.config import settings

        body = client.get("/api/health").text
        assert "JWT_SECRET" not in body
        assert "GEMINI_API_KEY" not in body
        # The actual configured secret must not appear anywhere in the payload.
        assert settings.JWT_SECRET not in body

    def test_health_reports_config_without_values(self, client):
        body = client.get("/api/health").json()
        assert "google_oauth" in body["auth"]
        assert isinstance(body["auth"]["google_oauth"], bool)

    def test_cors_is_not_wildcarded(self, client):
        from app.config import settings

        assert settings.CORS_ORIGINS, "CORS allowlist must not be empty"
        assert "*" not in settings.CORS_ORIGINS

    def test_cors_accepts_comma_separated_and_json_forms(self):
        """pydantic-settings JSON-decodes list fields unless told not to.

        An operator writing `A,B` must not get a SettingsError, and a deploy
        tool writing `["A","B"]` must work too.
        """
        from app.config import Settings

        csv = Settings(CORS_ORIGINS="https://a.test, https://b.test/")
        assert "https://a.test" in csv.CORS_ORIGINS
        assert "https://b.test" in csv.CORS_ORIGINS

        js = Settings(CORS_ORIGINS='["https://c.test","https://d.test"]')
        assert "https://c.test" in js.CORS_ORIGINS
        assert "https://d.test" in js.CORS_ORIGINS

    def test_frontend_url_is_always_an_allowed_origin(self):
        from app.config import Settings

        s = Settings(FRONTEND_URL="https://my-app.vercel.app")
        assert "https://my-app.vercel.app" in s.CORS_ORIGINS
        # Listed twice must be deduped.
        s2 = Settings(FRONTEND_URL="https://x.test", CORS_ORIGINS="https://x.test")
        assert s2.CORS_ORIGINS.count("https://x.test") == 1

    def test_docs_available(self, client):
        assert client.get("/docs").status_code == 200
