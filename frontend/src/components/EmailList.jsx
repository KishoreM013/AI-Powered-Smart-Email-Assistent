import React, { useState } from 'react';
import { Star, Inbox, CheckCircle2, Loader2 } from 'lucide-react';

/**
 * The message list.
 *
 * Presentation only. Props, callbacks and the local filter tab behave exactly
 * as before. The old version carried a block of hardcoded sample emails and a
 * per-brand avatar switch; both are gone, so every row now reflects real data
 * from the API.
 *
 * The visual idea: one quiet line per message. Sender and subject carry the
 * weight, a single tinted dot carries the category, and only genuinely urgent
 * mail earns colour. Everything else is greyscale so the eye lands on what
 * matters.
 */
export default function EmailList({
  activeFolder = 'all',
  emails = [],
  selectedEmail,
  onSelectEmail,
  onToggleStar,
  onDeleteEmail,
  isLoading,
}) {
  const [tab, setTab] = useState('all');

  const titles = {
    all: 'All mail',
    inbox: 'Inbox',
    important: 'Important',
    starred: 'Starred',
    sent: 'Sent',
    drafts: 'Drafts',
    spam: 'Spam',
    trash: 'Trash',
  };
  const title = titles[String(activeFolder || 'all').toLowerCase()] || 'Mail';

  const items = Array.isArray(emails) ? emails : [];
  const isUrgent = (e) => e.priority === 'High' || e.category === 'Important';
  const importantCount = items.filter(isUrgent).length;
  const unreadCount = items.filter((e) => !e.is_read).length;

  const visible = items.filter((e) => {
    if (tab === 'important') return isUrgent(e) || e.is_starred;
    if (tab === 'unread') return !e.is_read;
    return true;
  });

  const tabs = [
    { id: 'all', label: 'All', count: items.length },
    { id: 'important', label: 'Important', count: importantCount },
    { id: 'unread', label: 'Unread', count: unreadCount },
  ];

  return (
    <div className="flex-1 flex flex-col h-full surface min-h-0">
      {/* Header: title, then filters as a quiet segmented control */}
      <div className="px-4 pt-4 pb-3 border-b line">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="text-base font-semibold ink truncate">{title}</h2>
          <span className="meta shrink-0 tabular-nums">
            {visible.length} of {items.length}
          </span>
        </div>

        <div
          role="tablist"
          className="inline-flex items-center gap-0.5 p-0.5 rounded-xl"
          style={{ background: 'rgba(100,116,139,0.08)' }}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`px-2.5 py-1.5 rounded-[10px] text-[11px] font-semibold transition ${
                tab === t.id
                  ? 'surface ink shadow-sm'
                  : 'ink-soft hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {t.label}
              {t.count > 0 && <span className="ml-1.5 tabular-nums opacity-60">{t.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="state">
            <Loader2 className="w-5 h-5 accent-text spin mb-3" />
            <p className="state-hint">Loading mail…</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="state">
            <span className="w-11 h-11 rounded-2xl grid place-items-center mb-3 accent-soft-bg">
              {items.length === 0 ? (
                <Inbox className="w-5 h-5 accent-text" />
              ) : (
                <CheckCircle2 className="w-5 h-5 accent-text" />
              )}
            </span>
            <p className="state-title">
              {items.length === 0 ? 'Nothing here yet' : 'No matches'}
            </p>
            <p className="state-hint">
              {items.length === 0
                ? 'Sync your inbox to get started.'
                : 'Try a different filter.'}
            </p>
          </div>
        ) : (
          visible.map((item) => {
            const active = selectedEmail?.id === item.id;
            const urgent = isUrgent(item);
            const sender = item.sender_name || item.sender_email || 'Unknown';
            const preview =
              item.summary?.one_liner || item.snippet || item.preview || item.body || '';

            return (
              <div
                key={item.id}
                onClick={() => onSelectEmail?.(item)}
                className={`row ${active ? 'row-active' : ''} ${
                  item.is_read ? '' : 'row-unread'
                } ${urgent && !active ? 'row-urgent' : ''}`}
              >
                {/* Unread marker doubles as the category indicator */}
                <span
                  aria-hidden="true"
                  className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${
                    item.is_read
                      ? 'bg-slate-300 dark:bg-slate-700'
                      : urgent
                      ? 'bg-rose-500'
                      : 'accent-bg'
                  }`}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="row-sender text-[13px] truncate text-slate-600 dark:text-slate-300">
                      {sender}
                    </span>
                    {item.category && (
                      <span className="text-[10px] ink-soft truncate shrink-0 hidden sm:inline">
                        {item.category}
                      </span>
                    )}
                    <span className="meta ml-auto shrink-0 tabular-nums">
                      {item.date || item.timestamp || ''}
                    </span>
                  </div>

                  <p
                    className={`row-subject text-[13px] truncate mt-0.5 ${
                      item.is_read
                        ? 'text-slate-600 dark:text-slate-400'
                        : ''
                    }`}
                  >
                    {item.subject || '(no subject)'}
                  </p>

                  {preview && (
                    <p className="text-[11.5px] ink-soft truncate mt-0.5 leading-relaxed">
                      {preview}
                    </p>
                  )}

                  {urgent && (
                    <span className="badge-high mt-1.5">
                      {item.priority === 'High' ? 'High priority' : 'Important'}
                    </span>
                  )}
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStar?.(item.id);
                  }}
                  aria-label={item.is_starred ? 'Unstar' : 'Star'}
                  className="btn-icon !w-7 !h-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:!opacity-100 transition"
                >
                  <Star
                    className={`w-4 h-4 ${
                      item.is_starred ? 'text-amber-400 fill-amber-400' : ''
                    }`}
                  />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
