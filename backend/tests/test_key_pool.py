"""Tests for the Gemini key pool and rotation behaviour.

Rate-limit quota is per Google Cloud project, so rotating keys only helps when
the keys belong to different projects. These tests cover the mechanics: round
robin, cooldown on a limited key, and never leaking key material.
"""

import pytest

from app.services.key_pool import KeyPool, build_pool


class TestPoolConstruction:
    def test_parses_a_comma_separated_list(self):
        pool = build_pool("key-a,key-b,key-c")
        assert len(pool) == 3

    def test_tolerates_whitespace_and_duplicates(self):
        pool = build_pool(" key-a , key-b ,key-a ")
        assert pool.keys == ["key-a", "key-b"]

    def test_accepts_a_json_array(self):
        pool = build_pool('["key-a","key-b"]')
        assert pool.keys == ["key-a", "key-b"]

    def test_empty_input_yields_an_empty_pool(self):
        assert len(build_pool("")) == 0
        assert len(build_pool(None)) == 0
        assert len(build_pool("  ,  , ")) == 0


class TestRotation:
    def test_round_robins_across_keys(self):
        pool = KeyPool(["a", "b", "c"], cooldown=60)
        picked = [pool.acquire() for _ in range(6)]
        assert picked == ["a", "b", "c", "a", "b", "c"]

    def test_a_limited_key_is_skipped_while_cooling_down(self):
        pool = KeyPool(["a", "b", "c"], cooldown=60)
        assert pool.acquire() == "a"

        pool.report("a", "limited")

        # The next picks must avoid 'a' entirely.
        following = {pool.acquire() for _ in range(6)}
        assert "a" not in following
        assert following == {"b", "c"}

    def test_a_permanently_broken_key_is_quarantined(self):
        """An invalid key or disabled billing will not self-heal.

        Leaving it eligible would burn a round-trip on every single request.
        """
        pool = KeyPool(["a", "b"], cooldown=60)
        pool.report("a", "failed")

        following = {pool.acquire() for _ in range(6)}
        assert "a" not in following
        assert following == {"b"}
        assert pool.summary()["disabled"] == 1

    def test_all_keys_cooling_down_reports_none_available(self):
        """The pool reports 'nothing right now'; the service decides what to do.

        Returning a blocked key here would defeat the cooldown entirely.
        """
        pool = KeyPool(["a", "b"], cooldown=60)
        pool.report("a", "limited")
        pool.report("b", "limited")
        assert pool.acquire() is None
        assert pool.summary()["usable_now"] == 0

    def test_unblock_clears_cooldowns(self):
        pool = KeyPool(["a", "b"], cooldown=60)
        pool.report("a", "limited")
        pool.unblock_all()
        assert pool.summary()["usable_now"] == 2


class TestTelemetry:
    def test_counters_are_tracked_per_key(self):
        pool = KeyPool(["keyaaaa", "keybbbb"], cooldown=60)
        pool.acquire(); pool.report("keyaaaa", "success")
        pool.acquire(); pool.report("keybbbb", "limited")

        snap = {s["index"]: s for s in pool.snapshot()}
        assert snap[0]["success"] == 1
        assert snap[1]["limited"] == 1
        assert snap[0]["cooling_down"] == 0
        assert snap[1]["cooling_down"] > 0
        assert snap[1]["disabled"] is False, "a rate limit is not a permanent failure"

    def test_summary_aggregates(self):
        pool = KeyPool(["a", "b"], cooldown=60)
        pool.report("a", "success")
        pool.report("a", "success")
        pool.report("b", "limited")
        summary = pool.summary()
        assert summary["key_count"] == 2
        assert summary["total_success"] == 2
        assert summary["total_rate_limited"] == 1

    def test_telemetry_never_exposes_key_material(self):
        """Health output is public; a key must never appear in it."""
        # A synthetic value, deliberately not a real credential: this string
        # only has to be opaque and unique. Never paste a real API key here --
        # a committed key is a leaked key, and GitHub push protection is right
        # to block it.
        secret = "unit-test-key-abcdef123456"
        pool = KeyPool([secret], cooldown=60)
        pool.report(secret, "success")

        blob = repr(pool.snapshot()) + repr(pool.summary()) + repr(pool)
        assert secret not in blob
        # Only the final 4 characters are ever surfaced.
        assert secret[-4:] in blob


class _FakeChat:
    def __init__(self, text=None, error=None):
        self._text = text
        self._error = error

    def send_message(self, prompt):
        if self._error:
            raise self._error
        return type("R", (), {"text": self._text})()


class _FakeChats:
    """Mirrors the SDK shape: client.chats.create(model=...).send_message()."""

    def __init__(self, owner):
        self._owner = owner

    def create(self, model=None):
        self._owner.calls += 1
        return _FakeChat(text=self._owner.text, error=self._owner.error)


