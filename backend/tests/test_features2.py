"""
Tests for the added features: extraction, tone, filtering, history and
personalised replies.

Each test corresponds to a capability the brief asked for. They use the local
rules for the deterministic assertions so they do not depend on a live model,
and the model path is exercised separately through normalise_analysis.
"""

import pytest
from fastapi.testclient import TestClient

from app.auth.auth_handler import create_token_for_user
from app.database.db import db
from app.main import app
from app.models.schemas import EmailItem, UserProfile
from app.services import local_rules
from app.services.style_learner import MIN_SAMPLES_FOR_STYLE, StyleLearner

USER = "features2@test.local"

MEETING_BODY = (
    "Hi Sarah,\n\n"
    "Can we meet on Friday at 4pm to review the Q3 roadmap? The board sits on "
    "Tuesday. Please review the attached spec and confirm the delivery dates by "
    "Thursday EOD.\n\n"
    "Thanks,\nKaran"
)


def _headers() -> dict:
    token = create_token_for_user(
        UserProfile(id="usr-f2", email=USER, name="Karan", avatar="")
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def clean():
    db.clear_user(USER)
    yield
    db.clear_user(USER)


@pytest.fixture
def client():
    return TestClient(app)


# ============================================================ extraction
class TestExtraction:
    def test_extracts_people_dates_and_deadlines(self):
        r = local_rules.local_analysis("Q3 sign-off", MEETING_BODY, "Sarah Jenkins")
        assert r["people"], "expected at least the sender"
        assert r["deadlines"] or r["dates"]
        assert r["keywords"]

    def test_meeting_details_are_captured(self):
        r = local_rules.local_analysis(
            "Let's meet to review Q3", "Are you free Friday? Let's do a Zoom call.", "pm@corp.test"
        )
        assert r["category"] == "Meeting"
        assert r["meeting"] is not None
        assert r["meeting"]["is_meeting"] is True

    def test_no_meeting_is_invented_for_ordinary_mail(self):
        r = local_rules.local_analysis("Invoice attached", "Here is the invoice.", "billing@x.test")
        assert r["meeting"] is None, "a message with no meeting must not gain one"

    def test_action_items_are_imperative(self):
        r = local_rules.local_analysis(
            "Review needed", "Please review the spec.\nPlease confirm the dates.", "boss@x.test"
        )
        assert r["action_items"]
        assert all(a["task"] for a in r["action_items"])

    def test_keyword_extraction_ignores_stopwords(self):
        kws = local_rules.rule_keywords("the and for with you this that project roadmap")
        assert "the" not in kws and "and" not in kws
        assert "project" in kws

    # --- the normaliser is what protects the app from a drifting model ---
    def test_normaliser_rejects_an_unknown_category(self):
        out = local_rules.normalise_analysis({"category": "Nonsense"}, "s")
        assert out["category"] == "Other"

    def test_normaliser_clamps_importance(self):
        assert local_rules.normalise_analysis({"importance_score": 9}, "s")["importance_score"] == 1.0
        assert local_rules.normalise_analysis({"importance_score": -4}, "s")["importance_score"] == 0.0

    def test_normaliser_tolerates_garbage(self):
        for junk in (None, [], "nope", {"category": 5}):
            out = local_rules.normalise_analysis(junk, "subject")
            assert out["category"] in local_rules.CATEGORY_VALUES
            assert isinstance(out["keywords"], list)

    def test_normaliser_drops_an_empty_meeting(self):
        out = local_rules.normalise_analysis(
            {"meeting": {"is_meeting": True}}, "s"
        )
        assert out["meeting"] is None

    def test_tone_is_distinct_from_sentiment(self):
        """A polite but firm email is Professional, not Friendly."""
        r = local_rules.local_analysis(
            "Contract", "Dear team, this is unacceptable. Best regards.", "cfo@x.test"
        )
        assert r["tone"] in {"Professional", "Formal", "Angry"}
        assert r["tone"] != r["sentiment"] or r["sentiment"] == "Neutral"

    def test_tone_detects_anger(self):
        r = local_rules.local_analysis(
            "Complaint", "This is outrageous and frankly appalling.", "a@x.test"
        )
        assert r["tone"] == "Angry"


# ============================================================== filtering
class TestFiltering:
    def _seed(self, subject, ts, **kw):
        db.add_email(EmailItem(
            id=f"f{ts}", user_email=USER, sender_name="S", sender_email="s@x.test",
            subject=subject, body="b", snippet="b", date="01 Jan",
            folder="inbox", timestamp=ts, **kw,
        ))

    def test_filters_by_date_range(self, client):
        self._seed("Old", 1_672_531_200)
        self._seed("New", 1_704_067_200)
        recent = client.get("/api/emails?folder=all&from_date=1700000000",
                            headers=_headers()).json()
        assert [e["subject"] for e in recent] == ["New"]

    def test_unparseable_date_is_ignored_not_fatal(self, client):
        self._seed("Mail", 1_704_067_200)
        r = client.get("/api/emails?folder=all&from_date=not-a-date", headers=_headers())
        assert r.status_code == 200
        assert len(r.json()) == 1

    def test_filters_by_priority_and_category(self, client):
        from app.models.schemas import CategoryEnum, PriorityEnum
        self._seed("Meet", 1000.0, category=CategoryEnum.MEETING, priority=PriorityEnum.HIGH)
        assert len(client.get("/api/emails?folder=all&category=Meeting", headers=_headers()).json()) == 1
        assert len(client.get("/api/emails?folder=all&priority=High", headers=_headers()).json()) == 1

    def test_filters_by_tone(self, client):
        from app.models.schemas import EmailSummary
        db.add_email(EmailItem(
            id="t1", user_email=USER, sender_name="S", sender_email="s@x.test",
            subject="Angry note", body="b", snippet="b", date="01 Jan", folder="inbox",
            timestamp=1000.0, summary=EmailSummary(tone="Angry"),
        ))
        assert len(client.get("/api/emails?folder=all&tone=Angry", headers=_headers()).json()) == 1
        assert client.get("/api/emails?folder=all&tone=Friendly", headers=_headers()).json() == []


# ================================================================ history
class TestHistory:
    def test_pasted_email_is_saved_and_reviewable(self, client):
        r = client.post("/api/emails/analyze", headers=_headers(), json={
            "subject": "Q3 sign-off", "body": MEETING_BODY, "sender_name": "Sarah Jenkins",
            "save": True,
        })
        assert r.status_code == 200, r.text
        history = client.get("/api/emails/history", headers=_headers()).json()
        assert len(history) == 1
        assert history[0]["subject"] == "Q3 sign-off"

    def test_save_false_leaves_no_trace(self, client):
        client.post("/api/emails/analyze", headers=_headers(),
                    json={"subject": "X", "body": MEETING_BODY, "save": False})
        assert client.get("/api/emails/history", headers=_headers()).json() == []

    def test_saved_entry_can_be_removed(self, client):
        r = client.post("/api/emails/analyze", headers=_headers(),
                        json={"subject": "X", "body": MEETING_BODY, "save": True})
        email_id = r.json()["id"]
        assert client.delete(f"/api/emails/history/{email_id}", headers=_headers()).status_code == 200
        assert client.get("/api/emails/history", headers=_headers()).json() == []

    def test_saved_entry_carries_the_extraction(self, client):
        r = client.post("/api/emails/analyze", headers=_headers(), json={
            "subject": "Q3 sign-off", "body": MEETING_BODY,
            "sender_name": "Sarah Jenkins", "save": True,
        })
        summary = r.json()["summary"]
        assert summary["one_liner"]
        assert summary["tone"]
        assert "keywords" in summary
        assert "people" in summary

    def test_history_is_scoped_per_user(self, client):
        other = "someone-else@test.local"
        db.add_email(EmailItem(
            id="not-mine", user_email=other, sender_name="X", sender_email="x@x.test",
            subject="Theirs", body="b", snippet="b", date="01 Jan", folder="inbox", timestamp=1.0,
        ))
        assert client.get("/api/emails/history", headers=_headers()).json() == []


# ==================================================== personalised replies
class TestPersonalisedReplies:
    CASUAL = [
        "Hey,\n\nNo worries, I'll take a look today.\n\nCheers,\nKaran",
        "Hey,\n\nCool, thanks for the heads up. I'll sort it out.\n\nCheers,\nKaran",
        "Hey,\n\nGot it. I'll circle back tomorrow.\n\nCheers,\nKaran",
        "Hey,\n\nSure thing, that works for me.\n\nCheers,\nKaran",
        "Hey,\n\nSounds good. Speak soon.\n\nCheers,\nKaran",
    ]

    def test_profile_is_not_ready_without_enough_samples(self):
        db.add_sent_reply(USER, "a@b.test", "Hi", "Hey,\n\nThanks\n\nCheers")
        assert StyleLearner(db, USER).build_profile().ready is False

    def test_profile_becomes_ready_and_detects_the_style(self):
        for body in self.CASUAL:
            db.add_sent_reply(USER, "a@b.test", "Re: x", body)
        p = StyleLearner(db, USER).build_profile()
        assert p.ready is True
        assert p.reply_count == MIN_SAMPLES_FOR_STYLE
        assert p.greeting == "hey"
        assert p.sign_off == "cheers"
        assert p.formality < 0.5, "these samples are deliberately casual"

    def test_guidance_quotes_real_examples(self):
        for body in self.CASUAL:
            db.add_sent_reply(USER, "a@b.test", "Re: x", body)
        learner = StyleLearner(db, USER)
        guidance = learner.guidance(learner.build_profile(), learner.representative_examples(2))
        assert guidance
        assert "example 1" in guidance
        assert "cheers" in guidance.lower()
        assert "casual" in guidance.lower()

    def test_empty_corpus_produces_no_guidance(self):
        learner = StyleLearner(db, USER)
        assert learner.guidance(learner.build_profile(), []) == ""

    def test_style_is_scoped_per_account(self):
        for body in self.CASUAL:
            db.add_sent_reply(USER, "a@b.test", "Re: x", body)
        assert StyleLearner(db, "another@test.local").build_profile().reply_count == 0

    def test_draft_is_not_personalised_until_asked(self, client):
        db.add_email(EmailItem(
            id="sr1", user_email=USER, sender_name="Sarah", sender_email="s@x.test",
            subject="Can you review this?", body="Please review the spec.",
            snippet="b", date="01 Jan", folder="inbox", timestamp=1000.0,
        ))
        plain = client.get("/api/emails/sr1/suggest-reply", headers=_headers()).json()
        assert plain["personalized"] is False
        for body in self.CASUAL:
            db.add_sent_reply(USER, "a@b.test", "Re: x", body)
        styled = client.get("/api/emails/sr1/suggest-reply?personalize=true",
                            headers=_headers()).json()
        assert styled["personalized"] is True
        assert styled["style_notes"]

    def test_tone_defaults_to_the_detected_register(self, client):
        from app.models.schemas import EmailSummary
        db.add_email(EmailItem(
            id="sr2", user_email=USER, sender_name="Boss", sender_email="b@x.test",
            subject="A note", body="This is unacceptable.", snippet="b", date="01 Jan",
            folder="inbox", timestamp=1000.0,
            summary=EmailSummary(tone="Angry"),
        ))
        assert client.get("/api/emails/sr2/suggest-reply", headers=_headers()).json()["tone"] == "Angry"
        forced = client.get("/api/emails/sr2/suggest-reply?tone=Friendly",
                            headers=_headers()).json()
        assert forced["tone"] == "Friendly", "an explicit tone must win"

    def test_style_profile_endpoint_is_honest_when_empty(self, client):
        p = client.get("/api/emails/style-profile", headers=_headers()).json()
        assert p["ready"] is False
        assert p["reply_count"] == 0

    def test_recording_a_reply_needs_a_body(self, client):
        r = client.post("/api/emails/replies/record", headers=_headers(), json={"body": "  "})
        assert r.status_code == 400

    def test_recording_a_reply_grows_the_corpus(self, client):
        r = client.post("/api/emails/replies/record", headers=_headers(),
                        json={"to": "a@b.test", "subject": "Re: x",
                              "body": "Hey, thanks\n\nCheers"})
        assert r.status_code == 200
        assert r.json()["reply_count"] == 1

    def test_the_template_adopts_the_learned_greeting(self):
        """Personalisation must not vanish when the model is unavailable."""
        from app.services.gemini import local_reply
        plain = local_reply("Topic", "Sarah", "Professional", "en")
        styled = local_reply(
            "Topic", "Sarah", "Professional", "en",
            "- They usually open with 'Hey'\n- They usually close with 'Cheers'",
        )
        assert plain.startswith("Hi Sarah")
        assert styled.startswith("Hey Sarah")
        assert "Cheers" in styled


# ================================================================ dashboard
class TestDashboard:
    def test_counts_and_stats_come_from_real_mail(self, client):
        from app.models.schemas import PriorityEnum
        db.add_email(EmailItem(
            id="d1", user_email=USER, sender_name="Sarah", sender_email="s@x.test",
            subject="A", body="b", snippet="b", date="01 Jan", folder="inbox",
            timestamp=1000.0, priority=PriorityEnum.HIGH,
        ))
        db.add_email(EmailItem(
            id="d2", user_email=USER, sender_name="Bob", sender_email="b@x.test",
            subject="B", body="b", snippet="b", date="01 Jan", folder="spam",
            timestamp=2000.0, is_spam=True,
        ))
        counts = client.get("/api/emails/counts", headers=_headers()).json()
        assert counts["all"] == 2
        assert counts["spam"] == 1

        stats = client.get("/api/analytics/summary", headers=_headers()).json()
        assert stats["total_emails"] == 2
        assert stats["spam_blocked"] == 1
        assert stats["urgent_count"] == 1
        assert stats["category_distribution"]
        assert {s["name"] for s in stats["top_senders"]} == {"Sarah", "Bob"}

    def test_empty_mailbox_reports_zeroes(self, client):
        stats = client.get("/api/analytics/summary", headers=_headers()).json()
        assert stats["total_emails"] == 0
        assert stats["top_senders"] == []
        assert stats["daily_volume"] == []
