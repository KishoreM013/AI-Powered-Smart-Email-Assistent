/**
 * Parity tests, run on Deno.
 *
 * Same assertions as the Node suite in functions/src/test/tokens.test.ts,
 * against the Deno copies of the tokenizer. If the two drift, the port has
 * introduced a behaviour change and this fails.
 *
 *   deno test --allow-env supabase/functions/api/_shared/
 */
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { buildSearchTokens, matchesSearch, queryTokens, tokenize, } from "./tokens.js";
function email(over = {}) {
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
Deno.test("substring match is preserved for a mid-word query", () => {
    const e = email();
    assert(matchesSearch(e, "offsit"));
    assert(matchesSearch(e, "attached budget"));
    assert(matchesSearch(e, "Dana Reyes"));
    assert(matchesSearch(e, "headcount"));
});
Deno.test("matchesSearch finds nothing that the text does not contain", () => {
    const e = email();
    assertEquals(matchesSearch(e, "kubernetes"), false);
    assertEquals(matchesSearch(e, "payroll"), false);
});
Deno.test("case is ignored on both sides", () => {
    assert(matchesSearch(email(), "Q3 PLANNING"));
});
Deno.test("an empty query matches everything", () => {
    assert(matchesSearch(email(), ""));
    assert(matchesSearch(email(), "   "));
});
Deno.test("tokens cover every field the original search read", () => {
    const tokens = buildSearchTokens(email());
    for (const expected of [
        "planning", "offsite", "dana", "reyes", "dana@company.com", "headcount", "budget",
    ]) {
        assert(tokens.includes(expected), `missing token: ${expected}`);
    }
});
Deno.test("a multi-word query yields tokens for the prefilter", () => {
    assertEquals(queryTokens("amazon orders").sort(), ["amazon", "orders"]);
});
Deno.test("a query of only stopwords yields no tokens, and must not mean 'no match'", () => {
    // The dangerous case for a prefilter: "the" tokenises to nothing, so the
    // query builder must skip the prefilter rather than filter on an empty array
    // and return zero rows.
    assertEquals(queryTokens("the a of and from"), []);
    assertEquals(tokenize("the a of and from"), []);
    assert(matchesSearch(email(), "the"));
});
Deno.test("a compound split across a hyphen is still findable by either half", () => {
    // Regression: "Q3-Report" used to tokenise as one token, so searching
    // "report" returned nothing because the prefilter hid the document before
    // the substring test could run.
    const e = email({ subject: "Q3-Report (final)" });
    const tokens = buildSearchTokens(e);
    assert(tokens.includes("q3"), JSON.stringify(tokens));
    assert(tokens.includes("report"), JSON.stringify(tokens));
    for (const half of ["q3", "report"]) {
        const q = queryTokens(half);
        assert(q.some((t) => tokens.includes(t)), `prefilter would drop it for ${half}`);
    }
});
Deno.test("addresses survive tokenisation as a single token", () => {
    assert(tokenize("write to hr@company.com").includes("hr@company.com"));
});
Deno.test("punctuation does not defeat tokenisation", () => {
    const tokens = tokenize("Re: Q3-Report (final)");
    assertStringIncludes(JSON.stringify(tokens), "report");
    assertStringIncludes(JSON.stringify(tokens), "q3");
});
Deno.test("token list is bounded", () => {
    const huge = Array.from({ length: 5000 }, (_, i) => `word${i}`).join(" ");
    assert(tokenize(huge).length <= 200);
});
