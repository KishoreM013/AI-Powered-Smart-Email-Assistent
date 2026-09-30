import React from 'react';
import { ShieldAlert, AlertTriangle, X, Check, Lock, Info, Mail } from 'lucide-react';

export default function PhishingDetectionModal({
  isOpen,
  onClose,
  suspiciousEmail,
  onMarkAsSpam
}) {
  if (!isOpen) return null;

  const email = suspiciousEmail || {
    sender_name: "Amazon Security",
    sender_email: "support@amaz0n-security.com",
    subject: "Urgent: Your account will be suspended in 24 hours",
    date: "19 Sep 2026, 10:12 AM",
    risk_score: 94,
    reasons: [
      "Uses a lookalike domain (amaz0n with digit '0')",
      "Creates artificial urgency (account suspension threats)",
      "Asks for personal credentials / verification click"
    ]
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in select-none">
      <div className="bg-white dark:bg-[#0E1322] border border-rose-300 dark:border-rose-900/60 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 relative text-left">
        
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center space-x-2 text-rose-600 dark:text-rose-400 font-extrabold text-sm">
            <ShieldAlert className="w-5 h-5" />
            <span>Phishing Detection Shield</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Suspicious Email Detected Red Card */}
        <div className="p-4 rounded-2xl bg-rose-500/10 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 flex items-start space-x-3 text-rose-700 dark:text-rose-300">
          <div className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-rose-500/30">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-extrabold text-sm text-rose-700 dark:text-rose-300">
              Suspicious Email Detected
            </h4>
            <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5 leading-relaxed">
              This email has been flagged by Gemini AI as a high-risk phishing attempt.
            </p>
          </div>
        </div>

        {/* Info Grid */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
          <div className="flex justify-between items-center py-1 border-b border-slate-200/60 dark:border-slate-800">
            <span className="font-bold text-slate-500 dark:text-slate-400">From:</span>
            <span className="font-semibold text-rose-600 dark:text-rose-400 font-mono">{email.sender_email}</span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-slate-200/60 dark:border-slate-800">
            <span className="font-bold text-slate-500 dark:text-slate-400">Subject:</span>
            <span className="font-semibold text-slate-900 dark:text-white">{email.subject}</span>
          </div>

          <div className="flex justify-between items-center py-1">
            <span className="font-bold text-slate-500 dark:text-slate-400">Date:</span>
            <span className="font-medium text-slate-600 dark:text-slate-300">{email.date}</span>
          </div>
        </div>

        {/* Why it's suspicious? List */}
        <div className="space-y-2">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
            <Info className="w-4 h-4" />
            <span>Why it's suspicious?</span>
          </h4>

          <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
            {email.reasons.map((reason, idx) => (
              <li key={idx} className="flex items-start space-x-2.5 p-2 rounded-xl bg-slate-100/70 dark:bg-slate-900/50">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                <span className="font-medium leading-relaxed">{reason}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            onClick={() => {
              onMarkAsSpam && onMarkAsSpam(email);
              onClose();
            }}
            className="py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs shadow-lg shadow-rose-600/30 transition flex items-center justify-center space-x-2"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Mark as Spam</span>
          </button>

          <button
            onClick={onClose}
            className="py-3 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition border border-slate-300 dark:border-slate-700 flex items-center justify-center space-x-2"
          >
            <Mail className="w-4 h-4 text-indigo-500" />
            <span>View Email</span>
          </button>
        </div>
      </div>
    </div>
  );
}
