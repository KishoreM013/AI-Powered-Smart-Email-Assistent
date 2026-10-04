import React from 'react';
import { Bot, X, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function AISummaryModal({ isOpen, onClose, emails = [] }) {
  if (!isOpen) return null;

  const importantCount = emails.filter((email) =>
    email.priority === 'High' || email.is_starred || email.category === 'Important'
  ).length;
  const unreadCount = emails.filter((email) => !email.is_read).length;
  const promoCount = emails.filter((email) => /promot|marketing/i.test(email.category || '')).length;
  const financeCount = emails.filter((email) => /finance|billing/i.test(email.category || '')).length;
  const highlights = [...emails]
    .sort((a, b) => Number(b.priority === 'High' || b.is_starred) - Number(a.priority === 'High' || a.is_starred))
    .slice(0, 4)
    .map((email) => ({
      id: email.id,
      text: `${email.sender_name || email.sender_email || 'Email'}: ${email.summary?.one_liner || email.preview || email.snippet || email.subject || 'No preview available'}`
    }));

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none">
      <div className="bg-white dark:bg-[#0E1322] border border-indigo-200 dark:border-indigo-900/60 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 relative text-left">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center space-x-2 text-indigo-600 dark:text-indigo-400 font-extrabold text-sm">
            <Bot className="w-5 h-5" />
            <span>Inbox Summary</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Banner Card */}
        <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60">
          <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
            Inbox Summary
          </h4>
          <p className="text-xs text-indigo-600 dark:text-indigo-300 font-semibold mt-0.5">
            Overview of {emails.length} {emails.length === 1 ? 'email' : 'emails'} in your mailbox
          </p>

          {/* 4 Stat Boxes Grid */}
          <div className="grid grid-cols-2 gap-2.5 mt-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center space-x-2.5">
              <span className="text-base font-black text-amber-500">{importantCount}</span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Important</span>
            </div>

            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center space-x-2.5">
              <span className="text-base font-black text-blue-500">{unreadCount}</span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Unread</span>
            </div>

            <div className="p-2.5 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center space-x-2.5">
              <span className="text-base font-black text-pink-500">{promoCount}</span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Promotions</span>
            </div>

            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center space-x-2.5">
              <span className="text-base font-black text-emerald-500">{financeCount}</span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Finance</span>
            </div>
          </div>
        </div>

        {/* Key Highlights Section */}
        <div className="space-y-2">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Key Highlights
          </h4>

          {highlights.length ? (
            <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
              {highlights.map((highlight) => (
              <li key={highlight.id} className="flex items-start space-x-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <span className="font-medium leading-relaxed">{highlight.text}</span>
              </li>
            ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              No emails are available to summarize.
            </p>
          )}
        </div>

        {/* Action Button */}
        <button
          onClick={onClose}
          className="w-full py-3.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-indigo-600/30 transition flex items-center justify-center space-x-2"
        >
          <span>Done</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
