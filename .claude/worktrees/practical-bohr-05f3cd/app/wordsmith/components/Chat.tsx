'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Loader2, Bot, User, Paperclip, X, FileText, Mic, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Message, Note, Tone } from '../types';
import { cn } from '../lib/utils';

interface ChatProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  onClearChat: () => void;
  isGenerating: boolean;
  notes: Note[];
  activeNoteId: string | null;
  attachedNoteIds: string[];
  onToggleAttachNote: (id: string) => void;
  tones: Tone[];
  activeToneId: string | null;
  onSelectTone: (id: string | null) => void;
}

export function Chat({
  messages,
  onSendMessage,
  onClearChat,
  isGenerating,
  notes,
  activeNoteId,
  attachedNoteIds,
  onToggleAttachNote,
  tones,
  activeToneId,
  onSelectTone,
}: ChatProps) {
  const [input, setInput] = useState('');
  const [isAttaching, setIsAttaching] = useState(false);
  const [isToneMenuOpen, setIsToneMenuOpen] = useState(false);
  const [isLiveWriting, setIsLiveWriting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const toneMenuRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  // Live Writing auto-submit logic
  useEffect(() => {
    if (isLiveWriting && input.trim() && !isGenerating) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onSendMessage(input);
        setInput('');
      }, 5000);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [input, isLiveWriting, isGenerating, onSendMessage]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target as Node)) {
        setIsAttaching(false);
      }
      if (toneMenuRef.current && !toneMenuRef.current.contains(event.target as Node)) {
        setIsToneMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;
    onSendMessage(input);
    setInput('');
  };

  const availableNotes = notes.filter((n) => n.id !== activeNoteId);
  const activeTone = tones.find((t) => t.id === activeToneId);

  return (
    <div className="w-80 bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col h-full transition-colors duration-300">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-100 dark:bg-indigo-900/30 rounded-md text-indigo-600 dark:text-indigo-400">
            <Sparkles size={18} />
          </div>
          <h2 className="font-semibold text-slate-800 dark:text-slate-200">AI Assistant</h2>
        </div>
        {messages.length > 0 && (
          <button
            onClick={onClearChat}
            className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8 px-4">
            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mx-auto mb-3 text-indigo-400 dark:text-indigo-500">
              <Bot size={24} />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-1">Here to help!</p>
            <p className="text-xs text-slate-400 dark:text-slate-600">
              Ask me to rewrite sections, fix grammar, or brainstorm ideas.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn('flex gap-3 text-sm', message.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
          >
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                message.role === 'user'
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
              )}
            >
              {message.role === 'user' ? <User size={14} /> : <Bot size={14} />}
            </div>
            <div
              className={cn(
                'rounded-2xl px-4 py-2.5 max-w-[85%] shadow-sm',
                message.role === 'user'
                  ? 'bg-slate-800 dark:bg-slate-700 text-white rounded-tr-none'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-700 rounded-tl-none'
              )}
            >
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}

        {isGenerating && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0 mt-0.5 animate-pulse">
              <Bot size={14} />
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex items-center gap-2">
              <Loader2 size={16} className="animate-spin text-indigo-500 dark:text-indigo-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
        {/* Attached notes & tone badges */}
        <div className="flex flex-wrap gap-2 mb-2">
          {attachedNoteIds.map((id) => {
            const note = notes.find((n) => n.id === id);
            if (!note) return null;
            return (
              <div
                key={id}
                className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs px-2 py-1 rounded-md border border-indigo-100 dark:border-indigo-800"
              >
                <FileText size={10} />
                <span className="max-w-[100px] truncate">{note.title || 'Untitled'}</span>
                <button onClick={() => onToggleAttachNote(id)} className="hover:text-indigo-900 dark:hover:text-indigo-100">
                  <X size={10} />
                </button>
              </div>
            );
          })}
          {activeTone && (
            <div className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs px-2 py-1 rounded-md border border-emerald-100 dark:border-emerald-800">
              <Mic size={10} />
              <span className="max-w-[100px] truncate">{activeTone.name}</span>
              <button onClick={() => onSelectTone(null)} className="hover:text-emerald-900 dark:hover:text-emerald-100">
                <X size={10} />
              </button>
            </div>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1.5 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all shadow-sm relative"
        >
          <div className="relative flex items-center gap-1">
            {/* Attach button */}
            <button
              type="button"
              onClick={() => setIsAttaching(!isAttaching)}
              className={cn(
                'p-2 rounded-lg transition-colors',
                isAttaching || attachedNoteIds.length > 0
                  ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              )}
              title="Attach context from other notes"
            >
              <Paperclip size={16} />
            </button>

            {/* Tone button */}
            <button
              type="button"
              onClick={() => setIsToneMenuOpen(!isToneMenuOpen)}
              className={cn(
                'p-2 rounded-lg transition-colors',
                isToneMenuOpen || activeToneId
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              )}
              title="Select Tone/Voice"
            >
              <Mic size={16} />
            </button>

            {/* Attach dropdown */}
            {isAttaching && (
              <div
                ref={attachMenuRef}
                className="absolute bottom-full left-0 mb-2 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50 flex flex-col max-h-64"
              >
                <div className="p-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Add note to context
                </div>
                <div className="overflow-y-auto flex-1 p-1">
                  {availableNotes.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400 dark:text-slate-500">No other notes available</div>
                  ) : (
                    availableNotes.map((note) => (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => {
                          onToggleAttachNote(note.id);
                          setIsAttaching(false);
                        }}
                        className={cn(
                          'w-full text-left px-3 py-2 text-sm rounded-lg flex items-center gap-2 transition-colors',
                          attachedNoteIds.includes(note.id)
                            ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                        )}
                      >
                        <FileText
                          size={14}
                          className={attachedNoteIds.includes(note.id) ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}
                        />
                        <span className="truncate flex-1">{note.title || 'Untitled Note'}</span>
                        {attachedNoteIds.includes(note.id) && <X size={12} />}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Tone dropdown */}
            {isToneMenuOpen && (
              <div
                ref={toneMenuRef}
                className="absolute bottom-full left-8 mb-2 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50 flex flex-col max-h-80"
              >
                <div className="p-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Select Voice / Tone
                </div>
                <div className="overflow-y-auto flex-1 p-1">
                  {tones.map((tone) => (
                    <button
                      key={tone.id}
                      type="button"
                      onClick={() => {
                        onSelectTone(activeToneId === tone.id ? null : tone.id);
                        setIsToneMenuOpen(false);
                      }}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm rounded-lg flex flex-col gap-0.5 transition-colors',
                        activeToneId === tone.id
                          ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-900 dark:text-emerald-100'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-medium">{tone.name}</span>
                        {activeToneId === tone.id && <X size={12} className="text-emerald-500 dark:text-emerald-400" />}
                      </div>
                      <span
                        className={cn(
                          'text-xs truncate w-full',
                          activeToneId === tone.id ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                        )}
                      >
                        {tone.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Live writing button */}
          <button
            type="button"
            onClick={() => setIsLiveWriting(!isLiveWriting)}
            className={cn(
              'p-2 rounded-lg transition-colors',
              isLiveWriting
                ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30'
                : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            )}
            title="Live Writing: Auto-submit after 5s of inactivity"
          >
            <Zap size={16} className={isLiveWriting ? 'fill-amber-500' : ''} />
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isLiveWriting ? 'Live writing active...' : 'Ask AI to edit...'}
            className="flex-1 bg-transparent px-3 py-2 text-sm focus:outline-none text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600"
            disabled={isGenerating}
          />
          <button
            type="submit"
            disabled={!input.trim() || isGenerating}
            className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      </div>
    </div>
  );
}
