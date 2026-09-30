/**
 * Types mirrored from functions/src/models.ts.
 *
 * Kept in step with the frozen contract in contract/openapi.json.
 */

export const PRIORITIES = ["High", "Medium", "Low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CATEGORIES = [
  "Work", "Personal", "Promotions", "Finance", "Updates", "Newsletter",
  "Important", "Meeting", "Invitation", "Spam", "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface AttachmentInfo {
  id: string;
  filename: string;
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

export interface EmailSummary {
  bullet_points: string[];
  one_liner: string;
  urgency_reason?: string | null;
  sentiment: string;
  tone: string;
  key_deadlines: string[];
  dates: string[];
  people: { name: string; role?: string | null; email?: string | null }[];
  meeting: {
    is_meeting: boolean;
    title?: string | null;
    date?: string | null;
    time?: string | null;
    location?: string | null;
    platform?: string | null;
    attendees: string[];
  } | null;
  keywords: string[];
  requires_reply: boolean;
  importance_score: number;
}

export interface EmailItem {
  id: string;
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
  /** Unix seconds. 0 means "no date". */
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
}

export const TONES = [
  "Professional", "Formal", "Friendly", "Angry", "Urgent", "Neutral",
] as const;
/** Register of the sender, distinct from sentiment (polarity). */
export type Tone = (typeof TONES)[number];

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

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatar: string;
  is_demo: boolean;
  connected_gmail: boolean;
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
