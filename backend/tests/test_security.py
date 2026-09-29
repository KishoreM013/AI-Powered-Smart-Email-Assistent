"""Security regression tests.

Each test here corresponds to a defect that was live in this codebase and
has been reintroduced at least once by a branch reset. They are written to
fail loudly if that ever happens again.
"""

import pytest
from fastapi.testclient import TestClient

from app.auth.auth_handler import create_token_for_user
from app.database.db import db
from app.main import app
from app.models.schemas import EmailItem, UserProfile

ALICE = "alice@sec.test"
BOB = "bob@sec.test"


def _headers(email: str) -> dict:
    token = create_token_for_user(
        UserProfile(id=f"usr-{email}", email=email, name=email.split("@")[0], avatar="")
    )
    return {"Authorization": f"Bearer {token}"}


def _seed(email: str, email_id: str) -> None:
    db.add_email(EmailItem(
        id=email_id, user_email=email, sender_name="Sender",
        sender_email="s@x.test", subject=f"Secret for {email}",
        body="confidential body", snippet="confidential body",
        date="01 Jan, 09:00", folder="inbox", timestamp=1000.0,
    ))


@pytest.fixture(autouse=True)
def clean():
    for addr in (ALICE, BOB):
        for item in db.get_emails(folder="all", user_email=addr):
            db.delete_email(item.id, addr)
    yield
    for addr in (ALICE, BOB):
        for item in db.get_emails(folder="all", user_email=addr):
            db.delete_email(item.id, addr)


@pytest.fixture
def client():
    return TestClient(app)


# =============================================================== IDOR
class TestCrossAccountAccess:
    """A guessable message id must not reach another account's mail."""

    def test_read_requires_ownership(self, client):
        _seed(BOB, "bobs-secret")
        assert client.get("/api/emails/bobs-secret", headers=_headers(ALICE)).status_code == 404
        assert client.get("/api/emails/bobs-secret", headers=_headers(BOB)).status_code == 200

    def test_ownership_mismatch_is_404_not_403(self, client):
        """403 would confirm the id exists, which is itself a leak."""
        _seed(BOB, "bobs-secret")
        r = client.get("/api/emails/bobs-secret", headers=_headers(ALICE))
        assert r.status_code == 404
        assert "bobs-secret" not in r.json().get("detail", "").lower()

    def test_phishing_check_requires_ownership(self, client):
        _seed(BOB, "bobs-secret")
        r = client.get("/api/emails/bobs-secret/phishing-check", headers=_headers(ALICE))
        assert r.status_code == 404

    def test_suggest_reply_requires_ownership(self, client):
        _seed(BOB, "bobs-secret")
        r = client.get("/api/emails/bobs-secret/suggest-reply", headers=_headers(ALICE))
        assert r.status_code == 404

    def test_toggle_read_requires_ownership(self, client):
        _seed(BOB, "bobs-secret")
        r = client.post("/api/emails/bobs-secret/toggle-read", headers=_headers(ALICE))
        assert r.status_code == 404
        # Bob's copy must be untouched.
        assert db.get_email_by_id("bobs-secret", BOB).is_read is False

    def test_toggle_star_requires_ownership(self, client):
        _seed(BOB, "bobs-secret")
        assert client.post(
            "/api/emails/bobs-secret/toggle-star", headers=_headers(ALICE)
        ).status_code == 404
        assert db.get_email_by_id("bobs-secret", BOB).is_starred is False

    def test_delete_requires_ownership(self, client):
        _seed(BOB, "bobs-secret")
        assert client.delete("/api/emails/bobs-secret", headers=_headers(ALICE)).status_code == 404
        assert db.get_email_by_id("bobs-secret", BOB) is not None

    def test_counts_are_per_account(self, client):
        _seed(ALICE, "a1")
        _seed(ALICE, "a2")
        _seed(BOB, "b1")
        assert client.get("/api/emails/counts", headers=_headers(ALICE)).json()["all"] == 2
        assert client.get("/api/emails/counts", headers=_headers(BOB)).json()["all"] == 1

    def test_listing_is_per_account(self, client):
        _seed(ALICE, "a1")
        _seed(BOB, "b1")
        subjects = [e["subject"] for e in
                    client.get("/api/emails?folder=all", headers=_headers(ALICE)).json()]
        assert subjects == ["Secret for alice@sec.test"]

    def test_history_is_per_account(self, client):
        _seed(ALICE, "a1")
        _seed(BOB, "b1")
        assert len(client.get("/api/emails/history", headers=_headers(ALICE)).json()) == 1

    def test_analytics_are_per_account(self, client):
        _seed(ALICE, "a1")
        _seed(ALICE, "a2")
        _seed(BOB, "b1")
        a = client.get("/api/analytics/summary", headers=_headers(ALICE)).json()
        b = client.get("/api/analytics/summary", headers=_headers(BOB)).json()
        assert a["total_emails"] == 2
        assert b["total_emails"] == 1

    def test_data_layer_refuses_unowned_read(self):
        _seed(BOB, "bobs-secret")
        assert db.get_email_by_id("bobs-secret", BOB) is not None
        assert db.get_email_by_id("bobs-secret", ALICE) is None
        assert db.get_email_by_id("bobs-secret", "") is None

    def test_data_layer_refuses_unowned_write(self):
        _seed(BOB, "bobs-secret")
        assert db.update_email("bobs-secret", ALICE, {"is_read": True}) is None
        assert db.delete_email("bobs-secret", ALICE) is False
        assert db.get_email_by_id("bobs-secret", BOB).is_read is False


