'use client';

import { useState } from 'react';
import { X, Plus, Trash2, MessageSquare } from 'lucide-react';
import { Template } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface TemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: Template[];
  onCreateTemplate: (template: Template) => void;
  onDeleteTemplate: (id: string) => void;
  onUseTemplate: (template: Template) => void;
}

export function TemplateModal({
  isOpen,
  onClose,
  templates,
  onCreateTemplate,
  onDeleteTemplate,
  onUseTemplate,
}: TemplateModalProps) {
  const [view, setView] = useState<'list' | 'create'>('list');
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateContent, setNewTemplateContent] = useState('');
  const [newTemplatePrompt, setNewTemplatePrompt] = useState('');

  if (!isOpen) return null;

  const handleCreate = () => {
    if (!newTemplateName.trim()) return;
    const newTemplate: Template = {
      id: uuidv4(),
      name: newTemplateName,
      content: newTemplateContent,
      prompt: newTemplatePrompt,
    };
    onCreateTemplate(newTemplate);
    setNewTemplateName('');
    setNewTemplateContent('');
    setNewTemplatePrompt('');
    setView('list');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-semibold text-lg text-slate-800 dark:text-slate-200">
            {view === 'list' ? 'Templates' : 'Create New Template'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {view === 'list' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => setView('create')}
                  className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all group text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  <Plus size={32} className="mb-2 opacity-50 group-hover:opacity-100" />
                  <span className="font-medium">Create New Template</span>
                </button>

                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="relative group border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-indigo-200 dark:hover:border-indigo-700 hover:shadow-sm transition-all bg-white dark:bg-slate-800"
                  >
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteTemplate(template.id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
                        title="Delete Template"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-1 pr-6">{template.name}</h3>

                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-3 line-clamp-2 font-mono bg-slate-50 dark:bg-slate-700/50 p-1.5 rounded border border-slate-100 dark:border-slate-600">
                      {template.content || '(Empty content)'}
                    </div>

                    {template.prompt && (
                      <div className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 mb-3">
                        <MessageSquare size={12} />
                        <span className="truncate">Prompt: {template.prompt}</span>
                      </div>
                    )}

                    <button
                      onClick={() => onUseTemplate(template)}
                      className="w-full py-2 bg-slate-900 dark:bg-slate-700 text-white text-sm font-medium rounded-lg hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors"
                    >
                      Use Template
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Template Name
                </label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="e.g., Weekly Status Update"
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Initial Content (Optional)
                </label>
                <textarea
                  value={newTemplateContent}
                  onChange={(e) => setNewTemplateContent(e.target.value)}
                  placeholder="The text that will appear in the editor..."
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono text-sm h-32 resize-none bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  AI Prompt (Optional)
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  This instruction will be given to the AI when working on this note.
                </p>
                <textarea
                  value={newTemplatePrompt}
                  onChange={(e) => setNewTemplatePrompt(e.target.value)}
                  placeholder="e.g., Help me write in a formal, professional tone..."
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm h-24 resize-none bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setView('list')}
                  className="flex-1 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newTemplateName.trim()}
                  className="flex-1 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Create Template
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
