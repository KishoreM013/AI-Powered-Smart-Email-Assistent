import type { Request, Response, Router } from "express";
import { logger } from "firebase-functions";
import type { Store } from "../db/store";
import { extractPdfText, summariseDocument } from "../services/ocr";
import { gmailFor } from "../services/gmail";
import type { OCRScanRequest } from "../models";

/**
 * Port of app/routes/ocr_routes.py.
 *
 * The PDF is fetched from Gmail rather than uploaded, so the bytes never need
 * to transit the function twice, and the attachment id is checked against the
 * caller's own message before anything is fetched.
 */
export function registerOcr(
  api: Router,
  deps: { requireUser: any; rateLimit: any; store: Store },
): void {
  const { requireUser, rateLimit, store } = deps;

  const scanHandler = async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as OCRScanRequest;

      if (body.raw_text) {
        const result = await summariseDocument("pasted text", body.raw_text);
        res.json({ filename: "pasted text", extracted_text: body.raw_text, ...result });
        return;
      }

      if (!body.email_id || !body.attachment_id) {
        res.status(400).json({ detail: "email_id and attachment_id are required" });
        return;
      }

      // Confirms the attachment belongs to a message this caller owns.
      const email = await store.getEmailById(body.email_id, req.user!.email);
      if (!email) {
        res.status(404).json({ detail: "Email not found" });
        return;
      }
      const attachment = (email.attachments ?? []).find(
        (a) => a.id === body.attachment_id,
      );
      if (!attachment) {
        res.status(404).json({ detail: "Attachment not found" });
        return;
      }

      const ctx = await gmailFor(store, req.user!.email);
      if (!ctx) {
        res.status(400).json({ detail: "Gmail is not connected for this account" });
        return;
      }

      const fetched = await ctx.gmail.users.messages.attachments.get({
        userId: ctx.userId,
        messageId: body.email_id,
        id: body.attachment_id,
      });
      const bytes = Buffer.from(fetched.data.data ?? "", "base64");
      if (!bytes.length) {
        res.status(422).json({ detail: "Attachment body was empty" });
        return;
      }

      const { text, hasTextLayer } = await extractPdfText(bytes);
      if (!hasTextLayer) {
        // A scanned PDF has no text layer. Saying so is more useful than
        // returning an empty extraction that looks like a failure elsewhere.
        res.status(422).json({
          detail:
            "This PDF has no text layer, so it looks scanned. Text extraction needs an OCR service.",
        });
        return;
      }

      const result = await summariseDocument(attachment.filename, text);

      // Cache the text on the attachment so a re-render is free.
      const updated = await store.updateEmail(body.email_id, req.user!.email, {
        attachments: (email.attachments ?? []).map((a) =>
          a.id === body.attachment_id ? { ...a, extracted_text: text } : a,
        ),
      });
      void updated;

      logger.info({ msg: "ocr scan", file: attachment.filename, chars: text.length });
      res.json({ filename: attachment.filename, extracted_text: text, ...result });
  };

  api.post("/ocr/scan", requireUser, rateLimit(10, 60), scanHandler);

  /**
   * Multipart upload, kept from the contract.
   *
   * Rejected deliberately. A function request body is capped at ~10 MB, and
   * buffering an uploaded PDF to /tmp to work around it is what makes a
   * function the wrong place for this. The attachment path above fetches the
   * bytes straight from Gmail instead, which never transits the function twice.
   */
  const uploadRejected = (_req: Request, res: Response) => {
    res.status(501).json({
      detail:
        "File upload is not supported. Scan a PDF that is already attached to one of your emails.",
    });
  };
  api.post("/ocr/upload", requireUser, rateLimit(5, 60), uploadRejected);

  // Contract name for the same operation, so either client call site works.
  api.post("/ocr/scan-attachment", requireUser, rateLimit(10, 60), scanHandler);
}
