'use client';

import { History, RotateCcw, X, Clock } from 'lucide-react';
import { Note, NoteVersion } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../lib/utils';

interface VersionHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  note: Note | null;
  onRestoreVersion: (version: NoteVersion) => void;
}

export function VersionHistory({ isOpen, onClose, note, onRestoreVersion }: VersionHistoryProps) {
  if (!isOpen || !note) return null;

  const versions = note.versions || [];
  const sortedVersions = [...versions].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-end z-50">
      <div className="bg-white dark:bg-slate-900 h-full w-full max-w-md shadow-xl flex flex-col border-l border-slate-200 dark:border-slate-700">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <History size={20} className="text-slate-500 dark:text-slate-400" />
            <h2 className="font-semibold text-lg text-slate-800 dark:text-slate-200">Version History</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-900/50">
          {sortedVersions.length === 0 ? (
            <div className="text-center py-12 text-slate-400 dark:text-slate-500">
              <Clock size={48} className="mx-auto mb-4 opacity-20" />
              <p>No history available yet.</p>
              <p className="text-xs mt-1">Edits are saved automatically.</p>
            </div>
          ) : (
            sortedVersions.map((version) => (
              <div
                key={version.id}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm hover:border-indigo-200 dark:hover:border-indigo-700 transition-colors group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Clock size={12} />
                    {formatDistanceToNow(new Date(version.timestamp), { addSuffix: true })}
                  </span>
                  <button
                    onClick={() => onRestoreVersion(version)}
                    className={cn(
                      'text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200',
                      'flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity',
                      'bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-md'
                    )}
                  >
                    <RotateCcw size={12} />
                    Restore
                  </button>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 font-mono bg-slate-50 dark:bg-slate-700/50 p-2 rounded border border-slate-100 dark:border-slate-600 max-h-32 overflow-hidden relative">
                  {version.content || <span className="italic text-slate-400 dark:text-slate-500">(Empty)</span>}
                  <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-slate-50 dark:from-slate-700/50 to-transparent pointer-events-none" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
