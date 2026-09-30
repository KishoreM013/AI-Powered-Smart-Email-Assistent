import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../App';
import { authService } from '../services/api';
import { Mail, Shield, Chrome } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const [googleLoading, setGoogleLoading] = useState(false);
  useEffect(() => {
    if (searchParams.get('expired')) {
      addToast('Session expired. Please log in again.', 'warning');
    }
    if (searchParams.get('error') === 'auth_failed') {
      addToast('Google authentication failed. Please try again.', 'error');
    }
    if (searchParams.get('mode') === 'demo') {
      const triggerDemoLogin = async () => {
        try {
          await authService.demoLogin('demo.user@gmail.com', 'Demo Admin');
          addToast('Logged in successfully in Demo Sandbox mode!', 'success');
          navigate('/dashboard');
        } catch (err) {
          console.error(err);
          addToast('Demo login failed. Check backend connection.', 'error');
        }
      };
      triggerDemoLogin();
    }
  }, [searchParams, addToast, navigate]);

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const data = await authService.getLoginUrl();
      if (data.url) {
        if (data.url.includes('mode=demo')) {
          // Perform demo login directly without full page redirect
          await authService.demoLogin('demo.user@gmail.com', 'Demo Admin');
          addToast('Logged in successfully in Demo Sandbox mode!', 'success');
          navigate('/dashboard');
        } else {
          window.location.href = data.url;
        }
      } else {
        throw new Error('No redirect URL returned.');
      }
    } catch (err) {
      console.error(err);
      addToast('Failed to trigger Google OAuth redirect. Check console.', 'error');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex items-center justify-center p-6 relative overflow-hidden dark:bg-[#0B0F19] dark:text-white transition-colors duration-300">
      {/* Background Glows */}
      <div className="absolute w-[500px] h-[500px] rounded-full bg-indigo-500/10 blur-[120px] top-[-10%] left-[-10%] pointer-events-none dark:bg-indigo-500/5"></div>
      <div className="absolute w-[500px] h-[500px] rounded-full bg-purple-500/10 blur-[120px] bottom-[-10%] right-[-10%] pointer-events-none dark:bg-purple-500/5"></div>

      <motion.div 
        className="w-full max-w-md z-10 space-y-8"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <div className="text-center space-y-3">
          <motion.div 
            className="inline-flex p-4 rounded-2xl bg-indigo-50 text-indigo-600 mb-2 border border-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <Mail className="h-8 w-8" />
          </motion.div>
          
          <h2 className="text-3xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white">
            Access Smart Workspace
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
            Securely connect your Google Gmail account to start managing your inbox with NLP & AI
          </p>
        </div>

        {/* Clean Light-theme Card */}
        <motion.div 
          className="bg-white border border-slate-200/80 shadow-xl rounded-2xl p-8 space-y-6 dark:bg-slate-900/60 dark:border-slate-800/50 dark:shadow-2xl dark:shadow-black/20"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          <div className="space-y-4">
            <button
              onClick={handleGoogleLogin}
              disabled={googleLoading}
              className="w-full py-3.5 px-4 rounded-xl bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950 font-semibold flex items-center justify-center gap-3 transition-all duration-200 hover:shadow-lg shadow-slate-900/10 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              <Chrome className="h-5 w-5 text-indigo-500 dark:text-indigo-600" />
              <span>{googleLoading ? 'Redirecting to Google...' : 'Connect Google Gmail'}</span>
            </button>
          </div>

          <div className="pt-2 text-center text-xs text-slate-400 dark:text-slate-500 flex items-center justify-center gap-2 border-t border-slate-100 dark:border-slate-800/40">
            <Shield className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
            <span>OAuth 2.0 ensures secure, authorized access. We never store your Google password.</span>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
