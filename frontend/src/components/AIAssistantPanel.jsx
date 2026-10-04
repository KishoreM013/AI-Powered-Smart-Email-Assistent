import React from 'react';
import {
  Sparkles, Bot, ShieldCheck, MessageSquare,
  Mic, ArrowRight, Zap, CheckCircle2
} from 'lucide-react';

export default function AIAssistantPanel({
  user,
  totalEmails = 12,
  importantCount = 5,
  unreadCount = 3,
  onOpenAISummary,
  onOpenPhishingCenter,
  onOpenSmartReply,
  onOpenVoiceCommand,
  className = ''
}) {
  const userName = user?.name || (user?.email ? user.email.split('@')[0] : "User");

  return (
    <aside className={`${className} w-80 shrink-0 flex-col space-y-4 overflow-y-auto border-l border-slate-200 bg-slate-50/50 p-4 transition-colors dark:border-slate-800/80 dark:bg-[#0B0F19] 2xl:w-84`}>
      
      {/* Header title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
            AI Assistant
          </h3>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
          Online
        </span>
      </div>

      {/* Greeting Banner Card */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/20 relative overflow-hidden">
        <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-white/10 rounded-full blur-xl pointer-events-none" />
        <h4 className="font-extrabold text-sm mb-1">
          Good Morning, {userName}! 👋
        </h4>
        <p className="text-xs text-indigo-100 leading-relaxed font-medium">
          Here's what's happening with your emails today.
        </p>

        {/* 3 Metrics Row inside Banner */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-white/20 text-center">
          <div className="bg-white/10 rounded-xl p-1.5 backdrop-blur-xs">
            <span className="block text-base font-black leading-none mb-1">{totalEmails}</span>
            <span className="text-[9px] uppercase font-bold text-indigo-200">Total Emails</span>
          </div>

          <div className="bg-white/10 rounded-xl p-1.5 backdrop-blur-xs">
            <span className="block text-base font-black leading-none mb-1 text-amber-300">{importantCount}</span>
            <span className="text-[9px] uppercase font-bold text-indigo-200">Important</span>
          </div>

          <div className="bg-white/10 rounded-xl p-1.5 backdrop-blur-xs">
            <span className="block text-base font-black leading-none mb-1 text-cyan-300">{unreadCount}</span>
            <span className="text-[9px] uppercase font-bold text-indigo-200">Unread</span>
          </div>
        </div>
      </div>

      {/* Quick Actions Title */}
      <div className="pt-1">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
          Quick Actions
        </h4>

        <div className="space-y-2.5">
          {/* 1. Summarize Inbox */}
          <button
            onClick={onOpenAISummary}
            className="w-full p-3 rounded-2xl bg-white dark:bg-[#0F1424] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 shadow-xs hover:shadow-md transition text-left flex items-start space-x-3 group"
          >
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800/80 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
              <Bot className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition flex items-center justify-between">
                <span>Summarize Inbox</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition" />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                Get a quick summary of your emails
              </p>
            </div>
          </button>

          {/* 2. Check for Spam & Phishing */}
          <button
            onClick={onOpenPhishingCenter}
            className="w-full p-3 rounded-2xl bg-white dark:bg-[#0F1424] border border-slate-200 dark:border-slate-800 hover:border-rose-400 dark:hover:border-rose-600 shadow-xs hover:shadow-md transition text-left flex items-start space-x-3 group"
          >
            <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800/80 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
              <ShieldCheck className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition flex items-center justify-between">
                <span>Check for Spam & Phishing</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition" />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                Scan for suspicious emails
              </p>
            </div>
          </button>

          {/* 3. Generate Smart Reply */}
          <button
            onClick={onOpenSmartReply}
            className="w-full p-3 rounded-2xl bg-white dark:bg-[#0F1424] border border-slate-200 dark:border-slate-800 hover:border-purple-400 dark:hover:border-purple-600 shadow-xs hover:shadow-md transition text-left flex items-start space-x-3 group"
          >
            <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/80 border border-purple-200 dark:border-purple-800/80 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
              <MessageSquare className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition flex items-center justify-between">
                <span>Generate Smart Reply</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition" />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                Create personalized replies
              </p>
            </div>
          </button>

          {/* 4. Voice Command */}
          <button
            onClick={onOpenVoiceCommand}
            className="w-full p-3 rounded-2xl bg-white dark:bg-[#0F1424] border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600 shadow-xs hover:shadow-md transition text-left flex items-start space-x-3 group"
          >
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/80 border border-blue-200 dark:border-blue-800/80 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
              <Mic className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition flex items-center justify-between">
                <span>Voice Command</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition" />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                Search, reply, read emails with voice
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* AI Live Status Badge */}
      <div className="mt-auto pt-3">
        <div className="p-3 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/50 flex items-center space-x-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
          <Zap className="w-4 h-4 text-amber-500 shrink-0" />
          <span>Gemini 1.5 Flash Neural Engine Ready</span>
        </div>
      </div>
    </aside>
  );
}
