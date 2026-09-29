"""Test configuration.

Environment variables are set here because ``conftest.py`` is imported before
any test module, and the application reads its settings at import time.

The suite runs against a throwaway SQLite file so it can never touch real mail,
and resets the storage singleton between tests.
"""

import os
import tempfile
from pathlib import Path

os.environ["DEMO_MODE"] = "False"
os.environ["ENVIRONMENT"] = "development"
os.environ["JWT_SECRET"] = "test-secret-value-that-is-long-enough-for-tests-123"
# Keep Gemini out of the tests: they must not make network calls.
os.environ["GEMINI_API_KEY"] = ""
os.environ.pop("GOOGLE_CLIENT_ID", None)
os.environ.pop("GOOGLE_CLIENT_SECRET", None)

# Point storage at a per-run temporary file.
_TMP_DB = Path(tempfile.gettempdir()) / "smart_email_tests.db"
for suffix in ("", "-wal", "-shm"):
    try:
        _TMP_DB.with_name(_TMP_DB.name + suffix).unlink()
    except FileNotFoundError:
        pass
os.environ["STORAGE_PATH"] = str(_TMP_DB)

import pytest  # noqa: E402

from app.database import storage as storage_module  # noqa: E402
from app.database.db import db  # noqa: E402
from app.middleware import rate_limit  # noqa: E402


@pytest.fixture(autouse=True)
def clean_state():
    """Reset rate limits and any seeded rows around every test."""
    rate_limit.reset()
    # Remove rows the test itself created, without touching the schema.
    for address in ("alice@test.local", "bob@test.local", "sandbox@test.local",
                    "nobody@test.local", "s@x.test", "carol@test.local"):
        db.clear_user(address)
    yield
    for address in ("alice@test.local", "bob@test.local", "sandbox@test.local",
                    "nobody@test.local", "s@x.test", "carol@test.local"):
        db.clear_user(address)


@pytest.fixture
def storage():
    """Direct access to the storage singleton, for focused tests."""
    return storage_module.get_storage()
