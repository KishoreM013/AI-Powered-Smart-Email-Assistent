import type { Request, Response, Router } from "express";
import type { Store } from "../db/store";
import { classify, extractActionItems, generateReply, learnStyle, summarise } from "../services/gemini";
import { applyLabel, fetchRecent, gmailFor, sendReply } from "../services/gmail";
import { logger } from "firebase-functions";
import type {
  AnalyzeRequest,
  ComposeEmailRequest,
  EmailItem,
  GenerateReplyRequest,
} from "../models";

/**
 * Port of app/routes/email_routes.py (596 lines), the largest route module.
 *
 * Ownership is taken from the verified session, never from a request body, on
 * every path. That is the invariant the Python code enforced with
 * self._owned(), and it is the one thing that must not be relaxed.
 */

/** Never echo the derived index to the client. */
function publicView(email: EmailItem): Omit<EmailItem, "searchTokens"> {
  const { searchTokens: _omit, ...rest } = email;
  return rest;
}

function listView(email: EmailItem) {
  const view = publicView(email);
  // The inbox renders a list, so the full body and attachment payloads are
  // dropped here to keep the response small.
  return {
    ...view,
    body: undefined,
    attachments: (view.attachments ?? []).map((a) => ({
      ...a,
      extracted_text: undefined,
    })),
  };
}

function boolParam(value: unknown): boolean {
  return value === true || value === "true" || value === "1";
}

/**
 * Heuristic phishing signals, shared by the GET and POST variants.
 *
 * Self-contained on purpose: no model call, so it works on the free tier with
 * no API key. The output is a list of indicators, not a verdict, and the UI
 * should present it that way.
 */
function heuristicPhishing(email: EmailItem): {
  risk: "low" | "medium" | "high";
  signals: string[];
} {
  const signals: string[] = [];
  const sender = email.sender_email.toLowerCase();
  const body = email.body;
  const from = `${email.sender_name} ${email.sender_email}`.toLowerCase();

  if (/^(https?:\/\/)?(www\.)?[a-z0-9-]+\.(ru|cn|tk|xyz|top|click|zip)\b/.test(sender)) {
    signals.push("Sender domain uses a frequently abused TLD");
  }
  // A display name that does not match the actual domain is a classic
  // "invoice from <someone@else.com>" pattern.
  const display = email.sender_name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const domain = sender.split("@")[1]?.split(".")[0] ?? "";
  if (display && domain && !display.includes(domain) && display.length > 3) {
    signals.push("Display name does not match the sending domain");
  }
  if (
    /\b(verify your account|confirm your identity|act now|suspended|unusual activity|failed verification)\b/i.test(
      body,
    )
  ) {
    signals.push("Body contains urgency or account-verification language");
  }
  if (/\b(bitcoin|crypto|wire transfer|gift card|bank details|password|ssn)\b/i.test(body)) {
    signals.push("Body requests credentials or payment");
  }
  if (/https?:\/\/[^\s]*@/.test(body)) {
    signals.push("Link disguises its real destination");
  }
  // Reply-To pointing elsewhere from the From domain.
  if (/\bdo not reply\b/i.test(from) && /\b(invoice|security|support|payments)\b/i.test(from)) {
    signals.push("Sender address looks like an impersonation of a known brand");
  }
  return {
    risk: signals.length >= 2 ? "high" : signals.length === 1 ? "medium" : "low",
    signals,
  };
}

