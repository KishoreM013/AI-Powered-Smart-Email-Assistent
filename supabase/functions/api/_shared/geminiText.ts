/**
 * Raw Gemini text generation, shared by the OCR path.
 *
 * Kept separate from gemini.ts because that module deals only in structured
 * output while the document summariser needs prose. Both funnel through the
 * same client and the same failure handling: null means "unavailable", and
 * every caller has a deterministic fallback.
 */

import { GoogleGenAI } from "npm:@google/genai@1";
import { config } from "./config.ts";
import { logger } from "./log.ts";

let client: GoogleGenAI | null = null;

export async function askGeminiForText(prompt: string): Promise<string | null> {
  if (!config.GEMINI_API_KEY) return null;
  if (!client) client = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  try {
    const res = await client.models.generateContent({
      model: config.GEMINI_MODEL,
      contents: prompt,
    });
    const text = res.text?.trim();
    return text && text.length ? text : null;
  } catch (err) {
    logger.warn({ msg: "gemini text failed", error: (err as Error).message });
    return null;
  }
}
