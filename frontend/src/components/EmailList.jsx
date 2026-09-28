import React, { useState } from 'react';
import { Star, Mail, AlertTriangle, Trash2, CheckCircle, Sparkles } from 'lucide-react';

export default function EmailList({
  emails = [],
  selectedEmail,
  onSelectEmail,
  onToggleStar,
  onToggleRead,
  onDeleteEmail,
  isLoading
}) {
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'important' | 'unread'

  // Pre-configured rich mock data matching the reference image if emails array is default
  const defaultItems = [
    {
      id: "1",
      sender_name: "Google Workspace",
      sender_email: "no-reply@accounts.google.com",
      avatar_icon: "google",
      subject: "Security alert: New sign-in to your account",
      preview: "Your Google Account was just signed in from a new device...",
      timestamp: "10:24 AM",
      category: "Important",
      category_color: "bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300",
      priority: "High",
      is_read: false,
      is_starred: true
    },
    {
      id: "2",
      sender_name: "Project Team",
      sender_email: "project@college.edu",
      avatar_icon: "team",
      subject: "Final Project Submission - Reminder",
      preview: "Hi Karan, This is a reminder that the final project submission...",
      timestamp: "09:42 AM",
      category: "Work",
      category_color: "bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border-blue-300",
      priority: "High",
      is_read: false,
      is_starred: false
    },
    {
      id: "3",
      sender_name: "Amazon",
      sender_email: "shipment-tracking@amazon.com",
      avatar_icon: "amazon",
      subject: "Your order has been shipped",
      preview: "Hi Karan, Your order #404-039712-6 has been shipped...",
      timestamp: "08:15 AM",
      category: "Shopping",
      category_color: "bg-orange-100 dark:bg-orange-950/80 text-orange-800 dark:text-orange-300 border-orange-300",
      priority: "Medium",
      is_read: true,
      is_starred: false
    },
    {
      id: "4",
      sender_name: "LinkedIn",
      sender_email: "jobs-listings@linkedin.com",
      avatar_icon: "linkedin",
      subject: "Job opportunity match for you",
      preview: "We found a role that matches your profile. Check it out!",
      timestamp: "Yesterday",
      category: "Jobs",
      category_color: "bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border-purple-300",
      priority: "Medium",
      is_read: true,
      is_starred: false
    },
    {
      id: "5",
      sender_name: "Netflix",
      sender_email: "info@mailer.netflix.com",
      avatar_icon: "netflix",
      subject: "New shows & movies added",
      preview: "Discover what's new this week on Netflix...",
      timestamp: "Yesterday",
      category: "Promotions",
      category_color: "bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-300",
      priority: "Low",
      is_read: true,
      is_starred: false
    },
    {
      id: "6",
      sender_name: "HDFC Bank",
      sender_email: "alerts@hdfcbank.net",
      avatar_icon: "hdfc",
      subject: "Statement for your account",
      preview: "Your monthly statement is now available. Click to view...",
      timestamp: "18 Sep",
      category: "Finance",
      category_color: "bg-teal-100 dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 border-teal-300",
      priority: "High",
      is_read: false,
      is_starred: true
    }
  ];

  const listItems = emails;

  const filteredItems = listItems.filter(item => {
    if (filterTab === 'important') return item.priority === 'High' || item.category === 'Important' || item.is_starred;
    if (filterTab === 'unread') return !item.is_read;
    return true;
  });

  const totalCount = listItems.length;
  const importantCount = listItems.filter(item => item.priority === 'High' || item.category === 'Important' || item.is_starred).length;
  const unreadCount = listItems.filter(item => !item.is_read).length;

  const renderAvatar = (item) => {
    if (item.avatar_icon === 'google' || item.sender_name?.includes('Google')) {
      return (
        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
        </div>
      );
    }

    if (item.avatar_icon === 'amazon' || item.sender_name?.includes('Amazon')) {
      return (
        <div className="w-8 h-8 rounded-full bg-slate-900 text-amber-400 flex items-center justify-center shrink-0 font-extrabold text-sm border border-slate-700">
          a
        </div>
      );
    }

    if (item.avatar_icon === 'linkedin' || item.sender_name?.includes('LinkedIn')) {
      return (
        <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 font-extrabold text-xs">
          in
        </div>
      );
    }

    if (item.avatar_icon === 'netflix' || item.sender_name?.includes('Netflix')) {
      return (
        <div className="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center shrink-0 font-extrabold text-sm">
          N
        </div>
      );
    }

    if (item.avatar_icon === 'hdfc' || item.sender_name?.includes('HDFC')) {
      return (
        <div className="w-8 h-8 rounded-full bg-red-800 text-white flex items-center justify-center shrink-0 font-extrabold text-xs">
          H
        </div>
      );
    }

    const firstLetter = (item.sender_name || 'U').charAt(0).toUpperCase();
    return (
      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-white flex items-center justify-center shrink-0 font-extrabold text-xs">
        {firstLetter}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-[#0D111D] overflow-hidden select-none transition-colors">
      
      {/* Top Header & Filter Tabs Bar */}
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
        <h2 className="font-extrabold text-base text-slate-900 dark:text-white">
          Inbox
        </h2>

        {/* Filter Tabs */}
        <div className="flex items-center space-x-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1 rounded-lg transition ${
              filterTab === 'all'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            All ({totalCount})
          </button>
          <button
            onClick={() => setFilterTab('important')}
            className={`px-3 py-1 rounded-lg transition ${
              filterTab === 'important'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Important ({importantCount})
          </button>
          <button
            onClick={() => setFilterTab('unread')}
            className={`px-3 py-1 rounded-lg transition ${
              filterTab === 'unread'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>
      </div>

      {/* Email Feed List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Loading emails...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs font-medium">
            No emails in this view.
          </div>
        ) : (
          filteredItems.map((item) => {
            const isSelected = selectedEmail?.id === item.id;
            return (
              <div
                key={item.id}
                onClick={() => onSelectEmail && onSelectEmail(item)}
                className={`p-3.5 flex items-start space-x-3 cursor-pointer transition relative group ${
                  isSelected
                    ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-l-4 border-indigo-600'
                    : item.is_read
                    ? 'bg-white dark:bg-[#0D111D] hover:bg-slate-50 dark:hover:bg-slate-900/60'
                    : 'bg-indigo-50/30 dark:bg-indigo-950/20 font-semibold'
                }`}
              >
                {/* Sender Icon Avatar */}
                {renderAvatar(item)}

                {/* Main Email Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-xs font-bold truncate ${item.is_read ? 'text-slate-700 dark:text-slate-300' : 'text-slate-900 dark:text-white'}`}>
                      {item.sender_name}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0 font-medium ml-2">
                      {item.timestamp || "10:24 AM"}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2 mb-1">
                    {item.category && (
                      <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${item.category_color || 'bg-indigo-100 text-indigo-700 border-indigo-300'}`}>
                        {item.category}
                      </span>
                    )}
                    <span className={`text-xs truncate ${item.is_read ? 'text-slate-800 dark:text-slate-200' : 'font-extrabold text-slate-900 dark:text-white'}`}>
                      {item.subject}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate leading-relaxed">
                    {item.preview || item.snippet || item.body}
                  </p>
                </div>

                {/* Star Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStar && onToggleStar(item.id);
                  }}
                  className="text-slate-300 dark:text-slate-600 hover:text-amber-400 dark:hover:text-amber-400 transition"
                >
                  <Star className={`w-4 h-4 ${item.is_starred ? 'text-amber-400 fill-amber-400' : ''}`} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
