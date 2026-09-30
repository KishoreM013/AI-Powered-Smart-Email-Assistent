/**
 * Types mirrored from functions/src/models.ts.
 *
 * Kept in step with the frozen contract in contract/openapi.json.
 */
export const PRIORITIES = ["High", "Medium", "Low"];
export const CATEGORIES = [
    "Work", "Personal", "Promotions", "Finance", "Updates", "Newsletter",
    "Important", "Meeting", "Invitation", "Spam", "Other",
];
export const TONES = [
    "Professional", "Formal", "Friendly", "Angry", "Urgent", "Neutral",
];
export const DEFAULT_SETTINGS = {
    demo_mode: false,
    gemini_api_key: "",
    auto_reply_enabled: true,
    default_reply_tone: "Professional",
    connected_gmail: false,
    sync_interval_mins: 15,
};
