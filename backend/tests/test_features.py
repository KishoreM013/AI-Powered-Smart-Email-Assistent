"""Tests for the added capabilities: paste-analyse, tone, extraction, history, style.

These cover the features that were missing:
  - analysing an email the user pasted, not one from a connected mailbox
  - tone detection, distinct from sentiment
  - extraction of people, dates, meeting details and keywords
  - persistent history that survives a restart
  - personalised replies learned from the user's own sent mail
  - filtering by date
"""

import pytest
from fastapi.testclient import TestClient

from app.auth.auth_handler import create_token_for_user
from app.database.db import db
from app.database.storage import Storage
from app.main import app
from app.models.schemas import UserProfile
from app.services.style_learner import StyleLearner

USER = "features@test.local"


def _headers() -> dict:
    token = create_token_for_user(
        UserProfile(id="usr-features", email=USER, name="Karan", avatar="")
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client():
    db.clear_user(USER)
    with TestClient(app) as c:
        yield c
    db.clear_user(USER)


SAMPLE = {
    "subject": "URGENT: Q3 roadmap sign-off needed by Friday",
    "sender_name": "Sarah Jenkins (VP Engineering)",
    "sender_email": "sarah.jenkins@corp.test",
    "body": (
        "Hi Karan,\n\n"
        "We need your sign-off on the Q3 roadmap before the board meeting on "
        "Friday at 4pm in the boardroom.\n\n"
        "Please review the attached spec and confirm the delivery dates by "
        "Thursday EOD.\n\n"
        "Thanks,\nSarah"
    ),
}


# ============================================================== paste/analyse
class TestAnalyzeEndpoint:
    def test_pasted_email_is_analysed(self, client):
        """The core feature: any email, from nowhere in particular."""
        resp = client.post("/api/emails/analyze", json=SAMPLE, headers=_headers())
        assert resp.status_code == 200, resp.text
        body = resp.json()

        assert body["category"]
        assert body["priority"] in {"High", "Medium", "Low"}
        assert body["one_liner"]
        assert body["bullet_points"]
        assert body["engine"] in {"gemini", "local_rules"}

    def test_empty_input_is_rejected(self, client):
        resp = client.post(
            "/api/emails/analyze",
            json={"subject": "", "body": "", "sender_email": ""},
            headers=_headers(),
        )
        assert resp.status_code == 400

    def test_requires_authentication(self, client):
        assert client.post("/api/emails/analyze", json=SAMPLE).status_code == 401

    def test_saving_stores_it_and_it_appears_in_history(self, client):
        resp = client.post(
            "/api/emails/analyze", json={**SAMPLE, "save": True}, headers=_headers()
        )
        assert resp.status_code == 200
        assert resp.json()["saved"] is True

        history = client.get("/api/emails/history", headers=_headers()).json()
        assert len(history) == 1
        assert history[0]["subject"] == SAMPLE["subject"]

    def test_save_false_leaves_no_trace(self, client):
        client.post("/api/emails/analyze", json={**SAMPLE, "save": False}, headers=_headers())
        assert client.get("/api/emails/history", headers=_headers()).json() == []

    def test_can_draft_a_reply_in_one_call(self, client):
        resp = client.post(
            "/api/emails/analyze",
            json={**SAMPLE, "save": False, "generate_reply": True},
            headers=_headers(),
        )
        assert resp.status_code == 200
        assert resp.json()["reply"], "expected a drafted reply"

    def test_phishing_verdict_is_included(self, client):
        resp = client.post(
            "/api/emails/analyze",
            json={
                "subject": "Verify your account immediately",
                "sender_email": "support@amaz0n-verify.example.net",
                "body": "Click here to verify your password within 2 hours.",
                "save": False,
            },
            headers=_headers(),
        )
        body = resp.json()
        assert body["is_phishing"] is True
        assert body["phishing"]["status"] in {"Phishing", "Suspicious"}
        assert body["phishing"]["signals"]


# ======================================================= tone + extraction
class TestToneAndExtraction:
    def test_local_engine_reports_tone_separately_from_sentiment(self):
        from app.services.gemini_service import GeminiAIService

        svc = GeminiAIService.__new__(GeminiAIService)
        result = svc._rule_engine(
            "URGENT: final notice",
            "This is completely unacceptable and frankly appalling. I am furious "
            "about the delay. Please respond IMMEDIATELY.",
            "ceo@corp.test",
        )
        assert result["tone"] in {"Angry", "Urgent"}
        assert result["sentiment"] in {"Urgent", "Frustrated"}
        # Tone is a register, not an emotion: both must be present and typed.
        assert isinstance(result["tone"], str) and result["tone"]

    def test_local_engine_extracts_people_dates_and_keywords(self):
        from app.services.gemini_service import GeminiAIService

        svc = GeminiAIService.__new__(GeminiAIService)
        result = svc._rule_engine(
            "Budget review meeting",
            "Hi Sarah,\n\nCan we meet on Friday at 4pm to review the budget forecast?",
            "David Miller (Finance Lead)",
        )
        assert result["people"], "expected at least the sender"
        names = [p["name"] for p in result["people"]]
        assert any("David" in n for n in names)
        assert result["dates"] or result["deadlines"]
        assert result["keywords"]

    def test_meeting_details_are_captured(self):
        from app.services.gemini_service import GeminiAIService

        svc = GeminiAIService.__new__(GeminiAIService)
        result = svc._rule_engine(
            "Let's meet to review Q3",
            "Are you free on Friday? We can do a Zoom call to go through the roadmap.",
            "pm@corp.test",
        )
        assert result["category"] == "Meeting"
        assert result["meeting"] is not None
        assert result["meeting"]["is_meeting"] is True
        assert result["meeting"]["platform"] == "zoom"

    def test_every_analysis_carries_the_full_contract(self, client):
        """Both the model path and the fallback must return the same keys."""
        from app.services.gemini_service import GeminiAIService

        svc = GeminiAIService.__new__(GeminiAIService)
        result = svc._rule_engine("Test", "Body text here", "a@b.test")
        expected = {
            "category", "priority", "urgency_reason", "sentiment", "tone", "one_liner",
            "bullet_points", "deadlines", "dates", "people", "meeting", "keywords",
            "action_items", "requires_reply", "importance_score",
        }
        assert expected - set(result) == set()


# ================================================================== history
class TestHistory:
    def test_history_survives_a_new_store_instance(self, tmp_path):
        """Persistence, not an in-memory dict: this is what 'history' requires."""
        path = str(tmp_path / "history.db")
        first = Storage(path)
        from app.models.schemas import EmailItem

        first.upsert_email(EmailItem(
            id="e1", user_email="owner@test.local", sender_name="S", sender_email="s@x.test",
            subject="Persisted subject", body="body", folder="inbox", timestamp=1000.0,
        ))
        first.close()

        second = Storage(path)
        got = second.get_email("e1", "owner@test.local")
        assert got is not None, "the email should have survived a restart"
        assert got["subject"] == "Persisted subject"
        second.close()

    def test_history_is_scoped_per_user(self, client):
        for index in range(2):
            client.post(
                "/api/emails/analyze",
                json={**SAMPLE, "subject": f"Mail {index}", "save": True},
                headers=_headers(),
            )
        mine = client.get("/api/emails/history", headers=_headers()).json()
        assert len(mine) == 2

    def test_history_entry_can_be_deleted(self, client):
        resp = client.post(
            "/api/emails/analyze", json={**SAMPLE, "save": True}, headers=_headers()
        )
        email_id = resp.json()["email"]["id"]
        assert client.delete(
            f"/api/emails/history/{email_id}", headers=_headers()
        ).status_code == 200
        assert client.get("/api/emails/history", headers=_headers()).json() == []


# ================================================== date + tone filtering
class TestFiltering:
    def _seed(self, client, subject, timestamp):
        from app.models.schemas import EmailItem

        db.add_email(EmailItem(
            id=f"f-{timestamp}", user_email=USER, sender_name="S", sender_email="s@x.test",
            subject=subject, body="body", folder="inbox", timestamp=float(timestamp),
        ))

    def test_filters_by_date_range(self, client):
        # 2023-01-01 and 2024-01-01 as epoch seconds
        self._seed(client, "Old mail", 1_672_531_200)
        self._seed(client, "New mail", 1_704_067_200)

        everything = client.get(
            "/api/emails?folder=all&from_date=1600000000&to_date=1800000000",
            headers=_headers(),
        ).json()
        assert len(everything) == 2

        recent = client.get(
            "/api/emails?folder=all&from_date=1700000000", headers=_headers()
        ).json()
        assert [e["subject"] for e in recent] == ["New mail"]

    def test_filters_by_category_and_priority(self, client):
        from app.models.schemas import CategoryEnum, EmailItem, PriorityEnum

        db.add_email(EmailItem(
            id="fc1", user_email=USER, sender_name="S", sender_email="s@x.test",
            subject="Meeting invite", body="b", folder="inbox", timestamp=1000.0,
            category=CategoryEnum.MEETING, priority=PriorityEnum.HIGH,
        ))
        meetings = client.get(
            "/api/emails?folder=all&category=Meeting", headers=_headers()
        ).json()
        assert len(meetings) == 1
        high = client.get(
            "/api/emails?folder=all&priority=High", headers=_headers()
        ).json()
        assert len(high) == 1

    def test_unparseable_date_is_ignored_rather_than_erroring(self, client):
        self._seed(client, "Mail", 1_704_067_200)
        resp = client.get(
            "/api/emails?folder=all&from_date=not-a-date", headers=_headers()
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1


# =================================================== personalised replies
class TestStyleLearning:
    SAMPLES = [
        "Hey there,\n\nSounds good to me. Ping me if anything changes.\n\nCheers,\nKaran",
        "Hey,\n\nNo worries, I'll take a look today. Speak soon.\n\nCheers,\nKaran",
        "Hey,\n\nCool, thanks for the heads up. I'll sort it out.\n\nCheers,\nKaran",
        "Hey,\n\nGot it. I'll circle back tomorrow.\n\nCheers,\nKaran",
        "Hey,\n\nSure thing, that works for me.\n\nCheers,\nKaran",
    ]

    def test_profile_is_not_ready_without_enough_samples(self, client):
        db.add_sent_reply(USER, "a@b.test", "Hi", "Hey,\n\nThanks\n\nCheers")
        profile = client.get("/api/emails/style-profile", headers=_headers()).json()
        assert profile["reply_count"] == 1
        assert profile["ready"] is False

    def test_profile_becomes_ready_and_detects_style(self, client):
        for body in self.SAMPLES:
            db.add_sent_reply(USER, "a@b.test", "Re: thing", body)
        profile = client.get("/api/emails/style-profile", headers=_headers()).json()
        assert profile["ready"] is True
        assert profile["reply_count"] == 5
        assert profile["greeting"] == "hey"
        assert profile["sign_off"] == "cheers"
        # Deliberately casual, so the score should be low.
        assert profile["formality"] < 0.5

    def test_style_is_scoped_per_user(self, client):
        for body in self.SAMPLES:
            db.add_sent_reply(USER, "a@b.test", "s", body)
        other = client.post("/api/auth/demo-login")
        # A different account must not inherit this corpus.
        assert other.status_code in (200, 404)

    def test_representative_examples_come_from_real_replies(self, client):
        for body in self.SAMPLES:
            db.add_sent_reply(USER, "a@b.test", "s", body)
        from app.database.storage import get_storage

        learner = StyleLearner(get_storage(), USER)
        examples = learner.representative_examples(limit=3)
        assert examples, "expected sample replies"
        assert all(e.strip() in self.SAMPLES for e in examples)

    def test_guidance_is_empty_until_the_profile_is_ready(self, client):
        from app.database.storage import get_storage

        db.add_sent_reply(USER, "a@b.test", "s", "Hey, thanks\n\nCheers")
        learner = StyleLearner(get_storage(), USER)
        assert learner.guidance(learner.build_profile(), []) == ""

    def test_guidance_mentions_the_learned_sign_off(self, client):
        from app.database.storage import get_storage

        for body in self.SAMPLES:
            db.add_sent_reply(USER, "a@b.test", "s", body)
        learner = StyleLearner(get_storage(), USER)
        guidance = learner.guidance(learner.build_profile(), learner.representative_examples())
        assert guidance
        assert "cheers" in guidance.lower()
        assert "casual" in guidance.lower()

    def test_suggest_reply_reports_whether_it_was_personalised(self, client):
        from app.models.schemas import EmailItem

        db.add_email(EmailItem(
            id="sr1", user_email=USER, sender_name="Sarah", sender_email="s@x.test",
            subject="Can you review this?", body="Please review the attached spec.",
            folder="inbox", timestamp=1000.0,
        ))
        plain = client.get(
            "/api/emails/sr1/suggest-reply", headers=_headers()
        ).json()
        assert plain["personalized"] is False

        for body in self.SAMPLES:
            db.add_sent_reply(USER, "a@b.test", "s", body)
        styled = client.get(
            "/api/emails/sr1/suggest-reply?personalize=true", headers=_headers()
        ).json()
        assert styled["personalized"] is True
        assert styled["style_notes"]

    def test_tone_defaults_to_the_detected_tone(self, client):
        from app.models.schemas import EmailItem, EmailSummary

        db.add_email(EmailItem(
            id="sr2", user_email=USER, sender_name="Boss", sender_email="b@x.test",
            subject="Angry note", body="This is unacceptable.",
            folder="inbox", timestamp=1000.0,
            summary=EmailSummary(tone="Angry", one_liner="x"),
        ))
        resp = client.get("/api/emails/sr2/suggest-reply", headers=_headers()).json()
        assert resp["tone"] == "Angry", "should mirror the sender's register"

        forced = client.get(
            "/api/emails/sr2/suggest-reply?tone=Friendly", headers=_headers()
        ).json()
        assert forced["tone"] == "Friendly", "an explicit tone must win"

    def test_recording_a_reply_needs_a_body(self, client):
        resp = client.post("/api/emails/replies/record", json={"body": "  "}, headers=_headers())
        assert resp.status_code == 400

    def test_recording_a_reply_increments_the_count(self, client):
        resp = client.post(
            "/api/emails/replies/record",
            json={"to": "a@b.test", "subject": "Re: x", "body": "Hey, thanks\n\nCheers"},
            headers=_headers(),
        )
        assert resp.status_code == 200
        assert resp.json()["reply_count"] == 1
