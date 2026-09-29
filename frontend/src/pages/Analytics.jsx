import React, { useState, useEffect } from 'react';
import { useToast, useUser } from '../App';
import { analyticsService } from '../services/api';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid
} from 'recharts';
import { 
  Mail, 
  Clock, 
  ShieldAlert, 
  TrendingUp, 
  TrendingDown, 
  Award,
  Users
} from 'lucide-react';

export default function Analytics() {
  const { addToast } = useToast();
  const { theme } = useUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await analyticsService.get();
        setData(res);
      } catch (err) {
        addToast('Failed to load analytics.', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

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
        <div className="h-10 w-48 rounded-xl shimmer-skeleton"></div>
        <div className="grid md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl shimmer-skeleton"></div>
          ))}
        </div>
        <div className="h-96 rounded-2xl shimmer-skeleton"></div>
      </div>
    );
  }

  const { summary, categoryDistribution, weeklyActivity, topContacts, metrics } = data || {};

  return (
    <div className="space-y-8 pt-16 lg:pt-0">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold font-display tracking-tight">Inbox Analytics</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Historical review of communications efficiency and spam volume</p>
      </div>

      {/* Key metrics summaries */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="glass-panel p-5 rounded-2xl space-y-2 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-bold block">Avg Emails / Day</span>
            <span className="text-2xl font-extrabold font-display tracking-tight mt-1 block">{metrics?.averageEmailsPerDay || 0}</span>
          </div>
          <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-500">
            <Mail className="h-6 w-6" />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl space-y-2 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-bold block">Average Reply Speed</span>
            <span className="text-2xl font-extrabold font-display tracking-tight mt-1 block">{metrics?.averageResponseTime || 'N/A'}</span>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500">
            <Clock className="h-6 w-6" />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl space-y-2 flex items-center justify-between col-span-2 md:col-span-1">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-bold block">Spam Filter Efficiency</span>
            <span className="text-2xl font-extrabold font-display tracking-tight mt-1 block">99.8%</span>
          </div>
          <div className="p-3 rounded-xl bg-rose-500/10 text-rose-500">
            <ShieldAlert className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Grid: Charts */}
      <div className="grid lg:grid-cols-12 gap-6">
        {/* Weekly Activity Line/Bar */}
        <div className="lg:col-span-8 glass-panel p-6 rounded-2xl space-y-4">
          <h2 className="text-lg font-bold">Weekly Activity Distribution</h2>
          <div className="h-72 w-full">
            {weeklyActivity ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyActivity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ 
                      background: theme === 'dark' ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)', 
                      borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)', 
                      borderRadius: '12px',
                      color: theme === 'dark' ? '#FFF' : '#1E293B',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                    }}
                  />
                  <Line type="monotone" dataKey="received" stroke="#6366F1" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="replied" stroke="#10B981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="spam" stroke="#EF4444" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <span className="text-slate-500 text-sm">No activity datasets</span>
            )}
          </div>
        </div>

        {/* Categories Pie */}
        <div className="lg:col-span-4 glass-panel p-6 rounded-2xl flex flex-col justify-between space-y-4">
          <h2 className="text-lg font-bold">Category Shares</h2>
          <div className="h-56 w-full flex items-center justify-center">
            {categoryDistribution ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryDistribution.filter(c => c.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {categoryDistribution.filter(c => c.value > 0).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={chartColors[entry.name] || '#64748B'} />
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
              <span className="text-slate-500 text-sm">No categories share</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {categoryDistribution?.filter(c => c.value > 0).map((cat, i) => (
              <div key={i} className="flex items-center gap-1.5 truncate">
                <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: chartColors[cat.name] }}></span>
                <span className="truncate">{cat.name} ({cat.value})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Senders list */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-indigo-500" />
          <h2 className="text-lg font-bold">Most Contacted People</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200/50 dark:border-slate-800/50 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                <th className="pb-3 pl-2">Name</th>
                <th className="pb-3">Email Address</th>
                <th className="pb-3 text-center">Volume</th>
                <th className="pb-3 text-right pr-2">Average Response</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/20 dark:divide-slate-800/20 font-medium">
              {topContacts?.map((contact, idx) => (
                <tr key={idx} className="hover:bg-slate-100/20 dark:hover:bg-slate-900/20 transition-colors">
                  <td className="py-3.5 pl-2 font-bold text-slate-800 dark:text-slate-200">{contact.name}</td>
                  <td className="py-3.5 text-slate-500">{contact.email}</td>
                  <td className="py-3.5 text-center text-slate-800 dark:text-slate-200">{contact.count}</td>
                  <td className="py-3.5 text-right pr-2 font-bold text-indigo-500">{contact.responseTime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
