/**
 * Local-rule parity tests, run on Deno.
 *
 * Mirrors functions/src/test/rules.test.ts. These paths need no API key and no
 * network, which is the point: they are what makes the app usable on the free
 * tier, and they must not depend on a model.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  classifyByRules,
  extractByRules,
  styleFromRules,
  summariseByRules,
} from "./localRules.ts";

Deno.test("urgent language raises priority", () => {
  assertEquals(
    classifyByRules("URGENT: action required", "Your account is suspended.").priority,
    "High",
  );
});

Deno.test("fyi language lowers priority", () => {
  assertEquals(
    classifyByRules("Notes", "FYI, no rush when you get a chance.").priority,
    "Low",
  );
});

Deno.test("finance vocabulary classifies as Finance", () => {
  assertEquals(
    classifyByRules("Your invoice", "Payment of 42 is due.").category,
    "Finance",
  );
});

Deno.test("the subject line wins over the body", () => {
  // The body mentions a payment, but the subject is unambiguous.
  assertEquals(
    classifyByRules("Interview scheduling", "We will discuss the invoice later.").category,
    "Meeting",
  );
});

Deno.test("an unrecognisable email defaults to Updates", () => {
  assertEquals(classifyByRules("xyzzy", "qwerty asdfgh").category, "Updates");
});

Deno.test("summarise returns a one-liner and bullets without a model", () => {
  const s = summariseByRules(
    "Quarterly review",
    "The results were better than expected. Revenue grew by twelve percent. We should discuss hiring.",
  );
  assert(s.one_liner.length > 0);
  assert(s.bullet_points.length > 0);
  assert(s.importance_score > 0 && s.importance_score <= 1);
});

Deno.test("a request for action is detected as requiring a reply", () => {
  assert(summariseByRules("Question", "Please review the attached document and confirm.")
    .requires_reply);
});

Deno.test("summarise is stable across repeated calls", () => {
  // ACTION_RE is a /g pattern; a shared lastIndex would make the second call
  // disagree with the first. This is the regression that guard exists for.
  const args = ["Deadline", "Please send the report by Friday."] as const;
  const first = summariseByRules(...args);
  const second = summariseByRules(...args);
  const third = summariseByRules(...args);
  assertEquals(first.requires_reply, second.requires_reply);
  assertEquals(second.requires_reply, third.requires_reply);
  assertEquals(first.bullet_points, third.bullet_points);
});

Deno.test("action items are extracted, bounded, and never pre-completed", () => {
  const body = Array.from({ length: 30 }, (_, i) => `Please review section ${i} and confirm.`)
    .join(" ");
  const items = extractByRules("Tasks", body);
  assert(items.length > 0);
  assert(items.length <= 10, `got ${items.length} items`);
  assert(items.every((i) => i.completed === false));
});

Deno.test("an email with no requests yields no action items", () => {
  assertEquals(extractByRules("FYI", "Just sharing some news. Nothing to do.").length, 0);
});

Deno.test("extractByRules is stable across repeated calls", () => {
  const body = "Please approve the budget. Please confirm the date. Please review the deck.";
  assertEquals(extractByRules("Q", body).length, extractByRules("Q", body).length);
});

Deno.test("an empty corpus reports not ready, rather than inventing a style", () => {
  const style = styleFromRules([]);
  assertEquals(style.reply_count, 0);
  assertEquals(style.ready, false);
});

Deno.test("a thin corpus is still not ready", () => {
  assertEquals(styleFromRules(["hey, thanks!"]).ready, false);
});

Deno.test("a real corpus becomes ready and picks up a greeting and sign-off", () => {
  const bodies = Array.from(
    { length: 8 },
    () => "Dear Sam,\n\nPlease find the report attached.\n\nKind regards,\nAlex",
  );
  const style = styleFromRules(bodies);
  assertEquals(style.ready, true);
  assertEquals(style.reply_count, 8);
  assert(style.formality > 0.5);
  assert(style.greeting);
  assert(style.sign_off);
});

Deno.test("formality stays neutral when there is too little signal to judge", () => {
  // Six messages with no formal or casual markers. Ample sample, nil evidence,
  // so the honest answer is the midpoint.
  assertEquals(styleFromRules(Array.from({ length: 6 }, () => "shipped the build.")).formality, 0.5);
});

Deno.test("a consistently casual writer is read as casual", () => {
  const style = styleFromRules(Array.from({ length: 6 }, () => "hey, thanks, cheers"));
  assert(style.formality < 0.3, `got ${style.formality}`);
});
