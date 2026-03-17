'use client';

import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { Chat } from './components/Chat';
import { TemplateModal } from './components/TemplateModal';
import { VersionHistory } from './components/VersionHistory';
import { Note, Message, Template, Tone, NoteVersion } from './types';

// ─── Constants ────────────────────────────────────────────────

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: 't1',
    name: 'Status Update',
    content:
      '# Status Update\n\n**Date:** \n**Project:** \n\n## Accomplishments\n- \n\n## Blockers\n- \n\n## Next Steps\n- ',
    prompt:
      'Help me write a concise and professional status update. Focus on clear achievements and actionable next steps.',
  },
  {
    id: 't2',
    name: 'Meeting Notes',
    content:
      '# Meeting Notes\n\n**Date:** \n**Attendees:** \n\n## Agenda\n1. \n\n## Discussion Points\n- \n\n## Action Items\n- [ ] ',
    prompt: 'Help me capture key decisions and action items from this meeting. Summarize discussion points clearly.',
  },
  {
    id: 't3',
    name: 'Blog Post Outline',
    content:
      '# Title: \n\n## Introduction\n- Hook: \n- Thesis: \n\n## Main Point 1\n- \n\n## Main Point 2\n- \n\n## Conclusion\n- ',
    prompt: 'Help me brainstorm and refine this blog post outline. Suggest engaging hooks and strong arguments.',
  },
];

const TONES: Tone[] = [
  {
    id: 'active-voice',
    name: 'Active Voice',
    description: 'Direct, clear, and energetic.',
    prompt:
      "Rewrite the text in active voice. Make the subject perform the action. Avoid 'to be' verbs where possible.",
  },
  {
    id: 'passive-voice',
    name: 'Passive Voice',
    description: 'More formal or objective.',
    prompt:
      'Rewrite the text in passive voice. Focus on the object or action rather than the subject.',
  },
  {
    id: 'bluf',
    name: 'BLUF (Bottom Line Up Front)',
    description: 'Military style. Conclusion first.',
    prompt:
      'Rewrite using the BLUF (Bottom Line Up Front) style. Put the most important information or conclusion at the very beginning. Be concise.',
  },
  {
    id: 'concise',
    name: 'Concise / Brief',
    description: 'Short and to the point.',
    prompt: 'Rewrite the text to be as concise as possible. Remove unnecessary words and fluff without losing meaning.',
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'Formal and business-like.',
    prompt:
      'Rewrite the text to be professional and business-appropriate. Use formal language and avoid slang.',
  },
  {
    id: 'casual',
    name: 'Casual / Friendly',
    description: 'Relaxed and approachable.',
    prompt: 'Rewrite the text to be casual and friendly. Use conversational language and a warm tone.',
  },
  {
    id: 'persuasive',
    name: 'Persuasive',
    description: 'Convincing and compelling.',
    prompt:
      'Rewrite the text to be more persuasive. Use strong verbs and compelling arguments to convince the reader.',
  },
  {
    id: 'eli5',
    name: 'ELI5 (Explain Like I\'m 5)',
    description: 'Simple and easy to understand.',
    prompt:
      "Rewrite the text to be extremely simple, as if explaining it to a 5-year-old. Avoid jargon and complex sentences.",
  },
  {
    id: 'spec-based',
    name: 'Spec Based',
    description: 'Create technical specs from verbiage.',
    prompt:
      'Transform the provided verbiage into a clear, structured technical specification. Include sections for Overview, Requirements, and Details where appropriate.',
  },
];

// ─── Page ─────────────────────────────────────────────────────

