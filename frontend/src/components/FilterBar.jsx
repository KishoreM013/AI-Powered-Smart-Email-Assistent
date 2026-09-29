import React from 'react';
import { SlidersHorizontal, X } from 'lucide-react';

/**
 * Search and filter.
 *
 * Collapsed to a single button by default so the inbox is not buried under
 * controls. Every filter is optional and they combine, so leaving them alone
 * shows everything.
 *
 * The date fields are plain `type="date"` inputs, sent as YYYY-MM-DD. The
 * server accepts that, epoch seconds and several other layouts, and ignores a
 * value it cannot read rather than failing the request.
 */

const CATEGORIES = [
  'Work', 'Personal', 'Promotions', 'Finance', 'Updates',
  'Newsletter', 'Important', 'Meeting', 'Invitation', 'Spam', 'Other',
];
const PRIORITIES = ['High', 'Medium', 'Low'];
const TONES = ['Professional', 'Formal', 'Friendly', 'Angry', 'Urgent', 'Neutral'];

const SELECT_CLASS =
  'px-2 py-1.5 rounded-lg text-[11.5px] ink-soft border line bg-transparent ' +
  'focus:outline-none focus:ring-1 focus:ring-current cursor-pointer';

function Field({ label, children }) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="text-[11px] ink-faint">{label}</span>
      {children}
    </label>
  );
}

export default function FilterBar({ filters, onChange, resultCount }) {
  const [open, setOpen] = React.useState(false);

  const set = (key) => (e) => {
    const value = e?.target ? e.target.value : e;
    onChange({ ...filters, [key]: value === '' ? null : value });
  };

  const active = Object.entries(filters).filter(([, v]) => v !== null && v !== undefined && v !== '');

  const clear = () => onChange({
    priority: null, tone: null, from_date: null, to_date: null, requires_reply: false,
  });

  const toggle = (key) => () =>
    onChange({ ...filters, [key]: filters[key] ? null : true });

  return (
    <div className="border-b line px-3 py-2 flex flex-col gap-2 shrink-0">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11.5px] font-medium ink-soft hover:opacity-80 transition-opacity"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
          {active.length > 0 && (
            <span className="px-1.5 rounded-full text-[10px] accent-bg text-white font-semibold">
              {active.length}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2">
          {active.length > 0 && (
            <>
              <span className="text-[11px] ink-faint">
                {resultCount} {resultCount === 1 ? 'match' : 'matches'}
              </span>
              <button
                type="button"
                onClick={clear}
                className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg text-[11px] ink-soft hover:opacity-80 transition-opacity"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {open && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-0.5">
          <Field label="Priority">
            <select value={filters.priority || ''} onChange={set('priority')} className={SELECT_CLASS}>
              <option value="">Any</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>

          <Field label="Tone">
            <select value={filters.tone || ''} onChange={set('tone')} className={SELECT_CLASS}>
              <option value="">Any</option>
              {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>

          <Field label="Category">
            <select value={filters.category || ''} onChange={set('category')} className={SELECT_CLASS}>
              <option value="">Any</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          <Field label="From">
            <input
              type="date"
              value={filters.from_date || ''}
              onChange={set('from_date')}
              className={SELECT_CLASS}
            />
          </Field>

          <Field label="To">
            <input
              type="date"
              value={filters.to_date || ''}
              onChange={set('to_date')}
              className={SELECT_CLASS}
            />
          </Field>

          <button
            type="button"
            onClick={toggle('requires_reply')}
            aria-pressed={Boolean(filters.requires_reply)}
            className={`px-2 py-1.5 rounded-lg text-[11.5px] font-medium transition ${
              filters.requires_reply
                ? 'surface ink shadow-sm'
                : 'ink-soft hover:opacity-80'
            }`}
          >
            Reply expected
          </button>
        </div>
      )}
    </div>
  );
}
