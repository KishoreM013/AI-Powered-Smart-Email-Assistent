/**
 * PDF text extraction, replacing app/services/ocr.py (pypdf).
 *
 * Uses pdfjs-dist rather than pdf-parse: pdf-parse reads a hard-coded test
 * file at import time when its debug block is enabled, which throws on import
 * in a packaged function.
 */

import { logger } from "./log.ts";
import { askGeminiForText } from "./geminiText.ts";

/**
 * Extract the text layer of a PDF.
 *
 * Deliberately not OCR: this reads the embedded text layer only. A scanned
 * image PDF yields nothing, which is a different problem from the one the
 * Python version solved with pypdf, and is reported as such rather than
 * returning an empty string as if it had succeeded.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<{
  text: string;
  pages: number;
  hasTextLayer: boolean;
}> {
  // pdfjs is imported lazily: it is a large module and most invocations never
  // touch a PDF, so loading it eagerly would slow every cold start.
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    isEvalSupported: false,
  }).promise;

  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) pages.push(text);
  }
  await doc.destroy();

  const text = pages.join("\n\n").trim();
  return { text, pages: doc.numPages, hasTextLayer: text.length > 0 };
}

/** Classify a document and pull out its salient fields. */
export async function summariseDocument(
  filename: string,
  text: string,
): Promise<{
  document_type: string;
  summary: string;
  key_entities: Record<string, unknown>;
}> {
  const prompt = `Analyse this document and reply with JSON only.

Filename: ${filename}

Content:
${text.slice(0, 12000)}

Return:
document_type: one of Invoice, Contract, Receipt, Report, General
summary: one or two sentences
key_entities: an object with whichever apply -- amount, due_date, vendor, invoice_no, date`;

  const text2 = await askGeminiForText(prompt);
  if (!text2) {
    // Degrade to a description rather than failing the scan.
    return {
      document_type: "General",
      summary: `Extracted ${text.length} characters from ${filename}. Configure GEMINI_API_KEY for a written summary.`,
      key_entities: {},
    };
  }
  const start = text2.indexOf("{");
  const end = text2.lastIndexOf("}");
  try {
    const parsed = JSON.parse(text2.slice(start, end + 1));
    return {
      document_type: String(parsed.document_type ?? "General"),
      summary: String(parsed.summary ?? ""),
      key_entities: (parsed.key_entities as Record<string, unknown>) ?? {},
    };
  } catch {
    logger.warn({ msg: "ocr summary unparseable", filename });
    return { document_type: "General", summary: text.slice(0, 300), key_entities: {} };
  }
}
