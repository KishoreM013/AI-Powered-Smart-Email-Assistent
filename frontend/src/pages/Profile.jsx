import React, { useState } from 'react';
import { useUser, useToast } from '../App';
import { settingsService } from '../services/api';
import { User, Sparkles, Image as ImageIcon } from 'lucide-react';

export default function Profile() {
  const { user, setUser } = useUser();
  const { addToast } = useToast();

  const [name, setName] = useState(user?.name || '');
  const [picture, setPicture] = useState(user?.picture || '');
  const [saving, setSaving] = useState(false);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      addToast('Name field cannot be blank.', 'warning');
      return;
    }
    setSaving(true);
    try {
      await settingsService.updateProfile({ name, picture });
      setUser({ ...user, name, picture });
      addToast('Profile info updated successfully!', 'success');
    } catch (err) {
      addToast('Failed to update profile.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pt-16 lg:pt-0 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold font-display tracking-tight">User Profile</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Modify profile photos, user credentials, and display parameters</p>
      </div>

      <div className="glass-panel p-6 md:p-8 rounded-2xl">
        <form onSubmit={handleUpdateProfile} className="space-y-6">
          {/* Avatar display */}
          <div className="flex flex-col items-center space-y-3 pb-4 border-b border-slate-200/50 dark:border-slate-800/50">
            <img
              src={picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'}
              alt="Profile Avatar"
              className="w-24 h-24 rounded-full object-cover border-2 border-indigo-500 shadow-xl"
            />
            <span className="text-sm font-extrabold text-slate-800 dark:text-white leading-none mt-1">{user?.email}</span>
            <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400">Standard User License</span>
          </div>

          <div className="space-y-4">
            {/* Display Name Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> Display Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-slate-100/50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/80 rounded-xl px-4 py-2.5 outline-none text-sm text-slate-800 dark:text-slate-250 focus:border-indigo-500 transition"
                placeholder="John Doe"
              />
            </div>

            {/* Photo URL Link */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5" /> Profile Photo Link
              </label>
              <input
                type="url"
                value={picture}
                onChange={(e) => setPicture(e.target.value)}
                className="w-full bg-slate-100/50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/80 rounded-xl px-4 py-2.5 outline-none text-sm text-slate-800 dark:text-slate-250 focus:border-indigo-500 transition"
                placeholder="https://images.unsplash.com/...jpg"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving}
            className="w-full py-3.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50 shadow-lg shadow-indigo-500/20"
          >
            {saving ? 'Updating Profile...' : 'Save Profile Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
