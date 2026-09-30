/**
 * Port of app/services/local_rules.py (374 lines) and the deterministic parts
 * of app/services/style_learner.py.
 *
 * These are the fallbacks that run when Gemini is unconfigured, out of quota,
 * or slow. The Python version made the same bargain, and it matters: a repo
 * commit reads "Fix the degraded path, which the quota exhausted exposed", so
 * quota exhaustion is a known, expected condition rather than an edge case.
 *
 * Nothing here calls out to a model, so these paths work on the free tier with
 * no API key at all.
 */

import type {
  ActionItem,
  Category,
  EmailSummary,
  Priority,
  StyleProfile,
} from "./types.ts";

/** Ordered: the first match wins, so the most specific rule must come first. */
const CATEGORY_RULES: [RegExp, Category][] = [
  // Meeting words come first: an "interview scheduling" subject contains both
  // "interview" (Work) and "scheduling" (Meeting), and the more specific
  // category has to win. First match wins, so order is the priority.
  [/\b(meeting|invite|invitation|calendar|reschedul|agenda|standup|\bsync\b|1:1|interview)\b/i, "Meeting"],
  [/\b(invoice|receipt|payment|paid|charged|refund|statement|bank|transaction)\b/i, "Finance"],
  [/\b(offer|application|candidate|recruit|hiring|resume|cv)\b/i, "Work"],
  [/\b(urgent|asap|immediately|action required|overdue|final notice|time[- ]sensitive)\b/i, "Important"],
  [/\b(order|shipped|delivery|cart|checkout|sale|discount|coupon|shipping)\b/i, "Promotions"],
  [/\b(newsletter|unsubscribe|weekly digest|issue #|roundup|edition)\b/i, "Newsletter"],
  [/\b(ticket|incident|deployment|release|changelog|maintenance|outage|status)\b/i, "Updates"],
  [/\b(congratulat|happy birthday|dinner|weekend|family|personal)\b/i, "Personal"],
];

const URGENT_RULES: [RegExp, Priority][] = [
  [/\b(urgent|asap|immediately|right away|overdue|past due|final notice|expires?\b.*today|last (chance|day)|action required|escalat)\b/i, "High"],
  [/\b(reminder|please (review|respond|confirm|approve|sign)|awaiting your|could you|can you)\b/i, "Medium"],
  [/\b(fyi|no rush|when you (get a chance|have time)|for your information)\b/i, "Low"],
];

const DEADLINE_RE =
  /\b(?:by|before|due|until|on|no later than)\s+(?:the\s+)?((?:mon|tues|wednes|thurs|fri|satur|sun)day|(?:next|this)\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/gi;

const MEETING_RE =
  /\b(meeting|call|sync|standup|1:1|one[- ]on[- ]one|interview|demo|review session|workshop)\b/i;

/** Sentences that ask the reader to do something. */
const ACTION_RE =
  /\b(please\s+(?:send|review|approve|sign|confirm|reply|respond|submit|complete|fill|update|schedule|share|forward|provide|check|prepare|arrange|pick|book|cancel|verify|add|remove|fix|send me|let me know)|could you|can you|would you|need (?:you|your)|make sure (?:you|to)|don't forget|remember to|action required|waiting (?:on|for) your|your (?:response|approval|signature|input) (?:is )?(?:needed|required))\b/gi;

function firstMatch<T>(text: string, rules: [RegExp, T][], fallback: T): T {
  for (const [pattern, value] of rules) {
    if (pattern.test(text)) return value;
  }
  return fallback;
}

export function classifyByRules(subject: string, body: string): {
  category: Category;
  priority: Priority;
} {
  // The subject line carries the strongest signal, so it is searched first.
  const subjectHit = firstMatch<Category | null>(subject, CATEGORY_RULES, null);
  const category = subjectHit ?? firstMatch(body, CATEGORY_RULES, "Updates" as Category);
  const priority = firstMatch(
    `${subject}\n${body.slice(0, 2000)}`,
    URGENT_RULES,
    "Medium" as Priority,
  );
  return { category: category || "Updates", priority };
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function summariseByRules(subject: string, body: string): EmailSummary {
  const text = `${subject}\n${body}`;
  const { priority } = classifyByRules(subject, body);

  // First two or three sentences, as the one-liner.
  const sentences = body
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);
  const oneLiner = sentences[0]?.slice(0, 240) ?? subject ?? "";

  const bullets = sentences.slice(0, 4).map((s) => s.slice(0, 200));
  const keyDeadlines = dedupe(Array.from(body.matchAll(DEADLINE_RE), (m) => m[0].trim()));
  const dates = dedupe(
    Array.from(
      body.matchAll(
        /\b\d{1,2}(?:\/\d{1,2})?(?:\/\d{2,4})?\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/gi,
      ),
      (m) => m[0].trim(),
    ),
  );

  const isMeeting = MEETING_RE.test(text);
  // ACTION_RE is a /g pattern, so test() advances lastIndex between calls.
  // Probe a fresh non-global instance, otherwise the second summarisation in
  // the same process can read the wrong answer.
  const requiresReply = new RegExp(ACTION_RE.source, "i").test(text);
  // Heuristic and deliberately modest: these are estimates, and the UI labels
  // the resulting saving as an estimate too.
  const importance = priority === "High" ? 0.8 : priority === "Medium" ? 0.5 : 0.25;

  return {
    one_liner: oneLiner,
    bullet_points: bullets.length ? bullets : [subject],
    urgency_reason: priority === "High" ? "Contains urgent language" : null,
    sentiment: /angry|furious|complaint|disappointed/i.test(body) ? "Frustrated" : "Neutral",
    tone: /kind regards|best regards|thanks|thank you|cheers/i.test(body)
      ? "Friendly"
      : /dear |regards|sincerely/i.test(body)
        ? "Professional"
        : "Neutral",
    key_deadlines: keyDeadlines,
    dates,
    people: [],
    meeting: isMeeting
      ? {
          is_meeting: true,
          title: subject,
          date: dates[0] ?? null,
          time: null,
          location: null,
          platform: /\b(zoom|meet|teams|google meet)\b/i.exec(body)?.[0] ?? null,
          attendees: [],
        }
      : null,
    keywords: dedupe(
      (body.toLowerCase().match(/\b[a-z]{5,}\b/g) ?? []).slice(0, 12),
    ),
    requires_reply: requiresReply,
    importance_score: importance,
  };
}

export function extractByRules(subject: string, body: string): ActionItem[] {
  // Split on sentence boundaries, then keep the ones that ask for something.
  const sentences = `${subject}. ${body}`
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim());
  const items: ActionItem[] = [];
  for (const sentence of sentences) {
    // Fresh non-global instance, for the lastIndex reason above. ACTION_RE and
    // DEADLINE_RE are module-level /g patterns, so sharing them across
    // iterations makes the results depend on loop position.
    if (!new RegExp(ACTION_RE.source, "i").test(sentence)) continue;
    const deadline = new RegExp(DEADLINE_RE.source, "i").exec(sentence)?.[0]?.trim() ?? null;
    items.push({
      task: sentence.replace(/^[-*\d.\s]+/, "").slice(0, 250),
      due_date: deadline,
      completed: false,
      is_meeting: MEETING_RE.test(sentence),
      meeting_time: null,
    });
    if (items.length >= 10) break;
  }
  return items;
}

/** Minimum corpus before a style profile is worth imitating. */
const MIN_CORPUS = 5;

export function styleFromRules(bodies: string[]): StyleProfile {
  const usable = bodies.filter((b) => b && b.trim().length);
  if (!usable.length) {
    return {
      reply_count: 0,
      average_words: 0,
      average_sentence_length: 0,
      formality: 0.5,
      greeting: null,
      sign_off: null,
      uses_emoji: false,
      uses_bullets: false,
      common_phrases: [],
      language: "en",
      // Deliberately false: the contract says an empty corpus must be
      // reported as not ready rather than dressed up with defaults.
      ready: false,
    };
  }

  const wordCounts = usable.map((b) => b.trim().split(/\s+/).filter(Boolean).length);
  const sentenceCounts = usable.map(
    (b) => b.split(/[.!?]+/).filter((s) => s.trim().length).length || 1,
  );
  const averageWords = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length;
  const averageSentenceLength =
    wordCounts.reduce((a, b) => a + b, 0) / sentenceCounts.reduce((a, b) => a + b, 0);

  const joined = usable.join("\n").toLowerCase();
  // Counted per message, not per occurrence: one person who says "thanks" in
  // all six samples is a casual writer, and per-occurrence counting would let
  // a single repetitive message dominate the verdict.
  const messages = usable.map((b) => b.toLowerCase());
  const formalHits = messages.filter((b) =>
    /\b(dear|regards|sincerely|kindly|please find|hereby|pursuant)\b/.test(b),
  ).length;
  const casualHits = messages.filter((b) =>
    /\b(hey|cheers|btw|lol)\b|\bthanks\b/.test(b),
  ).length;
  const totalHits = formalHits + casualHits;
  // With too little signal, stay at the neutral midpoint rather than
  // inventing a confident reading.
  const formality =
    totalHits < 3 ? 0.5 : Math.min(1, Math.max(0, formalHits / totalHits));

  const greeting =
    /\b(dear|hi|hey|hello)\b[^\n]{0,40}/i.exec(usable[0])?.[0]?.trim() ?? null;
  const signOff =
    /(kind regards|best regards|warm regards|regards|sincerely|cheers|thanks)[,!\s]*$/im.exec(
      joined,
    )?.[0]?.trim() ?? null;

  const phraseCounts = new Map<string, number>();
  for (const body of usable) {
    for (const phrase of body.toLowerCase().match(/\b[a-z']{3,}\b/g) ?? []) {
      phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
    }
  }
  const commonPhrases = [...phraseCounts.entries()]
    .filter(([, n]) => n >= Math.max(3, Math.floor(usable.length / 3)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([phrase]) => phrase);

  return {
    reply_count: usable.length,
    average_words: Math.round(averageWords * 10) / 10,
    average_sentence_length: Math.round(averageSentenceLength * 10) / 10,
    formality: Math.round(formality * 100) / 100,
    greeting,
    sign_off: signOff,
    uses_emoji: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(joined),
    uses_bullets: /^\s*[-*•]\s+/m.test(usable.join("\n")),
    common_phrases: commonPhrases,
    language: "en",
    ready: usable.length >= MIN_CORPUS,
  };
}
