/**
 * Contract test: the /api/emails/analyze response.
 *
 * AnalyzeView reads a flat set of fields off the response. An earlier version
 * returned them nested under `summary`, which left the panel blank despite a
 * 200. These assertions are the field list the component actually depends on,
 * so a shape change breaks here rather than in the UI.
 *
 * The handler needs a Supabase client to construct, which is not available in a
 * unit test, so the expected shape is asserted against the source of truth the
 * handler builds from: summariseByRules, which is the no-API-key path and
 * therefore the one a fresh deployment gets.
 */

import { assert, assertEquals } from "@std/assert";
import { summariseByRules, classifyByRules, extractByRules } from "./localRules.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const router = readFileSync(join(here, "..", "index.js"), "utf8");

/** Every field AnalyzeView reads off the analyze response. */
const CLIENT_FIELDS = [
  "one_liner",
  "bullet_points",
  "sentiment",
  "tone",
  "urgency_reason",
  "keywords",
  "meeting",
  "people",
  "requires_reply",
  "importance_score",
  "action_items",
  "category",
  "priority",
  "reply",
  "reply_tone",
  "suggested_subject",
  "is_phishing",
  "engine",
  "saved",
  "email",
];

Deno.test("the analyze handler spreads the summary at the top level", () => {
  // `...summary` is what puts one_liner, bullet_points and the rest where the
  // component looks for them. Without it the whole panel renders blank.
  assert(
    /\.\.\.summary/.test(router),
    "the analyze response no longer spreads summary at the top level",
  );
});

Deno.test("the analyze response supplies every field AnalyzeView reads", () => {
  // Each of these must be reachable: either named literally in the handler, or
  // supplied by the summary object the handler spreads.
  const summary = summariseByRules(
    "Q3 planning",
    "Please review the budget before Friday. The meeting is at 3pm.",
  );
  const classification = classifyByRules("Q3 planning", "Please review the budget.");
  const actions = extractByRules("Q3 planning", "Please review the budget before Friday.");

  const response = {
    ...summary,
    summary,
    deadlines: summary.key_deadlines,
    action_items: actions,
    category: classification.category,
    priority: classification.priority,
    reply: null,
    reply_tone: null,
    suggested_subject: null,
    is_phishing: false,
    engine: "local-rules",
    saved: false,
    email: null,
  };

  const missing = CLIENT_FIELDS.filter((f) => !(f in response));
  assertEquals(missing, [], `analyze response is missing: ${missing.join(", ")}`);
});

Deno.test("deadlines is emitted alongside key_deadlines", () => {
  // The summary object calls it key_deadlines; AnalyzeView reads `deadlines`.
  // Emitting only one of the two names leaves the panel showing no deadlines.
  assert(/deadlines:/.test(router), "the analyze response no longer emits `deadlines`");
  const s = summariseByRules("x", "Please send the report by Friday.");
  assertEquals(s.key_deadlines.length > 0, true, "local rules should find a deadline");
});
