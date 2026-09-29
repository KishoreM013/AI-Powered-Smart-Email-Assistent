"""
The style-profile endpoint and the reply generator must agree.

They did not. The endpoint called a get_storage() that does not exist, and a
bare `except` around the call swallowed the ImportError and returned a
plausible-looking empty profile. So the UI showed "not enough replies yet" and
disabled the personalise affordance while the drafts coming out of the very
same screen were already in the user's voice. The endpoint was reporting a
default, not a measurement.

These tests assert the two paths read the same corpus.
"""

import pytest
from fastapi.testclient import TestClient

from app.auth.auth_handler import create_token_for_user
from app.database.db import db
from app.main import app
from app.models.schemas import EmailItem, UserProfile

USER = "style-agree@test.local"

CASUAL = [
    "Hey,\n\nNo worries, I'll take a look today.\n\nCheers,\nKaran",
    "Hey,\n\nCool, thanks for the heads up. I'll sort it out.\n\nCheers,\nKaran",
    "Hey,\n\nGot it. I'll circle back tomorrow.\n\nCheers,\nKaran",
    "Hey,\n\nSure thing, that works for me.\n\nCheers,\nKaran",
    "Hey,\n\nSounds good. Speak soon.\n\nCheers,\nKaran",
]


def _headers():
    return {"Authorization": "Bearer " + create_token_for_user(
        UserProfile(id="usr-sa", email=USER, name="K", avatar=""))}


@pytest.fixture(autouse=True)
def clean():
    db.clear_user(USER)
    yield
    db.clear_user(USER)


@pytest.fixture
def client():
    return TestClient(app)


def _seed_email(email_id="sa1"):
    db.add_email(EmailItem(
        id=email_id, user_email=USER, sender_name="Sarah", sender_email="s@x.test",
        subject="Can you review this?", body="Please review the spec.",
        snippet="b", date="01 Jan", folder="inbox", timestamp=1000.0,
    ))


def _record(n=None):
    for body in (CASUAL if n is None else CASUAL[:n]):
        db.add_sent_reply(USER, "a@b.test", "Re: x", body)


class TestStyleProfileAgreesWithTheDraft:
    def test_endpoint_reports_the_corpus_that_exists(self, client):
        """The bug: this returned 0 no matter what had been recorded."""
        _record()
        profile = client.get("/api/emails/style-profile", headers=_headers()).json()
        assert profile["reply_count"] == len(CASUAL), (
            "the endpoint did not read the store the reply generator reads"
        )
        assert profile["ready"] is True
        assert profile["greeting"] == "hey"
        assert profile["sign_off"] == "cheers"

    def test_endpoint_and_generator_agree_on_readiness(self, client):
        """Below the threshold both must say no."""
        _record(n=2)
        headers = _headers()
        profile = client.get("/api/emails/style-profile", headers=headers).json()
        _seed_email()
        draft = client.get("/api/emails/sa1/suggest-reply?personalize=true",
                           headers=headers).json()
        assert profile["ready"] is False
        assert draft["personalized"] is False, (
            "the draft claims a personalisation the profile says is not available"
        )

    def test_endpoint_and_generator_agree_above_the_threshold(self, client):
        _record()
        headers = _headers()
        profile = client.get("/api/emails/style-profile", headers=headers).json()
        _seed_email()
        draft = client.get("/api/emails/sa1/suggest-reply?personalize=true",
                           headers=headers).json()
        assert profile["ready"] is True
        assert draft["personalized"] is True, (
            "the profile says a style is available but the draft ignored it"
        )
        assert draft["style_notes"], "personalised draft should explain itself"

    def test_recording_through_the_api_shows_up_immediately(self, client):
        """A reply sent in the UI must be visible without a restart."""
        headers = _headers()
        assert client.get("/api/emails/style-profile", headers=headers).json()["ready"] is False
        for body in CASUAL:
            r = client.post("/api/emails/replies/record", headers=headers, json={
                "to": "a@b.test", "subject": "Re: x", "body": body,
            })
            assert r.status_code == 200
        profile = client.get("/api/emails/style-profile", headers=headers).json()
        assert profile["ready"] is True, "recorded replies did not reach the profile"

    def test_profile_is_cleared_on_sign_out(self, client):
        _record()
        headers = _headers()
        assert client.get("/api/emails/style-profile", headers=headers).json()["ready"] is True
        client.post("/api/auth/logout", headers=headers)
        after = client.get("/api/emails/style-profile", headers=headers).json()
        assert after["reply_count"] == 0
        assert after["ready"] is False, "a signed-out account must not look personalised"

    def test_the_endpoint_never_hides_a_broken_import(self, client, monkeypatch):
        """It used to answer a default profile when its storage import failed."""
        import app.services.style_learner as sl

        def boom(*a, **k):
            raise RuntimeError("storage is unreachable")

        monkeypatch.setattr(sl.StyleLearner, "build_profile", boom)
        # raise_server_exceptions=False so the failure surfaces as a response
        # rather than being re-raised into the test.
        strict = TestClient(app, raise_server_exceptions=False)
        r = strict.get("/api/emails/style-profile", headers=_headers())
        # A server-side failure must be visible, not reported as "no style yet".
        assert r.status_code >= 500, (
            f"a broken store was reported as {r.status_code} with "
            f"{r.text[:80]!r} instead of surfacing the failure"
        )
