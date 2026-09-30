import type { Request, Response, Router } from "express";
import type { Store } from "../db/store";
import type { EmailItem } from "../models";

/**
 * Port of app/routes/analytics_routes.py and Database.get_analytics.
 *
 * Scoped to the authenticated account: the dashboard must never count or
 * summarise another account's mail. An empty mailbox returns zeroes, not
 * invented figures.
 */

function emptyAnalytics() {
  return {
    total_emails: 0,
    unread_count: 0,
    spam_blocked: 0,
    urgent_count: 0,
    important_count: 0,
    open_action_items: 0,
    time_saved_hours: 0.0,
    avg_response_time_minutes: 0,
    category_distribution: {},
    priority_distribution: {},
    daily_volume: [],
    top_senders: [],
  };
}

function dayKey(ts: number): string | null {
  if (!ts) return null;
  try {
    return new Date(ts * 1000).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function shortDay(iso: string): string {
  // "2026-09-01" -> "01 Sep"
  const [y, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[Number(m) - 1] ?? m}`;
}

function summarise(emails: EmailItem[]) {
  const total = emails.length;
  const unread = emails.filter((e) => !e.is_read && e.folder === "inbox").length;
  const spam = emails.filter((e) => e.is_spam || e.category === "Spam").length;
  const urgent = emails.filter((e) => e.priority === "High" && e.folder === "inbox").length;

  // Only messages that were actually summarised count. The per-message figure
  // is an explicit estimate rather than a measurement.
  const isSummarised = (e: EmailItem) =>
    Boolean(e.summary && (e.summary.one_liner || e.summary.bullet_points?.length));
  const summarised = emails.filter(isSummarised).length;

  const categoryCounts: Record<string, number> = {};
  for (const e of emails) {
    categoryCounts[e.category] = (categoryCounts[e.category] ?? 0) + 1;
  }

  const priorityCounts = {
    High: emails.filter((e) => e.priority === "High").length,
    Medium: emails.filter((e) => e.priority === "Medium").length,
    Low: emails.filter((e) => e.priority === "Low").length,
  };

  const buckets: Record<string, { received: number; summarized: number; urgent: number }> = {};
  for (const e of emails) {
    const key = dayKey(e.timestamp);
    if (!key) continue;
    const b = (buckets[key] ??= { received: 0, summarized: 0, urgent: 0 });
    b.received += 1;
    if (isSummarised(e)) b.summarized += 1;
    if (e.priority === "High") b.urgent += 1;
  }
  const dailyVolume = Object.keys(buckets)
    .sort()
    .slice(-14)
    .map((d) => ({ day: shortDay(d), ...buckets[d] }));

  // Top senders, from this account's own mail only.
  const counts = new Map<string, number>();
  const addresses = new Map<string, string>();
  const urgentBy = new Map<string, number>();
  for (const e of emails) {
    const name = e.sender_name || e.sender_email;
    counts.set(name, (counts.get(name) ?? 0) + 1);
    addresses.set(name, e.sender_email);
    if (e.priority === "High") urgentBy.set(name, (urgentBy.get(name) ?? 0) + 1);
  }
  const topSenders = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({
      name,
      email: addresses.get(name) ?? "",
      count,
      urgent_ratio: `${Math.round(((urgentBy.get(name) ?? 0) / count) * 100)}%`,
    }));

  return {
    total_emails: total,
    unread_count: unread,
    spam_blocked: spam,
    urgent_count: urgent,
    important_count: emails.filter((e) => e.priority === "High" || e.is_starred).length,
    open_action_items: emails.reduce(
      (n, e) => n + (e.action_items ?? []).filter((a) => !a.completed).length,
      0,
    ),
    time_saved_hours: Math.round((summarised * 2) / 60 * 10) / 10,
    avg_response_time_minutes: 0,
    category_distribution: categoryCounts,
    priority_distribution: priorityCounts,
    daily_volume: dailyVolume,
    top_senders: topSenders,
  };
}

export function registerAnalytics(
  api: Router,
  deps: { requireUser: any; store: Store },
): void {
  const { requireUser, store } = deps;

  api.get("/analytics/summary", requireUser, async (req: Request, res: Response) => {
    const user = req.user!;
    // One read for the whole dashboard, rather than a filtered query per card.
    const emails = await store.getEmails({ userEmail: user.email, folder: "all" });
    res.json(emails.length ? summarise(emails) : emptyAnalytics());
  });
}