# ========================================================= authentication
class TestAuthentication:
    def test_no_token_is_rejected(self, client):
        for path in ("/api/emails", "/api/emails/counts", "/api/emails/history",
                     "/api/analytics/summary"):
            assert client.get(path).status_code == 401, path

    def test_garbage_token_is_rejected(self, client):
        r = client.get("/api/emails/counts", headers={"Authorization": "Bearer not.a.jwt"})
        assert r.status_code == 401

    def test_token_without_identity_is_rejected(self):
        """A signed token missing sub/email must not become a shared account."""
        from app.auth.auth_handler import create_access_token
        from jose import jwt
        from app.config import settings
        forged = jwt.encode(
            {"exp": 9_999_999_999, "iat": 0}, settings.JWT_SECRET,
            algorithm=settings.JWT_ALGORITHM,
        )
        r = TestClient(app).get("/api/emails/counts",
                               headers={"Authorization": f"Bearer {forged}"})
        assert r.status_code == 401

    def test_removed_default_account_endpoints(self, client):
        for path in ("/api/auth/demo-login", "/api/auth/google-login"):
            assert client.post(path, json={"email": "victim@x.test"}).status_code == 404

    def test_health_stays_public(self, client):
        assert client.get("/api/health").status_code == 200


# ============================================================== headers
class TestSecurityHeaders:
    def test_headers_present(self, client):
        h = client.get("/api/health").headers
        assert h["X-Content-Type-Options"] == "nosniff"
        assert h["X-Frame-Options"] == "DENY"
        assert h["Referrer-Policy"] == "no-referrer"

    def test_headers_on_the_spa_too(self, client):
        assert client.get("/").headers.get("X-Frame-Options") == "DENY"


# ================================================================= CORS
class TestCORS:
    def test_known_origin_allowed(self, client):
        r = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
        assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"

    def test_unknown_origin_blocked(self, client):
        r = client.get("/api/health", headers={"Origin": "https://evil.example.com"})
        assert "access-control-allow-origin" not in r.headers

    def test_not_wildcarded(self, client):
        r = client.get("/api/health", headers={"Origin": "https://anything.test"})
        assert r.headers.get("access-control-allow-origin") != "*"

    def test_lookalike_vercel_host_blocked(self, client):
        """A suffix must not satisfy the platform regex."""
        r = client.get("/api/health", headers={"Origin": "https://vercel.app.attacker.net"})
        assert "access-control-allow-origin" not in r.headers


# ================================================== fabricated data
class TestNoFabricatedData:
    def test_empty_mailbox_reports_zeroes(self, client):
        a = client.get("/api/analytics/summary", headers=_headers(ALICE)).json()
        assert a["total_emails"] == 0
        assert a["top_senders"] == []
        assert a["daily_volume"] == []

    def test_no_hardcoded_senders_in_source(self):
        from pathlib import Path
        src = Path("app/database/db.py").read_text()
        for fake in ("Sarah Jenkins", "David Miller", "Emily Zhao", "Stripe Billing"):
            assert fake not in src, f"fabricated sender {fake!r} is still in the source"

    def test_senders_come_from_real_mail(self, client):
        _seed(ALICE, "a1")
        a = client.get("/api/analytics/summary", headers=_headers(ALICE)).json()
        assert [s["name"] for s in a["top_senders"]] == ["Sender"]


# ================================================== removed routes
class TestDeadCodeRemoved:
    def test_duplicate_route_files_are_gone(self):
        from pathlib import Path
        for name in ("admin", "analytics", "auth", "emails", "settings"):
            assert not Path(f"app/routes/{name}.py").exists(), f"{name}.py is dead code"

    def test_no_duplicate_route_registration(self):
        """/api/health must be defined exactly once."""
        from app.main import app as fastapi_app
        paths = [getattr(r, "path", "") for r in fastapi_app.routes]
        assert paths.count("/api/health") == 1


# ==================================================== dependency pins
class TestDependencyPins:
    def test_starlette_is_pinned_below_one(self):
        from pathlib import Path
        req = Path("requirements.txt").read_text()
        assert "starlette" in req, "starlette must be declared explicitly"
        assert "<1.0.0" in req, (
            "starlette must stay below 1.0: fastapi 0.141 is incompatible with "
            "starlette 1.x and include_router silently drops routes"
        )

    def test_fastapi_has_an_upper_bound(self):
        from pathlib import Path
        req = Path("requirements.txt").read_text()
        line = next(l for l in req.split("\n") if l.startswith("fastapi"))
        assert "<" in line, "fastapi needs an upper bound"
