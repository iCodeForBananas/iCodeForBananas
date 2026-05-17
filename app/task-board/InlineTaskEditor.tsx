"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TipTapImage from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Task, Column } from "./types";

const COLUMN_OPTIONS: { value: Column; label: string }[] = [
  { value: "backlog", label: "Not Started" },
  { value: "in-progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

interface Props {
  task: Task;
  onUpdate: (task: Task) => void;
  onExpand: () => void;
}

export default function InlineTaskEditor({ task, onUpdate, onExpand }: Props) {
  const [title, setTitle] = useState(task.title);
  const [boardColumn, setBoardColumn] = useState<Column>(task.board_column);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const titleRef = useRef(title);
  const boardColumnRef = useRef(boardColumn);
  const taskRef = useRef(task);
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { boardColumnRef.current = boardColumn; }, [boardColumn]);
  useEffect(() => { taskRef.current = task; }, [task]);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);

  const flush = useCallback((html?: string) => {
    onUpdateRef.current({
      ...taskRef.current,
      title: titleRef.current || "Untitled",
      body: html ?? editor?.getHTML() ?? taskRef.current.body,
      board_column: boardColumnRef.current,
      updated_at: new Date().toISOString(),
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const debouncedFlush = useCallback((html: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => flush(html), 500);
  }, [flush]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TipTapImage.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({ placeholder: "Write your notes, plans, or anything here…" }),
    ],
    content: task.body || "",
    onUpdate: ({ editor }) => {
      debouncedFlush(editor.getHTML());
    },
  });

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  function handleTitleBlur() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    flush();
  }

  function handleColumnChange(newCol: Column) {
    setBoardColumn(newCol);
    boardColumnRef.current = newCol;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    flush();
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    const reader = new FileReader();
    reader.onload = () => {
      editor.chain().focus().setImage({ src: reader.result as string }).run();
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function ToolbarBtn({
    active,
    onClick,
    title: btnTitle,
    children,
  }: {
    active?: boolean;
    onClick: () => void;
    title: string;
    children: React.ReactNode;
  }) {
    return (
      <button
        onMouseDown={(e) => { e.preventDefault(); onClick(); }}
        title={btnTitle}
        className="px-2 py-1 rounded text-xs font-medium transition-all"
        style={{
          background: active ? "#facc15" : "transparent",
          color: active ? "#0a0a0a" : "#a89a00",
          border: "1px solid transparent",
        }}
        onMouseEnter={(e) => {
          if (!active) e.currentTarget.style.background = "rgba(250,204,21,0.12)";
        }}
        onMouseLeave={(e) => {
          if (!active) e.currentTarget.style.background = "transparent";
        }}
      >
        {children}
      </button>
    );
  }

  return (
    <div
      className="rounded-xl"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid #facc15",
        boxShadow: "0 0 0 2px rgba(250,204,21,0.1), 0 4px 24px rgba(0,0,0,0.25)",
      }}
    >
      {/* Header: status + expand */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b shrink-0"
        style={{ borderColor: "var(--border-color)" }}
      >
        <div className="flex gap-1">
          {COLUMN_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleColumnChange(opt.value)}
              className="text-xs px-2 py-1 rounded transition-all font-medium"
              style={{
                background: boardColumn === opt.value ? "#facc15" : "var(--border-color)",
                color: boardColumn === opt.value ? "#0a0a0a" : "#a89a00",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={onExpand}
          className="text-xs px-2 py-1 rounded font-medium transition-opacity hover:opacity-70"
          style={{ color: "#a89a00" }}
        >
          ↗ Expand
        </button>
      </div>

      {/* Editable title */}
      <div className="px-5 pt-4 pb-2 shrink-0">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          className="w-full bg-transparent text-xl font-bold outline-none"
          style={{ color: "var(--text-primary)" }}
          placeholder="Task title"
        />
      </div>

      {/* Toolbar */}
      <div
        className="px-4 py-1.5 flex flex-wrap items-center gap-0.5 border-b shrink-0"
        style={{ borderColor: "var(--border-color)" }}
      >
        <ToolbarBtn active={editor?.isActive("heading", { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">H1</ToolbarBtn>
        <ToolbarBtn active={editor?.isActive("heading", { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">H2</ToolbarBtn>
        <ToolbarBtn active={editor?.isActive("heading", { level: 3 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">H3</ToolbarBtn>
        <div className="w-px h-4 mx-1 shrink-0" style={{ background: "var(--border-dark)" }} />
        <ToolbarBtn active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()} title="Bold"><strong>B</strong></ToolbarBtn>
        <ToolbarBtn active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italic"><em>I</em></ToolbarBtn>
        <ToolbarBtn active={editor?.isActive("strike")} onClick={() => editor?.chain().focus().toggleStrike().run()} title="Strikethrough"><s>S</s></ToolbarBtn>
        <ToolbarBtn active={editor?.isActive("code")} onClick={() => editor?.chain().focus().toggleCode().run()} title="Inline code">{"</>"}</ToolbarBtn>
        <div className="w-px h-4 mx-1 shrink-0" style={{ background: "var(--border-dark)" }} />
        <ToolbarBtn active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Bullet list">• List</ToolbarBtn>
        <ToolbarBtn active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Ordered list">1. List</ToolbarBtn>
        <div className="w-px h-4 mx-1 shrink-0" style={{ background: "var(--border-dark)" }} />
        <ToolbarBtn active={editor?.isActive("blockquote")} onClick={() => editor?.chain().focus().toggleBlockquote().run()} title="Blockquote">❝ Quote</ToolbarBtn>
        <ToolbarBtn active={editor?.isActive("codeBlock")} onClick={() => editor?.chain().focus().toggleCodeBlock().run()} title="Code block">Code block</ToolbarBtn>
        <div className="w-px h-4 mx-1 shrink-0" style={{ background: "var(--border-dark)" }} />
        <ToolbarBtn onClick={() => imageInputRef.current?.click()} title="Insert image">＋ Image</ToolbarBtn>
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
      </div>

      {/* Editor body */}
      <div className="px-5 py-4 overflow-y-auto" style={{ minHeight: "180px", maxHeight: "320px" }}>
        <EditorContent editor={editor} className="task-board-editor" />
      </div>
    </div>
  );
}
