"""
The analyze response must satisfy the view that renders it.

AnalyzeView is the headline screen -- "any email, paste it, get the analysis" --
and it reads its fields flat: result.tone, result.one_liner, result.meeting,
result.importance_score, result.phishing. The endpoint returns an EmailItem,
which nests the analysis under `summary`.

When those two drifted apart the screen rendered blanks: the tone badge, the
one-liner, the meeting block, the keywords and the phishing banner were all
undefined, while the request reported success. Nothing threw, so no test
noticed.

This asserts the response contains every field the view reads, and pins the
nesting the view has to flatten.
"""

import pytest
from fastapi.testclient import TestClient

from app.auth.auth_handler import create_token_for_user
from app.database.db import db
from app.main import app
from app.models.schemas import UserProfile

USER = "contract@test.local"

BODY = (
    "Hi Sarah,\n\nCan we meet on Friday at 4pm to review the Q3 roadmap?\n"
    "Please review the spec and confirm the delivery dates by Thursday EOD.\n\n"
    "Thanks,\nKaran"
)

# The response is an EmailItem plus the spam verdict, so the split is fixed:
# message-level fields at the top level, analysis fields under `summary`.
# AnalyzeView flattens the nested half; the tests below pin each side so
# neither can drift without the other being noticed.
TOP_LEVEL_FIELDS = [
    "id", "category", "priority", "action_items", "is_spam", "reply_draft",
    "phishing", "engine", "saved",
]
SUMMARY_FIELDS = [
    "one_liner", "bullet_points", "urgency_reason", "tone", "sentiment",
    "importance_score", "requires_reply", "key_deadlines", "dates",
    "people", "keywords", "meeting",
]


def _headers():
    return {"Authorization": "Bearer " + create_token_for_user(
        UserProfile(id="usr-ct", email=USER, name="K", avatar=""))}


@pytest.fixture(autouse=True)
def clean():
    db.clear_user(USER)
    yield
    db.clear_user(USER)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def analysed(client):
    r = client.post("/api/emails/analyze", headers=_headers(), json={
        "subject": "Q3 roadmap sign-off", "body": BODY,
        "sender_name": "Sarah Jenkins", "sender_email": "sarah@corp.test",
        "save": True,
    })
    assert r.status_code == 200, r.text
    return r.json()


class TestAnalyzeResponseContract:
    def test_message_level_fields_are_at_the_top_level(self, analysed):
        missing = [f for f in TOP_LEVEL_FIELDS if f not in analysed]
        assert not missing, f"the endpoint stopped returning {missing}"

    def test_analysis_fields_are_present(self, analysed):
        summary = analysed.get("summary") or {}
        missing = [f for f in SUMMARY_FIELDS if f not in summary]
        assert not missing, (
            f"summary is missing {missing}; AnalyzeView flattens these and "
            "they would render blank"
        )

    def test_the_analysis_is_nested_under_summary(self, analysed):
        """The view flattens this; if it moves, the flatten is wrong."""
        summary = analysed.get("summary")
        assert isinstance(summary, dict), "summary must be an object"
        for f in ("one_liner", "tone", "keywords", "people", "meeting",
                  "importance_score", "requires_reply", "dates", "key_deadlines"):
            assert f in summary, f"summary.{f} is missing"

    def test_the_phishing_verdict_survives_the_response_model(self, analysed):
        """response_model=EmailItem used to strip this, hiding the warning."""
        ph = analysed.get("phishing")
        assert isinstance(ph, dict), "no phishing verdict in the response"
        assert ph.get("status") in {"Safe", "Suspicious", "Phishing"}
        assert ph.get("reason")

    def test_the_view_has_what_it_needs_to_derive_is_phishing(self, analysed):
        """AnalyzeView computes is_phishing from these; both must be there."""
        assert "is_spam" in analysed, "the view cannot derive is_phishing without is_spam"
        ph = analysed.get("phishing") or {}
        assert "status" in ph, "the view cannot derive is_phishing without a status"

    def test_engine_is_reported_so_a_degraded_run_is_visible(self, analysed):
        assert analysed.get("engine") in {"gemini", "local_rules"}

    def test_saved_flag_matches_the_request(self, client):
        yes = client.post("/api/emails/analyze", headers=_headers(),
                          json={"subject": "x", "body": BODY, "save": True}).json()
        no = client.post("/api/emails/analyze", headers=_headers(),
                         json={"subject": "y", "body": BODY, "save": False}).json()
        assert yes["saved"] is True
        assert no["saved"] is False

    def test_a_reply_can_be_drafted_in_the_same_call(self, client):
        r = client.post("/api/emails/analyze", headers=_headers(), json={
            "subject": "Q3 roadmap", "body": BODY, "sender_name": "Sarah",
            "generate_reply": True, "save": False,
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["reply_draft"], "generate_reply=true returned no draft"
        assert "Sarah" in body["reply_draft"]

    def test_the_view_gets_real_extraction_not_placeholders(self, analysed):
        summary = analysed["summary"]
        assert summary["one_liner"]
        assert summary["tone"] in {"Professional", "Formal", "Friendly",
                                   "Angry", "Urgent", "Neutral"}
        assert 0.0 <= float(summary["importance_score"]) <= 1.0
        # The response must not contain an unsubstituted template slot. This
        # is the prompt f-prefix bug, caught at the API boundary this time.
        blob = str(analysed)
        for slot in ("{subject}", "{body}", "{sender}", "{style_section}"):
            assert slot not in blob, f"an unsubstituted {slot} reached the client"
