/**
 * Search token index.
 *
 * Firestore has no full-text or substring search. The Python backend matched a
 * query against subject, body, sender_name, sender_email, summary.one_liner and
 * action_items[].task, in memory.
 *
 * Firestore allows at most ONE array-membership filter per query, so a
 * multi-word search cannot be expressed as "all of these tokens present". The
 * index is therefore used as a coarse prefilter (`array-contains-any`), and the
 * exact substring test still runs in memory afterwards. That keeps the
 * original matching behaviour identical while letting Firestore narrow the
 * candidate set instead of the app reading a whole mailbox.
 *
 * Documents are capped per token, so the array stays well under Firestore's
 * 1 MiB document limit.
 */

import type { EmailItem } from "../models";

/** Words too common to be worth indexing; they blow up the candidate set. */
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "has",
  "have", "he", "her", "his", "in", "is", "it", "its", "of", "on", "or", "she",
  "that", "the", "their", "them", "there", "these", "they", "this", "to", "was",
  "were", "will", "with", "you", "your", "i", "we", "our", "us", "me", "my",
  "not", "no", "so", "if", "do", "does", "did", "can", "will", "would", "about",
  "into", "over", "than", "then", "out", "up", "down", "all", "any", "how",
  // A query consisting only of stopwords therefore yields NO tokens. Callers
  // must treat an empty token list as "skip the prefilter", never as
  // "match nothing" -- otherwise a search for "the" would return zero rows.
]);

/** Beyond this, tokens stop discriminating and cost index space. */
const MAX_TOKEN_LENGTH = 24;

const MAX_TOKENS = 200;

/**
 * Split text into index tokens.
 *
 * Email addresses and words with internal punctuation ("q3-report", "re:") are
 * both split, so a query for either half still matches.
 */
export function tokenize(...parts: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const part of parts) {
    if (!part) continue;
    // Hyphens and underscores split. An earlier version kept them, so
    // "Q3-Report" became one token and a search for "report" matched nothing:
    // the prefilter dropped the document before the substring test could run.
    // Dots and @ stay, so an address survives as one token.
    const words = part.toLowerCase().split(/[^a-z0-9@.]+/);
    for (const word of words) {
      // An address is also indexed whole, so "hr@company.com" is findable.
      if (word.includes("@") && word.length > 3 && word.length <= 64) {
        out.add(word);
      }
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

/**
 * Every piece of text the Python backend searched, in one call.
 *
 * Order matters only for the token cap, so the most discriminating fields
 * (subject, sender) come first.
 */
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

/** Tokens for a user-supplied query, for the array-contains-any prefilter. */
export function queryTokens(search: string): string[] {
  return tokenize(search);
}

/**
 * The original substring test, preserved exactly.
 *
 * This is what makes the prefilter a pure optimisation: Firestore decides which
 * documents to hand back, and this decides which of those actually match.
 */
export function matchesSearch(email: EmailItem, search: string): boolean {
  const q = search.toLowerCase().trim();
  if (!q) return true;
  if (email.subject.toLowerCase().includes(q)) return true;
  if (email.body.toLowerCase().includes(q)) return true;
  if (email.sender_name.toLowerCase().includes(q)) return true;
  if (email.sender_email.toLowerCase().includes(q)) return true;
  if (email.summary && email.summary.one_liner.toLowerCase().includes(q)) return true;
  return (email.action_items ?? []).some((item) =>
    item.task.toLowerCase().includes(q),
  );
}
