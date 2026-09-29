"""
The local rules are the degraded path, and the degraded path is what runs when
the Gemini quota is exhausted.

Found by exhausting the quota during testing: an email proposing a Friday
meeting classified as plain Work with no meeting block, because "can we meet"
was not in the marker list. The fallback then reported less than the message
contained, which is better than inventing, but a scheduled email losing its
meeting is a bad miss for the most common kind of scheduling request in
English.
"""

import pytest

from app.services.local_rules import (
    CATEGORY_VALUES, TONE_VALUES, local_analysis, rule_people, rule_time,
)


class TestMeetingDetection:
    @pytest.mark.parametrize("body", [
        "Can we meet on Friday at 4pm to review the roadmap?",
        "Could we meet Tuesday morning?",
        "Are you free Thursday for a chat?",
        "Let's meet at 3pm.",
        "Shall we meet to discuss this?",
        "Book a time with me this week.",
        "Does this time work for you on Monday?",
        "Can you join a quick sync on Tuesday?",
    ])
    def test_scheduling_language_is_a_meeting(self, body):
        r = local_analysis("Subject line", body, "someone@x.test")
        assert r["category"] == "Meeting", f"missed: {body!r}"
        assert r["meeting"] is not None
        assert r["meeting"]["is_meeting"] is True

    @pytest.mark.parametrize("subject,body,expected", [
        ("Invoice attached", "Here is your invoice.", "Finance"),
        ("Build deployed", "Your build is live.", "Updates"),
        ("Weekend sale", "50% off everything.", "Promotions"),
        ("Legal notice", "Our attorney is filing a legal notice.", "Important"),
        ("Weekly digest", "Here is this week's roundup.", "Newsletter"),
    ])
    def test_other_categories_are_unaffected(self, subject, body, expected):
        r = local_analysis(subject, body, "x@x.test")
        assert r["category"] == expected
        assert r["meeting"] is None, "a non-meeting must not gain a meeting block"


class TestTimeExtraction:
    @pytest.mark.parametrize("text,expected", [
        ("meet at 4pm", "4pm"),
        ("call at 16:30", "16:30"),
        ("at 9 am tomorrow", "9am"),
        ("at 11:45 am", "11:45 am"),
        ("top 4 items", None),
        ("no time mentioned", None),
        ("", None),
    ])
    def test_only_a_stated_clock_time_is_read_as_a_time(self, text, expected):
        assert rule_time(text) == expected

    def test_the_time_reaches_the_meeting_block(self):
        r = local_analysis("Sync", "Can we meet on Friday at 4pm?", "a@x.test")
        assert r["meeting"]["time"] == "4pm"

    def test_a_meeting_with_no_time_reports_none(self):
        r = local_analysis("Sync", "Let's meet next week somewhere.", "a@x.test")
        assert r["meeting"]["time"] is None, "a time must not be invented"


class TestNoFabrication:
    """The fallback must report less, never more."""

    def test_a_short_mail_gains_no_meeting(self):
        r = local_analysis("Hi", "Hello", "a@x.test")
        assert r["meeting"] is None

    def test_people_come_from_the_text_only(self):
        r = local_analysis("Notes", "Regards,\nDana Whitfield", "sender@x.test")
        names = {p["name"] for p in r["people"]}
        assert names <= {"Dana Whitfield", "Sender"}, f"invented: {names}"

    def test_no_deadline_is_invented(self):
        r = local_analysis("Note", "Just saying hello.", "a@x.test")
        assert r["deadlines"] == []

    def test_every_field_is_typed_as_the_schema_expects(self):
        r = local_analysis("Subject", "Body text here.", "a@x.test")
        for field in CATEGORY_VALUES:
            assert r["category"] in CATEGORY_VALUES
        assert r["tone"] in TONE_VALUES
        assert isinstance(r["bullet_points"], list)
        assert isinstance(r["keywords"], list)
        assert isinstance(r["people"], list)
        assert isinstance(r["action_items"], list)
        assert isinstance(r["deadlines"], list)
        assert isinstance(r["dates"], list)
        assert 0.0 <= r["importance_score"] <= 1.0
        assert isinstance(r["requires_reply"], bool)


class TestPeopleArePeople:
    def test_a_signature_name_is_found(self):
        """Regards is capitalised in every real email; the pattern was case-sensitive."""
        names = [p["name"] for p in rule_people("Regards,\nDana Whitfield", "")]
        assert names == ["Dana Whitfield"]

    @pytest.mark.parametrize("sender", [
        "notifications@acme.co",
        "no-reply@github.com",
        "donotreply@mailer.example.org",
    ])
    def test_a_bare_address_is_not_a_person(self, sender):
        """Showing an email address under People is worse than showing nothing."""
        assert rule_people("Hello", sender) == []

    @pytest.mark.parametrize("body,expected", [
        ("Thanks,\nKaran", ["Karan"]),
        ("Best regards,\nDr Priya Raman", ["Priya Raman"]),
        ("Cheers,\nBen", ["Ben"]),
        ("Hello team,", []),
        ("Hi all,", []),
    ])
    def test_only_actual_names_are_listed(self, body, expected):
        assert [p["name"] for p in rule_people(body, "")] == expected

    def test_the_same_name_is_not_listed_twice(self):
        names = [p["name"] for p in rule_people("Regards,\nKaran", "Karan")]
        assert len(names) == len(set(n.lower() for n in names))

    def test_a_sender_that_is_both_name_and_address_keeps_the_name(self):
        names = [p["name"] for p in rule_people("", "Sarah Jenkins <s@x.test>")]
        assert names == ["Sarah Jenkins"]
