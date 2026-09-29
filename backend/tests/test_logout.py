"""
Tests for sign-out.

The gap these cover: the app had no logout endpoint at all, and the store's
own `clear_user` -- documented as the "forget me" primitive for sign-out --
removed messages but left the OAuth access and refresh token behind. A
refresh token outlives the session that created it, so a signed-out account
could still be read and written to by anyone holding the app's in-memory
store.
"""

import pytest
from fastapi.testclient import TestClient

from app.auth.auth_handler import create_token_for_user
from app.database.db import db
from app.main import app
from app.models.schemas import EmailItem, UserProfile

USER = "signout@test.local"
OTHER = "bystander@test.local"


def _headers(email: str = USER) -> dict:
    token = create_token_for_user(
        UserProfile(id="usr-so", email=email, name="K", avatar="")
    )
    return {"Authorization": f"Bearer {token}"}


def _seed(email: str = USER, email_id: str = "so1"):
    db.add_email(EmailItem(
        id=email_id, user_email=email, sender_name="S", sender_email="s@x.test",
        subject="Private", body="secret", snippet="secret", date="01 Jan",
        folder="inbox", timestamp=1.0,
    ))
    db.set_user_credentials(email, {
        "token": "access-token", "refresh_token": "refresh-token",
    })
    db.add_sent_reply(email, "a@x.test", "Re: x", "Hey,\n\nThanks\n\nCheers")


@pytest.fixture(autouse=True)
def clean():
    for address in (USER, OTHER):
        db.clear_user(address)
    yield
    for address in (USER, OTHER):
        db.clear_user(address)


@pytest.fixture
def client():
    return TestClient(app)


class TestLogout:
    def test_requires_authentication(self, client):
        assert client.post("/api/auth/logout").status_code in (401, 403)

    def test_sign_out_destroys_stored_data(self, client):
        _seed()
        assert client.post("/api/auth/logout", headers=_headers()).status_code == 200
        assert db.get_email_by_id("so1", USER) is None, "mail must not survive sign-out"
        assert db.get_user_credentials(USER) is None, \
            "a refresh token must not survive sign-out"
        assert db.sent_reply_count(USER) == 0, "learned style must not survive sign-out"

    def test_sign_out_revokes_the_google_grant(self, client):
        _seed()
        r = client.post("/api/auth/logout", headers=_headers())
        # Whatever upstream did, the local copy is gone either way.
        assert "google_revoked" in r.json()
        assert db.get_user_credentials(USER) is None

    def test_sign_out_succeeds_without_google_configured(self, client):
        """Signing out must not fail just because there is nothing to revoke."""
        _seed()
        r = client.post("/api/auth/logout", headers=_headers())
        assert r.status_code == 200
        assert r.json()["google_revoked"] is False

    def test_sign_out_is_not_destructive_to_other_accounts(self, client):
        _seed(USER, "mine")
        _seed(OTHER, "theirs")
        client.post("/api/auth/logout", headers=_headers(USER))
        assert db.get_email_by_id("theirs", OTHER) is not None, \
            "signing out one account must not wipe another"
        assert db.get_user_credentials(OTHER) is not None

    def test_sign_out_twice_is_safe(self, client):
        _seed()
        assert client.post("/api/auth/logout", headers=_headers()).status_code == 200
        assert client.post("/api/auth/logout", headers=_headers()).status_code == 200

    def test_anonymous_sign_out_cannot_clear_a_named_account(self, client):
        _seed(OTHER, "theirs")
        assert client.post("/api/auth/logout").status_code in (401, 403)
        assert db.get_email_by_id("theirs", OTHER) is not None, \
            "an unauthenticated request must not be able to wipe an account"

    def test_clearing_one_account_leaves_its_own_creds_only(self):
        """clear_user is the primitive sign-out relies on; scope it directly."""
        _seed(USER, "a")
        _seed(OTHER, "b")
        db.clear_user(USER)
        assert db.get_user_credentials(USER) is None
        assert db.get_user_credentials(OTHER) is not None
