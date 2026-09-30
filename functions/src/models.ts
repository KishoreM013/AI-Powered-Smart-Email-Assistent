/**
 * Port of app/models/schemas.py.
 *
 * These are the live request/response shapes. app/models/email.py defines a
 * SECOND, conflicting EmailItem (with thread_id / body_full / ai_analysis)
 * that no route actually uses; it is deliberately not reproduced here, because
 * copying it would reintroduce the ambiguity.
 */

export const PRIORITIES = ["High", "Medium", "Low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CATEGORIES = [
  "Work",
  "Personal",
  "Promotions",
  "Finance",
  "Updates",
  "Newsletter",
  // Added so scheduling mail is distinguishable from general work mail, and
  // so a thread can be flagged important in its own right.
  "Important",
  "Meeting",
  "Invitation",
  "Spam",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const TONES = [
  "Professional",
  "Formal",
  "Friendly",
  "Angry",
  "Urgent",
  "Neutral",
] as const;
/** Register of the sender, distinct from sentiment (polarity). */
export type Tone = (typeof TONES)[number];

export const FOLDERS = [
  "inbox",
  "sent",
  "drafts",
  "spam",
  "trash",
  "archive",
] as const;
export type Folder = (typeof FOLDERS)[number];

export interface AttachmentInfo {
  id: string;
  filename: string;
  /** Human-readable, e.g. "1.2 MB". Kept as a string for parity. */
  size: string;
  content_type: string;
  url?: string | null;
  extracted_text?: string | null;
}

export interface ActionItem {
  task: string;
  due_date?: string | null;
  completed: boolean;
  is_meeting: boolean;
  meeting_time?: string | null;
}

/** A named person mentioned in the message. */
export interface Person {
  name: string;
  role?: string | null;
  email?: string | null;
}

/** Structured schedule information pulled out of the body. */
export interface MeetingDetails {
  is_meeting: boolean;
  title?: string | null;
  date?: string | null;
  time?: string | null;
  location?: string | null;
  platform?: string | null;
  attendees: string[];
}

export interface EmailSummary {
  bullet_points: string[];
  one_liner: string;
  urgency_reason?: string | null;
  /** Emotional register, i.e. polarity. */
  sentiment: string;
  /**
   * How the sender is speaking. Distinct from sentiment: a stern but polite
   * CEO is tone=Professional, sentiment=Frustrated.
   */
  tone: string;
  key_deadlines: string[];
  /** Any other date mentioned, as opposed to an implied deadline. */
  dates: string[];
  /** Named people, excluding the account owner. */
  people: Person[];
  meeting?: MeetingDetails | null;
  keywords: string[];
  /** True when the sender is waiting on an answer. */
  requires_reply: boolean;
  /** 0.0 to 1.0, how much this matters to the recipient. */
  importance_score: number;
}

export interface EmailItem {
  id: string;
  /**
   * Owning account. Every read and write path is scoped by this field, so it
   * must always be set by the route or the sync layer rather than trusted from
   * a request body. Without it there is nothing to authorise against.
   */
  user_email: string;
  sender_name: string;
  sender_email: string;
  recipient_email: string;
  subject: string;
  snippet: string;
  body: string;
  category: Category;
  priority: Priority;
  date: string;
  /** Unix seconds, as a number. 0 means "no date" and is excluded from ranges. */
  timestamp: number;
  is_read: boolean;
  is_starred: boolean;
  is_spam: boolean;
  is_trash: boolean;
  has_attachments: boolean;
  attachments: AttachmentInfo[];
  summary?: EmailSummary | null;
  action_items: ActionItem[];
  reply_draft?: string | null;
  folder: string;

  /**
   * Not part of the API response. Derived on write from the searchable text so
   * Firestore can answer `search` with array-contains, which it cannot do for
   * substrings. Stripped before serialising a response.
   */
  searchTokens?: string[];
}

export interface GenerateReplyRequest {
  email_id?: string | null;
  email_subject?: string | null;
  email_body?: string | null;
  tone: string;
  custom_instructions?: string | null;
}

export interface GenerateReplyResponse {
  reply_text: string;
  tone: string;
  suggested_subject: string;
}

export interface OCRScanRequest {
  email_id?: string | null;
  attachment_id?: string | null;
  raw_text?: string | null;
}

export interface OCRScanResponse {
  filename: string;
  extracted_text: string;
  /** Invoice, Contract, Receipt, Report, General */
  document_type: string;
  summary: string;
  /** e.g. amount, due_date, vendor, invoice_no */
  key_entities: Record<string, unknown>;
}

export interface ComposeEmailRequest {
  recipient: string;
  subject: string;
  body: string;
  /**
   * The message this replies to. Used to thread the reply and to set
   * In-Reply-To. Validated against the caller's own mail by the route.
   */
  in_reply_to?: string | null;
  category: Category;
  priority: Priority;
  attachments?: Record<string, unknown>[] | null;
}

export interface FilterParams {
  folder: string;
  category?: string | null;
  priority?: string | null;
  search?: string | null;
  unread_only: boolean;
  starred_only: boolean;
  has_attachments?: boolean | null;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatar: string;
  is_demo: boolean;
  connected_gmail: boolean;
}

export interface Token {
  access_token: string;
  token_type: string;
  user: UserProfile;
}

export interface GoogleLoginRequest {
  code?: string | null;
  id_token?: string | null;
  email?: string | null;
  name?: string | null;
  avatar?: string | null;
  is_demo?: boolean | null;
}

export interface AuthConfigResponse {
  google_client_id: string;
  google_redirect_uri: string;
  is_live_configured: boolean;
  demo_mode: boolean;
}

export interface IMAPLoginRequest {
  email: string;
  app_password: string;
}

export interface SettingsUpdateRequest {
  gemini_api_key?: string | null;
  demo_mode?: boolean | null;
  auto_reply_enabled?: boolean | null;
  default_reply_tone?: string | null;
}

/**
 * What the app has learned about how an account writes.
 *
 * Deliberately descriptive rather than a mock: an empty corpus yields
 * ready=false, and the caller is expected to say so.
 */
export interface StyleProfile {
  reply_count: number;
  average_words: number;
  average_sentence_length: number;
  /** 0 casual .. 1 formal */
  formality: number;
  greeting?: string | null;
  sign_off?: string | null;
  uses_emoji: boolean;
  uses_bullets: boolean;
  common_phrases: string[];
  language: string;
  /** True once there is enough sent mail to be worth imitating. */
  ready: boolean;
}

/** An arbitrary email supplied by the user, not necessarily from a mailbox. */
export interface AnalyzeRequest {
  subject: string;
  body: string;
  sender_name?: string | null;
  sender_email?: string | null;
  save: boolean;
  generate_reply: boolean;
  tone?: string | null;
  personalize: boolean;
}

export interface SentReplyRecord {
  id: string;
  user_email: string;
  to: string;
  subject: string;
  body: string;
  sent: boolean;
  created_at: number;
}

export interface UserSettings {
  demo_mode: boolean;
  gemini_api_key: string;
  auto_reply_enabled: boolean;
  default_reply_tone: string;
  connected_gmail: boolean;
  sync_interval_mins: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  demo_mode: false,
  gemini_api_key: "",
  auto_reply_enabled: true,
  default_reply_tone: "Professional",
  connected_gmail: false,
  sync_interval_mins: 15,
};
