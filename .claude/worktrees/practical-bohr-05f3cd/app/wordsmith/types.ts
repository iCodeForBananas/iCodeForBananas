export interface NoteVersion {
  id: string;
  noteId: string;
  content: string;
  timestamp: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  prompt?: string;
  versions?: NoteVersion[];
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

export interface Template {
  id: string;
  name: string;
  content: string;
  prompt: string;
}

export interface Tone {
  id: string;
  name: string;
  description: string;
  prompt: string;
}
