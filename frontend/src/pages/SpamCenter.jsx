import React, { useState, useEffect } from 'react';
import { useToast } from '../App';
import { emailService } from '../services/api';
import { 
  ShieldAlert, 
  Trash2, 
  RotateCcw, 
  AlertTriangle,
  Info,
  CheckSquare
} from 'lucide-react';

export default function SpamCenter() {
  const { addToast } = useToast();
  const [spamEmails, setSpamEmails] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSpam = async () => {
    setLoading(true);
    try {
      const data = await emailService.list({ category: 'Spam' });
      setSpamEmails(data);
    } catch (err) {
      addToast('Failed to load spam logs.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpam();
  }, []);

  const handleAction = async (id, action) => {
    try {
      if (action === 'delete') {
        await emailService.performAction(id, 'delete');
        addToast('Spam message permanently deleted.', 'success');
      } else if (action === 'restore') {
        // Move back to inbox updates
        await emailService.performAction(id, 'archive');
        addToast('Message restored to Inbox folder.', 'success');
      }
      fetchSpam();
    } catch (err) {
      addToast('Failed to execute spam action.', 'error');
    }
  };

  const handleBulkDelete = async () => {
    if (spamEmails.length === 0) return;
    try {
      for (const email of spamEmails) {
        await emailService.performAction(email._id, 'delete');
      }
      addToast('All spam emails permanently cleared.', 'success');
      fetchSpam();
    } catch (err) {
      addToast('Error during bulk deletion.', 'error');
    }
  };

  return (
    <div className="space-y-6 pt-16 lg:pt-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold font-display tracking-tight">AI Spam Center</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Review suspicious triggers and sender reputation checks</p>
        </div>

        {spamEmails.length > 0 && (
          <button
            onClick={handleBulkDelete}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs transition shadow-lg shadow-rose-500/15"
          >
            <Trash2 className="h-4 w-4" />
            <span>Empty Spam Folder</span>
          </button>
        )}
      </div>

      {/* Main logs display list */}
      <div className="space-y-4">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl shimmer-skeleton"></div>
          ))
        ) : spamEmails.length === 0 ? (
          <div className="glass-panel py-16 text-center rounded-2xl flex flex-col items-center gap-3">
            <div className="p-4 rounded-full bg-emerald-500/10 text-emerald-500">
              <ShieldAlert className="h-8 w-8" />
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Inbox clean. No spam logs detected.</p>
          </div>
        ) : (
          spamEmails.map((email) => (
            <div
              key={email._id}
              className="glass-panel p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 border-l-4 border-l-slate-400"
            >
              {/* Left detail */}
              <div className="space-y-2 max-w-[70%]">
                <div className="flex items-center flex-wrap gap-2.5">
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{email.sender_name}</span>
                  <span className="text-xs text-slate-500">&lt;{email.sender_email}&gt;</span>
                  
                  {/* ML Score indicator */}
                  <span className="inline-flex items-center gap-1 bg-rose-500/10 text-rose-500 border border-rose-500/10 px-2 py-0.5 rounded text-[10px] font-bold animate-pulse">
                    <AlertTriangle className="h-3 w-3" />
                    <span>Score: {Math.round(email.category_score * 100)}%</span>
                  </span>
                </div>

                <div className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                  {email.subject}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed font-normal">
                  {email.body_full}
                </p>
                
                {/* Keywords flag if any */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[9px] uppercase font-bold text-slate-400">Flagged keywords:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {['lottery', 'jackpot', 'wire money', 'bitcoin'].map((kw) => (
                      <span key={kw} className="text-[9px] font-semibold bg-white/40 dark:bg-slate-950/60 border border-slate-300/40 dark:border-slate-800/40 px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-400">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 shrink-0 md:justify-end">
                <button
                  onClick={() => handleAction(email._id, 'restore')}
                  className="px-3.5 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 hover:bg-indigo-500 hover:text-white text-xs font-bold transition flex items-center gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Restore</span>
                </button>
                <button
                  onClick={() => handleAction(email._id, 'delete')}
                  className="px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white text-xs font-bold transition flex items-center gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
