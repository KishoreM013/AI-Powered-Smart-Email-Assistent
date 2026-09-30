/**
 * Search token index, ported verbatim from functions/src/db/tokens.ts.
 *
 * Postgres has `search_tokens text[]` with a GIN index, so `&&` (array
 * overlap) does the prefilter in one index scan, and the exact substring test
 * still runs afterwards. Same behaviour as the Firestore version.
 */

import type { EmailItem } from "./types.ts";

/** Words too common to be worth indexing; they blow up the candidate set. */
const STOPWORDS = new Set([
  "a","an","and","are","as","at","be","but","by","for","from","has","have",
  "he","her","his","in","is","it","its","of","on","or","she","that","the",
  "their","them","there","these","they","this","to","was","were","will","with",
  "you","your","i","we","our","us","me","my","not","no","so","if","do","does",
  "did","can","would","about","into","over","than","then","out","up","down",
  "all","any","how",
]);

const MAX_TOKEN_LENGTH = 24;
const MAX_TOKENS = 200;

/**
 * A query of only stopwords yields no tokens, and callers must treat that as
 * "skip the prefilter", never "match nothing".
 */
export function tokenize(...parts: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const part of parts) {
    if (!part) continue;
    // Hyphens and underscores split. An earlier version kept them, so
    // "Q3-Report" became one token and searching "report" matched nothing.
    // Dots and @ stay, so an address survives as one token.
    for (const word of part.toLowerCase().split(/[^a-z0-9@.]+/)) {
      if (word.includes("@") && word.length > 3 && word.length <= 64) out.add(word);
      const trimmed = word.replace(/^[._+-]+|[._+-]+$/g, "");
      if (trimmed.length < 2 || trimmed.length > MAX_TOKEN_LENGTH) continue;
      if (STOPWORDS.has(trimmed)) continue;
      if (/^\d+$/.test(trimmed) && trimmed.length < 4) continue;
      out.add(trimmed);
    }
    if (out.size >= MAX_TOKENS) break;
  }
  return Array.from(out).slice(0, MAX_TOKENS);
}

export function buildSearchTokens(email: EmailItem): string[] {
  return tokenize(
    email.subject,
    email.sender_name,
    email.sender_email,
    email.summary?.one_liner,
    ...(email.action_items ?? []).map((a) => a.task),
    email.body,
  );
}

export function queryTokens(search: string): string[] {
  return tokenize(search);
}

/**
 * The original substring test, preserved exactly. Firestore and Postgres both
 * lack substring search, so this is what actually decides a match; the token
 * index only narrows the candidate set.
 */
export function matchesSearch(email: EmailItem, search: string): boolean {
  const q = search.toLowerCase().trim();
  if (!q) return true;
  if (email.subject.toLowerCase().includes(q)) return true;
  if (email.body.toLowerCase().includes(q)) return true;
  if (email.sender_name.toLowerCase().includes(q)) return true;
  if (email.sender_email.toLowerCase().includes(q)) return true;
  if (email.summary && email.summary.one_liner.toLowerCase().includes(q)) return true;
  return (email.action_items ?? []).some((i) => i.task.toLowerCase().includes(q));
}