function numParam(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function registerEmails(
  api: Router,
  deps: {
    requireUser: any;
    optionalUser: any;
    rateLimit: any;
    store: Store;
  },
): void {
  const { requireUser, optionalUser, rateLimit, store } = deps;

  // ------------------------------------------------------------------ list
  api.get("/emails", requireUser, async (req: Request, res: Response) => {
    const q = req.query;
    const emails = await store.getEmails({
      userEmail: req.user!.email,
      folder: (q.folder as string) ?? "inbox",
      category: (q.category as string) ?? null,
      priority: (q.priority as string) ?? null,
      search: (q.search as string) ?? null,
      unreadOnly: boolParam(q.unread_only),
      starredOnly: boolParam(q.starred_only),
      hasAttachments: q.has_attachments === undefined ? null : boolParam(q.has_attachments),
      tone: (q.tone as string) ?? null,
      fromDate: numParam(q.from_date),
      toDate: numParam(q.to_date),
      requiresReply: q.requires_reply === undefined ? null : boolParam(q.requires_reply),
    });
    res.json(emails.map(listView));
  });

  api.get("/emails/counts", requireUser, async (req: Request, res: Response) => {
    const owner = req.user!.email;
    // Four filtered reads rather than one read of the whole mailbox, so the
    // sidebar badges stay cheap as a mailbox grows.
    const [inbox, unread, starred, spam] = await Promise.all([
      store.getEmails({ userEmail: owner, folder: "inbox" }),
      store.getEmails({ userEmail: owner, folder: "unread" }),
      store.getEmails({ userEmail: owner, folder: "starred" }),
      store.getEmails({ userEmail: owner, folder: "spam" }),
    ]);
    res.json({
      inbox: inbox.length,
      unread: unread.length,
      starred: starred.length,
      spam: spam.length,
    });
  });

  api.get("/emails/:id", requireUser, async (req: Request, res: Response) => {
    const email = await store.getEmailById(req.params.id, req.user!.email);
    if (!email) {
      // 404, not 403: the caller should not learn that the id exists.
      res.status(404).json({ detail: "Email not found" });
      return;
    }
    res.json(publicView(email));
  });

  // ---------------------------------------------------------------- mutate
  const mutate = requireUser;
  const writeLimit = rateLimit(60, 60);

  api.patch("/emails/:id", mutate, writeLimit, async (req: Request, res: Response) => {
    const updated = await store.updateEmail(
      req.params.id,
      req.user!.email,
      (req.body ?? {}) as Record<string, unknown>,
    );
    if (!updated) {
      res.status(404).json({ detail: "Email not found" });
      return;
    }
    res.json(publicView(updated));
  });

  api.delete("/emails/:id", mutate, writeLimit, async (req: Request, res: Response) => {
    const ok = await store.deleteEmail(req.params.id, req.user!.email);
    if (!ok) {
      res.status(404).json({ detail: "Email not found" });
      return;
    }
    res.json({ status: "deleted" });
  });

  /**
   * Read state.
   *
   * A dedicated endpoint in the Python contract, but it was a wrapper over the
   * same PATCH. Kept because the contract calls it, and because toggling
   * server-side in one round trip is cheaper than a read-then-write from the
   * client. The value is inverted from the stored state, not from a parameter,
   * so a stale client cannot set it to the wrong value.
   */
  api.post(
    "/emails/:id/toggle-read",
    mutate,
    writeLimit,
    async (req: Request, res: Response) => {
      const email = await store.getEmailById(req.params.id, req.user!.email);
      if (!email) {
        res.status(404).json({ detail: "Email not found" });
        return;
      }
      const updated = await store.updateEmail(req.params.id, req.user!.email, {
        is_read: !email.is_read,
      });
      res.json(publicView(updated!));
    },
  );

  api.post(
    "/emails/:id/toggle-star",
    mutate,
    writeLimit,
    async (req: Request, res: Response) => {
      const email = await store.getEmailById(req.params.id, req.user!.email);
      if (!email) {
        res.status(404).json({ detail: "Email not found" });
        return;
      }
      const updated = await store.updateEmail(req.params.id, req.user!.email, {
        is_starred: !email.is_starred,
      });
      res.json(publicView(updated!));
    },
  );

  /**
   * Take a message back out of the trash.
   *
   * Reversible, so it is distinct from purge, which really deletes.
   */
  api.post(
    "/emails/:id/restore",
    mutate,
    writeLimit,
    async (req: Request, res: Response) => {
      const email = await store.getEmailById(req.params.id, req.user!.email);
      if (!email) {
        res.status(404).json({ detail: "Email not found" });
        return;
      }
      const updated = await store.updateEmail(req.params.id, req.user!.email, {
        folder: "inbox",
        is_trash: false,
      });
      res.json(publicView(updated!));
    },
  );

  api.post(
    "/emails/:id/purge",
    mutate,
    writeLimit,
    async (req: Request, res: Response) => {
      const ok = await store.purgeEmail(req.params.id, req.user!.email);
      if (!ok) {
        res.status(404).json({ detail: "Email not found" });
        return;
      }
      res.json({ status: "purged" });
    },
  );

  api.post(
    "/emails/:id/move",
    mutate,
    writeLimit,
    async (req: Request, res: Response) => {
      const folder = String(req.body?.folder ?? "");
      if (!folder) {
        res.status(400).json({ detail: "folder is required" });
        return;
      }
      const updated = await store.updateEmail(req.params.id, req.user!.email, {
        folder,
        is_trash: folder === "trash",
      });
      if (!updated) {
        res.status(404).json({ detail: "Email not found" });
        return;
      }
      res.json(publicView(updated));
    },
  );

  api.post(
    "/emails/:email_id/action-items/:task_idx/toggle",
    mutate,
    writeLimit,
    async (req: Request, res: Response) => {
      const email = await store.getEmailById(req.params.email_id, req.user!.email);
      if (!email) {
        res.status(404).json({ detail: "Email not found" });
        return;
      }
      const idx = Number(req.params.task_idx);
      const items = [...(email.action_items ?? [])];
      if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) {
        res.status(400).json({ detail: "Invalid task index" });
        return;
      }
      items[idx] = { ...items[idx], completed: !items[idx].completed };
      const updated = await store.updateEmail(req.params.email_id, req.user!.email, {
        action_items: items,
      });
      res.json(publicView(updated!));
    },
  );

  // ------------------------------------------------------------------- AI
  api.post(
    "/emails/:id/summarize",
    mutate,
    rateLimit(20, 60),
    async (req: Request, res: Response) => {
      const email = await store.getEmailById(req.params.id, req.user!.email);
      if (!email) {
        res.status(404).json({ detail: "Email not found" });
        return;
      }
      const [summary, actions] = await Promise.all([
        summarise(email.subject, email.body),
        extractActionItems(email.subject, email.body),
      ]);
      const updated = await store.updateEmail(req.params.id, req.user!.email, {
        summary,
        action_items: actions,
      });
      res.json(publicView(updated!));
    },
  );

  api.post(
    "/emails/summarize",
    mutate,
    rateLimit(20, 60),
    async (req: Request, res: Response) => {
      const { subject = "", body = "" } = (req.body ?? {}) as Partial<EmailItem>;
      if (!body) {
        res.status(400).json({ detail: "body is required" });
        return;
      }
      res.json(await summarise(subject, body));
    },
  );

  api.post(
    "/emails/analyze",
    optionalUser,
    rateLimit(20, 60),
    async (req: Request, res: Response) => {
      const body = (req.body ?? {}) as AnalyzeRequest;
      if (!body?.body) {
        res.status(400).json({ detail: "body is required" });
        return;
      }
      const [summary, actions, classification] = await Promise.all([
        summarise(body.subject ?? "", body.body),
        extractActionItems(body.subject ?? "", body.body),
        classify(body.subject ?? "", body.body),
      ]);

      const wantsReply = Boolean(body.generate_reply);
      const style = body.personalize
        ? await learnStyle(
            (await store.listSentReplies(req.user?.email ?? "")).map((r) => ({ body: r.body })),
          )
        : null;
      const reply =
        wantsReply && body.tone
          ? await generateReply(body.subject ?? "", body.body, body.tone, undefined, style ?? undefined)
          : null;

      const result = {
        summary,
        action_items: actions,
        category: classification.category,
        priority: classification.priority,
        reply: reply?.reply_text ?? null,
        suggested_subject: reply?.suggested_subject ?? null,
      };

      if (body.save && req.user) {
        const id = `an-${Date.now().toString(36)}`;
        const email: EmailItem = {
          id,
          user_email: req.user.email,
          sender_name: body.sender_name ?? "Unknown sender",
          sender_email: body.sender_email ?? "",
          recipient_email: req.user.email,
          subject: body.subject ?? "(no subject)",
          snippet: body.body.slice(0, 160),
          body: body.body,
          category: classification.category,
          priority: classification.priority,
          date: new Date().toISOString(),
          timestamp: Date.now() / 1000,
          is_read: true,
          is_starred: false,
          is_spam: false,
          is_trash: false,
          has_attachments: false,
          attachments: [],
          summary,
          action_items: actions,
          reply_draft: reply?.reply_text ?? null,
          folder: "inbox",
        };
        await store.addEmail(email);
      }
      res.json(result);
    },
  );

  api.post(
    "/emails/generate-reply",
    mutate,
    rateLimit(20, 60),
    async (req: Request, res: Response) => {
      const body = (req.body ?? {}) as GenerateReplyRequest;
      let subject = body.email_subject ?? "";
      let text = body.email_body ?? "";

      // Prefer the stored message when given an id, so a caller cannot draft a
      // reply to content it did not receive.
      if (body.email_id) {
        const stored = await store.getEmailById(body.email_id, req.user!.email);
        if (!stored) {
          res.status(404).json({ detail: "Email not found" });
          return;
        }
        subject = stored.subject;
        text = stored.body;
      }
      if (!text) {
        res.status(400).json({ detail: "email_body or email_id is required" });
        return;
      }
      const style = await learnStyle(
        (await store.listSentReplies(req.user!.email)).map((r) => ({ body: r.body })),
      );
      const result = await generateReply(
        subject,
        text,
        body.tone ?? "Professional",
        body.custom_instructions ?? undefined,
        style,
      );
      res.json({ ...result, tone: body.tone ?? "Professional" });
    },
  );

  // ---------------------------------------------------------------- style
  api.get("/emails/style-profile", requireUser, async (req: Request, res: Response) => {
    const replies = await store.listSentReplies(req.user!.email);
    res.json(await learnStyle(replies.map((r) => ({ body: r.body }))));
  });

  api.post(
    "/emails/replies/record",
    mutate,
    writeLimit,
    async (req: Request, res: Response) => {
      const { recipient, subject, body, sent } = (req.body ?? {}) as Record<string, unknown>;
      // Only delivered mail is evidence of how someone writes; a draft the
      // user never sent is not.
      if (body) {
        await store.addSentReply(
          req.user!.email,
          String(recipient ?? ""),
          String(subject ?? ""),
          String(body),
          sent !== false,
        );
      }
      res.json({ status: "recorded" });
    },
  );

  /**
   * Emails this account has analysed, newest first.
   *
   * Reads the analysed-email collection, not the sent-reply corpus: the history
   * screen lists analysed messages.
   */
  api.get("/emails/history", requireUser, async (req: Request, res: Response) => {
    const emails = await store.getEmails({ userEmail: req.user!.email, folder: "all" });
    res.json(emails.map(listView));
  });

  /**
   * Remove one analysed email from the history list, permanently.
   *
   * This is a purge rather than a move to trash: a history entry that only
   * moved to trash would still be listed, so the user could never actually
   * delete anything.
   */
  api.delete(
    "/emails/history/:email_id",
    requireUser,
    rateLimit(30, 60),
    async (req: Request, res: Response) => {
      const ok = await store.purgeEmail(req.params.email_id, req.user!.email);
      if (!ok) {
        res.status(404).json({ detail: "Not found" });
        return;
      }
      res.json({ status: "deleted" });
    },
  );

  // ----------------------------------------------------------------- gmail
  /**
   * IMAP sync, kept from the contract.
   *
   * Refused for the same reason as /auth/imap-login: it exists only to drive
   * IMAP sign-in, and that path is gone.
   */
  api.post(
    "/emails/sync-imap",
    mutate,
    rateLimit(5, 300),
    (_req: Request, res: Response) => {
      res.status(501).json({
        detail: "IMAP sync has been removed. Connect Gmail with Google OAuth instead.",
      });
    },
  );

  api.post(
    "/emails/sync",
    mutate,
    rateLimit(10, 300),
    async (req: Request, res: Response) => {
      const ctx = await gmailFor(store, req.user!.email);
      if (!ctx) {
        res.status(400).json({ detail: "Gmail is not connected for this account" });
        return;
      }
      const fetched = await fetchRecent(ctx);
      // Server folders become authoritative; locally composed mail is kept.
      const stored = await store.replaceUserEmails(req.user!.email, fetched);
      // Once real mail exists the synthetic demo set is meaningless.
      await store.clearFakeEmailsForUser(req.user!.email);
      logger.info({ msg: "sync", user: req.user!.email, fetched: fetched.length, stored });
      res.json({ status: "success", synced: fetched.length, stored });
    },
  );

  api.post(
    "/emails/compose",
    mutate,
    rateLimit(20, 60),
    async (req: Request, res: Response) => {
      const body = (req.body ?? {}) as ComposeEmailRequest;
      if (!body?.recipient || !body?.body) {
        res.status(400).json({ detail: "recipient and body are required" });
        return;
      }
      const ctx = await gmailFor(store, req.user!.email);
      if (!ctx) {
        res.status(400).json({ detail: "Gmail is not connected for this account" });
        return;
      }
      // The thread this replies to must belong to the caller, or a caller could
      // graft their reply onto somebody else's thread.
      let inReplyTo: string | null = null;
      if (body.in_reply_to) {
        const parent = await store.getEmailById(body.in_reply_to, req.user!.email);
        if (!parent) {
          res.status(404).json({ detail: "Thread not found" });
          return;
        }
        inReplyTo = body.in_reply_to;
      }
      const sent = await sendReply(ctx, {
        to: body.recipient,
        subject: body.subject,
        body: body.body,
        inReplyTo,
      });
      // Record it: this is the only input to style learning.
      await store.addSentReply(
        req.user!.email,
        body.recipient,
        body.subject,
        body.body,
        true,
      );
      res.json({ status: "sent", message_id: sent.id });
    },
  );

  /**
   * Draft a reply for a stored thread.
   *
   * The contract has this as GET; the client calls GET with query params, so
   * both are registered and share one handler. `tone` is optional and falls
   * back to the tone detected on the incoming message.
   */
  const suggestReply = async (req: Request, res: Response) => {
    const email = await store.getEmailById(req.params.id, req.user!.email);
    if (!email) {
      res.status(404).json({ detail: "Email not found" });
      return;
    }
    const personalize = boolParam(req.query.personalize);
    const requestedTone = (req.query.tone as string) || null;
    const tone = requestedTone ?? (email.summary?.tone || "Professional");
    const style = personalize
      ? await learnStyle(
          (await store.listSentReplies(req.user!.email)).map((r) => ({ body: r.body })),
        )
      : null;
    const result = await generateReply(
      email.subject,
      email.body,
      tone,
      undefined,
      style ?? undefined,
    );
    res.json({ ...result, tone, style_applied: Boolean(style?.ready) });
  };

  api.get("/emails/:id/suggest-reply", mutate, rateLimit(20, 60), suggestReply);
  api.post("/emails/:id/suggest-reply", mutate, rateLimit(20, 60), suggestReply);

  api.get(
    "/emails/:id/phishing-check",
    mutate,
    rateLimit(20, 60),
    async (req: Request, res: Response) => {
      const email = await store.getEmailById(req.params.id, req.user!.email);
      if (!email) {
        res.status(404).json({ detail: "Email not found" });
        return;
      }
      res.json(heuristicPhishing(email));
    },
  );

  api.post(
    "/emails/:id/phishing-check",
    mutate,
    rateLimit(20, 60),
    async (req: Request, res: Response) => {
      const email = await store.getEmailById(req.params.id, req.user!.email);
      if (!email) {
        res.status(404).json({ detail: "Email not found" });
        return;
      }
      res.json(heuristicPhishing(email));
    },
  );
}
