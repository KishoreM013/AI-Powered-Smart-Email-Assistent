import React, { useState, useEffect } from 'react';
import { useToast } from '../App';
import { adminService } from '../services/api';
import { 
  ShieldCheck, 
  Cpu, 
  Terminal, 
  Users, 
  RefreshCw, 
  AlertTriangle,
  Play
} from 'lucide-react';

export default function AdminPanel() {
  const { addToast } = useToast();

  const [users, setUsers] = useState([]);
  const [apiUsage, setApiUsage] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAdminData = async () => {
    try {
      const usersData = await adminService.getUsers();
      setUsers(usersData);
      
      const usage = await adminService.getApiUsage();
      setApiUsage(usage);
      
      const logStreams = await adminService.getLogs();
      setLogs(logStreams);
    } catch (err) {
      addToast('Failed to load administrative configurations.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadAdminData();
    addToast('Developer statistics sync refreshed!', 'info');
  };

  if (loading) {
    return (
      <div className="space-y-6 pt-16 lg:pt-0">
        <div className="h-10 w-48 rounded-xl shimmer-skeleton"></div>
        <div className="grid md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl shimmer-skeleton"></div>
          ))}
        </div>
        <div className="h-80 rounded-2xl shimmer-skeleton"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pt-16 lg:pt-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold font-display tracking-tight">Admin Console</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">System resources usage logs and API metrics monitors</p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/5 transition"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh Monitors</span>
        </button>
      </div>

      {/* API counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Gemini NLP Tokens', count: apiUsage?.gemini_calls || 0, details: 'OpenAI/Gemini API calls', color: 'bg-indigo-500/5 text-indigo-500 border-indigo-500/10' },
          { label: 'Gmail API syncs', count: apiUsage?.gmail_calls || 0, details: 'Inbox message reads', color: 'bg-emerald-500/5 text-emerald-500 border-emerald-500/10' },
          { label: 'OCR Document Scans', count: apiUsage?.ocr_calls || 0, details: 'PDF attachment parses', color: 'bg-amber-500/5 text-amber-500 border-amber-500/10' },
          { label: 'System Errors logged', count: apiUsage?.error_count || 0, details: 'Unresolved exceptions', color: 'bg-rose-500/5 text-rose-500 border-rose-500/10' }
        ].map((item, idx) => (
          <div key={idx} className={`glass-panel p-5 rounded-2xl space-y-1.5 border-l-4 ${item.color}`}>
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">{item.label}</span>
            <span className="text-2xl font-extrabold font-display tracking-tight block">{item.count}</span>
            <span className="text-[10px] text-slate-400 block font-semibold">{item.details}</span>
          </div>
        ))}
      </div>

      {/* Grid details */}
      <div className="grid lg:grid-cols-12 gap-6">
        {/* User database summary */}
        <div className="lg:col-span-7 glass-panel p-6 rounded-2xl space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-500" />
            <h2 className="text-lg font-bold">Registered Tenant Users</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/50 dark:border-slate-800/50 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  <th className="pb-3 pl-2">User Details</th>
                  <th className="pb-3">Google Registration Date</th>
                  <th className="pb-3 text-right pr-2">Last Sign In</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/20 dark:divide-slate-800/20 font-medium">
                {users.map((u) => (
                  <tr key={u._id} className="hover:bg-slate-100/10 dark:hover:bg-slate-900/10 transition-colors">
                    <td className="py-3.5 pl-2 flex items-center gap-2.5">
                      <img
                        src={u.picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'}
                        alt=""
                        className="w-8 h-8 rounded-full border"
                      />
                      <div className="truncate">
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">{u.name}</span>
                        <span className="text-[10px] text-slate-500 block">{u.email}</span>
                      </div>
                    </td>
                    <td className="py-3.5 text-slate-500">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 text-right pr-2 text-indigo-500 font-bold">
                      {new Date(u.last_login).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live debug streams */}
        <div className="lg:col-span-5 glass-panel p-6 rounded-2xl space-y-4">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-indigo-500" />
            <h2 className="text-lg font-bold">System Log Stream</h2>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 font-mono text-[10px] text-slate-300 leading-relaxed max-h-[300px] overflow-y-auto space-y-2 border border-slate-900">
            {logs.map((log, idx) => (
              <div key={idx} className="flex gap-2">
                <span className="text-slate-500 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={
                  log.level === 'ERROR' 
                    ? 'text-rose-500 font-bold' 
                    : log.level === 'WARNING' 
                    ? 'text-amber-500 font-bold' 
                    : 'text-indigo-400 font-bold'
                }>
                  [{log.level}]
                </span>
                <span className="text-slate-200">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