export default function WordsmithPage() {
  const [notes, setNotes] = useState<Note[]>(() => {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem('wordsmith-notes');
    const parsedNotes = saved ? JSON.parse(saved) : [];
    if (parsedNotes.length === 0) {
      const welcomeNote: Note = {
        id: uuidv4(),
        title: 'Welcome to Wordsmith',
        content:
          'This is your new writing environment.\n\nType here to start writing.\nUse the AI on the right to help you edit, rewrite, or brainstorm.\n\nTry asking the AI: "Rewrite this to be more professional" or "Fix the grammar".',
        updatedAt: new Date().toISOString(),
      };
      return [welcomeNote];
    }
    return parsedNotes;
  });

  const [templates, setTemplates] = useState<Template[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_TEMPLATES;
    const saved = localStorage.getItem('wordsmith-templates');
    return saved ? JSON.parse(saved) : DEFAULT_TEMPLATES;
  });

  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [attachedNoteIds, setAttachedNoteIds] = useState<string[]>([]);
  const [activeToneId, setActiveToneId] = useState<string | null>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const saved = localStorage.getItem('wordsmith-theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const versionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist theme
  useEffect(() => {
    localStorage.setItem('wordsmith-theme', theme);
  }, [theme]);

  // Select first note on load
  useEffect(() => {
    if (!activeNoteId && notes.length > 0) {
      setActiveNoteId(notes[0].id);
    }
  }, [notes, activeNoteId]);

  // Clear context when switching notes
  useEffect(() => {
    setAttachedNoteIds([]);
    setActiveToneId(null);
  }, [activeNoteId]);

  // Persist notes
  useEffect(() => {
    localStorage.setItem('wordsmith-notes', JSON.stringify(notes));
  }, [notes]);

  // Persist templates
  useEffect(() => {
    localStorage.setItem('wordsmith-templates', JSON.stringify(templates));
  }, [templates]);

  const activeNote = notes.find((n) => n.id === activeNoteId) || null;
  const activeTone = TONES.find((t) => t.id === activeToneId);

  // ─── Version saving ──────────────────────────────────────────

  const saveVersion = (noteId: string, content: string) => {
    setNotes((current) =>
      current.map((n) => {
        if (n.id !== noteId) return n;
        const versions = n.versions || [];
        if (versions.length > 0 && versions[0].content === content) return n;
        const newVersion: NoteVersion = {
          id: uuidv4(),
          noteId,
          content,
          timestamp: new Date().toISOString(),
        };
        return { ...n, versions: [newVersion, ...versions].slice(0, 50) };
      })
    );
  };

  useEffect(() => {
    if (!activeNote?.content) return;
    const handler = setTimeout(() => {
      saveVersion(activeNote.id, activeNote.content);
    }, 2000);
    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNote?.content]);

  // ─── Handlers ────────────────────────────────────────────────

  const handleAddNote = () => {
    const newNote: Note = {
      id: uuidv4(),
      title: 'Untitled Note',
      content: '',
      updatedAt: new Date().toISOString(),
    };
    setNotes([newNote, ...notes]);
    setActiveNoteId(newNote.id);
  };

  const handleDeleteNote = (id: string) => {
    setNotes(notes.filter((n) => n.id !== id));
    if (activeNoteId === id) setActiveNoteId(null);
  };

  const handleUpdateNote = (id: string, updates: Partial<Note>) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n))
    );
  };

  const handleCreateTemplate = (template: Template) => {
    setTemplates([...templates, template]);
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplates(templates.filter((t) => t.id !== id));
  };

  const handleUseTemplate = (template: Template) => {
    const newNote: Note = {
      id: uuidv4(),
      title: template.name,
      content: template.content,
      updatedAt: new Date().toISOString(),
      prompt: template.prompt,
    };
    setNotes([newNote, ...notes]);
    setActiveNoteId(newNote.id);
    setIsTemplateModalOpen(false);
    if (template.prompt) {
      setMessages((prev) => [
        ...prev,
        {
          id: uuidv4(),
          role: 'model',
          content: `I've created a new note based on the "${template.name}" template.\n\n**Active Prompt:** ${template.prompt}`,
          timestamp: Date.now(),
        },
      ]);
    }
  };

  const handleRestoreVersion = (version: NoteVersion) => {
    if (activeNoteId) {
      handleUpdateNote(activeNoteId, { content: version.content });
      setIsHistoryOpen(false);
      setMessages((prev) => [
        ...prev,
        {
          id: uuidv4(),
          role: 'model',
          content: `I've restored the document to the version from ${new Date(version.timestamp).toLocaleTimeString()}.`,
          timestamp: Date.now(),
        },
      ]);
    }
  };

  const handleToggleAttachNote = (id: string) => {
    setAttachedNoteIds((prev) => (prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]));
  };

  const handleSendMessage = async (content: string) => {
    const userMessage: Message = { id: uuidv4(), role: 'user', content, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMessage]);
    setIsGenerating(true);

    try {
      let systemInstruction = `You are a professional writing assistant for the "Wordsmith" app.

Your goal is to help the user write, edit, and refine their text.
The user is currently editing a document.

CURRENT DOCUMENT TITLE: "${activeNote?.title || 'Untitled'}"
CURRENT DOCUMENT CONTENT:
"""
${activeNote?.content || '(Empty)'}
"""

You can answer questions about the text, suggest improvements, or rewrite sections.

CRITICAL: If the user asks you to modify, rewrite, or update the document, you MUST provide the FULL new content of the document wrapped in <updated_document> tags.
Example:
<updated_document>
# New Title
New content here...
</updated_document>

Do not just print the new text in the chat. Wrap it in the tags so the system can automatically update the editor.`;

      if (activeNote?.prompt) {
        systemInstruction += `\n\nIMPORTANT CUSTOM INSTRUCTION FOR THIS NOTE:\n${activeNote.prompt}\n\nAlways follow this custom instruction when helping with this note.`;
      }

      if (activeTone) {
        systemInstruction += `\n\nACTIVE TONE/VOICE SETTING:\nThe user has selected the "${activeTone.name}" voice.\nINSTRUCTION: ${activeTone.prompt}\n\nApply this tone to any text you generate or rewrite.`;
      }

      if (attachedNoteIds.length > 0) {
        const attachedContent = attachedNoteIds
          .map((id) => {
            const note = notes.find((n) => n.id === id);
            return note ? `Title: ${note.title}\nContent:\n${note.content}` : '';
          })
          .filter(Boolean)
          .join('\n\n---\n\n');
        if (attachedContent) {
          systemInstruction += `\n\nADDITIONAL CONTEXT FROM OTHER NOTES:\nThe user has attached the following notes for context:\n\n${attachedContent}`;
        }
      }

      const response = await fetch('/api/wordsmith-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: `${systemInstruction}\n\nUser: ${content}` }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || response.statusText);
      }

      const data = await response.json();
      let chatContent = data.text || '';

      const updateMatch = chatContent.match(/<updated_document>([\s\S]*?)<\/updated_document>/);
      if (updateMatch && activeNoteId) {
        const newContent = updateMatch[1].trim();
        handleUpdateNote(activeNoteId, { content: newContent });
        chatContent = chatContent.replace(/<updated_document>[\s\S]*?<\/updated_document>/, '').trim();
        if (!chatContent) chatContent = "I've updated the document for you.";
      }

      setMessages((prev) => [
        ...prev,
        { id: uuidv4(), role: 'model', content: chatContent, timestamp: Date.now() },
      ]);
    } catch (error) {
      console.error('Wordsmith AI error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: uuidv4(),
          role: 'model',
          content:
            error instanceof Error
              ? `Error: ${error.message}`
              : 'Sorry, I encountered an error while processing your request.',
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  // Suppress unused ref warning
  void versionTimeoutRef;

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div
      data-theme={theme}
      className="flex h-full w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans overflow-hidden transition-colors duration-300"
    >
      <Sidebar
        notes={notes}
        activeNoteId={activeNoteId}
        onSelectNote={setActiveNoteId}
        onAddNote={handleAddNote}
        onDeleteNote={handleDeleteNote}
        onOpenTemplates={() => setIsTemplateModalOpen(true)}
        theme={theme}
        onToggleTheme={() => setTheme((p) => (p === 'light' ? 'dark' : 'light'))}
      />

      <main className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-950 shadow-sm z-0 relative transition-colors duration-300 overflow-hidden">
        <Editor note={activeNote} onUpdateNote={handleUpdateNote} onOpenHistory={() => setIsHistoryOpen(true)} />
      </main>

      <aside className="border-l border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-col shadow-xl z-10 transition-colors duration-300">
        <Chat
          messages={messages}
          onSendMessage={handleSendMessage}
          onClearChat={() => setMessages([])}
          isGenerating={isGenerating}
          notes={notes}
          activeNoteId={activeNoteId}
          attachedNoteIds={attachedNoteIds}
          onToggleAttachNote={handleToggleAttachNote}
          tones={TONES}
          activeToneId={activeToneId}
          onSelectTone={setActiveToneId}
        />
      </aside>

      <TemplateModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        templates={templates}
        onCreateTemplate={handleCreateTemplate}
        onDeleteTemplate={handleDeleteTemplate}
        onUseTemplate={handleUseTemplate}
      />

      <VersionHistory
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        note={activeNote}
        onRestoreVersion={handleRestoreVersion}
      />
    </div>
  );
}
