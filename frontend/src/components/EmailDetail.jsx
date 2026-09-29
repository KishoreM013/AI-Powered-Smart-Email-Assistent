import React, { useState, useEffect, useRef } from 'react';
import {
  Send, Sparkles, ShieldCheck, ShieldAlert, AlertTriangle,
  Mail, Edit, RefreshCw, Star, Reply,
} from 'lucide-react';
import { emailsAPI } from '../services/api';

/**
 * Reading pane.
 *
 * Presentation only. Every prop, callback and local state below is unchanged.
 *
 * Layout idea: one column, generous line height, and a single accent used
 * only for the action the user is most likely to take next. The AI summary
 * and the reply box are the two things this screen exists for, so they get
 * the visual weight; the raw message is deliberately the quietest part.
 */
export default function EmailDetail({
  email: activeEmail,
  currentUser,
  onSendReply,
  language = 'en',
  onToggleLanguage,
  onOpenVoiceCommand,
}) {
  const [replyText, setReplyText] = useState('');
  const [isEditingReply, setIsEditingReply] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [selectedTone, setSelectedTone] = useState('Professional');
  const [phishingStatus, setPhishingStatus] = useState(null);
  const requestId = useRef(0);

  // Data loading and generation are untouched.
  useEffect(() => {
    let cancelled = false;
    setReplyText('');
    setPhishingStatus(null);
    if (!activeEmail?.id) return undefined;

    emailsAPI
      .getEmailById(activeEmail.id)
      .then((data) => {
        if (cancelled || !data) return;
        setPhishingStatus(data.phishing_status || null);
        if (data.reply_draft) setReplyText(data.reply_draft);
      })
      .catch(() => {});

    emailsAPI
      .phishingCheck(activeEmail.id)
      .then((res) => {
        if (!cancelled) setPhishingStatus(res);
      })
      .catch(() => {
        if (!cancelled) setPhishingStatus(null);
      });

    return () => {
      cancelled = true;
    };
  }, [activeEmail?.id]);

  const handleGenerateReply = async (tone) => {
    if (!activeEmail?.id) return;
    const ticket = ++requestId.current;
    setIsGenerating(true);
    try {
      const result = await emailsAPI.suggestReply(activeEmail.id, tone, language);
      if (ticket !== requestId.current) return;
      setReplyText(result.reply_body || result.reply_text || '');
    } catch {
      if (ticket === requestId.current) setReplyText('');
    } finally {
      if (ticket === requestId.current) setIsGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!activeEmail?.id || !replyText.trim()) return;
    setIsSending(true);
    try {
      await onSendReply?.({
        recipient: activeEmail.sender_email,
        subject: `Re: ${activeEmail.subject}`,
        body: replyText,
        in_reply_to: activeEmail.id,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsSending(false);
    }
  };

  if (!activeEmail) {
    return (
      <div className="flex-1 grid place-items-center h-full p-8 canvas">
        <div className="text-center max-w-xs">
          <span className="w-12 h-12 rounded-2xl accent-soft-bg grid place-items-center mx-auto mb-3">
            <Mail className="w-5 h-5 accent-text" />
          </span>
          <p className="text-sm font-semibold ink">No message selected</p>
          <p className="text-xs ink-soft mt-1 leading-relaxed">
            Pick a message on the left to read it, see the AI summary and draft a reply.
          </p>
        </div>
      </div>
    );
  }

  const phishingTone =
    phishingStatus?.status === 'Phishing'
      ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300'
      : phishingStatus?.status === 'Suspicious'
      ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300'
      : 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300';

  const summary = activeEmail.summary || {};
  const senderName = activeEmail.sender_name || activeEmail.sender_email || 'Unknown';

  return (
    <div className="flex-1 h-full overflow-y-auto canvas">
      <div className="max-w-3xl mx-auto p-5 lg:p-8 space-y-5">
        {phishingStatus && (
          <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 ${phishingTone}`}>
            {phishingStatus.status === 'Phishing' ? (
              <ShieldAlert className="w-4 h-4 shrink-0 mt-px" />
            ) : phishingStatus.status === 'Suspicious' ? (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
            ) : (
              <ShieldCheck className="w-4 h-4 shrink-0 mt-px" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold">
                Looks {phishingStatus.status?.toLowerCase() || 'safe'}
                {phishingStatus.reason ? (
                  <span className="font-normal opacity-80"> — {phishingStatus.reason}</span>
                ) : null}
              </p>
              {phishingStatus.signals?.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {phishingStatus.signals.slice(0, 3).map((s) => (
                    <li key={s} className="text-[11px] opacity-75">
                      {s}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Subject block */}
        <div>
          <h1 className="text-xl font-semibold ink leading-snug break-words">
            {activeEmail.subject || '(no subject)'}
          </h1>

          <div className="mt-3 flex items-center gap-3">
            <span className="w-9 h-9 rounded-full accent-soft-bg accent-text grid place-items-center text-xs font-bold shrink-0">
              {senderName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold ink truncate">{senderName}</p>
              <p className="text-[11px] ink-soft truncate">{activeEmail.sender_email}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {activeEmail.priority && (
                <span className={activeEmail.priority === 'High' ? 'badge-high' : 'badge-calm'}>
                  {activeEmail.priority}
                </span>
              )}
              <button
                onClick={() => emailsAPI.toggleStar?.(activeEmail.id)}
                aria-label="Star"
                className="btn-icon !w-8 !h-8"
              >
                <Star
                  className={`w-4 h-4 ${
                    activeEmail.is_starred ? 'text-amber-400 fill-amber-400' : ''
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* AI summary - the reason this screen exists */}
        {(summary.one_liner || summary.bullet_points?.length > 0) && (
          <section className="panel overflow-hidden">
            <div className="px-4 py-2.5 border-b line flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 accent-text" />
              <span className="section-title">AI summary</span>
            </div>
            <div className="px-4 py-3.5 space-y-2.5">
              {summary.one_liner && (
                <p className="text-sm font-medium ink leading-relaxed">{summary.one_liner}</p>
              )}
              {summary.bullet_points?.length > 0 && (
                <ul className="space-y-1.5">
                  {summary.bullet_points.map((point, i) => (
                    <li key={i} className="flex gap-2.5 text-[13px] text-slate-600 dark:text-slate-300">
                      <span className="accent-text mt-1.5 w-1 h-1 rounded-full shrink-0" />
                      <span className="leading-relaxed">{point}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* Raw message - deliberately the quietest block */}
        <div className="panel px-4 py-4">
          <p className="text-[13.5px] text-slate-600 dark:text-slate-300 leading-[1.75] whitespace-pre-line break-words">
            {activeEmail.body}
          </p>
        </div>

        {/* Reply composer */}
        <section className="panel overflow-hidden">
          <div className="px-4 py-2.5 border-b line flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Reply className="w-3.5 h-3.5 accent-text" />
              <span className="section-title">Reply</span>
            </div>

            <div
              className="inline-flex items-center gap-0.5 p-0.5 rounded-xl"
              style={{ background: 'rgba(100,116,139,0.08)' }}
            >
              {['Professional', 'Friendly', 'Short'].map((tone) => (
                <button
                  key={tone}
                  onClick={() => {
                    setSelectedTone(tone);
                    handleGenerateReply(tone);
                  }}
                  className={`px-2.5 py-1.5 rounded-[10px] text-[11px] font-semibold transition ${
                    selectedTone === tone ? 'surface ink shadow-sm' : 'ink-soft hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  {language === 'ta'
                    ? { Professional: 'தொழில்', Friendly: 'நட்பு', Short: 'சுருக்கம்' }[tone]
                    : tone}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 space-y-3">
            <div className="relative">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                disabled={!isEditingReply || isGenerating}
                rows={5}
                aria-label="Reply text"
                placeholder={
                  language === 'ta' ? 'பதில் உருவாக்கப்படுகிறது...' : 'Write a reply, or generate one...'
                }
                className="w-full rounded-xl px-3.5 py-3 text-[13px] leading-relaxed resize-y transition"
                style={{
                  background: 'rgba(100,116,139,0.05)',
                  border: '1px solid var(--line)',
                  color: 'var(--ink)',
                }}
              />
              {isGenerating && (
                <div
                  className="absolute inset-0 rounded-xl grid place-items-center gap-2"
                  style={{ background: 'rgba(255,255,255,0.8)' }}
                >
                  <RefreshCw className="w-4 h-4 accent-text spin" />
                  <span className="text-[11px] font-medium ink-soft">
                    {language === 'ta' ? 'உருவாக்குகிறது...' : 'Writing a reply...'}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                onClick={() => handleGenerateReply(selectedTone)}
                disabled={isGenerating}
                className="btn-ghost"
              >
                <Sparkles className="w-3.5 h-3.5 accent-text" />
                {language === 'ta' ? 'மீண்டும் உருவாக்கு' : 'Regenerate'}
              </button>

              <div className="flex items-center gap-2">
                <button onClick={() => setIsEditingReply((v) => !v)} className="btn-ghost">
                  <Edit className="w-3.5 h-3.5" />
                  {isEditingReply
                    ? language === 'ta'
                      ? 'முடிந்தது'
                      : 'Done'
                    : language === 'ta'
                    ? 'திருத்து'
                    : 'Edit'}
                </button>
                <button
                  onClick={handleSend}
                  disabled={isSending || !replyText.trim()}
                  className="btn-primary"
                >
                  {isSending ? (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  {language === 'ta' ? 'அனுப்பு' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
