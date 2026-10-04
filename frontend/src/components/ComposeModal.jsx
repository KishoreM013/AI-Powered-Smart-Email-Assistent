import React, { useState } from 'react';
import { X, Send, Sparkles, Paperclip, Bot } from 'lucide-react';
import { emailsAPI } from '../services/api';

export default function ComposeModal({ isOpen, onClose, onEmailSent }) {
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('Work');
  const [priority, setPriority] = useState('Medium');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);

  if (!isOpen) return null;

  const handleAiDraft = async () => {
    if (!aiPrompt.trim() && !subject.trim()) return;
    setIsAiGenerating(true);
    try {
      const res = await emailsAPI.generateReply({
        email_subject: subject || aiPrompt,
        email_body: aiPrompt,
        tone: 'Professional',
        custom_instructions: aiPrompt
      });
      if (res?.reply_text) {
        setBody(res.reply_text);
        if (!subject && res.suggested_subject) {
          setSubject(res.suggested_subject.replace('Re: ', ''));
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!recipient || !subject || !body) return;
    setIsSending(true);
    try {
      const sentEmail = await emailsAPI.composeEmail({
        recipient,
        subject,
        body,
        category,
        priority
      });
      onEmailSent?.(sentEmail, recipient);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSending(false);
    }

  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 backdrop-blur-xs sm:p-4">
      <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-colors dark:border-slate-700/80 dark:bg-slate-900">
        {/* Header */}
        <div className="p-4 bg-slate-50 dark:bg-[#0F1423] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex min-w-0 items-center space-x-2">
            <Bot className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span className="truncate text-sm font-bold text-slate-900 dark:text-white">Compose AI-Assisted Message</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* AI Draft Assistance Bar */}
        <div className="p-3 bg-gradient-to-r from-indigo-50 via-purple-50 to-white dark:from-indigo-950/40 dark:via-purple-950/30 dark:to-slate-900 border-b border-indigo-200 dark:border-indigo-500/20">
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <Sparkles className="w-4 h-4 text-amber-500 dark:text-amber-300 flex-shrink-0" />
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="AI Prompt: 'Draft a polite follow-up on the enterprise MSA contract terms'..."
              className="min-w-0 flex-1 bg-white dark:bg-slate-950/80 border border-indigo-300 dark:border-indigo-500/30 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-indigo-500 shadow-2xs"
            />
            <button
              type="button"
              onClick={handleAiDraft}
              disabled={isAiGenerating || (!aiPrompt.trim() && !subject.trim())}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition disabled:opacity-50 shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isAiGenerating ? 'Drafting...' : 'AI Draft'}</span>
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-3 sm:p-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
              To:
            </label>
            <input
              type="email"
              required
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="colleague@company.com"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
              Subject:
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Meeting Discussion / API Migration Update"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                Category:
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="Work">Work</option>
                <option value="Finance">Finance</option>
                <option value="Personal">Personal</option>
                <option value="Updates">Updates</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                Priority:
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="High">High (Urgent)</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
              Message:
            </label>
            <textarea
              required
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your email here or click AI Draft..."
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white leading-relaxed"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-between border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Attach File"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold"
              >
                Discard
              </button>
              <button
                type="submit"
                disabled={isSending}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold shadow-md flex items-center space-x-1.5 transition"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSending ? 'Sending...' : 'Send Message'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
