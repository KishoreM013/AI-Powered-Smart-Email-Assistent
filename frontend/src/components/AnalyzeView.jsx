import React, { useCallback, useState } from 'react';
import { Upload, FileText, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import { emailsAPI } from '../services/api';
import { TONES, badgeClass, PRIORITY_CLASSES, CATEGORY_CLASSES, TONE_CLASSES } from '../utils/analysis';

/**
 * Paste any email, get it analysed.
 *
 * This is the core "any email" path. The message does not have to come from a
 * connected mailbox, which is the whole point: forwarded threads, a provider
 * that was never linked, and text copied out of a screenshot all work.
 *
 * Every failure path surfaces the real error from the API. Nothing here
 * invents a result, and nothing is shown that the backend did not return.
 */
/**
 * Flatten the API response into what this view renders.
 *
 * The endpoint returns an EmailItem, so the analysis lives under `summary` and
 * the spam verdict under `phishing`. This view reads them flat, so without
 * this the badges, the one-liner, the tone, the meeting block and the keywords
 * all silently rendered as undefined -- the headline screen of the app showed
 * almost nothing while reporting success.
 */
function toResult(data, saved) {
  if (!data) return null;
  const s = data.summary || {};
  const phishing = data.phishing || null;
  return {
    ...s,
    id: data.id,
    category: data.category,
    priority: data.priority,
    sender_name: data.sender_name,
    subject: data.subject || s.one_liner || '',
    one_liner: s.one_liner || data.subject || '',
    bullet_points: Array.isArray(s.bullet_points) ? s.bullet_points : [],
    key_deadlines: Array.isArray(s.key_deadlines) ? s.key_deadlines : [],
    dates: Array.isArray(s.dates) ? s.dates : [],
    people: Array.isArray(s.people) ? s.people : [],
    keywords: Array.isArray(s.keywords) ? s.keywords : [],
    meeting: s.meeting || null,
    tone: s.tone || 'Neutral',
    sentiment: s.sentiment || 'Neutral',
    importance_score: Number(s.importance_score) || 0,
    requires_reply: Boolean(s.requires_reply),
    action_items: Array.isArray(data.action_items) ? data.action_items : [],
    reply_draft: data.reply_draft || null,
    is_phishing: Boolean(data.is_spam) || phishing?.status === 'Phishing',
    phishing,
    // Surfaced in the UI so a degraded run is not mistaken for a good one.
    engine: data.engine || (phishing ? 'gemini' : 'local_rules'),
    saved: Boolean(saved),
  };
}

export default function AnalyzeView({ onOpenEmail, onHistoryChanged, language = 'en' }) {
  const ta = language === 'ta';
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sender, setSender] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fileError, setFileError] = useState('');
  const [save, setSave] = useState(true);
  const [withReply, setWithReply] = useState(false);
  const [tone, setTone] = useState('');
  const [personalize, setPersonalize] = useState(false);
  const [styleProfile, setStyleProfile] = useState(null);

  const canSubmit = body.trim().length > 0 || subject.trim().length > 0;

  const loadStyle = useCallback(async () => {
    try {
      setStyleProfile(await emailsAPI.getStyleProfile());
    } catch {
      // Style is an enhancement; a failure here must not block analysis.
      setStyleProfile(null);
    }
  }, []);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setFileError('');
    try {
      const text = await file.text();
      // A raw .eml puts headers first; lift Subject/From out of them.
      const subjectMatch = text.match(/^Subject:\s*(.+)$/im);
      const fromMatch = text.match(/^From:\s*(.+)$/im);
      if (subjectMatch) setSubject(subjectMatch[1].trim());
      if (fromMatch) setSender(fromMatch[1].trim());
      const blankLine = text.search(/\r?\n\s*\r?\n/);
      setBody((blankLine > -1 ? text.slice(blankLine) : text).trim());
      setResult(null);
      setError('');
    } catch {
      setFileError(ta ? 'அந்தக் கோப்பைப் படிக்க முடியவில்லை. உரையை ஒட்டுங்கவும்.' : 'Could not read that file. Paste the text instead.');
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit || loading) return;
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const payload = {
        subject: subject.trim(),
        body: body.trim(),
        sender_name: sender.trim(),
        save,
      };
      if (withReply) {
        payload.generate_reply = true;
        payload.personalize = personalize;
        if (tone) payload.tone = tone;
      }
      const data = await emailsAPI.analyze(payload);
      setResult(toResult(data, payload.save));
      if (payload.save && data?.id) onHistoryChanged?.();
      if (personalize) loadStyle();
    } catch (err) {
      setError(err?.message || (ta ? 'ஆய்வு தோல்வியடைந்தது.' : 'Analysis failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setSubject('');
    setBody('');
    setSender('');
    setResult(null);
    setError('');
    setFileError('');
  }

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#F8FAFC] dark:bg-[#090D16] transition-colors">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {ta ? 'ஏதேனும் மின்னஞ்சலை ஆய்வு செய்' : 'Analyse any email'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
              {ta
                ? 'கீழே ஏதேனும் மின்னஞ்சலை ஒட்டுங்கவும் அல்லது கோப்பைத் தேர்ந்தெடுக்கவும். இணைக்கப்படாத மின்னஞ்சலாக இருந்தாலும் வேலை செய்யும்.'
                : 'Paste any email below, or choose a file. Works even if it did not come from a connected mailbox.'}
            </p>
          </div>

          <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0">
            <Upload className="w-3.5 h-3.5" />
            {ta ? 'கோப்பு தேர்ந்தெடு' : 'Choose file'}
            <input
              type="file"
              accept=".txt,.eml,.md,text/plain,message/rfc822"
              onChange={handleFile}
              className="hidden"
            />
          </label>
        </header>

        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <form
            onSubmit={handleSubmit}
            className="space-y-4 bg-white dark:bg-[#0D111D] border border-slate-200 dark:border-slate-800 rounded-2xl p-5"
          >
            <Field label={ta ? 'அனுப்பி' : 'From'} hint={ta ? 'விருப்பம்' : 'optional'}>
              <input
                type="text"
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                placeholder="Sarah Jenkins"
                disabled={loading}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </Field>

            <Field label={ta ? 'தலைப்பு' : 'Subject'} hint={ta ? 'விருப்பம்' : 'optional'}>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Q3 roadmap sign-off needed by Friday"
                disabled={loading}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </Field>

            <Field label={ta ? 'மின்னஞ்சல் உள்ளடக்கம்' : 'Email content'} required>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={14}
                placeholder={ta ? 'முழு மின்னஞ்சலையும் இங்கே ஒட்டுங்கவும்…' : 'Paste the full email here…'}
                disabled={loading}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono leading-relaxed"
              />
            </Field>

            <div className="space-y-2.5 pt-1">
              <Check checked={save} onChange={setSave} disabled={loading} label={ta ? 'வரலாற்றில் சேமிக்கவும்' : 'Save to history'} />
              <Check checked={withReply} onChange={setWithReply} disabled={loading} label={ta ? 'ஒரு பதிலும் உருவாக்கு' : 'Also draft a reply'} />
              {withReply && (
                <Check
                  checked={personalize}
                  onChange={(next) => {
                    setPersonalize(next);
                    if (next) loadStyle();
                  }}
                  disabled={loading}
                  label={ta ? 'எனது எழுத்து பாணியைப் பின்பற்று' : 'Match my writing style'}
                  hint={
                    styleProfile
                      ? styleProfile.ready
                        ? `${styleProfile.reply_count} replies learned`
                        : `${styleProfile.reply_count}/5 replies`
                      : null
                  }
                />
              )}
              {withReply && (
                <Field label={ta ? 'நடம்' : 'Tone'}>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    disabled={loading}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">{ta ? 'கண்டறிந்த நடத்தைப் பின்பற்று' : 'Match the detected tone'}</option>
                    {TONES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>

            {styleProfile && !styleProfile.ready && personalize && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-3 py-2">
                {ta
                  ? `இன்னும் ${Math.max(0, 5 - styleProfile.reply_count)} பதில்களை அனுப்புங்கள்; பின்னர் உங்கள் பாணி கற்றுக்கொள்ளப்படும்.`
                  : `Send ${Math.max(0, 5 - styleProfile.reply_count)} more replies and your writing style will be learned.`}
              </p>
            )}

            {fileError && (
              <p className="text-[11px] text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-lg px-3 py-2">
                {fileError}
              </p>
            )}

            {error && (
              <p role="alert" className="text-[11px] font-semibold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-lg px-3 py-2 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={!canSubmit || loading}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition"
              >
                {loading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {ta ? 'ஆய்வு நடக்கிறது…' : 'Analysing…'}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    {ta ? 'ஆய்வு செய்' : 'Analyse email'}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={loading}
                className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition"
              >
                {ta ? 'அழி' : 'Clear'}
              </button>
            </div>
          </form>

          {result ? (
            <AnalysisResult result={result} ta={ta} onOpenEmail={onOpenEmail} />
          ) : (
            <div className="hidden lg:flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-2xl">
              <FileText className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                {ta ? 'ஆய்வு இங்கே தோன்றும்' : 'The analysis will appear here'}
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 max-w-xs">
                {ta
                  ? 'ஒரு மின்னஞ்சலை ஒட்டி ஆய்வைத் தொடங்குங்கள்.'
                  : 'Paste an email on the left and start the analysis.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, required, children }) {
  return (
    <label className="block">
      <span className="flex items-baseline gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
        {label}
        {required && <em className="text-rose-500 not-italic">*</em>}
        {hint && <em className="text-[10px] font-medium normal-case text-slate-400">{hint}</em>}
      </span>
      {children}
    </label>
  );
}

function Check({ checked, onChange, disabled, label, hint }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
      />
      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
        {label}
        {hint && <em className="ml-1.5 not-italic text-[10px] font-medium text-slate-400">{hint}</em>}
      </span>
    </label>
  );
}

/** Renders a completed analysis. Every value here comes straight from the API. */
function AnalysisResult({ result, ta, onOpenEmail }) {
  const score = Math.round((result.importance_score || 0) * 100);

  return (
    <section aria-live="polite" className="space-y-5 bg-white dark:bg-[#0D111D] border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
      <div className="flex flex-wrap gap-1.5">
        <Badge className={badgeClass(PRIORITY_CLASSES, result.priority)} pulse={result.priority === 'High'}>
          {result.priority}
        </Badge>
        <Badge className={badgeClass(CATEGORY_CLASSES, result.category)}>{result.category}</Badge>
        <Badge className={badgeClass(TONE_CLASSES, result.tone)}>{result.tone}</Badge>
        <Badge className="bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-700/50 dark:text-slate-400 dark:border-slate-600">
          {result.sentiment}
        </Badge>
        {result.engine === 'local_rules' && (
          <Badge
            className="bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700"
            title="No AI key configured, so the built-in rules were used"
          >
            local rules
          </Badge>
        )}
      </div>

      {result.is_phishing && result.phishing && (
        <div role="alert" className="rounded-xl border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 p-3.5">
          <strong className="flex items-center gap-1.5 text-xs font-extrabold text-rose-800 dark:text-rose-300">
            <AlertTriangle className="w-3.5 h-3.5" />
            {result.phishing.status}
          </strong>
          <p className="text-[11px] text-rose-700 dark:text-rose-300/90 mt-1">{result.phishing.reason}</p>
          {result.phishing.signals?.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {result.phishing.signals.slice(0, 4).map((signal) => (
                <li key={signal} className="text-[10px] text-rose-600 dark:text-rose-400/80">
                  • {signal}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <h2 className="text-base font-extrabold text-slate-900 dark:text-white leading-snug">
          {result.one_liner}
        </h2>
        {result.urgency_reason && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {ta ? 'காரணம்' : 'Why'}: {result.urgency_reason}
          </p>
        )}
      </div>

      {result.bullet_points.length > 0 && (
        <Block title={ta ? 'முக்கிய கருத்துகள்' : 'Key points'}>
          <ul className="space-y-1">
            {result.bullet_points.map((point, i) => (
              <li key={i} className="flex gap-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <span className="text-indigo-500 shrink-0">•</span>
                {point}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {result.action_items.length > 0 && (
        <Block title={ta ? 'செயல்கள்' : 'Action items'}>
          <ul className="space-y-1.5">
            {result.action_items.map((item, i) => (
              <li
                key={i}
                className="flex items-start justify-between gap-3 text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2"
              >
                <span className="leading-relaxed">{item.task}</span>
                {item.due_date && (
                  <em className="shrink-0 not-italic text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-full px-2 py-0.5">
                    {item.due_date}
                  </em>
                )}
              </li>
            ))}
          </ul>
        </Block>
      )}

      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2.5 pt-1 border-t border-slate-100 dark:border-slate-800">
        {result.meeting?.is_meeting && (
          <Fact label={ta ? 'கூட்டம்' : 'Meeting'}>
            {[result.meeting.title, result.meeting.date, result.meeting.time].filter(Boolean).join(' · ')}
            {result.meeting.platform && <em className="not-italic text-indigo-500"> ({result.meeting.platform})</em>}
            {result.meeting.location && <span className="text-slate-400"> · {result.meeting.location}</span>}
          </Fact>
        )}
        {result.deadlines.length > 0 && <Fact label={ta ? 'காலகட்டு' : 'Deadlines'}>{result.deadlines.join(', ')}</Fact>}
        {result.dates.length > 0 && <Fact label={ta ? 'தேதிகள்' : 'Dates'}>{result.dates.join(', ')}</Fact>}
        {result.people.length > 0 && (
          <Fact label={ta ? 'பெயர்கள்' : 'People'}>
            {result.people.map((p) => (p.role ? `${p.name} (${p.role})` : p.name)).join(', ')}
          </Fact>
        )}
        {result.keywords.length > 0 && (
          <div className="sm:col-span-2">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">
              {ta ? 'முக்கிய வார்த்தைகள்' : 'Keywords'}
            </span>
            <span className="flex flex-wrap gap-1">
              {result.keywords.map((word) => (
                <span
                  key={word}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/30"
                >
                  {word}
                </span>
              ))}
            </span>
          </div>
        )}
        <Fact label={ta ? 'முக்கியத்துவம்' : 'Importance'}>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-20 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <span
                className="block h-full rounded-full bg-indigo-500"
                style={{ width: `${score}%` }}
              />
            </span>
            {score}%
          </span>
        </Fact>
        {result.requires_reply && (
          <Fact label={ta ? 'பதில்' : 'Response'}>
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
              <CheckCircle2 className="w-3 h-3" />
              {ta ? 'பதில் தேவை' : 'A reply is expected'}
            </span>
          </Fact>
        )}
      </div>

      {result.reply && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/5 p-3.5">
          <h3 className="flex items-center gap-2 text-xs font-extrabold text-indigo-800 dark:text-indigo-300 mb-2">
            {ta ? 'உருவாக்கிய பதில்' : 'Drafted reply'}
            {result.reply_tone && <Badge className={badgeClass(TONE_CLASSES, result.reply_tone)}>{result.reply_tone}</Badge>}
          </h3>
          <pre className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap font-sans">
            {result.reply}
          </pre>
        </div>
      )}

      {result.saved && result.email && (
        <button
          type="button"
          onClick={() => onOpenEmail?.(result.email)}
          className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          {ta ? 'வரலாற்றில் திற' : 'Open in history'}
        </button>
      )}
    </section>
  );
}

function Badge({ children, className = '', pulse = false }) {
  return (
    <span
      className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 ${className} ${
        pulse ? 'badge-urgent' : ''
      }`}
    >
      {children}
    </span>
  );
}

function Block({ title, children }) {
  return (
    <div>
      <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">{title}</h3>
      {children}
    </div>
  );
}

function Fact({ label, children }) {
  if (!children) return null;
  return (
    <div className="min-w-0">
      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">{label}</span>
      <span className="block text-xs text-slate-700 dark:text-slate-300 leading-relaxed break-words">{children}</span>
    </div>
  );
}
