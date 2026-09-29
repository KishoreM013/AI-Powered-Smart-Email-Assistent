import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../App';
import { emailService } from '../services/api';
import { 
  Search, 
  Sparkles, 
  Calendar, 
  Paperclip, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Inbox as InboxIcon,
  Briefcase,
  GraduationCap,
  Heart,
  PiggyBank,
  ShoppingBag,
  Share2,
  Tag
} from 'lucide-react';

export default function Inbox() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('');
  const [keywordSearch, setKeywordSearch] = useState('');
  const [smartSearchQuery, setSmartSearchQuery] = useState('');
  const [isSmartSearch, setIsSmartSearch] = useState(false);

  const fetchEmails = async () => {
    setLoading(true);
    try {
      let data = [];
      if (isSmartSearch && smartSearchQuery.trim()) {
        data = await emailService.search(smartSearchQuery);
      } else {
        const params = {};
        if (selectedCategory) params.category = selectedCategory;
        if (selectedPriority) params.priority = selectedPriority;
        if (keywordSearch) params.search = keywordSearch;
        
        data = await emailService.list(params);
      }
      setEmails(data);
    } catch (err) {
      addToast('Failed to retrieve emails.', 'error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, [selectedCategory, selectedPriority, keywordSearch, isSmartSearch]);

  const handleSmartSearchSubmit = (e) => {
    e.preventDefault();
    if (!smartSearchQuery.trim()) {
      setIsSmartSearch(false);
      return;
    }
    setIsSmartSearch(true);
    fetchEmails();
  };

  const clearFilters = () => {
    setSelectedCategory('');
    setSelectedPriority('');
    setKeywordSearch('');
    setSmartSearchQuery('');
    setIsSmartSearch(false);
  };

  // Helper mapping icon for category tab
  const categories = [
    { id: '', label: 'All', icon: InboxIcon },
    { id: 'Work', label: 'Work', icon: Briefcase },
    { id: 'College', label: 'College', icon: GraduationCap },
    { id: 'Personal', label: 'Personal', icon: Heart },
    { id: 'Finance', label: 'Finance', icon: PiggyBank },
    { id: 'Shopping', label: 'Shopping', icon: ShoppingBag },
    { id: 'Social', label: 'Social', icon: Share2 },
    { id: 'Promotions', label: 'Promotions', icon: Tag }
  ];

  return (
    <div className="space-y-6 pt-16 lg:pt-0">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold font-display tracking-tight">Smart Inbox</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Review prioritized messages and AI summaries</p>
      </div>

      {/* Dual Search bar: Smart Search and Keyword Search */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Natural Language Smart Search */}
        <form onSubmit={handleSmartSearchSubmit} className="glass-panel p-2 rounded-2xl flex items-center gap-2">
          <div className="p-2 text-indigo-500">
            <Sparkles className="h-5 w-5 animate-pulse" />
          </div>
          <input
            type="text"
            value={smartSearchQuery}
            onChange={(e) => setSmartSearchQuery(e.target.value)}
            placeholder="Smart Search: 'Emails from HR' or 'meeting this week'..."
            className="flex-1 bg-transparent text-sm outline-none px-2 text-slate-800 dark:text-white placeholder-slate-400"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold transition shadow-md shadow-indigo-500/10"
          >
            Ask AI
          </button>
        </form>

        {/* Traditional Search */}
        <div className="glass-panel p-2 rounded-2xl flex items-center gap-2">
          <div className="p-2 text-slate-400">
            <Search className="h-5 w-5" />
          </div>
          <input
            type="text"
            value={keywordSearch}
            onChange={(e) => {
              setIsSmartSearch(false);
              setKeywordSearch(e.target.value);
            }}
            placeholder="Filter subject, name, body contents..."
            className="flex-1 bg-transparent text-sm outline-none px-2 text-slate-800 dark:text-white placeholder-slate-400"
          />
        </div>
      </div>

      {/* Categories Horizontal Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {categories.map((cat) => {
          const Icon = cat.icon;
          const active = selectedCategory === cat.id && !isSmartSearch;
          return (
            <button
              key={cat.id}
              onClick={() => {
                setIsSmartSearch(false);
                setSelectedCategory(cat.id);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition border whitespace-nowrap ${
                active
                  ? 'bg-indigo-500 text-white border-indigo-500 shadow-md shadow-indigo-500/10'
                  : 'bg-white/50 dark:bg-slate-900/40 border-slate-200/50 dark:border-slate-800/50 text-slate-600 dark:text-slate-400 hover:border-indigo-500/30'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filter Options Row */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-3">
          {/* Priority filter */}
          <select
            value={selectedPriority}
            onChange={(e) => {
              setIsSmartSearch(false);
              setSelectedPriority(e.target.value);
            }}
            className="glass-panel px-3 py-2 rounded-xl text-xs font-bold outline-none cursor-pointer bg-white dark:bg-slate-900 border-slate-200/50 dark:border-slate-800/50 text-slate-600 dark:text-slate-400"
          >
            <option value="">Priority: All</option>
            <option value="High">High Urgency</option>
            <option value="Medium">Medium Urgency</option>
            <option value="Low">Low Urgency</option>
          </select>
        </div>

        {/* Clear buttons */}
        {(selectedCategory || selectedPriority || keywordSearch || smartSearchQuery) && (
          <button
            onClick={clearFilters}
            className="text-xs font-bold text-rose-500 hover:text-rose-600 transition"
          >
            Clear Active Filters
          </button>
        )}
      </div>

      {/* Emails list container */}
      <div className="space-y-3">
        {loading ? (
          // Loading Skeletons
          [...Array(5)].map((_, i) => (
            <div key={i} className="h-20 rounded-2xl shimmer-skeleton"></div>
          ))
        ) : emails.length === 0 ? (
          <div className="glass-panel py-16 text-center rounded-2xl flex flex-col items-center gap-3">
            <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-900/60 text-slate-400">
              <InboxIcon className="h-8 w-8" />
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">No emails match the active filters.</p>
          </div>
        ) : (
          emails.map((email) => (
            <div
              key={email._id}
              onClick={() => navigate(`/dashboard/inbox/${email._id}`)}
              className={`glass-panel-interactive p-4 md:p-5 rounded-2xl cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 ${
                email.is_read ? 'opacity-85' : 'font-semibold border-l-indigo-500'
              }`}
            >
              {/* Left Column: sender & topic info */}
              <div className="space-y-1.5 md:max-w-[70%]">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-800 dark:text-slate-200 block truncate">{email.sender_name}</span>
                  <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/10">
                    {email.category}
                  </span>
                  {email.attachments?.length > 0 && (
                    <Paperclip className="h-3.5 w-3.5 text-slate-400 shrink-0" title="Includes Attachments" />
                  )}
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-white leading-snug truncate">
                  {email.subject}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate font-normal">
                  {email.body_snippet}
                </p>
              </div>

              {/* Right Column: priorities, dates, summaries tags */}
              <div className="flex items-center justify-between md:justify-end gap-4">
                {/* Date */}
                <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    {new Date(email.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>

                {/* Priority Badge */}
                <span
                  className={
                    email.priority === 'High'
                      ? 'badge-priority-high animate-pulse'
                      : email.priority === 'Medium'
                      ? 'badge-priority-medium'
                      : 'badge-priority-low'
                  }
                >
                  {email.priority}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
