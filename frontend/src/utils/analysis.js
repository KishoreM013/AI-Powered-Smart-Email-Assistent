/**
 * Shared display helpers for analysis results.
 *
 * Every colour here is a Tailwind class string, matching the rest of the app.
 * The *values* always come from the API: these maps only decide how a
 * category or tone is painted, and every lookup falls back to a neutral
 * default so an unrecognised value renders rather than disappearing.
 */

export const TONES = ['Professional', 'Formal', 'Friendly', 'Angry', 'Urgent', 'Neutral'];

export const CATEGORIES = [
  'Work',
  'Personal',
  'Promotions',
  'Finance',
  'Updates',
  'Newsletter',
  'Important',
  'Meeting',
  'Invitation',
  'Spam',
  'Other',
];

export const PRIORITIES = ['High', 'Medium', 'Low'];

/** Badge classes per category. */
export const CATEGORY_CLASSES = {
  Work: 'bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30',
  Finance: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  Personal: 'bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30',
  Promotions: 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
  Updates: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30',
  Newsletter: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  Important: 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30',
  Meeting: 'bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30',
  Invitation: 'bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30',
  Spam: 'bg-rose-200 text-rose-800 border-rose-400 dark:bg-rose-500/25 dark:text-rose-200 dark:border-rose-500/40',
  Other: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-700/50 dark:text-slate-300 dark:border-slate-600',
};

/** Badge classes per priority. High pulses, so urgent mail is visible at a glance. */
export const PRIORITY_CLASSES = {
  High: 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/40',
  Medium: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40',
  Low: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-700/50 dark:text-slate-400 dark:border-slate-600',
};

/** Badge classes per detected tone (the sender's register, not their mood). */
export const TONE_CLASSES = {
  Angry: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/40',
  Urgent: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/40',
  Friendly: 'bg-lime-100 text-lime-700 border-lime-300 dark:bg-lime-500/20 dark:text-lime-300 dark:border-lime-500/40',
  Formal: 'bg-slate-200 text-slate-700 border-slate-400 dark:bg-slate-700/60 dark:text-slate-200 dark:border-slate-500',
  Professional: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/40',
  Neutral: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-700/50 dark:text-slate-400 dark:border-slate-600',
};

const NEUTRAL_BADGE =
  'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-700/50 dark:text-slate-400 dark:border-slate-600';

export const badgeClass = (map, value) => map[value] || NEUTRAL_BADGE;

/** Unrecognised priorities sort last rather than first. */
const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };

export function priorityRank(priority) {
  const rank = PRIORITY_RANK[priority];
  return rank === undefined ? 3 : rank;
}

/** True when the message should stand out in the list. */
export function isUrgent(email) {
  if (!email) return false;
  return email.priority === 'High' || email.category === 'Important' || email.is_starred;
}

/**
 * Flatten a message's analysis into the shape the badges consume.
 * Tolerates a missing summary, since an unsynced or unanalysed email has none.
 */
export function badgesFor(email) {
  const summary = email?.summary || {};
  return {
    priority: email?.priority || 'Medium',
    category: email?.category || 'Other',
    tone: summary.tone || 'Neutral',
    sentiment: summary.sentiment || 'Neutral',
  };
}
