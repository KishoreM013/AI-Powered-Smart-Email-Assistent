import React, { useState } from 'react';
import {
  X, User, Mail, ShieldCheck, Moon, Sun,
  CheckCircle2, ChevronRight, Sliders, Globe, Bot, Mic
} from 'lucide-react';

export default function SettingsModal({ isOpen, onClose, user, theme, onToggleTheme, onLogout }) {
  if (!isOpen) return null;

  const [enableSummarization, setEnableSummarization] = useState(true);
  const [enablePhishing, setEnablePhishing] = useState(true);
  const [enableVoice, setEnableVoice] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(theme === 'dark');

  const handleDarkToggle = () => {
    setIsDarkMode(!isDarkMode);
    onToggleTheme && onToggleTheme();
  };

  const userName = user?.name || (user?.email ? user.email.split('@')[0] : "User");
  const userEmail = user?.email || "user@gmail.com";

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in select-none">
      <div className="bg-white dark:bg-[#0E1322] border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 relative text-left">
        
        {/* Top Bar Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center space-x-2 text-slate-900 dark:text-white font-extrabold text-sm">
            <Sliders className="w-4 h-4 text-indigo-500" />
            <span>Settings</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Account Card (Matching Panel 7) */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img
              src={user?.avatar || user?.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${userEmail}`}
              alt="Avatar"
              className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-950 p-0.5 border border-indigo-300 dark:border-indigo-700"
            />
            <div>
              <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                {userName}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {userEmail}
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </div>

        {/* Section 1: Account */}
        <div className="space-y-2">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Account
          </h4>

          <div className="space-y-1.5 text-xs font-semibold">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Mail className="w-4 h-4 text-indigo-500" />
                <span className="text-slate-700 dark:text-slate-200">Gmail Account</span>
              </div>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
                Connected
              </span>
            </div>

            <button className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition flex items-center justify-between text-slate-700 dark:text-slate-200">
              <div className="flex items-center space-x-2.5">
                <User className="w-4 h-4 text-slate-400" />
                <span>Manage Account</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Section 2: AI Preferences & Switches */}
        <div className="space-y-2">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            AI Preferences
          </h4>

          <div className="space-y-2 text-xs font-semibold">
            {/* Enable Email Summarization */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Bot className="w-4 h-4 text-indigo-500" />
                <span className="text-slate-700 dark:text-slate-200">Enable Email Summarization</span>
              </div>
              <input
                type="checkbox"
                checked={enableSummarization}
                onChange={() => setEnableSummarization(!enableSummarization)}
                className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
              />
            </div>

            {/* Enable Phishing Detection */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <ShieldCheck className="w-4 h-4 text-rose-500" />
                <span className="text-slate-700 dark:text-slate-200">Enable Phishing Detection</span>
              </div>
              <input
                type="checkbox"
                checked={enablePhishing}
                onChange={() => setEnablePhishing(!enablePhishing)}
                className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
              />
            </div>

            {/* Enable Voice Command */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Mic className="w-4 h-4 text-blue-500" />
                <span className="text-slate-700 dark:text-slate-200">Enable Voice Command</span>
              </div>
              <input
                type="checkbox"
                checked={enableVoice}
                onChange={() => setEnableVoice(!enableVoice)}
                className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
              />
            </div>

            {/* Dark Mode Switch */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Moon className="w-4 h-4 text-amber-400" />
                <span className="text-slate-700 dark:text-slate-200">Dark Mode</span>
              </div>
              <input
                type="checkbox"
                checked={isDarkMode}
                onChange={handleDarkToggle}
                className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
              />
            </div>

            {/* Language Selector */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Globe className="w-4 h-4 text-emerald-500" />
                <span className="text-slate-700 dark:text-slate-200">Language</span>
              </div>
              <span className="text-slate-500 dark:text-slate-400 text-xs font-bold flex items-center gap-1">
                English <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Account & About */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
          {onLogout && (
            <button
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 font-bold text-xs flex items-center justify-center space-x-2 transition"
            >
              <span>Sign Out / Switch Account</span>
            </button>
          )}
          <div className="flex justify-between items-center text-[11px] text-slate-400 font-medium">
            <span>About</span>
            <span>AI Email Assistant v1.0.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
