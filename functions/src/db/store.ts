/**
 * Firestore-backed replacement for app/database/db.py.
 *
 * The Python store was a dict keyed by email id, so every read pulled the whole
 * mailbox into memory. Here, ownership is the first indexed filter and the
 * common filters are pushed down, so a query only transfers matching documents.
 *
 * Two call sites in the Python code reached past the methods and touched the
 * dict directly:
 *   - gmail_service.py  `if email_id not in db.emails`   -> emailExists()
 *   - settings_routes.py `db.settings[...] = ...`         -> getSettings/setSettings
 * Both are ported to methods, so this interface is the whole contract.
 */

import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import {
  DEFAULT_SETTINGS,
  type EmailItem,
  type EmailSummary,
  type SentReplyRecord,
  type UserSettings,
} from "../models";
import { buildSearchTokens, matchesSearch, queryTokens } from "./tokens";

export const EMAILS = "emails";
export const SENT_REPLIES = "sentReplies";
export const CREDENTIALS = "credentials";
export const SETTINGS = "settings";

/** Cap on documents read per query, so one page cannot exhaust memory. */
const MAX_SCAN = 500;

/** Firestore sorts missing fields first on ascending order, so low is 0. */
function ts(value: number | undefined | null): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export class Store {
  private readonly db: Firestore;

  constructor(db?: Firestore) {
    this.db = db ?? getFirestore();
  }

  // ------------------------------------------------------------------ emails

  private toEmail(doc: FirebaseFirestore.DocumentSnapshot): EmailItem {
    return doc.data() as EmailItem;
  }

  /**
   * Membership test for a single id, without loading the document.
   * Replaces `email_id not in db.emails`.
   */
  async emailExists(emailId: string): Promise<boolean> {
    const snap = await this.db.collection(EMAILS).doc(emailId).get();
    return snap.exists;
  }

  async getEmailById(
    emailId: string,
    userEmail: string,
  ): Promise<EmailItem | null> {
    const snap = await this.db.collection(EMAILS).doc(emailId).get();
    if (!snap.exists) return null;
    const email = this.toEmail(snap);
    // Every read path is scoped by owner, so one user can never reach
    // another's mail by guessing an id. A mismatch is reported as "not found"
    // rather than "forbidden": the caller should not learn the id exists.
    if ((email.user_email || "").toLowerCase() !== (userEmail || "").toLowerCase()) {
      return null;
    }
    return email;
  }

  async getEmails(params: {
    folder?: string;
    category?: string | null;
    priority?: string | null;
    search?: string | null;
    unreadOnly?: boolean;
    starredOnly?: boolean;
    hasAttachments?: boolean | null;
    userEmail: string;
    tone?: string | null;
    fromDate?: number | null;
    toDate?: number | null;
    requiresReply?: boolean | null;
  }): Promise<EmailItem[]> {
    const owner = (params.userEmail || "").trim().toLowerCase();
    if (!owner) {
      // No owner means no authorised caller. Return nothing rather than the
      // whole mailbox.
      return [];
    }

    const folder = (params.folder || "inbox").toLowerCase();
    let query = this.db.collection(EMAILS).where("user_email", "==", owner);

    // Compound equality filters are supported; ordering is applied after the
    // in-memory pass, because Firestore would need a composite index for
    // every combination of these plus the sort.
    if (folder === "inbox" || folder === "sent" || folder === "drafts" ||
        folder === "spam" || folder === "trash" || folder === "archive") {
      query = query.where("folder", "==", folder);
    }
    if (params.category) {
      query = query.where("category", "==", params.category);
    }
    if (params.priority) {
      query = query.where("priority", "==", params.priority);
    }
    if (params.starredOnly) {
      query = query.where("is_starred", "==", true);
    }
    if (params.hasAttachments !== undefined && params.hasAttachments !== null) {
      query = query.where("has_attachments", "==", params.hasAttachments);
    }

    // Coarse prefilter. The exact substring test still runs below, so this
    // only narrows candidates; it never decides the result.
    const tokens = params.search ? queryTokens(params.search) : [];
    if (tokens.length) {
      query = query.where("searchTokens", "array-contains-any", tokens.slice(0, 10));
    }

    const snapshot = await query.limit(MAX_SCAN).get();
    let results: EmailItem[] = snapshot.docs.map((d) => this.toEmail(d));

    // ---- filters that cannot be expressed as a simple Firestore clause ----

    if (folder === "important") {
      results = results.filter(
        (e) =>
          e.priority?.toLowerCase() === "high" ||
          e.category?.toLowerCase() === "important" ||
          e.is_starred,
      );
    } else if (folder === "starred") {
      results = results.filter((e) => e.is_starred);
    } else if (folder === "unread") {
      results = results.filter((e) => !e.is_read);
    }

    if (params.unreadOnly) results = results.filter((e) => !e.is_read);

    if (params.search) {
      results = results.filter((e) => matchesSearch(e, params.search as string));
    }
    if (params.tone) {
      const wanted = params.tone.trim().replace(/\b\w/g, (c) => c.toUpperCase());
      results = results.filter(
        (e) => (e.summary ? e.summary.tone : "Neutral") === wanted,
      );
    }
    if (params.requiresReply !== undefined && params.requiresReply !== null) {
      results = results.filter(
        (e) => Boolean(e.summary && e.summary.requires_reply) === params.requiresReply,
      );
    }

    // A timestamp of 0 means "no date", so it is excluded from a bounded
    // range instead of appearing in every one.
    if (params.fromDate !== null && params.fromDate !== undefined) {
      results = results.filter((e) => {
        const t = ts(e.timestamp);
        return t !== 0 && t >= (params.fromDate as number);
      });
    }
    if (params.toDate !== null && params.toDate !== undefined) {
      results = results.filter((e) => {
        const t = ts(e.timestamp);
        return t !== 0 && t <= (params.toDate as number);
      });
    }

    results.sort((a, b) => ts(b.timestamp) - ts(a.timestamp));
    return results;
  }

  async addEmail(email: EmailItem): Promise<EmailItem> {
    const searchTokens = buildSearchTokens(email);
    await this.db.collection(EMAILS).doc(email.id).set({
      ...email,
      timestamp: ts(email.timestamp),
      searchTokens,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return email;
  }

  async addEmails(emails: EmailItem[]): Promise<number> {
    if (!emails.length) return 0;
    // Chunked: Firestore caps a batch at 500 operations.
    let stored = 0;
    for (let i = 0; i < emails.length; i += 400) {
      const batch = this.db.batch();
      for (const email of emails.slice(i, i + 400)) {
        // An unowned message has no authorisation context, so storing it would
        // create something nobody can ever read.
        if (!(email.user_email || "").trim()) continue;
        batch.set(this.db.collection(EMAILS).doc(email.id), {
          ...email,
          timestamp: ts(email.timestamp),
          searchTokens: buildSearchTokens(email),
          updatedAt: FieldValue.serverTimestamp(),
        });
        stored += 1;
      }
      await batch.commit();
    }
    return stored;
  }

  async updateEmail(
    emailId: string,
    userEmail: string,
    updates: Record<string, unknown>,
  ): Promise<EmailItem | null> {
    const ref = this.db.collection(EMAILS).doc(emailId);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const existing = this.toEmail(snap);
    if ((existing.user_email || "").toLowerCase() !== (userEmail || "").toLowerCase()) {
      return null;
    }
    // Ownership is not reassignable: otherwise an update could hand a message
    // to another account, or take one away from its owner.
    const safe: Record<string, unknown> = { ...updates };
    delete safe.user_email;
    delete safe.id;
    delete safe.searchTokens;

    const merged = { ...existing, ...safe } as EmailItem;
    // The token index is derived, so it is rebuilt from the merged document
    // rather than trusted from the caller.
    await ref.set(
      { ...safe, searchTokens: buildSearchTokens(merged), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return merged;
  }

  /** Remove a message permanently, bypassing the trash. */
  async purgeEmail(emailId: string, userEmail: string): Promise<boolean> {
    const existing = await this.getEmailById(emailId, userEmail);
    if (!existing) return false;
    await this.db.collection(EMAILS).doc(emailId).delete();
    return true;
  }

  /** The reversible transition to trash; a second call really removes it. */
  async deleteEmail(emailId: string, userEmail: string): Promise<boolean> {
    const existing = await this.getEmailById(emailId, userEmail);
    if (!existing) return false;
    if (existing.folder === "trash") {
      await this.db.collection(EMAILS).doc(emailId).delete();
    } else {
      await this.db.collection(EMAILS).doc(emailId).set(
        { folder: "trash", is_trash: true, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    return true;
  }

  /**
   * Drop the synthetic demo set once real mail arrives.
   * Scoped by owner, not by sender/recipient, so it cannot remove somebody
   * else's real message.
   */
  async clearFakeEmailsForUser(userEmail: string): Promise<number> {
    const owner = (userEmail || "").trim().toLowerCase();
    if (!owner) return 0;
    const snapshot = await this.db
      .collection(EMAILS)
      .where("user_email", "==", owner)
      .where("id", ">=", "em-usr-")
      .where("id", "<", "em-usr0")
      .get();
    if (snapshot.empty) return 0;
    const batch = this.db.batch();
    for (const doc of snapshot.docs) batch.delete(doc.ref);
    await batch.commit();
    return snapshot.size;
  }

  /**
   * Make a fresh sync authoritative for server folders.
   *
   * Locally composed mail is kept: sent messages, drafts and anything the user
   * trashed were produced here, not fetched, and a sync must not delete them.
   */
  async replaceUserEmails(userEmail: string, emails: EmailItem[]): Promise<number> {
    const owner = (userEmail || "").trim().toLowerCase();
    if (!owner) return 0;
    const keep = ["sent", "drafts", "trash"];
    const existing = await this.db.collection(EMAILS).where("user_email", "==", owner).get();
    const doomed = existing.docs.filter((d) => {
      const folder = ((this.toEmail(d).folder || "") as string).toLowerCase();
      return !keep.includes(folder);
    });
    for (let i = 0; i < doomed.length; i += 400) {
      const batch = this.db.batch();
      for (const doc of doomed.slice(i, i + 400)) batch.delete(doc.ref);
      await batch.commit();
    }
    return this.addEmails(emails.filter((e) => (e.user_email || "").toLowerCase() === owner));
  }

  /**
   * Remove every message belonging to one account.
   * Scoped deliberately: it must never be callable without an owner.
   */
  async clearUser(userEmail: string): Promise<number> {
    const owner = (userEmail || "").trim().toLowerCase();
    if (!owner) return 0;
    const emails = await this.db.collection(EMAILS).where("user_email", "==", owner).get();
    const replies = await this.db.collection(SENT_REPLIES).where("user_email", "==", owner).get();
    for (let i = 0; i < emails.size; i += 400) {
      const batch = this.db.batch();
      for (const doc of emails.docs.slice(i, i + 400)) batch.delete(doc.ref);
      await batch.commit();
    }
    for (let i = 0; i < replies.size; i += 400) {
      const batch = this.db.batch();
      for (const doc of replies.docs.slice(i, i + 400)) batch.delete(doc.ref);
      await batch.commit();
    }
    // Credentials too. This is the "forget me" primitive, and an OAuth
    // refresh token left behind outlives the session that created it.
    await Promise.all([
      this.db.collection(CREDENTIALS).doc(owner).delete(),
      this.db.collection(SETTINGS).doc(owner).delete(),
    ]);
    return emails.size;
  }

  // ------------------------------------------------- sent replies / style corpus

  async addSentReply(
    userEmail: string,
    recipient: string,
    subject: string,
    body: string,
    sent = true,
  ): Promise<SentReplyRecord | null> {
    const owner = (userEmail || "").trim().toLowerCase();
    const text = (body || "").trim();
    if (!owner || !text) return null;
    const record: SentReplyRecord = {
      id: `rep-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
      user_email: owner,
      to: (recipient || "").trim(),
      subject: (subject || "").trim(),
      body: text,
      sent,
      created_at: Date.now() / 1000,
    };
    await this.db.collection(SENT_REPLIES).doc(record.id).set(record);
    return record;
  }

  async listSentReplies(userEmail: string, limit = 100): Promise<SentReplyRecord[]> {
    const owner = (userEmail || "").trim().toLowerCase();
    if (!owner) return [];
    const snapshot = await this.db
      .collection(SENT_REPLIES)
      .where("user_email", "==", owner)
      .orderBy("created_at", "desc")
      .limit(Math.min(limit, 200))
      .get();
    return snapshot.docs.map((d) => d.data() as SentReplyRecord);
  }

  async sentReplyCount(userEmail: string): Promise<number> {
    const owner = (userEmail || "").trim().toLowerCase();
    if (!owner) return 0;
    const snapshot = await this.db
      .collection(SENT_REPLIES)
      .where("user_email", "==", owner)
      .select()
      .get();
    return snapshot.size;
  }

  // -------------------------------------------------------------- credentials

  async setUserCredentials(userEmail: string, creds: Record<string, unknown>): Promise<void> {
    const owner = (userEmail || "").trim().toLowerCase();
    if (!owner) return;
    await this.db.collection(CREDENTIALS).doc(owner).set({
      ...creds,
      user_email: owner,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  async getUserCredentials(userEmail: string): Promise<Record<string, unknown> | null> {
    const owner = (userEmail || "").trim().toLowerCase();
    if (!owner) return null;
    const snap = await this.db.collection(CREDENTIALS).doc(owner).get();
    return snap.exists ? (snap.data() as Record<string, unknown>) : null;
  }

  // ----------------------------------------------------------------- settings

  async getSettings(userEmail: string): Promise<UserSettings> {
    const owner = (userEmail || "").trim().toLowerCase();
    if (!owner) return { ...DEFAULT_SETTINGS };
    const snap = await this.db.collection(SETTINGS).doc(owner).get();
    if (!snap.exists) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<UserSettings>) };
  }

  async setSettings(
    userEmail: string,
    updates: Partial<UserSettings>,
  ): Promise<UserSettings> {
    const current = await this.getSettings(userEmail);
    const merged = { ...current, ...updates };
    await this.db.collection(SETTINGS)
      .doc((userEmail || "").trim().toLowerCase())
      .set({ ...merged, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return merged;
  }
}

export { Timestamp };
