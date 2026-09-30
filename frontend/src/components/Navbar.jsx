import React, { useState } from 'react';
import {
  Search, RefreshCw, Plus, Bell, Sparkles, AlertCircle,
  Sliders, ShieldCheck, Mail, LogOut, Sun, Moon, Mic, Globe
} from 'lucide-react';

export default function Navbar({
  searchQuery,
  setSearchQuery,
  onSync,
  isSyncing,
  onOpenCompose,
  onOpenSettings,
  unreadCount = 12,
  urgentCount = 5,
  user,
  onLogout,
  theme,
  onToggleTheme,
  language = 'en',
  onToggleLanguage,
  onOpenVoiceCommand
}) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const userName = user?.name || (user?.email ? user.email.split('@')[0] : "User");

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0C101B] px-4 lg:px-6 flex items-center justify-between z-30 sticky top-0 transition-colors select-none">
      
      {/* Brand & Logo */}
      <div className="flex items-center space-x-3 w-64">
        <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/30">
          <Mail className="w-5 h-5" />
        </div>
        <div>
          <span className="font-extrabold text-base tracking-tight text-slate-900 dark:text-white block">
            AI Email Assistant
          </span>
        </div>
      </div>

      {/* Center Search Input */}
      <div className="flex-1 max-w-xl mx-4 hidden md:flex items-center">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search emails by sender, subject, keywords..."
            className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl pl-10 pr-4 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-medium"
          />
        </div>
      </div>

      {/* Right Controls Bar */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* Voice Command Shortcut Button */}
        <button
          onClick={onOpenVoiceCommand}
          className="p-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition shadow-2xs flex items-center space-x-1 text-xs font-semibold"
          title="Voice AI Command Assistant"
        >
          <Mic className="w-4 h-4" />
          <span className="hidden xl:inline">Voice Assistant</span>
        </button>

        {/* Sync Inbox Button */}
        <button
          onClick={onSync}
          disabled={isSyncing}
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white transition shadow-2xs flex items-center space-x-1.5 text-xs font-semibold"
          title="Sync Emails with AI Categorizer"
        >
          <RefreshCw className={`w-4 h-4 text-indigo-600 dark:text-indigo-400 ${isSyncing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Sync</span>
        </button>

        {/* Compose Button */}
        <button
          onClick={onOpenCompose}
          className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center space-x-1.5 transition shadow-md shadow-indigo-600/20"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Compose</span>
        </button>

        {/* Language Toggle Button */}
        <button
          onClick={onToggleLanguage}
          className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-extrabold hover:border-indigo-500 transition"
          title="Toggle Language (English / Tamil)"
        >
          {language === 'en' ? 'EN' : 'TA'}
        </button>

        {/* Theme Toggle Button */}
        <button
          onClick={onToggleTheme}
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white transition shadow-2xs"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
        </button>

        {/* Notification Bell Badge */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white transition relative shadow-2xs"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-[10px] font-bold text-white rounded-full flex items-center justify-center">
              5
            </span>
          </button>
        </div>

        {/* User Profile Pill matching diagram "User Name v" */}
        <div className="relative">
          <button
            onClick={onOpenSettings}
            className="flex items-center space-x-2.5 p-1 pl-2 pr-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <img
              src={user?.avatar || user?.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.email || 'User'}`}
              alt="Avatar"
              className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-950 p-0.5 border border-indigo-300 dark:border-indigo-700"
            />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 hidden sm:inline">
              {userName}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
