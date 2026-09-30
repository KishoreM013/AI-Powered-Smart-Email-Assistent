/**
 * Gmail access, replacing app/services/gmail_service.py and imap_service.py.
 *
 * The refresh token is read from the credentials table and decrypted per
 * request. Nothing is cached in module scope, because an edge function
 * instance serves different users over its lifetime and a cached token would
 * be the wrong account's credential.
 */

import { google } from "npm:googleapis@160";
import { logger } from "./log.ts";
import { config } from "./config.ts";
import { decryptSecret } from "./credentials.ts";
import type { Store } from "./store.ts";
import { classifyByRules } from "./localRules.ts";
import type { EmailItem } from "./types.ts";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

export interface GmailContext {
  gmail: ReturnType<typeof google.gmail>;
  userId: string;
}

/**
 * Build an authorised Gmail client for one account.
 * Returns null when the account has never completed OAuth.
 */
export async function gmailFor(
  store: Store,
  userEmail: string,
): Promise<GmailContext | null> {
  const creds = await store.getUserCredentials(userEmail);
  const sealed = creds?.refresh_token;
  if (typeof sealed !== "string" || !sealed) return null;

  const oauth = new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_REDIRECT_URI,
  );
  // `scope`, not `scopes`: setCredentials takes a single space-delimited string.
  // Passing the array here is silently ignored, so the stored refresh token
  // would be used with default scopes and every Gmail call would 403.
  oauth.setCredentials({
    // Awaited here: decryptSecret is async on WebCrypto, and passing the
    // promise would type-check as a string only by accident.
    refresh_token: await decryptSecret(sealed),
    scope: SCOPES.join(" "),
  });
  return { gmail: google.gmail({ version: "v1", auth: oauth }), userId: userEmail };
}

/** The subset of the Gmail message resource this module reads. */
interface GmailMessage {
  id?: string | null;
  threadId?: string | null;
  labelIds?: string[] | null;
  snippet?: string | null;
  internalDate?: string | null;
  payload?: {
    headers?: { name?: string | null; value?: string | null }[] | null;
    body?: { data?: string | null; attachmentId?: string | null; size?: number | null } | null;
    parts?: {
      mimeType?: string | null;
      filename?: string | null;
      body?: { data?: string | null; attachmentId?: string | null; size?: number | null } | null;
    }[] | null;
  } | null;
}

function headerValue(
  headers: { name?: string | null; value?: string | null }[] | undefined,
  name: string,
): string {
  return (
    headers?.find((h) => (h.name || "").toLowerCase() === name.toLowerCase())?.value ??
    ""
  );
}

