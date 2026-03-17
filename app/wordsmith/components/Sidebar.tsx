'use client';

import { Plus, Trash2, LayoutTemplate, Sun, Moon } from 'lucide-react';
import { Note } from '../types';
import { cn } from '../lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface SidebarProps {
  notes: Note[];
  activeNoteId: string | null;
  onSelectNote: (id: string) => void;
  onAddNote: () => void;
  onDeleteNote: (id: string) => void;
  onOpenTemplates: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export function Sidebar({
  notes,
  activeNoteId,
  onSelectNote,
  onAddNote,
  onDeleteNote,
  onOpenTemplates,
  theme,
  onToggleTheme,
}: SidebarProps) {
  return (
    <div className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full transition-colors duration-300 shrink-0">
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <h2 className="font-semibold text-slate-800 dark:text-slate-200">Notes</h2>
        <div className="flex gap-1">
          <button
            onClick={onToggleTheme}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
          <button
            onClick={onOpenTemplates}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            title="Templates"
          >
            <LayoutTemplate size={20} />
          </button>
          <button
            onClick={onAddNote}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            title="New Note"
          >
            <Plus size={20} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {notes.length === 0 ? (
          <div className="text-center py-8 text-slate-400 dark:text-slate-600 text-sm">
            No notes yet.
            <br />
            Click + to create one.
          </div>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              onClick={() => onSelectNote(note.id)}
              className={cn(
                'group flex items-start justify-between p-3 rounded-lg cursor-pointer transition-all border border-transparent',
                activeNoteId === note.id
                  ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-900/30 shadow-sm'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
              )}
            >
              <div className="flex-1 min-w-0 pr-2">
                <h3
                  className={cn(
                    'font-medium truncate text-sm mb-1',
                    activeNoteId === note.id ? 'text-indigo-900 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'
                  )}
                >
                  {note.title || 'Untitled Note'}
                </h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                  {formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteNote(note.id);
                }}
                className={cn(
                  'opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-all text-slate-400 dark:text-slate-500',
                  activeNoteId === note.id && 'opacity-100'
                )}
                title="Delete Note"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
