/**
 * Parity tests for the deterministic fallbacks.
 *
 * These run with no API key and no network, which is the point: they are what
 * makes the app usable on the free tier, and they must not depend on a model.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyByRules,
  extractByRules,
  styleFromRules,
  summariseByRules,
} from "../services/localRules";

test("urgent language raises priority", () => {
  const { priority } = classifyByRules(
    "URGENT: action required",
    "Your account is suspended.",
  );
  assert.equal(priority, "High");
});

test("fyi language lowers priority", () => {
  const { priority } = classifyByRules("Notes", "FYI, no rush when you get a chance.");
  assert.equal(priority, "Low");
});

test("finance vocabulary classifies as Finance", () => {
  assert.equal(classifyByRules("Your invoice", "Payment of £42 is due.").category, "Finance");
});

test("the subject line wins over the body", () => {
  // The body mentions a payment, but the subject is unambiguous.
  const result = classifyByRules("Interview scheduling", "We will discuss the invoice later.");
  assert.equal(result.category, "Meeting");
});

test("an unrecognisable email defaults to Updates", () => {
  assert.equal(classifyByRules("xyzzy", "qwerty asdfgh").category, "Updates");
});

test("summarise returns a one-liner and bullets without a model", () => {
  const s = summariseByRules(
    "Quarterly review",
    "The results were better than expected. Revenue grew by twelve percent. We should discuss hiring.",
  );
  assert.ok(s.one_liner.length > 0);
  assert.ok(s.bullet_points.length > 0);
  assert.ok(s.importance_score > 0 && s.importance_score <= 1);
});

test("a request for action is detected as requiring a reply", () => {
  const s = summariseByRules("Question", "Please review the attached document and confirm.");
  assert.equal(s.requires_reply, true);
});

test("summarise is stable across repeated calls", () => {
  // ACTION_RE is a /g pattern; a shared lastIndex would make the second call
  // disagree with the first. This is the regression that guard exists for.
  const args = ["Deadline", "Please send the report by Friday."] as const;
  const first = summariseByRules(...args);
  const second = summariseByRules(...args);
  const third = summariseByRules(...args);
  assert.equal(first.requires_reply, second.requires_reply);
  assert.equal(second.requires_reply, third.requires_reply);
  assert.deepEqual(first.bullet_points, third.bullet_points);
});

test("action items are extracted, bounded, and never pre-completed", () => {
  const body = Array.from(
    { length: 30 },
    (_, i) => `Please review section ${i} and confirm.`,
  ).join(" ");
  const items = extractByRules("Tasks", body);
  assert.ok(items.length > 0);
  assert.ok(items.length <= 10, `got ${items.length} items`);
  assert.ok(items.every((i) => i.completed === false));
});

test("an email with no requests yields no action items", () => {
  assert.equal(extractByRules("FYI", "Just sharing some news. Nothing to do.").length, 0);
});

test("extractByRules is stable across repeated calls", () => {
  const body = "Please approve the budget. Please confirm the date. Please review the deck.";
  const a = extractByRules("Q", body);
  const b = extractByRules("Q", body);
  assert.equal(a.length, b.length);
});

test("an empty corpus reports not ready, rather than inventing a style", () => {
  const style = styleFromRules([]);
  assert.equal(style.reply_count, 0);
  assert.equal(style.ready, false);
});

test("a thin corpus is still not ready", () => {
  assert.equal(styleFromRules(["hey, thanks!"]).ready, false);
});

test("a real corpus becomes ready and picks up a greeting and sign-off", () => {
  const bodies = Array.from(
    { length: 8 },
    () => "Dear Sam,\n\nPlease find the report attached.\n\nKind regards,\nAlex",
  );
  const style = styleFromRules(bodies);
  assert.equal(style.ready, true);
  assert.equal(style.reply_count, 8);
  assert.equal(style.formality > 0.5, true);
  assert.ok(style.greeting);
  assert.ok(style.sign_off);
});

test("formality stays neutral when there is too little signal to judge", () => {
  // Six messages with no formal or casual markers at all. The sample size is
  // ample but the evidence is nil, so the honest answer is the midpoint.
  const style = styleFromRules(Array.from({ length: 6 }, () => "shipped the build."));
  assert.equal(style.formality, 0.5);
});

test("a consistently casual writer is read as casual", () => {
  const style = styleFromRules(Array.from({ length: 6 }, () => "hey, thanks, cheers"));
  assert.ok(style.formality < 0.3, `got ${style.formality}`);
});
