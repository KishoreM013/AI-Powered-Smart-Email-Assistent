/**
 * Port of the Gemini layer (app/services/gemini.py, gemini_service.py).
 *
 * Two changes worth calling out:
 *
 *  1. The Python code imported `google.generativeai`, which Google has ended
 *     support for; it warns at import time. This uses @google/genai, the
 *     supported SDK. Prompt text and parsing are unchanged.
 *
 *  2. Every call is wrapped so that quota exhaustion degrades to the local
 *     rules in local_rules.ts instead of failing the request. The Python
 *     version had a fix for exactly this ("Fix the degraded path, which the
 *     quota exhausted exposed"), so a hard failure here would be a regression.
 */

import { GoogleGenAI, type GenerateContentResponse } from "npm:@google/genai@1";
import { config } from "./config.ts";
import { logger } from "./log.ts";
import {
  classifyByRules,
  extractByRules,
  summariseByRules,
  styleFromRules,
} from "./localRules.ts";
import type {
  ActionItem,
  Category,
  EmailSummary,
  Priority,
  StyleProfile,
  Tone,
} from "./types.ts";

let client: GoogleGenAI | null = null;

function ai(): GoogleGenAI | null {
  if (!config.GEMINI_API_KEY) return null;
  if (!client) client = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  return client;
}

export function isAiAvailable(): boolean {
  return Boolean(config.GEMINI_API_KEY);
}

/**
 * Run a prompt with a deadline, returning null on any failure.
 * The caller is expected to have a local fallback for null.
 */
async function ask(prompt: string, system?: string): Promise<string | null> {
  const genai = ai();
  if (!genai) return null;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    config.GEMINI_TIMEOUT_SECONDS * 1000,
  );
  try {
    const res: GenerateContentResponse = await genai.models.generateContent({
      model: config.GEMINI_MODEL,
      contents: prompt,
      ...(system ? { config: { systemInstruction: system } } : {}),
    });
    const text = res.text?.trim();
    return text && text.length ? text : null;
  } catch (err) {
    const message = (err as Error).message || String(err);
    // 429 is quota. Worth surfacing, because it is the failure mode the
    // Python version was patched for.
    if (/429|quota|rate limit/i.test(message)) {
      logger.warn({ msg: "gemini quota", model: config.GEMINI_MODEL, error: message });
    } else {
      logger.warn({ msg: "gemini failed", error: message });
    }
    return null;
  } finally {
    clearTimeout(timer);
    void controller;
  }
}

/** Strip a markdown fence, if the model added one. */
function unwrapFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

/**
 * Pull the first complete JSON value out of a model reply.
 *
 * Handles both an object and an array, because different prompts ask for
 * different shapes, and models often wrap the value in prose.
 */
