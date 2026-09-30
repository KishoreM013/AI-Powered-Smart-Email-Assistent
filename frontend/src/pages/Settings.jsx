import React, { useState, useEffect } from 'react';
import { useToast } from '../App';
import { settingsService } from '../services/api';
import { Settings as SettingsIcon, Bell, Globe, Sparkles, UserCheck, Plus, Trash } from 'lucide-react';

export default function Settings() {
  const { addToast } = useToast();
  
  const [theme, setTheme] = useState('dark');
  const [language, setLanguage] = useState('en');
  const [notifications, setNotifications] = useState(true);
  const [criticalContacts, setCriticalContacts] = useState([]);
  const [newContact, setNewContact] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const data = await settingsService.get();
        setTheme(data.theme || 'dark');
        setLanguage(data.language || 'en');
        setNotifications(data.notifications_enabled !== false);
        setCriticalContacts(data.critical_contacts || []);
      } catch (err) {
        addToast('Failed to load settings.', 'error');
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await settingsService.update({
        theme,
        language,
        notifications_enabled: notifications,
        critical_contacts: criticalContacts
      });
      addToast('Application configuration settings saved!', 'success');
    } catch (err) {
      addToast('Failed to save settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddContact = () => {
    if (!newContact.trim() || !newContact.includes('@')) {
      addToast('Please enter a valid email address.', 'warning');
      return;
    }
    if (criticalContacts.includes(newContact.trim())) {
      addToast('Contact already in list.', 'warning');
      return;
    }
    setCriticalContacts([...criticalContacts, newContact.trim()]);
    setNewContact('');
    addToast('Contact added (save to apply changes).', 'info');
  };

  const handleRemoveContact = (email) => {
    setCriticalContacts(criticalContacts.filter(c => c !== email));
    addToast('Contact removed (save to apply changes).', 'info');
  };

  return (
    <div className="space-y-6 pt-16 lg:pt-0 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold font-display tracking-tight">Configuration Settings</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Theme styles, language files, and critical notification alerts</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Visual appearance */}
        <div className="glass-panel p-6 rounded-2xl space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200/50 dark:border-slate-800/50 pb-3">
            <Globe className="h-5 w-5 text-indigo-500" />
            <h2 className="text-lg font-bold">Preferences</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Language dropdown */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Primary Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-slate-100/50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800 rounded-xl px-4 py-2.5 outline-none text-sm text-slate-700 dark:text-slate-300 cursor-pointer focus:border-indigo-500"
              >
                <option value="en">English (US)</option>
                <option value="es">Español (ES)</option>
                <option value="fr">Français (FR)</option>
                <option value="de">Deutsch (DE)</option>
                <option value="hi">हिन्दी (IN)</option>
              </select>
            </div>

            {/* Layout theme toggles */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Workspace Theme</label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="w-full bg-slate-100/50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800 rounded-xl px-4 py-2.5 outline-none text-sm text-slate-700 dark:text-slate-300 cursor-pointer focus:border-indigo-500"
              >
                <option value="dark">Vibrant Dark Glow</option>
                <option value="light">Minimal Clean Light</option>
              </select>
            </div>
          </div>
        </div>

        {/* Notifications details */}
        <div className="glass-panel p-6 rounded-2xl space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200/50 dark:border-slate-800/50 pb-3">
            <Bell className="h-5 w-5 text-indigo-500" />
            <h2 className="text-lg font-bold">Notifications</h2>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <span className="font-bold text-sm block">System Banner Alerts</span>
              <span className="text-xs text-slate-500">Show push-styled banner notifications on dashboard sync</span>
            </div>
            <input
              type="checkbox"
              checked={notifications}
              onChange={(e) => setNotifications(e.target.checked)}
              className="h-5 w-5 rounded bg-indigo-500 border-transparent text-indigo-500 focus:ring-0 cursor-pointer"
            />
          </div>
        </div>

        {/* VIP Contacts trigger */}
        <div className="glass-panel p-6 rounded-2xl space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200/50 dark:border-slate-800/50 pb-3">
            <UserCheck className="h-5 w-5 text-indigo-500" />
            <h2 className="text-lg font-bold">VIP Senders (Instant Alerts)</h2>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Emails from these contacts will immediately trigger high priority indicators and push-styled notifications, regardless of AI classification ratings.
          </p>

          <div className="flex gap-2">
            <input
              type="email"
              value={newContact}
              onChange={(e) => setNewContact(e.target.value)}
              placeholder="e.g. boss@company.com"
              className="flex-1 bg-slate-100/50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/80 rounded-xl px-4 py-2.5 outline-none text-sm text-slate-800 dark:text-slate-250 focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={handleAddContact}
              className="px-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-md shadow-indigo-500/10"
            >
              <Plus className="h-4 w-4" />
              <span>Add VIP</span>
            </button>
          </div>

          {/* List of critical contacts */}
          <div className="space-y-2 pt-2">
            {criticalContacts.length === 0 ? (
              <p className="text-center text-xs text-slate-500 py-3">No VIP contacts configured.</p>
            ) : (
              criticalContacts.map((contact) => (
                <div key={contact} className="p-3 rounded-xl bg-slate-100/50 dark:bg-slate-950/30 border border-slate-200/30 dark:border-slate-800 flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-700 dark:text-slate-300">{contact}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveContact(contact)}
                    className="p-1 rounded text-rose-500 hover:bg-rose-500/10 transition"
                  >
                    <Trash className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={saving}
          className="w-full py-3.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50 shadow-lg shadow-indigo-500/20"
        >
          {saving ? 'Saving changes...' : 'Save Configuration Preferences'}
        </button>
      </form>
    </div>
  );
}
