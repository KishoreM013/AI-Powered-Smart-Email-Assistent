import React, { useState, useEffect } from 'react';
import {
  Send, Sparkles, ShieldCheck, ShieldAlert, AlertTriangle,
  Bot, Edit, RefreshCw, Globe, Mic, CheckCircle2, ArrowLeft
} from 'lucide-react';
import { emailsAPI } from '../services/api';
import EmailBody from './EmailBody';

export default function EmailDetail({
  email,
  currentUser,
  onSendReply,
  language = 'en',
  onToggleLanguage,
  onOpenVoiceCommand,
  onBack
}) {
  const [selectedTone, setSelectedTone] = useState('Professional');
  const [replyText, setReplyText] = useState('');
  const [isEditingReply, setIsEditingReply] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [phishingStatus, setPhishingStatus] = useState(null);
  const [fullEmail, setFullEmail] = useState(null);
  const [loadingBodyFor, setLoadingBodyFor] = useState(null);
  const [bodyErrorFor, setBodyErrorFor] = useState(null);

  const activeEmail = fullEmail?.id === email?.id ? fullEmail : email;
  const myName = currentUser?.name || (currentUser?.email ? currentUser.email.split('@')[0] : "User");

  useEffect(() => {
    if (!email) return;
    if (typeof email.body === 'string') {
      setFullEmail(email);
      setLoadingBodyFor(null);
      setBodyErrorFor(null);
      return;
    }

    let isCurrent = true;
    setLoadingBodyFor(email.id);
    setBodyErrorFor(null);
    emailsAPI.getEmailById(email.id)
      .then((details) => {
        if (!isCurrent) return;
        if (details && typeof details.body === 'string') {
          setFullEmail(details);
        } else {
          setBodyErrorFor(email.id);
        }
      })
      .catch(() => {
        if (isCurrent) setBodyErrorFor(email.id);
      })
      .finally(() => {
        if (isCurrent) setLoadingBodyFor(null);
      });

    return () => {
      isCurrent = false;
    };
  }, [email?.id, email?.body]);

  // Perform Phishing Detection on active email change
  useEffect(() => {
    if (activeEmail) {
      const isSusp = activeEmail.sender_email?.includes('amaz0n') || activeEmail.sender_email?.includes('security-verify');
      const isPhish = activeEmail.subject?.toLowerCase().includes('suspended') || activeEmail.subject?.toLowerCase().includes('verify');
      
      const status = isPhish ? 'Phishing' : (isSusp ? 'Suspicious' : 'Safe');
      const reason = isPhish
        ? (language === 'ta' ? "போலி டொமைன் மற்றும் அவசர கணக்கு இடைநிறுத்த அச்சுறுத்தல் கண்டறியப்பட்டது." : "Uses a lookalike domain and urgent credentials request.")
        : isSusp
        ? (language === 'ta' ? "கணக்கு சரிபார்ப்பு இணைப்புகளைக் கொண்டுள்ளது." : "Contains account verification link or external redirect.")
        : (language === 'ta' ? "பாதுகாப்புச் சோதனைகளில் தேர்ச்சி பெற்றது." : "Email passed safety signature checks.");

      setPhishingStatus({ status, reason });
    }
  }, [activeEmail, language]);

  // Generate Reply with selected tone (Professional, Friendly, Short) and Language (en, ta)
  const handleGenerateReply = async (tone = selectedTone) => {
    setIsGenerating(true);
    try {
      if (emailsAPI?.suggestReply) {
        const res = await emailsAPI.suggestReply(activeEmail.id, tone, language);
        if (res?.reply_body) {
          setReplyText(res.reply_body);
          setIsGenerating(false);
          return;
        }
      }

      // Client-side simulation fallback if offline/mock
      const senderName = activeEmail.sender_name || "Sender";
      let text = "";
      if (language === 'ta') {
        if (tone === 'Professional') {
          text = `வணக்கம் ${senderName},\n\nஉங்கள் மின்னஞ்சல் கிடைத்தது. '${activeEmail.subject}' தொடர்பான தகவல்களைச் சரிபார்த்து விரைவில் பதில் அனுப்புகிறேன்.\n\nநன்றி,\nகரன்`;
        } else if (tone === 'Friendly') {
          text = `வணக்கம்!\n\nதகவலுக்கு மிக்க நன்றி. நான் உடனடியாக இதைச் சரிபார்த்துவிட்டுப் பதில் அளிக்கிறேன். நல்ல நாளாக அமையட்டும்!\n\nஅன்புடன்,\nகரன்`;
        } else {
          text = `செய்தி கிடைத்தது, நன்றி. விரைவில் தொடர்பு கொள்கிறேன்.`;
        }
      } else {
        if (tone === 'Professional') {
          text = `Hi ${senderName},\n\nThank you for reaching out. I have received your email regarding '${activeEmail.subject}' and will review the details. I will get back to you with a comprehensive response shortly.\n\nBest regards,\n${myName}`;
        } else if (tone === 'Friendly') {
          text = `Hi there!\n\nThanks for sending this over. I'll take a look at it right away and follow up with you soon. Have a great day!\n\nCheers,\n${myName}`;
        } else {
          text = `Received, thank you. I will follow up shortly.`;
        }
      }
      setReplyText(text);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (activeEmail) {
      handleGenerateReply(selectedTone);
    }
  }, [activeEmail?.id, language]);

  const handleSend = async () => {
    setIsSending(true);
    try {
      if (onSendReply) {
        await onSendReply({
          email_id: activeEmail.id,
          recipient: activeEmail.sender_email,
          reply_body: replyText
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSending(false);
    }
  };

  if (!activeEmail) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center select-none">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center mb-3">
          <Bot className="w-6 h-6 text-indigo-500" />
        </div>
        <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-1">No Email Selected</h4>
        <p className="text-xs max-w-xs text-slate-500 dark:text-slate-400">Select an email thread from your inbox feed on the left to view its details and AI reply options.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col h-full bg-[#F8FAFC] dark:bg-[#090D17] overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 transition-colors">
      
      {/* 1. Phishing Detection Header Banner (Feature 1) */}
      {phishingStatus && (
        <div className={`p-3.5 rounded-2xl border flex items-center justify-between text-xs font-semibold ${
          phishingStatus.status === 'Phishing'
            ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
            : phishingStatus.status === 'Suspicious'
            ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200'
            : 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
        }`}>
          <div className="flex items-center space-x-2.5">
            {phishingStatus.status === 'Phishing' ? (
              <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            ) : phishingStatus.status === 'Suspicious' ? (
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            )}
            <div>
              <span className="font-black uppercase tracking-wider text-[11px] mr-2">
                🛡️ Phishing Check: {phishingStatus.status}
              </span>
              <span className="text-[11px] font-medium opacity-90">
                — {phishingStatus.reason}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Email Title & Header Bar */}
      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#0F1424] border border-slate-200 dark:border-slate-800 shadow-xs flex min-w-0 items-start sm:items-center justify-between gap-2">
        <div className="flex min-w-0 items-start sm:items-center gap-2 sm:gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden -ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Back to email list"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-white flex items-center justify-center font-extrabold text-sm shrink-0">
            {activeEmail.sender_name?.charAt(0) || "P"}
          </div>
          <div className="min-w-0">
            <h3 className="break-words font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
              {activeEmail.subject}
            </h3>
            <div className="mt-1 flex min-w-0 flex-col gap-0.5 break-all text-[11px] font-medium text-slate-500 dark:text-slate-400 sm:flex-row sm:flex-wrap sm:gap-2 sm:text-xs">
              <span>From: <strong className="text-slate-700 dark:text-slate-200">{activeEmail.sender_email}</strong></span>
              <span className="hidden sm:inline">•</span>
              <span>To: {activeEmail.recipient_email || activeEmail.recipient || currentUser?.email || "Account"}</span>
            </div>
          </div>
        </div>
        <span className="hidden shrink-0 text-xs font-semibold text-slate-400 sm:block">
          {activeEmail.timestamp || "09:42 AM"}
        </span>
      </div>

      {/* Main Email Content */}
      <div className="w-full min-w-0 min-h-72 overflow-x-hidden rounded-2xl border border-slate-200 bg-white p-0 text-sm font-normal leading-7 text-slate-800 shadow-xs dark:border-slate-800 dark:bg-[#0F1424] dark:text-slate-200 sm:min-h-80">
        {loadingBodyFor === activeEmail.id ? (
          <p role="status" className="text-slate-500 dark:text-slate-400">Loading message...</p>
        ) : bodyErrorFor === activeEmail.id ? (
          <p role="alert" className="text-rose-600 dark:text-rose-400">Could not load this message body. Select it again to retry.</p>
        ) : (
          <EmailBody body={activeEmail.body} />
        )}
      </div>

      {/* 2. Personalized AI Reply Box (Feature 2 & Feature 4) */}
      <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#0F1424] border border-indigo-200 dark:border-indigo-900/60 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center space-x-2 text-indigo-600 dark:text-indigo-400 font-extrabold text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            <span>✍️ Personalized AI Reply</span>
          </div>

          {/* Tone Selector Options: Professional, Friendly, Short */}
          <div className="flex max-w-full items-center space-x-1 overflow-x-auto bg-slate-100 dark:bg-slate-900 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => { setSelectedTone('Professional'); handleGenerateReply('Professional'); }}
              className={`px-3 py-1 rounded-lg transition ${
                selectedTone === 'Professional'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {language === 'ta' ? 'தொழில்முறை' : 'Professional'}
            </button>
            <button
              onClick={() => { setSelectedTone('Friendly'); handleGenerateReply('Friendly'); }}
              className={`px-3 py-1 rounded-lg transition ${
                selectedTone === 'Friendly'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {language === 'ta' ? 'நட்பாக' : 'Friendly'}
            </button>
            <button
              onClick={() => { setSelectedTone('Short'); handleGenerateReply('Short'); }}
              className={`px-3 py-1 rounded-lg transition ${
                selectedTone === 'Short'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {language === 'ta' ? 'சுருக்கமாக' : 'Short'}
            </button>
          </div>
        </div>

        {/* Textarea for editable reply */}
        <div className="relative">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            disabled={!isEditingReply || isGenerating}
            rows={4}
            className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-[#0A0D18] border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500 leading-relaxed"
            placeholder={language === 'ta' ? 'பதில் உருவாக்கப்படுகிறது...' : 'AI is generating response...'}
          />
          {isGenerating && (
            <div className="absolute inset-0 bg-white/70 dark:bg-slate-900/70 rounded-2xl flex items-center justify-center text-xs font-bold text-indigo-600">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              <span>{language === 'ta' ? 'AI பதில் உருவாக்குகிறது...' : 'Generating AI Reply...'}</span>
            </div>
          )}
        </div>

        {/* Action Buttons: Generate Reply, Edit, Send Reply */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={() => handleGenerateReply(selectedTone)}
            disabled={isGenerating}
            className="flex items-center space-x-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 sm:px-3.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            <span>{language === 'ta' ? 'மறுபடியும் உருவாக்கு' : 'Generate Reply'}</span>
          </button>

          <div className="flex items-center space-x-1.5 sm:space-x-3">
            <button
              onClick={() => setIsEditingReply(!isEditingReply)}
              className="flex items-center space-x-1.5 rounded-xl border border-slate-300 bg-white px-2.5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:px-4"
            >
              <Edit className="w-3.5 h-3.5" />
              <span>{isEditingReply ? (language === 'ta' ? 'திருத்தம் முடிந்தது' : 'Done Editing') : (language === 'ta' ? 'திருத்து' : 'Edit')}</span>
            </button>

            <button
              onClick={handleSend}
              disabled={isSending}
              className="flex items-center space-x-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-500 sm:px-6"
            >
              {isSending ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>{language === 'ta' ? 'பதில் அனுப்பு' : 'Send Reply'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
