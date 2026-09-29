"""In-process sliding-window rate limiter.

Deliberately dependency-free: the backend is a single process, so a shared
store (Redis) would add operational weight without buying real protection.
If this is ever scaled to multiple workers, swap the storage for Redis and
keep the same interface.
"""

import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple

# identifier -> deque of request timestamps
_HITS: Dict[str, Deque[float]] = defaultdict(deque)
_LOCK = threading.Lock()

# Guard against unbounded memory growth from unique client identifiers.
_MAX_TRACKED_KEYS = 10_000


def _prune(now: float) -> None:
    if len(_HITS) <= _MAX_TRACKED_KEYS:
        return
    stale = [key for key, hits in _HITS.items() if not hits or now - hits[-1] > 3600]
    for key in stale:
        _HITS.pop(key, None)


def hit(key: str, limit: int, window_seconds: int) -> Tuple[bool, int]:
    """Record a request. Returns (allowed, retry_after_seconds)."""
    now = time.monotonic()
    with _LOCK:
        hits = _HITS[key]
        cutoff = now - window_seconds
        while hits and hits[0] < cutoff:
            hits.popleft()

        if len(hits) >= limit:
            return False, max(1, int(window_seconds - (now - hits[0])))

        hits.append(now)
        _prune(now)
        return True, 0


def reset() -> None:
    """Clear all counters. Used by tests."""
    with _LOCK:
        _HITS.clear()
