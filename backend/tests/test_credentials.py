"""
Tests for the Gmail credential path.

The bug these guard against: `creds.refresh(google.auth.transport.requests
.Request())` was called in a module that never imported `google`. The
NameError was swallowed by a broad `except`, and the function returned None,
which the caller reports as "not connected". A refreshable token was therefore
indistinguishable from an absent one, so every account silently stopped
working about an hour after connecting.
"""

import sys
import types

import pytest

from app.database.db import db
from app.services.gmail_service import gmail_service

USER = "creds@test.local"


@pytest.fixture(autouse=True)
def clean():
    db.clear_user(USER)
    yield
    db.clear_user(USER)


class _Creds:
    """Stands in for google.oauth2.credentials.Credentials."""

    def __init__(self, valid=False, has_refresh=True, fail=False):
        self.valid = valid
        self.refresh_token = "refresh-token" if has_refresh else None
        self.token = "access-token"
        self._fail = fail
        self.refreshed_with = None
        self.persisted = False

    def refresh(self, request):
        self.refreshed_with = request
        if self._fail:
            raise RuntimeError("invalid_grant")
        self.valid = True


def _patch_credentials(monkeypatch, creds):
    """Install fake google modules so the local import resolves to `creds`."""
    google_mod = types.ModuleType("google")
    auth_mod = types.ModuleType("google.auth")
    transport_mod = types.ModuleType("google.auth.transport")
    requests_mod = types.ModuleType("google.auth.transport.requests")
    oauth2_mod = types.ModuleType("google.oauth2")
    creds_mod = types.ModuleType("google.oauth2.credentials")

    requests_mod.Request = lambda: "a-real-transport-request"
    creds_mod.Credentials = lambda **kw: creds

    google_mod.auth = auth_mod
    google_mod.oauth2 = oauth2_mod
    auth_mod.transport = transport_mod
    transport_mod.requests = requests_mod
    oauth2_mod.credentials = creds_mod

    for name, mod in [
        ("google", google_mod),
        ("google.auth", auth_mod),
        ("google.auth.transport", transport_mod),
        ("google.auth.transport.requests", requests_mod),
        ("google.oauth2", oauth2_mod),
        ("google.oauth2.credentials", creds_mod),
    ]:
        monkeypatch.setitem(sys.modules, name, mod)


def _store_token(refresh_token="refresh-token"):
    db.set_user_credentials(USER, {
        "token": "expired-access-token",
        "refresh_token": refresh_token,
    })


class TestCredentials:
    def test_valid_token_needs_no_refresh(self, monkeypatch):
        creds = _Creds(valid=True)
        _patch_credentials(monkeypatch, creds)
        _store_token()
        out = gmail_service._credentials_for(USER)
        assert out is creds
        assert creds.refreshed_with is None, "a valid token must not be refreshed"

    def test_expired_token_is_actually_refreshed(self, monkeypatch):
        """The regression: this used to raise NameError and return None."""
        creds = _Creds(valid=False)
        _patch_credentials(monkeypatch, creds)
        _store_token()
        out = gmail_service._credentials_for(USER)
        assert out is creds, "a refreshable token must yield usable credentials"
        assert creds.refreshed_with == "a-real-transport-request"

    def test_refreshed_token_is_persisted(self, monkeypatch):
        creds = _Creds(valid=False)
        _patch_credentials(monkeypatch, creds)
        _store_token()
        gmail_service._credentials_for(USER)
        stored = db.get_user_credentials(USER) or {}
        assert stored.get("refresh_token") == "refresh-token", \
            "a successful refresh must be written back or it repeats every call"

    def test_revoked_token_reports_not_connected(self, monkeypatch):
        """A rejected refresh must be distinguishable, not retried forever."""
        creds = _Creds(valid=False, fail=True)
        _patch_credentials(monkeypatch, creds)
        _store_token()
        assert gmail_service._credentials_for(USER) is None

    def test_token_without_refresh_token_is_not_connected(self, monkeypatch):
        creds = _Creds(valid=False, has_refresh=False)
        _patch_credentials(monkeypatch, creds)
        _store_token(refresh_token=None)
        assert gmail_service._credentials_for(USER) is None

    def test_no_stored_token_is_not_connected(self, monkeypatch):
        _patch_credentials(monkeypatch, _Creds())
        assert gmail_service._credentials_for(USER) is None

    def test_credentials_are_scoped_to_the_account(self, monkeypatch):
        """One account's token must never be handed to another."""
        creds = _Creds(valid=True)
        _patch_credentials(monkeypatch, creds)
        _store_token()
        assert gmail_service._credentials_for("someone-else@test.local") is None
