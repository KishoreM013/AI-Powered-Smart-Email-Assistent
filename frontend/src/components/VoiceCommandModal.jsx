import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, X, Sparkles, Volume2, Send } from 'lucide-react';

const PRESET_COMMANDS = [
  'Read my important emails',
  'Summarize my inbox',
  'Reply to this email',
  'Search for project emails'
];

const SPEECH_ERRORS = {
  'not-allowed': 'Microphone permission was denied. Enable microphone access for this site in browser settings, then tap the mic again.',
  'service-not-allowed': 'Voice input is blocked by browser settings. Check microphone and speech permissions, then try again.',
  'no-speech': 'No speech was detected. Try again or type a command below.',
  'audio-capture': 'No microphone was found. Connect a microphone or type a command below.',
  network: 'Speech recognition could not connect. Check your connection or type a command below.'
};

export default function VoiceCommandModal({
  isOpen,
  onClose,
  onExecuteCommand,
  language = 'en'
}) {
  const recognitionRef = useRef(null);
  const requestIdRef = useRef(0);
  const onCloseRef = useRef(onClose);
  const onExecuteRef = useRef(onExecuteCommand);
  const [isListening, setIsListening] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [commandText, setCommandText] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    onCloseRef.current = onClose;
    onExecuteRef.current = onExecuteCommand;
  }, [onClose, onExecuteCommand]);

  const stopListening = useCallback(() => {
    requestIdRef.current += 1;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        recognition.stop();
      }
    }
    setIsListening(false);
    setIsRequestingPermission(false);
  }, []);

  const executeCommand = useCallback((rawCommand) => {
    const command = rawCommand.trim();
    if (!command) return;
    stopListening();
    setTranscript(command);
    setCommandText(command);
    setErrorMessage('');
    setStatusMessage(`Running: "${command}"`);
    onExecuteRef.current?.(command);
    onCloseRef.current?.();
  }, [stopListening]);

  const startListening = useCallback(async () => {
    stopListening();
    const requestId = ++requestIdRef.current;
    setErrorMessage('');
    setStatusMessage('');
    setTranscript('');
    setIsRequestingPermission(true);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access requires a secure connection. Open the app over HTTPS and try again.');
      }

      const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphone.getTracks().forEach((track) => track.stop());
      if (requestId !== requestIdRef.current) return;

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setIsRequestingPermission(false);
        setErrorMessage('Voice input could not start in this browser. You can still type a command below.');
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = language === 'ta' ? 'ta-IN' : 'en-US';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;

      recognition.onstart = () => {
        setIsRequestingPermission(false);
        setIsListening(true);
        setStatusMessage('Microphone is on. Say a command.');
      };
      recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const text = result[0]?.transcript || '';
          if (result.isFinal) finalTranscript += text;
          else interimTranscript += text;
        }
        const recognized = (finalTranscript || interimTranscript).trim();
        if (recognized) {
          setTranscript(recognized);
          setCommandText(recognized);
        }
        if (finalTranscript.trim()) executeCommand(finalTranscript);
      };
      recognition.onerror = (event) => {
        if (recognitionRef.current !== recognition) return;
        recognitionRef.current = null;
        setIsRequestingPermission(false);
        setIsListening(false);
        setErrorMessage(SPEECH_ERRORS[event.error] || `Voice input failed (${event.error}). Tap the microphone to retry or type a command.`);
      };
      recognition.onend = () => {
        if (recognitionRef.current !== recognition) return;
        recognitionRef.current = null;
        setIsRequestingPermission(false);
        setIsListening(false);
      };

      recognition.start();
      setIsRequestingPermission(false);
      setIsListening(true);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setIsRequestingPermission(false);
      setIsListening(false);
      const permissionDenied = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError';
      setErrorMessage(permissionDenied
        ? SPEECH_ERRORS['not-allowed']
        : error instanceof Error
          ? error.message
          : 'Could not start voice input. Tap the microphone to retry or type a command.');
    }
  }, [executeCommand, language, stopListening]);

  useEffect(() => {
    if (!isOpen) {
      stopListening();
      return undefined;
    }

    setIsListening(false);
    setTranscript('');
    setCommandText('');
    setStatusMessage('');
    setErrorMessage('');
    return stopListening;
  }, [isOpen, stopListening]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/85 p-3 backdrop-blur-md animate-fade-in sm:p-4">
      <div className="relative my-auto flex max-h-[94dvh] w-full max-w-md flex-col items-center space-y-5 overflow-y-auto rounded-3xl border border-indigo-500/30 bg-[#0B0E1A] p-4 text-center shadow-2xl sm:space-y-6 sm:p-6">
        <div className="flex w-full items-center justify-between border-b border-slate-800/80 pb-3 text-slate-400">
          <div className="flex items-center space-x-2 text-sm font-bold text-white">
            <Sparkles className="h-4 w-4 text-indigo-400" />
            <span>Voice Assistant</span>
          </div>
          <button
            onClick={() => {
              stopListening();
              onClose();
            }}
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Close voice assistant"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative py-2">
          {isListening && (
            <>
              <div className="absolute inset-0 animate-ping rounded-full bg-indigo-500/20" />
              <div className="absolute -inset-4 animate-pulse rounded-full bg-purple-500/15" />
            </>
          )}
          <button
            onClick={isListening ? stopListening : startListening}
            className={`relative z-10 flex h-24 w-24 items-center justify-center rounded-full shadow-2xl transition duration-300 ${
              isListening
                ? 'scale-105 bg-gradient-to-tr from-indigo-600 via-purple-600 to-blue-500 text-white shadow-indigo-500/50'
                : 'border border-slate-700 bg-slate-800 text-slate-300 hover:text-white'
            }`}
            disabled={isRequestingPermission}
            aria-label={isListening ? 'Stop listening' : 'Allow microphone access and start listening'}
          >
            {isListening || isRequestingPermission
              ? <Mic className="h-10 w-10 animate-bounce" />
              : <MicOff className="h-10 w-10" />}
          </button>
        </div>

        <div className="w-full">
          <h3 className="text-xl font-black tracking-tight text-white">
            {isRequestingPermission
              ? 'Requesting microphone access...'
              : isListening
                ? 'Listening...'
                : 'Tap the microphone to start'}
          </h3>
          <p aria-live="polite" className="mt-1 min-h-5 break-words text-xs font-semibold text-indigo-300">
            {transcript || 'Allow microphone access when your browser asks, then say a command.'}
          </p>
          {statusMessage && <p className="mt-2 break-words text-xs text-emerald-300">{statusMessage}</p>}
          {errorMessage && <p role="alert" className="mt-2 break-words text-xs text-rose-300">{errorMessage}</p>}
        </div>

        <form
          className="flex w-full gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            executeCommand(commandText);
          }}
        >
          <input
            value={commandText}
            onChange={(event) => setCommandText(event.target.value)}
            placeholder="Type a command..."
            aria-label="Type a voice command"
            className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!commandText.trim()}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Run
          </button>
        </form>

        <div className="w-full space-y-2">
          <p className="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">Try a command</p>
          {PRESET_COMMANDS.map((command) => (
            <button
              key={command}
              onClick={() => executeCommand(command)}
              className="group flex w-full items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/90 px-4 py-3 text-left text-xs font-semibold text-slate-200 transition hover:border-indigo-500/60 hover:bg-indigo-950/60 hover:text-white"
            >
              <span>{command}</span>
              <Volume2 className="h-3.5 w-3.5 shrink-0 text-indigo-400 opacity-60 transition group-hover:opacity-100" />
            </button>
          ))}
        </div>

        <p className="w-full border-t border-slate-900 pt-3 text-[11px] text-slate-500">
          Tap the microphone and allow access in your browser’s permission prompt. You can type a command anytime.
        </p>
      </div>
    </div>
  );
}
