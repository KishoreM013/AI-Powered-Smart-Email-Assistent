/**
 * Formatting helpers.
 *
 * `EmailItem.timestamp` is a float (epoch seconds). The list and detail views
 * previously interpolated it directly, so the inbox rendered values like
 * `1756468800.0` in the date column.
 */

export function formatEmailDate(item) {
  if (!item) return '';
  if (item.date) return item.date;

  const seconds = Number(item.timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return '';

  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  const withinWeek = now.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000;
  if (withinWeek) return date.toLocaleDateString(undefined, { weekday: 'short' });

  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function pluralise(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural || `${singular}s`}`;
}
