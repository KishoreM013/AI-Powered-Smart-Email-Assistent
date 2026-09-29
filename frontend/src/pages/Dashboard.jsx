import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useToast, useUser } from '../App';
import { emailService, analyticsService } from '../services/api';
import { 
  Mail, 
  Inbox, 
  AlertTriangle, 
  ShieldCheck, 
  RefreshCw, 
  Brain, 
  TrendingUp, 
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip
} from 'recharts';

export default function Dashboard() {
  const { addToast } = useToast();
  const { theme } = useUser();
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08 }
    }
  };

  const itemVariants = {
    hidden: { y: 15, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: 'spring', stiffness: 100, damping: 15 }
    }
  };

  const loadDashboardData = async () => {
    try {
      const stats = await analyticsService.get();
      setAnalytics(stats);
      
      // Load suggestions (High priority unread emails)
      const list = await emailService.list({ priority: 'High', is_read: false, limit: 3 });
      setSuggestions(list);
    } catch (err) {
      addToast('Failed to retrieve analytics', 'error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    addToast('Synchronizing messages with Gmail API...', 'info');
    try {
      const res = await emailService.sync();
      addToast(`Sync successful! Processed ${res.synced} emails.`, 'success');
      await loadDashboardData();
    } catch (err) {
      addToast('Synchronization failed. Check credentials.', 'error');
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

  const chartColors = {
    Work: '#6366F1',      // indigo
    College: '#F59E0B',   // amber
    Personal: '#10B981',  // emerald
    Finance: '#EC4899',   // pink
    Shopping: '#3B82F6',  // blue
    Social: '#8B5CF6',    // purple
    Promotions: '#A855F7',// light purple
    Important: '#EF4444', // red
    Spam: '#64748B',      // slate
  };

  if (loading) {
    return (
      <div className="space-y-6 pt-16 lg:pt-0">
        {/* Header Shimmer */}
        <div className="flex justify-between items-center">
          <div className="h-8 w-48 rounded-lg shimmer-skeleton"></div>
          <div className="h-10 w-36 rounded-xl shimmer-skeleton"></div>
        </div>
        
        {/* Metrics Grid Shimmer */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl shimmer-skeleton"></div>
          ))}
        </div>

        {/* Detailed Layout Shimmer */}
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 h-80 rounded-2xl shimmer-skeleton"></div>
          <div className="lg:col-span-4 h-80 rounded-2xl shimmer-skeleton"></div>
        </div>
      </div>
    );
  }

  const { summary, categoryDistribution, weeklyActivity, metrics } = analytics || {};

  return (
    <motion.div 
      className="space-y-8 pt-16 lg:pt-0"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Dashboard Top Header */}
      <motion.div className="flex flex-col md:flex-row justify-between md:items-center gap-4" variants={itemVariants}>
        <div>
          <h1 className="text-3xl font-extrabold font-display tracking-tight">Intelligence Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Real-time summaries and classification analysis</p>
        </div>
        
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/35 transition-all duration-200 disabled:opacity-50"
        >
          <RefreshCw className={`h-4.5 w-4.5 ${syncing ? 'animate-spin' : ''}`} />
          <span>{syncing ? 'Syncing...' : 'Sync Inbox'}</span>
        </button>
      </motion.div>

      {/* Metrics Card Grid */}
      <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-4" variants={itemVariants}>
        {[
          { label: 'Total Emails', count: summary?.total || 0, icon: Mail, color: 'text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-500/10' },
          { label: 'Unread Emails', count: summary?.unread || 0, icon: Inbox, color: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10' },
          { label: 'Important Items', count: summary?.important || 0, icon: AlertTriangle, color: 'text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/10' },
          { label: 'Spam Handled', count: summary?.spam || 0, icon: ShieldCheck, color: 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-500/10' }
        ].map((card, i) => (
          <div
            key={i}
            className="glass-panel p-5 rounded-2xl flex items-center justify-between"
          >
            <div>
              <span className="text-xs text-slate-400 dark:text-slate-400 font-bold block">{card.label}</span>
              <span className="text-2xl font-extrabold font-display tracking-tight mt-1 block">{card.count}</span>
            </div>
            <div className={`p-3 rounded-xl ${card.color}`}>
              <card.icon className="h-6 w-6" />
            </div>
          </div>
        ))}
      </motion.div>

      {/* Daily Summary & Suggestions */}
      <motion.div className="grid lg:grid-cols-12 gap-6" variants={itemVariants}>
        {/* Today's AI Summary Card */}
        <div className="lg:col-span-8 glass-panel p-6 rounded-2xl space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
              <Brain className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-bold">Today's Sync Summary</h2>
          </div>
          
          <div className="p-4 rounded-xl bg-slate-100/50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/50 leading-relaxed text-sm text-slate-600 dark:text-slate-300">
            "We detected multiple business and college notifications in this sync. Specifically, Marcus Vance (CEO) requested a progress briefing by tomorrow, while an assignment deadline for CS-504 is set for Friday. Invoices and credit card bills were cataloged under Finance."
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10">
              <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-500 dark:text-indigo-400">Avg Emails/Day</span>
              <span className="text-xl font-bold font-display block mt-1">{metrics?.averageEmailsPerDay || 0}</span>
            </div>
            <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400">Response Speed</span>
              <span className="text-xl font-bold font-display block mt-1">{metrics?.averageResponseTime || 'N/A'}</span>
            </div>
            <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/10 col-span-2 md:col-span-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-rose-500 dark:text-rose-400">Spam rate</span>
              <span className="text-xl font-bold font-display block mt-1">{metrics?.spamPercentage || 0}%</span>
            </div>
          </div>
        </div>

        {/* AI Action Suggestions */}
        <div className="lg:col-span-4 glass-panel p-6 rounded-2xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                <Sparkles className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-bold">Urgent Actions</h2>
            </div>
            
            <div className="space-y-3">
              {suggestions.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-sm">
                  No unread high-priority emails. Great job!
                </div>
              ) : (
                suggestions.map((email) => (
                  <div
                    key={email._id}
                    onClick={() => navigate(`/dashboard/inbox/${email._id}`)}
                    className="p-3.5 rounded-xl bg-slate-100/30 dark:bg-slate-950/20 border border-slate-200/50 dark:border-slate-800/30 hover:border-indigo-500/30 hover:bg-slate-50 dark:hover:bg-slate-950/50 cursor-pointer flex items-center justify-between transition-all group"
                  >
                    <div className="truncate space-y-1 w-[85%]">
                      <span className="font-bold text-xs block text-slate-800 dark:text-slate-200">{email.sender_name}</span>
                      <span className="text-xs text-slate-500 truncate block font-medium">{email.subject}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            onClick={() => navigate('/dashboard/inbox')}
            className="mt-4 w-full py-2.5 rounded-xl border border-indigo-500/20 text-indigo-600 hover:bg-indigo-500/10 text-sm font-semibold transition"
          >
            Go to Inbox
          </button>
        </div>
      </motion.div>

      {/* Mini charts widget row */}
      <motion.div className="grid lg:grid-cols-12 gap-6" variants={itemVariants}>
        {/* Category Share (Pie Chart) */}
        <div className="lg:col-span-5 glass-panel p-6 rounded-2xl space-y-4">
          <h2 className="text-lg font-bold">Email Distribution</h2>
          <div className="h-52 w-full flex items-center justify-center">
            {categoryDistribution ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryDistribution.filter(c => c.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {categoryDistribution.filter(c => c.value > 0).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={chartColors[entry.name] || '#CBD5E1'} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      background: theme === 'dark' ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)', 
                      borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)', 
                      borderRadius: '12px',
                      color: theme === 'dark' ? '#FFF' : '#1E293B',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <span className="text-slate-500 text-sm">No distribution metrics</span>
            )}
          </div>
          
          {/* Custom Legends grid */}
          <div className="grid grid-cols-3 gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {categoryDistribution?.filter(c => c.value > 0).slice(0, 6).map((cat, i) => (
              <div key={i} className="flex items-center gap-1.5 truncate">
                <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: chartColors[cat.name] }}></span>
                <span className="truncate">{cat.name}: {cat.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Weekly Activities (Bar Chart) */}
        <div className="lg:col-span-7 glass-panel p-6 rounded-2xl space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold">Weekly Activity</h2>
            <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500"></span>Received</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>Replied</span>
            </div>
          </div>
          <div className="h-64 w-full">
            {weeklyActivity ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyActivity}>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ 
                      background: theme === 'dark' ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)', 
                      borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)', 
                      borderRadius: '12px',
                      color: theme === 'dark' ? '#FFF' : '#1E293B',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                    }}
                  />
                  <Bar dataKey="received" fill="#6366F1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="replied" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <span className="text-slate-500 text-sm">No activity metrics</span>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