class _FakeClient:
    def __init__(self, text=None, error=None):
        self.text = text
        self.error = error
        self.calls = 0
        self.chats = _FakeChats(self)


def _svc_with(monkeypatch, keys, clients):
    """Build a GeminiAIService wired to fake clients, bypassing real init."""
    from app.config import settings
    from app.services import gemini_service as mod
    from app.services.gemini_service import GeminiAIService
    from app.services.key_pool import build_pool

    monkeypatch.setattr(settings, "GEMINI_API_KEYS", keys, raising=False)
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "", raising=False)
    monkeypatch.setattr(settings, "GEMINI_KEY_COOLDOWN_SECONDS", 60.0, raising=False)
    monkeypatch.setattr(mod, "_RETRY_BASE_DELAY", 0.01)

    svc = GeminiAIService.__new__(GeminiAIService)  # skip _init_model
    svc._pool = build_pool(keys, cooldown=60.0)
    svc._clients = clients
    return svc


class TestRotationIntegration:
    @pytest.mark.asyncio
    async def test_a_rate_limited_key_is_replaced_by_a_working_one(self, monkeypatch):
        """The whole point: 429 on the first key must not fail the email.

        Exercises the real _sync_generate so pool accounting is verified too.
        """
        good = _FakeClient(text=(
            '{"category":"Work","priority":"High","urgency_reason":"x",'
            '"sentiment":"Urgent","one_liner":"Real AI","bullet_points":["a"],'
            '"deadlines":[],"action_items":[]}'
        ))
        limited = _FakeClient(error=RuntimeError("429 Too Many Requests"))

        svc = _svc_with(
            monkeypatch, "key-0001,key-0002",
            {"key-0001": limited, "key-0002": good},
        )

        out = await svc.analyze_and_summarize_email("Subject", "Body", "boss@corp.test")

        assert limited.calls == 1, "the limited key should have been tried first"
        assert good.calls == 1, "it should have rotated to the healthy key"
        assert out["one_liner"] == "Real AI", "must return the real result, not the fallback"
        assert out["category"] == "Work"

        status = svc.pool_status()
        assert status["total_rate_limited"] == 1
        assert status["total_success"] == 1
        assert status["usable_now"] == 1, "the limited key should be cooling down"

    @pytest.mark.asyncio
    async def test_a_dead_key_is_skipped_for_the_rest_of_the_session(self, monkeypatch):
        dead = _FakeClient(error=RuntimeError("400 API key not valid"))
        healthy = _FakeClient(text=(
            '{"category":"Work","priority":"High","urgency_reason":"x",'
            '"sentiment":"Urgent","one_liner":"Real AI","bullet_points":["a"],'
            '"deadlines":[],"action_items":[]}'
        ))
        svc = _svc_with(monkeypatch, "dead-key,good-key", {"dead-key": dead, "good-key": healthy})

        # Force the dead key to be picked first.
        svc._pool._cursor = 0
        svc._pool._blocked_until.clear()
        await svc.analyze_and_summarize_email("S", "B", "s@x.test")

        dead.calls = 0
        await svc.analyze_and_summarize_email("S", "B", "s@x.test")
        await svc.analyze_and_summarize_email("S", "B", "s@x.test")

        assert dead.calls == 0, "a permanently broken key must not be retried"
        assert svc.pool_status()["disabled"] == 1

    @pytest.mark.asyncio
    async def test_a_permanently_bad_key_does_not_spin(self, monkeypatch):
        """A config error must fail fast, not rotate through every key."""
        clients = {
            "bad-1": _FakeClient(error=RuntimeError("400 API key not valid")),
            "bad-2": _FakeClient(error=RuntimeError("400 API key not valid")),
        }
        svc = _svc_with(monkeypatch, "bad-1,bad-2", clients)

        out = await svc.analyze_and_summarize_email("S", "Body text", "s@x.test")

        assert sum(c.calls for c in clients.values()) == 1, "must not retry a permanent error"
        assert out["one_liner"] != "Real AI", "should fall back to the local engine"

    @pytest.mark.asyncio
    async def test_every_key_limited_falls_back_to_the_local_engine(self, monkeypatch):
        clients = {
            "k1": _FakeClient(error=RuntimeError("429 rate limit")),
            "k2": _FakeClient(error=RuntimeError("429 rate limit")),
        }
        svc = _svc_with(monkeypatch, "k1,k2", clients)
        out = await svc.analyze_and_summarize_email("S", "Please review this", "s@x.test")
        assert out["one_liner"] != "Real AI", "must degrade rather than crash"
        assert out["category"] in {"Work", "Updates", "Personal"}
