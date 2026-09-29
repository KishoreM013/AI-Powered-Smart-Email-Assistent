import React, { useState } from 'react';
import {
  Search, RefreshCw, Plus, Sparkles, Mail, Sun, Moon, Mic, Globe, LogOut, X,
} from 'lucide-react';

/**
 * Top bar.
 *
 * Presentation only: every handler, prop and piece of state below is exactly
 * what the previous version had. What changed is the arrangement. Search gets
 * the room it deserves, Compose is the one filled button, and everything else
 * collapses into a quiet icon group so the bar reads as a single line.
 */
export default function Navbar({
  searchQuery,
  setSearchQuery,
  onSync,
  isSyncing,
  onOpenCompose,
  onOpenSettings,
  unreadCount = 0,
  urgentCount = 0,
  user,
  onLogout,
  theme,
  onToggleTheme,
  language = 'en',
  onToggleLanguage,
  onOpenVoiceCommand,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const userName = user?.name || (user?.email ? user.email.split('@')[0] : 'User');
  const avatar =
    user?.avatar || user?.picture ||
    `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.email || 'User'}`;

  return (
    <header className="sticky top-0 z-30 h-16 surface line border-b">
      <div className="h-full px-4 lg:px-6 flex items-center gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2.5 shrink-0 w-auto lg:w-56">
          <div className="w-9 h-9 rounded-xl accent-bg text-white grid place-items-center">
            <Mail className="w-[18px] h-[18px]" />
          </div>
          <span className="hidden sm:block text-[15px] font-semibold tracking-tight ink truncate">
            Smart Inbox
          </span>
        </div>

        {/* Search takes the remaining room */}
        <div className="flex-1 min-w-0 max-w-2xl mx-auto relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ink-soft pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by sender, subject or keyword"
            aria-label="Search emails"
            className="w-full pl-10 pr-9 py-2.5 rounded-xl text-sm transition"
            style={{
              background: 'rgba(100,116,139,0.07)',
              border: '1px solid transparent',
              color: 'var(--ink)',
            }}
            onFocus={(e) => {
              e.target.style.background = 'var(--surface)';
              e.target.style.borderColor = 'var(--accent)';
              e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.14)';
            }}
            onBlur={(e) => {
              e.target.style.background = 'rgba(100,116,139,0.07)';
              e.target.style.borderColor = 'transparent';
              e.target.style.boxShadow = 'none';
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 btn-icon !w-6 !h-6"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onSync}
            disabled={isSyncing}
            title="Sync now"
            aria-label="Sync now"
            className="btn-icon"
          >
            <RefreshCw className={`w-[18px] h-[18px] accent-text ${isSyncing ? 'spin' : ''}`} />
          </button>

          <button
            onClick={onOpenVoiceCommand}
            title="Voice command"
            aria-label="Voice command"
            className="btn-icon hidden sm:inline-flex"
          >
            <Mic className="w-[18px] h-[18px]" />
          </button>

          <button
            onClick={onToggleLanguage}
            title="Language"
            aria-label="Toggle language"
            className="btn-icon !w-auto !px-2.5 text-[11px] font-bold"
          >
            {language === 'en' ? 'EN' : 'தமிழ்'}
          </button>

          <button
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            aria-label="Toggle theme"
            className="btn-icon"
          >
            {theme === 'dark' ? (
              <Sun className="w-[18px] h-[18px] text-amber-400" />
            ) : (
              <Moon className="w-[18px] h-[18px]" />
            )}
          </button>

          <div className="w-px h-6 mx-1.5 line border" aria-hidden="true" />

          <button onClick={onOpenCompose} className="btn-primary">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Compose</span>
          </button>

          {/* Account */}
          <div className="relative ml-1">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 pl-1 pr-1.5 py-1 rounded-xl hover:bg-slate-500/10 transition"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <img
                src={avatar}
                alt=""
                className="w-8 h-8 rounded-full accent-soft-bg"
              />
              <span className="hidden lg:inline text-xs font-semibold ink-soft max-w-24 truncate">
                {userName}
              </span>
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 panel shadow-xl overflow-hidden z-20 animate-in"
                >
                  <div className="px-4 py-3 border-b line">
                    <p className="text-sm font-semibold ink truncate">{userName}</p>
                    <p className="text-[11px] ink-soft truncate">{user?.email}</p>
                  </div>
                  <div className="p-1.5 space-y-0.5">
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenSettings?.();
                      }}
                      className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-500/10 transition"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Settings
                    </button>
                    <button
                      role="menuitem"
                      onClick={onLogout}
                      className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