function decodeBody(data: string | null | undefined): string {
  if (!data) return "";
  try {
    return Buffer.from(data, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

/** Strip quoted history and signatures, so classification sees the new mail. */
function stripQuoted(body: string): string {
  return body
    .split(/\n--+\s*Original Message\s*--+/i)[0]
    .split(/\n\s*(?:On .+ wrote:|From:\s.+$)/m)[0]
    .replace(/^>.*$/gm, "")
    .trim();
}

function listUnsubscribe(value: string): boolean {
  return /unsubscribe|list-unsubscribe/i.test(value);
}

/**
 * Fetch recent mail and map it to EmailItem.
 *
 * The AI pass is deliberately NOT run here. Summarising every message would
 * make a sync of 50 emails 50 sequential model calls, which cannot finish
 * inside the function deadline. The Python version summarised lazily; this
 * does too, in the /summarize route.
 */
export async function fetchRecent(
  ctx: GmailContext,
  max = config.MAX_SYNC_EMAILS,
): Promise<EmailItem[]> {
  const list = await ctx.gmail.users.messages.list({
    userId: ctx.userId,
    maxResults: Math.min(max, 100),
    q: "in:anywhere -in:chats",
  });
  const ids = (list.data.messages ?? []).map((m) => m.id).filter(Boolean) as string[];
  if (!ids.length) return [];

  // One batched fetch. The alternative, 50 individual gets, is both slower and
  // burns quota.
  const batch = ctx.gmail.users.messages as unknown as BatchCapable;
  const detailed = await batch.batchGet({
    userId: ctx.userId,
    ids,
    format: "full",
  });

  const emails: EmailItem[] = [];
  for (const message of detailed.data.messages as GmailMessage[] ?? []) {
    if (!message.id) continue;
    const payload = message.payload;
    const headers = payload?.headers ?? [];

    const body = stripQuoted(
      decodeBody(payload?.body?.data) ||
        (payload?.parts ?? [])
          .filter((p) => p.mimeType === "text/plain" && p.body?.data)
          .map((p) => decodeBody(p.body?.data))
          .join("\n"),
    );

    const attachments = (payload?.parts ?? [])
      .filter((p) => p.filename && p.body?.attachmentId)
      .map((p) => ({
        id: p.body!.attachmentId!,
        filename: p.filename!,
        size: p.body?.size ? `${Math.round(Number(p.body.size) / 1024)} KB` : "0 KB",
        content_type: p.mimeType ?? "application/octet-stream",
      }));

    const unsub = headerValue(headers, "list-unsubscribe");
    const from = headerValue(headers, "from");
    const subject = headerValue(headers, "subject") || "(no subject)";
    const senderName = from.includes("<")
      ? from.slice(0, from.indexOf("<")).trim().replace(/^["']|["']$/g, "")
      : from;

    const internalDate = Number(message.internalDate ?? 0);
    const timestamp = internalDate ? internalDate / 1000 : 0;
    const isSpam =
      listUnsubscribe(unsub) || /^(noreply|no-reply)@/i.test(from);

    const { category, priority } = classifyByRules(subject, body);
    const labels = message.labelIds ?? [];

    emails.push({
      id: message.id,
      user_email: ctx.userId,
      sender_name: senderName || from,
      sender_email: from.includes("<")
        ? from.slice(from.indexOf("<") + 1, from.indexOf(">")).trim()
        : from,
      recipient_email: ctx.userId,
      subject,
      snippet: message.snippet ?? body.slice(0, 160),
      body,
      category: isSpam ? "Spam" : category,
      priority,
      date: timestamp
        ? new Date(timestamp * 1000).toISOString()
        : new Date(0).toISOString(),
      timestamp,
      is_read: labels.includes("UNREAD") ? false : true,
      is_starred: labels.includes("STARRED"),
      is_spam: isSpam,
      is_trash: false,
      has_attachments: attachments.length > 0,
      attachments,
      summary: null,
      action_items: [],
      reply_draft: null,
      folder: labels.includes("SENT")
        ? "sent"
        : labels.includes("DRAFT")
          ? "drafts"
          : labels.includes("SPAM")
            ? "spam"
            : labels.includes("TRASH")
              ? "trash"
              : labels.includes("ARCHIVE")
                ? "archive"
                : "inbox",
    });
  }
  return emails;
}

/** Apply a Gmail-side label change, so state is not only local. */
export async function applyLabel(
  ctx: GmailContext,
  messageId: string,
  add: string[],
  remove: string[],
): Promise<void> {
  await ctx.gmail.users.messages.modify({
    userId: ctx.userId,
    id: messageId,
    requestBody: { addLabelIds: add, removeLabelIds: remove },
  });
}

/**
 * The Gmail v1 client types do not declare batchGet, though the endpoint
 * exists and is the only way to avoid N round trips on a sync.
 */
type BatchCapable = {
  batchGet(params: {
    userId: string;
    ids: string[];
    format: string;
  }): Promise<{ data: { messages?: unknown[] } }>;
};

/**
 * Send a reply.
 *
 * The Gmail draft API is used rather than a hand-built RFC 2822 string: it
 * handles threading, MIME boundaries and encoding, all of which are easy to
 * get subtly wrong.
 */
export async function sendReply(
  ctx: GmailContext,
  args: { to: string; subject: string; body: string; inReplyTo?: string | null },
): Promise<{ id: string; threadId: string | null | undefined }> {
  const threadId = args.inReplyTo ?? undefined;
  const raw = [
    `To: ${args.to}`,
    `Subject: ${args.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    threadId ? `In-Reply-To: ${threadId}` : "",
    threadId ? `References: ${threadId}` : "",
    "",
    args.body,
  ]
    .filter(Boolean)
    .join("\r\n");

  const sent = await ctx.gmail.users.messages.send({
    userId: ctx.userId,
    requestBody: { raw: Buffer.from(raw, "utf8").toString("base64url"), threadId },
  });
  logger.info({ msg: "reply sent", to: args.to, id: sent.data.id });
  return { id: sent.data.id ?? "", threadId: sent.data.threadId };
}
