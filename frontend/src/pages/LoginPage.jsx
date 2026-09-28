import React, { useState, useEffect } from 'react';
import {
  Sparkles, Bot, ShieldCheck, ArrowRight,
  Zap, FileText, CheckCircle2, Lock, Info,
  Mail, ChevronRight, UserCheck, HelpCircle,
  ExternalLink, Sun, Moon, Check, Key
} from 'lucide-react';
import { authAPI } from '../services/api';

export default function LoginPage({ onLoginSuccess }) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState('');
  const [authConfig, setAuthConfig] = useState({ is_live_configured: false, demo_mode: true });
  const [customEmail, setCustomEmail] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(true);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Theme support
  const [theme, setTheme] = useState(() => localStorage.getItem('smart_email_theme') || 'light');

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
    localStorage.setItem('smart_email_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Fetch auth config on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const config = await authAPI.getAuthConfig();
        setAuthConfig(config);
      } catch (e) {
        console.warn('Could not load auth config, using fallback:', e);
      }
    };
    fetchConfig();
  }, []);

  const [loginMethod, setLoginMethod] = useState('google'); // 'google' | 'imap'
  const [appPassword, setAppPassword] = useState('');

  // 1. Google OAuth Main Button Handler
  const handleGoogleOAuthLogin = async () => {
    setIsLoading(true);
    setLoadingAction('google_oauth');
    setErrorMsg('');
    const targetEmail = customEmail.trim() || undefined;
    try {
      const data = await authAPI.getLoginUrl(targetEmail);
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      setErrorMsg('Google OAuth Cloud credentials missing. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env to connect your real Gmail account.');
    } catch (e) {
      console.error(e);
      setErrorMsg('Failed to connect to Google OAuth servers. Ensure backend is running.');
    } finally {
      setIsLoading(false);
      setLoadingAction('');
    }
  };

  // 2. Custom IMAP Direct Login with App Password
  const handleImapLogin = async (e) => {
    e?.preventDefault();
    if (!customEmail || !customEmail.includes('@')) {
      setErrorMsg('Please enter your valid Gmail address.');
      return;
    }
    if (!appPassword || appPassword.length < 8) {
      setErrorMsg('Please enter your Google 16-character App Password.');
      return;
    }

    setIsLoading(true);
    setLoadingAction('imap');
    setErrorMsg('');

    try {
      const res = await authAPI.imapLogin({
        email: customEmail.trim(),
        app_password: appPassword.trim()
      });
      if (res?.user) {
        onLoginSuccess(res.user);
      }
    } catch (e) {
      console.error(e);
      setErrorMsg(e.response?.data?.detail || 'IMAP Authentication failed. Make sure to use a 16-character Google App Password.');
    } finally {
      setIsLoading(false);
      setLoadingAction('');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#080C16] text-slate-800 dark:text-slate-100 flex flex-col justify-between relative overflow-x-hidden font-sans transition-colors duration-200">
      {/* Background dynamic ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[450px] bg-gradient-to-tr from-indigo-500/15 via-purple-500/15 to-pink-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 right-10 w-[500px] h-[500px] bg-gradient-to-br from-blue-500/10 to-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Navigation Bar */}
      <header className="p-4 sm:p-6 max-w-6xl mx-auto w-full flex items-center justify-between relative z-10">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 p-0.5 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <div className="w-full h-full bg-white dark:bg-[#0F1422] rounded-[10px] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
          <div>
            <span className="font-bold text-base sm:text-lg text-slate-900 dark:text-white tracking-tight block">
              Smart Email AI
            </span>
            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold tracking-wide">
              Powered by Google Gemini NLP
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white transition shadow-xs"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
          </button>
        </div>
      </header>

      {/* Main Google Login Hero & Card */}
      <main className="max-w-5xl mx-auto px-4 py-6 sm:py-10 text-center relative z-10 flex flex-col items-center w-full">
        {/* Verification Status Pill */}
        <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold mb-6 shadow-2xs">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Real Gmail Sync & Google OAuth 2.0 Enabled</span>
          <span className="ml-1 px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">LIVE</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight max-w-3xl mb-3">
          Connect Your Real <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-400 dark:to-purple-400">Gmail Account</span>
        </h1>

        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-2xl mb-8 leading-relaxed font-medium">
          Fetch your real Gmail inbox messages with AI triage, Gemini summaries, PDF OCR parsing, and smart auto-reply drafting.
        </p>

        {errorMsg && (
          <div className="w-full max-w-md mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold text-left flex items-center space-x-2">
            <Info className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Main Authentication Card */}
        <div className="w-full max-w-md p-6 sm:p-7 rounded-3xl bg-white/95 dark:bg-[#0D121F]/90 border border-slate-200/90 dark:border-slate-800/90 backdrop-blur-2xl shadow-2xl shadow-indigo-950/5 space-y-4 mb-8 text-left transition-all">
          
          {/* Method Selection Tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-2xl text-xs font-bold mb-2">
            <button
              type="button"
              onClick={() => setLoginMethod('google')}
              className={`py-2 rounded-xl transition ${loginMethod === 'google' ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              Google Sign-In
            </button>
            <button
              type="button"
              onClick={() => setLoginMethod('imap')}
              className={`py-2 rounded-xl transition ${loginMethod === 'imap' ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              App Password (IMAP)
            </button>
          </div>

          {loginMethod === 'imap' ? (
            /* Direct IMAP App Password Form */
            <form onSubmit={handleImapLogin} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Gmail Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    placeholder="your.real.email@gmail.com"
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>Google App Password</span>
                  <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-indigo-600 dark:text-indigo-400 underline lowercase font-semibold text-[10px]">Generate App Password</a>
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={appPassword}
                    onChange={(e) => setAppPassword(e.target.value)}
                    placeholder="16-character google app password"
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Create a 16-character app password at myaccount.google.com/apppasswords to sync your real inbox directly.
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-md flex items-center justify-center space-x-2"
              >
                {loadingAction === 'imap' ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>Sync Real Gmail Inbox Now</span>
                )}
              </button>
            </form>
          ) : (
            /* Google OAuth Login Form */
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleGoogleOAuthLogin}
                disabled={isLoading}
                className="w-full py-3.5 px-4 rounded-2xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-bold text-sm flex items-center justify-center space-x-3 transition duration-200 shadow-md hover:shadow-lg hover:border-indigo-400 dark:hover:border-indigo-500 transform hover:-translate-y-0.5 disabled:opacity-60"
              >
                {loadingAction === 'google_oauth' ? (
                  <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                )}
                <span>{loadingAction === 'google_oauth' ? 'Authenticating...' : 'Sign in with Google Account'}</span>
              </button>
            </div>
          )}

          {/* Security & Permissions Footer Link */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1">
            <button
              type="button"
              onClick={() => setShowPermissions(!showPermissions)}
              className="hover:text-indigo-600 dark:hover:text-indigo-400 underline font-medium flex items-center space-x-1"
            >
              <Lock className="w-3 h-3 text-emerald-500" />
              <span>Google Permissions & Privacy</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSetupGuide(true)}
              className="hover:text-indigo-600 dark:hover:text-indigo-400 underline font-medium flex items-center space-x-1"
            >
              <HelpCircle className="w-3 h-3 text-indigo-500" />
              <span>OAuth Cloud Setup</span>
            </button>
          </div>

          {/* Expandable Google Permissions Breakdown */}
          {showPermissions && (
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] space-y-2 text-slate-600 dark:text-slate-300 animate-in fade-in">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Google OAuth 2.0 Scopes Requested:</span>
              </div>
              <ul className="space-y-1.5 pl-1">
                <li className="flex items-start space-x-2">
                  <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span><strong>gmail.readonly:</strong> Allows Gemini AI to summarize threads and extract deadlines.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span><strong>gmail.send:</strong> Allows sending AI-composed replies only after your explicit review.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span><strong>userinfo.profile:</strong> Displays your name and Google account avatar.</span>
                </li>
              </ul>
              <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-800">
                🔒 We use client-side tokens and encrypted sessions. Your Google password is never requested or stored.
              </p>
            </div>
          )}
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left w-full max-w-4xl">
          <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/40 border border-slate-200/90 dark:border-slate-800/80 shadow-xs backdrop-blur-md">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center mb-2.5">
              <Bot className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-1">AI Summarizer & Triage</h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Extracts 3-bullet points, urgency level, and detected action items from Gmail threads.</p>
          </div>

          <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/40 border border-slate-200/90 dark:border-slate-800/80 shadow-xs backdrop-blur-md">
            <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 flex items-center justify-center mb-2.5">
              <FileText className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-1">PDF Attachment OCR</h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Instantly parses invoice amounts, due dates, vendors, and contract clauses from PDF files.</p>
          </div>

          <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/40 border border-slate-200/90 dark:border-slate-800/80 shadow-xs backdrop-blur-md">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center mb-2.5">
              <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-1">Smart Tone Auto-Replies</h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Generates custom contextual drafts in Friendly, Professional, or Formal tones with 1 click.</p>
          </div>
        </div>
      </main>

      {/* Google Cloud Setup Guide Modal */}
      {showSetupGuide && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <Key className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Google OAuth Cloud Credentials</h3>
              </div>
              <button
                onClick={() => setShowSetupGuide(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs font-bold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-3 leading-relaxed">
              <p>
                To enable live Google OAuth sign-in with your own Google Cloud project:
              </p>
              <ol className="list-decimal pl-4 space-y-2 font-medium">
                <li>
                  Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-indigo-600 dark:text-indigo-400 underline inline-flex items-center gap-0.5">Google Cloud Console <ExternalLink className="w-3 h-3" /></a> and create an <strong>OAuth 2.0 Client ID</strong> (Web Application).
                </li>
                <li>
                  Add Authorized Redirect URI: <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[11px] font-mono text-indigo-600 dark:text-indigo-400">http://localhost:8000/api/auth/callback</code>
                </li>
                <li>
                  Enable the <strong>Gmail API</strong> in API Library.
                </li>
                <li>
                  Add your credentials to <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[11px] font-mono">backend/.env</code>:
                  <pre className="bg-slate-900 text-slate-200 p-2.5 rounded-xl font-mono text-[11px] mt-1.5 overflow-x-auto">
{`GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/callback`}
                  </pre>
                </li>
              </ol>
              <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/50 text-[11px] text-indigo-800 dark:text-indigo-300">
                💡 <strong>Instant Access:</strong> Built-in Google Account personas allow immediate access to all AI features without mandatory GCP client configuration.
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowSetupGuide(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="p-4 text-center text-xs text-slate-500 relative z-10 border-t border-slate-200 dark:border-slate-850">
        AI-Powered Smart Email Assistant • Google Workspace & Gemini NLP Integration
      </footer>
    </div>
  );
}

