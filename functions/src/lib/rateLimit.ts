/**
 * Port of app/middleware/rate_limit.py.
 *
 * NOTE: this is now weaker than the Python original, and that is a real
 * change of behaviour. The Python comment said the in-process store was fine
 * because "the backend is a single process". Cloud Functions is not a single
 * process: it runs many concurrent instances, and each one starts with an
 * empty window. A client that fans out across instances effectively multiplies
 * its limit by the instance count, and a cold start resets it entirely.
 *
 * It is kept as a cheap guard against a runaway loop in a single invocation.
 * For a real limit, the counters must move to a shared store; see
 * docs/DEPLOY_FIREBASE.md, "Rate limiting", for the Firestore-backed option.
 */

interface Window {
  hits: number[];
}

const HITS = new Map<string, Window>();

/** Guard against unbounded memory growth from unique client identifiers. */
const MAX_TRACKED_KEYS = 10_000;

function prune(now: number): void {
  if (HITS.size <= MAX_TRACKED_KEYS) return;
  for (const [key, window] of HITS) {
    if (!window.hits.length || now - window.hits[window.hits.length - 1] > 3600) {
      HITS.delete(key);
    }
  }
}

export interface RateVerdict {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Record a request. Returns whether it is allowed and how long to wait. */
export function hit(
  key: string,
  limit: number,
  windowSeconds: number,
): RateVerdict {
  const now = Date.now() / 1000;
  const window = HITS.get(key) ?? { hits: [] };
  const cutoff = now - windowSeconds;
  while (window.hits.length && window.hits[0] < cutoff) {
    window.hits.shift();
  }
  if (window.hits.length >= limit) {
    HITS.set(key, window);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.floor(windowSeconds - (now - window.hits[0]))) };
  }
  window.hits.push(now);
  HITS.set(key, window);
  prune(now);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function reset(): void {
  HITS.clear();
}

/** Best-effort client identity, for keying the window. */
export function clientKey(req: { ip?: string; socket?: { remoteAddress?: string } }): string {
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}
