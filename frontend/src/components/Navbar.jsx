import React, { useState } from 'react';
import {
  Search, RefreshCw, Plus, Bell, Mail, Sun, Moon, Mic, Menu
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
  onOpenVoiceCommand,
  onOpenMenu
}) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const userName = user?.name || (user?.email ? user.email.split('@')[0] : "User");

  return (
    <header className="relative z-30 flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-3 py-2 transition-colors dark:border-slate-800 dark:bg-[#0C101B] sm:min-h-16 sm:px-4 lg:px-6">
      
      {/* Brand & Logo */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-3 md:w-56">
        <button
          onClick={onOpenMenu}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/30 sm:flex">
          <Mail className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <span className="block truncate text-sm font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-base">
            AI Email Assistant
          </span>
        </div>
      </div>

      {/* Center Search Input */}
      <div className="mx-3 hidden max-w-xl flex-1 items-center md:flex">
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
      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        {/* Voice Command Shortcut Button */}
        <button
          onClick={onOpenVoiceCommand}
          className="hidden rounded-xl border border-indigo-200 bg-indigo-50 p-2 text-xs font-semibold text-indigo-600 shadow-2xs transition hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-400 xl:flex xl:items-center xl:space-x-1"
          title="Voice AI Command Assistant"
        >
          <Mic className="w-4 h-4" />
          <span className="hidden xl:inline">Voice Assistant</span>
        </button>

        {/* Sync Inbox Button */}
        <button
          onClick={onSync}
          disabled={isSyncing}
          className="flex items-center space-x-1.5 rounded-xl border border-slate-200 bg-white p-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white"
          title="Sync Emails with AI Categorizer"
        >
          <RefreshCw className={`w-4 h-4 text-indigo-600 dark:text-indigo-400 ${isSyncing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Sync</span>
        </button>

        {/* Compose Button */}
        <button
          onClick={onOpenCompose}
          className="flex items-center space-x-1.5 rounded-xl bg-indigo-600 px-2.5 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-500 sm:px-3.5"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Compose</span>
        </button>

        {/* Language Toggle Button */}
        <button
          onClick={onToggleLanguage}
          className="hidden rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-extrabold text-slate-700 transition hover:border-indigo-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 sm:inline-flex"
          title="Toggle Language (English / Tamil)"
        >
          {language === 'en' ? 'EN' : 'TA'}
        </button>

        {/* Theme Toggle Button */}
        <button
          onClick={onToggleTheme}
          className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 shadow-2xs transition hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
        </button>

        {/* Notification Bell Badge */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative hidden rounded-xl border border-slate-200 bg-white p-2 text-slate-700 shadow-2xs transition hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white sm:block"
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
            className="flex items-center space-x-1 rounded-xl p-1 hover:bg-slate-100 dark:hover:bg-slate-800 sm:space-x-2.5 sm:pl-2 sm:pr-3"
          >
            <img
              src={user?.avatar || user?.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.email || 'User'}`}
              alt="Avatar"
              className="h-8 w-8 rounded-full border border-indigo-300 bg-indigo-100 p-0.5 dark:border-indigo-700 dark:bg-indigo-950 sm:h-7 sm:w-7"
            />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 hidden sm:inline">
              {userName}
            </span>
          </button>
        </div>
      </div>

      <div className="w-full px-1 md:hidden">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search your mail"
            aria-label="Search email"
            className="w-full rounded-xl border border-slate-200 bg-slate-100 py-2 pl-10 pr-3 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
      </div>
    </header>
  );
}
