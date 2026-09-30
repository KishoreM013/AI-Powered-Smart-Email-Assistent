/**
 * Parity tests for the search token index.
 *
 * The point of these is that Firestore has no substring search, so the index
 * was introduced to prefilter. These assert that the exact substring test is
 * still the thing that decides a match, i.e. the prefilter changed performance
 * and not behaviour.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSearchTokens, matchesSearch, queryTokens, tokenize } from "../db/tokens";
import type { EmailItem } from "../models";

function email(over: Partial<EmailItem> = {}): EmailItem {
  return {
    id: "em-1",
    user_email: "owner@example.com",
    sender_name: "Dana Reyes",
    sender_email: "dana@company.com",
    recipient_email: "owner@example.com",
    subject: "Q3 planning offsite",
    snippet: "snippet",
    body: "Please review the attached budget before Friday.",
    category: "Work",
    priority: "High",
    date: "2026-09-01",
    timestamp: 1_757_000_000,
    is_read: false,
    is_starred: false,
    is_spam: false,
    is_trash: false,
    has_attachments: true,
    attachments: [],
    summary: {
      bullet_points: ["Confirm venue"],
      one_liner: "Offsite needs a headcount.",
      sentiment: "Neutral",
      tone: "Professional",
      key_deadlines: ["Friday"],
      dates: [],
      people: [],
      meeting: null,
      keywords: [],
      requires_reply: true,
      importance_score: 0.8,
    },
    action_items: [{ task: "Send the headcount", completed: false, is_meeting: false }],
    folder: "inbox",
    ...over,
  };
}

test("substring match is preserved for a mid-word query", () => {
  // "offsit" is a substring of "offsite" but not a whole token. A naive
  // token-equality prefilter would have dropped this document.
  const e = email();
  assert.equal(matchesSearch(e, "offsit"), true);
  assert.equal(matchesSearch(e, "attached budget"), true);
  assert.equal(matchesSearch(e, "Dana Reyes"), true);
  assert.equal(matchesSearch(e, "headcount"), true);
});

test("matchesSearch finds nothing that the text does not contain", () => {
  const e = email();
  assert.equal(matchesSearch(e, "kubernetes"), false);
  assert.equal(matchesSearch(e, "payroll"), false);
});

test("case is ignored on both sides", () => {
  assert.equal(matchesSearch(email(), "Q3 PLANNING"), true);
});

test("an empty query matches everything", () => {
  assert.equal(matchesSearch(email(), ""), true);
  assert.equal(matchesSearch(email(), "   "), true);
});

test("tokens cover every field the original search read", () => {
  const tokens = buildSearchTokens(email());
  for (const expected of [
    "planning", "offsite",        // subject
    "dana", "reyes",             // sender_name
    "dana@company.com",          // sender_email, whole
    "headcount",                 // summary.one_liner
    "headcount",                 // action_items[].task
    "budget",                    // body
  ]) {
    assert.ok(tokens.includes(expected), `missing token: ${expected}`);
  }
});

test("a multi-word query yields tokens for the prefilter", () => {
  const tokens = queryTokens("amazon orders");
  assert.deepEqual(tokens.sort(), ["amazon", "orders"]);
});

test("a query of only stopwords yields no tokens, and must not mean 'no match'", () => {
  // This is the dangerous case for a prefilter. "the" tokenises to nothing, so
  // getEmails() must skip the prefilter and let the substring test decide,
  // rather than filtering on an empty array and returning zero documents.
  assert.deepEqual(queryTokens("the a of and from"), []);
  assert.deepEqual(tokenize("the a of and from"), []);
  // The real match is still substring-based, so an article-only query behaves.
  assert.equal(matchesSearch(email(), "the"), true);
});

test("a compound split across a hyphen is still findable by either half", () => {
  // The regression this guards: "Q3-Report" used to tokenise as one token, so
  // searching "report" returned nothing because the prefilter hid the
  // document before the substring test could run.
  const e = email({ subject: "Q3-Report (final)" });
  const tokens = buildSearchTokens(e);
  assert.ok(tokens.includes("q3"), JSON.stringify(tokens));
  assert.ok(tokens.includes("report"), JSON.stringify(tokens));
  // And the prefilter must not reject a document the substring test accepts.
  for (const half of ["q3", "report"]) {
    const q = queryTokens(half);
    assert.ok(
      q.some((t) => tokens.includes(t)),
      `prefilter would drop the document for query ${half}`,
    );
  }
});

test("addresses survive tokenisation as a single token", () => {
  assert.ok(tokenize("write to hr@company.com").includes("hr@company.com"));
});

test("punctuation does not defeat tokenisation", () => {
  const tokens = tokenize("Re: Q3-Report (final)");
  assert.ok(tokens.includes("report"), JSON.stringify(tokens));
  assert.ok(tokens.includes("q3"), JSON.stringify(tokens));
});

test("token list is bounded", () => {
  const huge = Array.from({ length: 5000 }, (_, i) => `word${i}`).join(" ");
  assert.ok(tokenize(huge).length <= 200);
});