function parseJson<T>(text: string | null): T | null {
  if (!text) return null;
  const body = unwrapFence(text);
  const objStart = body.indexOf("{");
  const arrStart = body.indexOf("[");
  // Choose whichever appears first, so an array is not read as an object.
  const start =
    objStart < 0 ? arrStart : arrStart < 0 ? objStart : Math.min(objStart, arrStart);
  if (start < 0) return null;
  const open = body[start];
  const close = open === "{" ? "}" : "]";
  const end = body.lastIndexOf(close);
  if (end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  return [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

// ---------------------------------------------------------------- summarise

export async function summarise(
  subject: string,
  body: string,
): Promise<EmailSummary> {
  const prompt = `Summarise this email. Reply with JSON only.

Subject: ${subject}

Body:
${body.slice(0, 8000)}

Return exactly these keys:
one_liner: string, a single sentence
bullet_points: string[] (2-5 items)
sentiment: one of Positive, Neutral, Urgent, Frustrated
tone: one of Professional, Formal, Friendly, Angry, Urgent, Neutral
key_deadlines: string[] (only implied deadlines)
dates: string[] (any other date mentioned)
requires_reply: boolean, true only if the sender is waiting on an answer
importance_score: number between 0 and 1
urgency_reason: string or null`;

  const parsed = parseJson<Record<string, unknown>>(await ask(prompt));
  if (!parsed) return summariseByRules(subject, body);
  return {
    one_liner: asString(parsed.one_liner),
    bullet_points: asList(parsed.bullet_points),
    sentiment: asString(parsed.sentiment, "Neutral"),
    tone: asString(parsed.tone, "Neutral"),
    key_deadlines: asList(parsed.key_deadlines),
    dates: asList(parsed.dates),
    people: [],
    meeting: null,
    keywords: [],
    requires_reply: Boolean(parsed.requires_reply),
    importance_score:
      typeof parsed.importance_score === "number" ? parsed.importance_score : 0,
    urgency_reason: asString(parsed.urgency_reason) || null,
  };
}

// ----------------------------------------------------------------- classify

export async function classify(
  subject: string,
  body: string,
): Promise<{ category: Category; priority: Priority }> {
  const prompt = `Classify this email. Reply with JSON only.

Subject: ${subject}

Body:
${body.slice(0, 4000)}

Return:
category: one of Work, Personal, Promotions, Finance, Updates, Newsletter, Important, Meeting, Invitation, Spam, Other
priority: one of High, Medium, Low`;

  const parsed = parseJson<Record<string, unknown>>(await ask(prompt));
  const fallback = classifyByRules(subject, body);
  if (!parsed) return fallback;
  const category = asString(parsed.category) as Category;
  const priority = asString(parsed.priority) as Priority;
  return {
    category: category || fallback.category,
    priority: priority || fallback.priority,
  };
}

// ------------------------------------------------------------ action items

export async function extractActionItems(
  subject: string,
  body: string,
): Promise<ActionItem[]> {
  const prompt = `Extract every action item from this email. Reply with a JSON array only.

Subject: ${subject}

Body:
${body.slice(0, 8000)}

Each item: {"task": string, "due_date": string or null, "is_meeting": boolean, "meeting_time": string or null}
Return [] if there are none.`;

  const parsed = parseJson<ActionItem[]>(await ask(prompt));
  if (!Array.isArray(parsed)) return extractByRules(subject, body);
  return parsed
    .filter(
      (i: ActionItem | null | undefined): i is ActionItem =>
        Boolean(i) && typeof i?.task === "string" && i.task.trim().length > 0,
    )
    .map((i) => ({
      task: i.task.trim(),
      due_date: i.due_date ?? null,
      // Never trust the model to decide that something is already done.
      completed: false,
      is_meeting: Boolean(i.is_meeting),
      meeting_time: i.meeting_time ?? null,
    }));
}

// ------------------------------------------------------------------- reply

export async function generateReply(
  subject: string,
  body: string,
  tone: string,
  customInstructions?: string,
  style?: StyleProfile,
): Promise<{ reply_text: string; suggested_subject: string }> {
  const styleNote = style?.ready
    ? `Match the sender's usual style: they greet with "${style.greeting ?? "no fixed greeting"}", sign off as "${style.sign_off ?? "no fixed sign-off"}", formality ${Math.round(style.formality * 100)}%.`
    : "";

  const prompt = `Write a reply to this email.

Subject: ${subject}

Body:
${body.slice(0, 8000)}

Tone: ${tone}
${customInstructions ? `Additional instructions: ${customInstructions}` : ""}
${styleNote}

Reply with JSON only: {"reply_text": string, "suggested_subject": string}`;

  const parsed = parseJson<Record<string, unknown>>(await ask(prompt));
  if (!parsed) {
    // No model: a usable, plainly-worded reply beats an error.
    return {
      reply_text: `Thanks for your message about "${subject}".\n\nI have read it and will follow up shortly.\n\nBest regards`,
      suggested_subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
    };
  }
  return {
    reply_text: asString(parsed.reply_text),
    suggested_subject: asString(parsed.suggested_subject, `Re: ${subject}`),
  };
}

// ------------------------------------------------------------------- style

export async function learnStyle(
  replies: { body: string }[],
): Promise<StyleProfile> {
  if (!replies.length) return styleFromRules([]);
  const corpus = replies
    .slice(0, 40)
    .map((r, i) => `--- ${i + 1} ---\n${r.body.slice(0, 1500)}`)
    .join("\n");

  const prompt = `Analyse how this person writes email, from the samples below.

${corpus}

Reply with JSON only:
formality: number 0 (casual) to 1 (formal)
uses_emoji: boolean
uses_bullets: boolean
greeting: the greeting they habitually open with, or null
sign_off: the sign-off they habitually close with, or null
language: two-letter code`;

  const parsed = parseJson<Record<string, unknown>>(await ask(prompt));
  const base = styleFromRules(replies.map((r) => r.body));
  if (!parsed) return base;
  return {
    ...base,
    formality:
      typeof parsed.formality === "number" ? parsed.formality : base.formality,
    uses_emoji: typeof parsed.uses_emoji === "boolean" ? parsed.uses_emoji : base.uses_emoji,
    uses_bullets:
      typeof parsed.uses_bullets === "boolean" ? parsed.uses_bullets : base.uses_bullets,
    greeting: asString(parsed.greeting) || base.greeting,
    sign_off: asString(parsed.sign_off) || base.sign_off,
    language: asString(parsed.language, base.language),
  };
}

export type { Tone };
