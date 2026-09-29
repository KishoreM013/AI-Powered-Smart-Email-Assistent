import React from 'react';
import {
  Users, Calendar, Clock, MapPin, Video, Tag, ListTodo,
  CheckCircle2, Circle, Gauge,
} from 'lucide-react';

/**
 * The extracted details panel.
 *
 * Everything here comes from the analysis, and every block is conditional on
 * the analysis actually having found something. An email with no meeting shows
 * no meeting block rather than an empty one, so the panel always reads as
 * "here is what was in the message" and never as "here is a blank form".
 *
 * Presentational only; it takes the summary object and renders it.
 */

const TONE_TONE_CLASS = {
  Professional: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  Formal: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300',
  Friendly: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  Angry: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  Urgent: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  Neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400',
};

/** Rendered as a percent only when the model actually supplied a score. */
function Importance({ value }) {
  const score = Number(value);
  if (!Number.isFinite(score) || score <= 0) return null;
  const pct = Math.round(Math.min(score, 1) * 100);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Gauge className="w-3.5 h-3.5 accent-text shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between text-[11px] ink-soft mb-1">
          <span>Importance</span>
          <span className="font-medium ink">{pct}%</span>
        </div>
        <div className="h-1 rounded-full" style={{ background: 'rgba(100,116,139,0.18)' }}>
          <div
            className="h-1 rounded-full accent-bg transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function Chip({ icon: Icon, children, title }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11.5px] ink-soft"
      style={{ background: 'rgba(100,116,139,0.08)' }}
    >
      {Icon && <Icon className="w-3 h-3 shrink-0 opacity-70" />}
      <span className="truncate">{children}</span>
    </span>
  );
}

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-3.5 h-3.5 accent-text mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide ink-faint mb-1">{label}</p>
        <div className="flex flex-wrap gap-1.5">{children}</div>
      </div>
    </div>
  );
}

export default function ExtractionPanel({ summary, actionItems = [], onToggleTask }) {
  if (!summary) return null;

  const people = Array.isArray(summary.people) ? summary.people : [];
  const keywords = Array.isArray(summary.keywords) ? summary.keywords : [];
  const deadlines = Array.isArray(summary.key_deadlines) ? summary.key_deadlines : [];
  const dates = Array.isArray(summary.dates) ? summary.dates : [];
  const meeting = summary.meeting;
  const tasks = Array.isArray(actionItems) ? actionItems : [];

  const hasExtraction =
    people.length || keywords.length || deadlines.length || dates.length ||
    meeting || tasks.length || summary.tone || summary.importance_score > 0 ||
    summary.requires_reply;

  if (!hasExtraction) return null;

  // Dates already listed as deadlines are not repeated in the dates row.
  const extraDates = dates.filter((d) => !deadlines.includes(d));

  return (
    <section className="panel overflow-hidden">
      <div className="px-4 py-2.5 border-b line flex flex-wrap items-center gap-2">
        <span className="section-title">Extracted details</span>
        {summary.tone && (
          <span
            className={`px-2 py-0.5 rounded-full text-[10.5px] font-medium ${
              TONE_TONE_CLASS[summary.tone] || TONE_TONE_CLASS.Neutral
            }`}
          >
            {summary.tone}
          </span>
        )}
        {summary.requires_reply && (
          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            Reply expected
          </span>
        )}
      </div>

      <div className="px-4 py-3.5 space-y-3.5">
        {summary.importance_score > 0 && <Importance value={summary.importance_score} />}

        {meeting && (
          <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(100,116,139,0.05)' }}>
            <p className="text-[11px] uppercase tracking-wide ink-faint">
              {meeting.title || 'Meeting'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {meeting.date && <Chip icon={Calendar}>{meeting.date}</Chip>}
              {meeting.time && <Chip icon={Clock}>{meeting.time}</Chip>}
              {meeting.platform && <Chip icon={Video}>{meeting.platform}</Chip>}
              {meeting.location && <Chip icon={MapPin}>{meeting.location}</Chip>}
            </div>
            {meeting.attendees?.length > 0 && (
              <p className="text-[11.5px] ink-soft">
                With {meeting.attendees.join(', ')}
              </p>
            )}
          </div>
        )}

        {tasks.length > 0 && (
          <Row icon={ListTodo} label="Action items">
            {tasks.map((task, i) => {
              const done = Boolean(task.done);
              const label = task.task || task.text || '';
              if (!label) return null;
              const content = (
                <>
                  {done
                    ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                    : <Circle className="w-3 h-3 opacity-50 shrink-0" />}
                  <span className={done ? 'line-through opacity-60' : ''}>{label}</span>
                  {task.due_date && (
                    <span className="opacity-60">· {task.due_date}</span>
                  )}
                </>
              );
              return onToggleTask ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => onToggleTask(i)}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11.5px] ink-soft hover:opacity-80 transition-opacity"
                  style={{ background: 'rgba(100,116,139,0.08)' }}
                >
                  {content}
                </button>
              ) : (
                <Chip key={i} icon={done ? CheckCircle2 : Circle}>{content}</Chip>
              );
            })}
          </Row>
        )}

        {people.length > 0 && (
          <Row icon={Users} label="People">
            {people.map((person, i) => (
              <Chip key={i} title={person.email || undefined}>
                {person.role ? `${person.name} · ${person.role}` : person.name}
              </Chip>
            ))}
          </Row>
        )}

        {deadlines.length > 0 && (
          <Row icon={Clock} label="Deadlines">
            {deadlines.map((d, i) => <Chip key={i} icon={Clock}>{d}</Chip>)}
          </Row>
        )}

        {extraDates.length > 0 && (
          <Row icon={Calendar} label="Dates mentioned">
            {extraDates.map((d, i) => <Chip key={i} icon={Calendar}>{d}</Chip>)}
          </Row>
        )}

        {keywords.length > 0 && (
          <Row icon={Tag} label="Keywords">
            {keywords.map((k, i) => <Chip key={i}>{k}</Chip>)}
          </Row>
        )}
      </div>
    </section>
  );
}
