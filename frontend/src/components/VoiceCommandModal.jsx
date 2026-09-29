import React, { useState, useEffect } from 'react';
import { Mic, MicOff, X, Sparkles, Volume2, Check } from 'lucide-react';

const PRESET_COMMANDS = [
  "Read my important emails",
  "Summarize my inbox",
  "Reply to this email",
  "Search for project emails"
];

export default function VoiceCommandModal({ isOpen, onClose, onExecuteCommand }) {
  const [isListening, setIsListening] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setIsListening(true);
      setTranscript('');
      setFeedbackMsg('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectCommand = (cmdText) => {
    setTranscript(cmdText);
    setIsListening(false);
    setFeedbackMsg(`Processing: "${cmdText}"`);
    setTimeout(() => {
      onExecuteCommand && onExecuteCommand(cmdText);
      onClose();
    }, 1200);
  };

  const toggleListening = () => {
    setIsListening(!isListening);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in select-none">
      <div className="bg-[#0B0E1A] border border-indigo-500/30 rounded-3xl max-w-md w-full p-6 shadow-2xl relative flex flex-col items-center text-center space-y-6">
        
        {/* Top Close Button & Title */}
        <div className="w-full flex items-center justify-between text-slate-400 border-b border-slate-800/80 pb-3">
          <div className="flex items-center space-x-2 text-white font-bold text-sm">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>Voice Assistant</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Central Pulse Microphone Icon Container */}
        <div className="relative py-4">
          {/* Animated sound wave circles */}
          {isListening && (
            <>
              <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" />
              <div className="absolute -inset-4 rounded-full bg-purple-500/15 animate-pulse" />
            </>
          )}

          <button
            onClick={toggleListening}
            className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center shadow-2xl transition duration-300 ${
              isListening
                ? 'bg-gradient-to-tr from-indigo-600 via-purple-600 to-blue-500 text-white shadow-indigo-500/50 scale-105'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {isListening ? (
              <Mic className="w-10 h-10 animate-bounce" />
            ) : (
              <MicOff className="w-10 h-10" />
            )}
          </button>
        </div>

        {/* Status Text */}
        <div>
          <h3 className="text-xl font-black text-white tracking-tight">
            {isListening ? "Listening..." : "Microphone Paused"}
          </h3>
          <p className="text-xs text-indigo-300 font-semibold mt-1">
            {transcript ? `"${transcript}"` : "Try saying one of these commands:"}
          </p>
          {feedbackMsg && (
            <p className="text-xs font-bold text-emerald-400 mt-2 flex items-center justify-center gap-1">
              <Check className="w-3.5 h-3.5" />
              <span>{feedbackMsg}</span>
            </p>
          )}
        </div>

        {/* Preset Command Pills */}
        <div className="w-full space-y-2.5 pt-2">
          {PRESET_COMMANDS.map((cmd, idx) => (
            <button
              key={idx}
              onClick={() => handleSelectCommand(cmd)}
              className="w-full py-3 px-4 rounded-2xl bg-slate-900/90 hover:bg-indigo-950/60 border border-slate-800 hover:border-indigo-500/60 text-xs font-semibold text-slate-200 hover:text-white transition duration-200 flex items-center justify-between group"
            >
              <span>"{cmd}"</span>
              <Volume2 className="w-3.5 h-3.5 text-indigo-400 opacity-60 group-hover:opacity-100 transition" />
            </button>
          ))}
        </div>

        {/* Footer info */}
        <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-900 w-full">
          Speech synthesis powered by Web Speech NLP
        </p>
      </div>
    </div>
  );
}
