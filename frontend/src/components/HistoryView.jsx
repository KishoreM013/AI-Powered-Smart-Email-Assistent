import React, { useCallback, useEffect, useState } from 'react';
import { History, Trash2, RotateCcw, Search } from 'lucide-react';
import { emailsAPI } from '../services/api';
import { formatEmailDate } from '../utils/format';
import { badgeClass, PRIORITY_CLASSES, CATEGORY_CLASSES, TONE_CLASSES } from '../utils/analysis';

/**
 * Every email this account has analysed, newest first.
 *
 * Backed by the SQLite store rather than component state, so the list survives
 * a backend restart -- which is the entire point of keeping history.
 */
export default function HistoryView({ onOpenEmail, language = 'en', onChanged }) {
  const ta = language === 'ta';
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [removing, setRemoving] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setEntries(await emailsAPI.getHistory());
    } catch (e) {
      setError(e.message || 'Could not load your history.');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = query.trim()
    ? entries.filter((item) => {
        const needle = query.trim().toLowerCase();
        return [item.subject, item.sender_name, item.sender_email, item.summary?.one_liner]
          .filter(Boolean)
          .some((field) => field.toLowerCase().includes(needle));
      })
    : entries;

  async function handleDelete(id) {
    setRemoving(id);
    try {
      await emailsAPI.deleteHistoryEntry(id);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e.message || 'Could not remove that entry.');
    } finally {
      setRemoving('');
    }
  }

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#F8FAFC] dark:bg-[#090D16] transition-colors">
      <div className="max-w-5xl mx-auto p-6 space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-500" />
              {ta ? 'மின்னஞ்சல் வரலாறு' : 'Email history'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {ta
                ? 'முன்பு ஆய்வு செய்யப்பட்ட அனைத்து மின்னஞ்சல்களும். மீண்டும் பார்க்கலாம்.'
                : 'Everything analysed so far. Kept on the server, so it survives a restart.'}
            </p>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={ta ? 'வரலாற்றில் தேடு' : 'Search history'}
              className="pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </header>

        {error && (
          <p role="alert" className="text-[11px] font-semibold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            {ta ? 'ஏற்றுகிறது…' : 'Loading history…'}
          </div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-2xl">
            <History className="w-9 h-9 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {query
                ? ta
                  ? 'எதுவும் கிடைக்கவில்லை.'
                  : 'Nothing matches that search.'
                : ta
                ? 'இன்னும் ஆய்வு செய்யப்படவில்லை.'
                : 'No emails analysed yet.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {visible.map((item) => {
              const summary = item.summary || {};
              return (
                <li
                  key={item.id}
                  className="flex items-start gap-3 p-3.5 bg-white dark:bg-[#0D111D] border border-slate-200 dark:border-slate-800 rounded-xl hover:border-indigo-300 dark:hover:border-indigo-700 transition group"
                >
                  <button
                    type="button"
                    onClick={() => onOpenEmail?.(item)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 ${badgeClass(PRIORITY_CLASSES, item.priority)}`}>
                        {item.priority}
                      </span>
                      <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 ${badgeClass(CATEGORY_CLASSES, item.category)}`}>
                        {item.category}
                      </span>
                      {summary.tone && (
                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 ${badgeClass(TONE_CLASSES, summary.tone)}`}>
                          {summary.tone}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 ml-auto shrink-0 font-medium">
                        {formatEmailDate(item)}
                      </span>
                    </div>
                    <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                      {item.subject}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {item.sender_name || item.sender_email}
                      {summary.one_liner ? ` — ${summary.one_liner}` : ''}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    disabled={removing === item.id}
                    aria-label={ta ? 'வரலாற்றிலிருந்து நீக்கு' : 'Remove from history'}
                    className="shrink-0 p-2 rounded-lg text-slate-300 dark:text-slate-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 disabled:opacity-40 transition"
                  >
                    {removing === item.id ? (
                      <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin block" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {entries.length > 0 && (
          <p className="text-[10px] text-slate-400 text-center">
            {ta ? `${entries.length} மின்னஞ்சல்கள் சேமிக்கப்பட்டுள்ளன` : `${entries.length} emails stored`}
            <button
              type="button"
              onClick={load}
              className="ml-2 inline-flex items-center gap-1 font-bold text-indigo-500 hover:text-indigo-400"
            >
              <RotateCcw className="w-3 h-3" />
              {ta ? 'புதுப்பி' : 'Refresh'}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
