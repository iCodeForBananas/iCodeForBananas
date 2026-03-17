'use client';

import { Note } from '../types';
import { History } from 'lucide-react';

interface EditorProps {
  note: Note | null;
  onUpdateNote: (id: string, updates: Partial<Note>) => void;
  onOpenHistory: () => void;
}

export function Editor({ note, onUpdateNote, onOpenHistory }: EditorProps) {
  if (!note) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-400 transition-colors">
        Select a note to start writing
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-slate-950 overflow-hidden relative transition-colors duration-300">
      <div className="px-8 pt-8 pb-4 border-b border-transparent focus-within:border-slate-100 dark:focus-within:border-slate-800 transition-colors flex items-start gap-4">
        <input
          type="text"
          value={note.title}
          onChange={(e) => onUpdateNote(note.id, { title: e.target.value })}
          placeholder="Untitled Note"
          className="flex-1 text-3xl font-bold text-slate-800 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-700 focus:outline-none bg-transparent"
        />
        <button
          onClick={onOpenHistory}
          className="p-2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors mt-1"
          title="Version History"
        >
          <History size={20} />
        </button>
      </div>
      <textarea
        value={note.content}
        onChange={(e) => onUpdateNote(note.id, { content: e.target.value })}
        placeholder="Start writing..."
        className="flex-1 w-full px-8 py-4 resize-none focus:outline-none font-mono text-sm leading-relaxed text-slate-700 dark:text-slate-300 bg-transparent placeholder:text-slate-400 dark:placeholder:text-slate-600"
        spellCheck={false}
      />
    </div>
  );
}
