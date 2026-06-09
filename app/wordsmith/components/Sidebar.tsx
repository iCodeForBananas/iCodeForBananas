'use client';

import { Plus, Trash2, LayoutTemplate } from 'lucide-react';
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
}

export function Sidebar({
  notes,
  activeNoteId,
  onSelectNote,
  onAddNote,
  onDeleteNote,
  onOpenTemplates,
}: SidebarProps) {
  return (
    <div className="w-64 bg-white border-r border-slate-200 flex flex-col h-full shrink-0">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <h2 className="font-semibold text-slate-800">Notes</h2>
        <div className="flex gap-1">
          <button
            onClick={onOpenTemplates}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600 hover:text-slate-900"
            title="Templates"
          >
            <LayoutTemplate size={20} />
          </button>
          <button
            onClick={onAddNote}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600 hover:text-slate-900"
            title="New Note"
          >
            <Plus size={20} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {notes.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
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
                  ? 'bg-indigo-50 border-indigo-100 shadow-sm'
                  : 'hover:bg-slate-50 hover:border-slate-200'
              )}
            >
              <div className="flex-1 min-w-0 pr-2">
                <h3
                  className={cn(
                    'font-medium truncate text-sm mb-1',
                    activeNoteId === note.id ? 'text-indigo-900' : 'text-slate-700'
                  )}
                >
                  {note.title || 'Untitled Note'}
                </h3>
                <p className="text-xs text-slate-400 truncate">
                  {formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteNote(note.id);
                }}
                className={cn(
                  'opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-50 hover:text-red-600 transition-all text-slate-400',
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
