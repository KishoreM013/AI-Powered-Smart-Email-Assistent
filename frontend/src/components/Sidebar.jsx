import React from 'react';
import {
  Inbox, Star, Send, FileText, AlertTriangle, Trash2,
  Bot, MessageSquare, ShieldCheck, Mic, Bookmark, Mail, BarChart3,
  ScanText, History,
} from 'lucide-react';

/**
 * Sidebar.
 *
 * Presentation only; props and handlers are unchanged. Two groups instead of
 * one long list, muted counts, and a single accent for the active item. The
 * 'Snoozed' entry was removed because the backend has never had a snoozed
 * folder and clicking it did nothing.
 */
export default function Sidebar({
  activeView,
  setActiveView,
  activeFolder,
  setActiveFolder,
  selectedCategory,
  setSelectedCategory,
  unreadCount = 0,
  urgentCount = 0,
  folderCounts = {},
  user,
  onOpenAISummary,
  onOpenPhishingCenter,
  onOpenSmartReply,
  onOpenVoiceCommand,
}) {
  const folders = [
    { id: 'inbox', label: 'Inbox', icon: Inbox, count: folderCounts.inbox ?? unreadCount },
    { id: 'important', label: 'Important', icon: Bookmark, count: folderCounts.urgent ?? urgentCount },
    { id: 'starred', label: 'Starred', icon: Star, count: folderCounts.starred },
    { id: 'all', label: 'All mail', icon: Mail, count: folderCounts.all },
    { id: 'sent', label: 'Sent', icon: Send, count: folderCounts.sent },
    { id: 'drafts', label: 'Drafts', icon: FileText, count: folderCounts.drafts },
    { id: 'spam', label: 'Spam', icon: AlertTriangle, count: folderCounts.spam },
    { id: 'trash', label: 'Trash', icon: Trash2, count: folderCounts.trash },
  ];

  const tools = [
    { label: 'Summarize', icon: Bot, onClick: onOpenAISummary },
    { label: 'Reply assistant', icon: MessageSquare, onClick: onOpenSmartReply },
    { label: 'Phishing check', icon: ShieldCheck, onClick: onOpenPhishingCenter },
    { label: 'Voice command', icon: Mic, onClick: onOpenVoiceCommand },
  ];

  const userEmail = user?.email || '';

  return (
    <aside className="w-60 shrink-0 surface line border-r flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex-1 overflow-y-auto p-3 space-y-6">
        <nav className="space-y-0.5">
          {folders.map((folder) => {
            const Icon = folder.icon;
            const active =
              activeView === 'inbox' && activeFolder === folder.id && !selectedCategory;
            return (
              <button
                key={folder.id}
                onClick={() => {
                  setActiveView('inbox');
                  setActiveFolder(folder.id);
                  setSelectedCategory(null);
                }}
                className={`nav-item ${active ? 'nav-item-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className={`w-[18px] h-[18px] shrink-0 ${active ? 'text-white' : ''}`} />
                <span className="truncate">{folder.label}</span>
                {folder.count > 0 && (
                  <span
                    className={`ml-auto text-[11px] font-semibold tabular-nums ${
                      active ? 'text-white/80' : 'ink-soft'
                    }`}
                  >
                    {folder.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div>
          <p className="section-title px-3 mb-2">Assistant</p>
          <nav className="space-y-0.5">
            {tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button key={tool.label} onClick={tool.onClick} className="nav-item">
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  <span className="truncate">{tool.label}</span>
                </button>
              );
            })}
            <button
              onClick={() => setActiveView('analyze')}
              className={`nav-item ${activeView === 'analyze' ? 'nav-item-active' : ''}`}
            >
              <ScanText className="w-[18px] h-[18px] shrink-0" />
              <span className="truncate">Analyse any email</span>
            </button>
            <button
              onClick={() => setActiveView('history')}
              className={`nav-item ${activeView === 'history' ? 'nav-item-active' : ''}`}
            >
              <History className="w-[18px] h-[18px] shrink-0" />
              <span className="truncate">Email history</span>
            </button>
            <button
              onClick={() => setActiveView('analytics')}
              className={`nav-item ${activeView === 'analytics' ? 'nav-item-active' : ''}`}
            >
              <BarChart3 className="w-[18px] h-[18px] shrink-0" />
              <span className="truncate">Insights</span>
            </button>
          </nav>
        </div>
      </div>

      {userEmail && (
        <div className="p-3 border-t line">
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl" style={{ background: 'rgba(100,116,139,0.06)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="Connected" />
            <span className="text-[11px] ink-soft truncate font-mono">{userEmail}</span>
          </div>
        </div>
      )}
    </aside>
  );
}
