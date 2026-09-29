import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../App';
import { emailService } from '../services/api';
import { 
  ArrowLeft, 
  Trash2, 
  ShieldAlert, 
  Archive, 
  Brain, 
  Calendar, 
  Sparkles, 
  Send, 
  Clock, 
  Paperclip, 
  FileText, 
  Search,
  MessageSquare,
  AlertTriangle,
  Smile,
  Frown,
  Meh
} from 'lucide-react';

export default function EmailDetails() {
  const { emailId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [email, setEmail] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // OCR State
  const [ocrLoading, setOcrLoading] = useState(false);
  const [activeOcrData, setActiveOcrData] = useState(null);

  // Reply Compose States
  const [selectedTone, setSelectedTone] = useState('Professional');
  const [replyBody, setReplyBody] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);

  // Scheduling States
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('tomorrow');

  const fetchEmailDetails = async () => {
    try {
      const data = await emailService.get(emailId);
      setEmail(data);
    } catch (err) {
      addToast('Failed to load email details.', 'error');
      navigate('/dashboard/inbox');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmailDetails();
  }, [emailId]);

  const handleAction = async (action) => {
    try {
      await emailService.performAction(emailId, action);
      addToast(`Email ${action}d successfully.`, 'success');
      navigate('/dashboard/inbox');
    } catch (err) {
      addToast('Failed to perform email action.', 'error');
    }
  };

  const handleRunOCR = async (attachmentId) => {
    setOcrLoading(true);
    addToast('Starting document OCR text extraction...', 'info');
    try {
      const res = await emailService.ocr(emailId, attachmentId);
      setActiveOcrData(res);
      addToast('OCR scan completed and summarized!', 'success');
      // Refresh attachment list
      await fetchEmailDetails();
    } catch (err) {
      addToast('OCR scan failed.', 'error');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleGenerateAIDraft = async () => {
    setGeneratingDraft(true);
    try {
      const res = await emailService.suggestReply(emailId, selectedTone);
      setReplyBody(res.reply_body);
      addToast('AI Draft generated!', 'success');
    } catch (err) {
      addToast('Failed to generate draft.', 'error');
    } finally {
      setGeneratingDraft(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyBody.trim()) {
      addToast('Draft content cannot be empty.', 'warning');
      return;
    }
    setReplyLoading(true);
    try {
      await emailService.reply(emailId, replyBody);
      addToast('Reply sent successfully!', 'success');
      setReplyBody('');
      await fetchEmailDetails();
    } catch (err) {
      addToast('Failed to deliver reply.', 'error');
    } finally {
      setReplyLoading(false);
    }
  };

  const handleScheduleReply = async () => {
    if (!replyBody.trim()) {
      addToast('Draft content cannot be empty.', 'warning');
      return;
    }
    try {
      await emailService.scheduleReply(emailId, {
        recipient: email.sender_email,
        subject: email.subject,
        reply_body: replyBody,
        tone: selectedTone,
        send_at: scheduleTime
      });
      addToast(`Reply scheduled successfully for ${scheduleTime}!`, 'success');
      setReplyBody('');
      setShowScheduler(false);
    } catch (err) {
      addToast('Failed to queue schedule task.', 'error');
    }
  };

  const getSentimentIcon = (sentiment) => {
    const s = sentiment?.toLowerCase();
    if (s === 'positive' || s === 'happy') return <Smile className="h-4 w-4 text-emerald-500" />;
    if (s === 'negative' || s === 'angry' || s === 'complaint') return <Frown className="h-4 w-4 text-rose-500" />;
    return <Meh className="h-4 w-4 text-amber-500" />;
  };

  if (loading) {
    return (
      <div className="space-y-6 pt-16 lg:pt-0">
        <div className="h-10 w-24 rounded-xl shimmer-skeleton"></div>
        <div className="h-64 rounded-2xl shimmer-skeleton"></div>
        <div className="h-48 rounded-2xl shimmer-skeleton"></div>
      </div>
    );
  }

  const ai = email.ai_analysis;

  return (
    <div className="space-y-6 pt-16 lg:pt-0 max-w-5xl mx-auto">
      {/* Action Header Nav */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={() => navigate('/dashboard/inbox')}
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-500 transition"
        >
          <ArrowLeft className="h-4.5 w-4.5" />
          <span>Back to Inbox</span>
        </button>

        {/* Action Controls */}
        <div className="flex gap-2">
          <button
            onClick={() => handleAction('archive')}
            className="p-2.5 rounded-xl bg-white/50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/50 text-slate-500 hover:text-indigo-500 transition"
            title="Archive Email"
          >
            <Archive className="h-4.5 w-4.5" />
          </button>
          <button
            onClick={() => handleAction('spam')}
            className="p-2.5 rounded-xl bg-white/50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/50 text-slate-500 hover:text-amber-500 transition"
            title="Move to Spam"
          >
            <ShieldAlert className="h-4.5 w-4.5" />
          </button>
          <button
            onClick={() => handleAction('delete')}
            className="p-2.5 rounded-xl bg-white/50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/50 text-slate-500 hover:text-rose-500 transition"
            title="Delete Email"
          >
            <Trash2 className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>

      {/* Main split grid layout */}
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Email Contents */}
        <div className="lg:col-span-7 space-y-6">
          {/* Email Body Card */}
          <div className="glass-panel p-6 rounded-2xl space-y-4">
            <div className="flex flex-wrap justify-between items-start gap-4">
              <div className="space-y-1.5 max-w-[70%]">
                <h1 className="text-xl font-bold font-display tracking-tight text-slate-900 dark:text-white leading-tight">
                  {email.subject}
                </h1>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  From: <span className="font-bold text-slate-800 dark:text-slate-200">{email.sender_name}</span> &lt;{email.sender_email}&gt;
                </div>
              </div>

              {/* Status Badges */}
              <div className="flex gap-2 shrink-0">
                <span className={email.priority === 'High' ? 'badge-priority-high' : email.priority === 'Medium' ? 'badge-priority-medium' : 'badge-priority-low'}>
                  {email.priority} Priority
                </span>
                <span className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-full text-xs font-medium text-slate-600 dark:text-slate-400">
                  {getSentimentIcon(email.sentiment)}
                  <span className="capitalize">{email.sentiment}</span>
                </span>
              </div>
            </div>

            {/* Email Date */}
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              Received: {new Date(email.date).toLocaleString()}
            </div>

            <hr className="border-slate-200/50 dark:border-slate-800/50" />

            {/* Content Body */}
            <div className="whitespace-pre-wrap leading-relaxed text-sm text-slate-700 dark:text-slate-200 font-normal">
              {email.body_full}
            </div>
          </div>

          {/* Attachments Section */}
          {email.attachments?.length > 0 && (
            <div className="glass-panel p-6 rounded-2xl space-y-4">
              <div className="flex items-center gap-2">
                <Paperclip className="h-5 w-5 text-indigo-500" />
                <h2 className="text-lg font-bold">Attachments ({email.attachments.length})</h2>
              </div>

              <div className="space-y-4">
                {email.attachments.map((att) => (
                  <div key={att.id} className="p-4 rounded-xl bg-slate-100/50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/50 space-y-3">
                    <div className="flex justify-between items-center gap-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-slate-400 shrink-0" />
                        <div className="truncate">
                          <span className="text-sm font-bold block text-slate-800 dark:text-slate-200 truncate">{att.filename}</span>
                          <span className="text-[10px] text-slate-500 font-medium block">
                            {att.content_type} • {Math.round(att.size / 1024)} KB
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRunOCR(att.id)}
                        disabled={ocrLoading}
                        className="px-3.5 py-1.5 rounded-lg border border-indigo-500/20 text-indigo-500 hover:bg-indigo-500/10 text-xs font-bold transition whitespace-nowrap disabled:opacity-50"
                      >
                        {ocrLoading ? 'Scanning...' : 'Extract & Summarize (OCR)'}
                      </button>
                    </div>

                    {/* OCR Output & Summary */}
                    {att.summary && (
                      <div className="mt-3 pt-3 border-t border-slate-200/40 dark:border-slate-800/40 space-y-2">
                        <div className="text-[10px] uppercase font-extrabold tracking-wider text-indigo-400 flex items-center gap-1.5">
                          <Brain className="h-3.5 w-3.5" /> AI Summary of PDF
                        </div>
                        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400 italic">
                          "{att.summary}"
                        </p>
                        
                        {/* Extracted text preview toggler */}
                        <details className="text-[11px] text-slate-500 mt-2">
                          <summary className="cursor-pointer hover:text-indigo-400 outline-none font-bold">View Extracted Text</summary>
                          <div className="mt-2 p-3 rounded-lg bg-slate-200/50 dark:bg-slate-950 border border-slate-300/30 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                            {att.text_content}
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: AI Analytics and Smart Autoreplier */}
        <div className="lg:col-span-5 space-y-6">
          {/* AI Intelligence Summary Panel */}
          {ai && (
            <div className="glass-panel p-6 rounded-2xl space-y-4">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-indigo-500" />
                <h2 className="text-lg font-bold">AI Analysis Panel</h2>
              </div>

              {/* Short Summary */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Short Summary</span>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 font-medium">
                  {ai.short_summary}
                </p>
              </div>

              {/* Action Required flag */}
              <div className="flex items-center gap-2 py-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Action Required:</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  ai.action_required 
                    ? 'bg-rose-500/10 text-rose-500 dark:text-rose-400' 
                    : 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400'
                }`}>
                  {ai.action_required ? 'Yes, Urgent Action' : 'No Action Needed'}
                </span>
              </div>

              {/* Bullet points */}
              {ai.key_points?.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Key Deliverables</span>
                  <ul className="list-disc pl-4 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {ai.key_points.map((p, idx) => (
                      <li key={idx}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Deadlines or Meetings */}
              {(ai.deadlines?.length > 0 || ai.meetings?.length > 0) && (
                <div className="pt-2 border-t border-slate-200/50 dark:border-slate-800/50 space-y-2">
                  {ai.deadlines?.map((d, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-rose-500 dark:text-rose-400 font-bold bg-rose-500/5 border border-rose-500/10 px-3 py-2 rounded-xl">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>Deadline: {d}</span>
                    </div>
                  ))}
                  {ai.meetings?.map((m, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-indigo-500 dark:text-indigo-400 font-bold bg-indigo-500/5 border border-indigo-500/10 px-3 py-2 rounded-xl">
                      <Calendar className="h-4 w-4 shrink-0" />
                      <span>Meeting: {m}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI Auto Reply Box */}
          <div className="glass-panel p-6 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-indigo-500" />
                <h2 className="text-lg font-bold">AI Auto Reply</h2>
              </div>
              <Sparkles className="h-4.5 w-4.5 text-indigo-500 animate-pulse" />
            </div>

            {/* Tone Selector */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Response Tone</label>
              <div className="grid grid-cols-5 gap-1 text-[10px] font-bold">
                {['Professional', 'Friendly', 'Formal', 'Short', 'Detailed'].map((tone) => (
                  <button
                    key={tone}
                    type="button"
                    onClick={() => setSelectedTone(tone)}
                    className={`py-1.5 rounded-lg border text-center transition ${
                      selectedTone === tone
                        ? 'bg-indigo-500 border-indigo-500 text-white'
                        : 'border-slate-200/50 dark:border-slate-800/50 hover:border-indigo-500/30 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {tone}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Form draft */}
            <div className="space-y-2">
              <textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Click 'Generate AI Draft' to let Gemini write a reply, or type your response here..."
                rows={6}
                className="w-full bg-slate-100/50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/80 rounded-xl p-3 outline-none text-xs text-slate-800 dark:text-slate-200 transition focus:border-indigo-500"
              />
              
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleGenerateAIDraft}
                  disabled={generatingDraft}
                  className="flex-1 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  <span>{generatingDraft ? 'Drafting...' : 'Generate AI Draft'}</span>
                </button>
              </div>
            </div>

            {/* Actions button */}
            <div className="flex gap-2 pt-2 border-t border-slate-200/50 dark:border-slate-800/50">
              <button
                type="button"
                onClick={handleSendReply}
                disabled={replyLoading}
                className="flex-1 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-lg shadow-indigo-500/15"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{replyLoading ? 'Sending...' : 'Send Reply Now'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowScheduler(!showScheduler)}
                className="p-3 rounded-xl border border-slate-200/50 dark:border-slate-800/50 hover:bg-indigo-500/10 text-slate-500 hover:text-indigo-500 transition"
                title="Schedule Response"
              >
                <Clock className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Scheduler expand overlay */}
            {showScheduler && (
              <div className="p-4 rounded-xl bg-slate-100/50 dark:bg-slate-950/50 border border-slate-200/50 dark:border-slate-800 space-y-3 mt-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Queue Delay Timer</span>
                <select
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full bg-slate-200/50 dark:bg-slate-900 border border-slate-350/50 dark:border-slate-800 rounded-lg p-2 text-xs font-bold text-slate-700 dark:text-slate-300"
                >
                  <option value="tomorrow">Tomorrow Morning (9:00 AM)</option>
                  <option value="next_week">Next Week Monday (9:00 AM)</option>
                </select>
                <button
                  type="button"
                  onClick={handleScheduleReply}
                  className="w-full py-2 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-500 hover:text-white rounded-lg text-xs font-bold transition border border-indigo-500/20"
                >
                  Schedule Queue Task
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
