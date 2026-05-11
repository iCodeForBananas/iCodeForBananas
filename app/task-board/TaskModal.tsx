"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TipTapImage from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Task, Column } from "./types";

const COLUMN_OPTIONS: { value: Column; label: string }[] = [
  { value: "backlog", label: "Backlog" },
  { value: "in-progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

interface TaskModalProps {
  task: Task;
  onUpdate: (task: Task) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function TaskModal({ task, onUpdate, onDelete, onClose }: TaskModalProps) {
  const [title, setTitle] = useState(task.title);
  const [column, setColumn] = useState<Column>(task.column);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Refs so the editor's onUpdate closure always sees current values
  const titleRef = useRef(title);
  const columnRef = useRef(column);
  const taskRef = useRef(task);
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { columnRef.current = column; }, [column]);
  useEffect(() => { taskRef.current = task; }, [task]);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);

  const flush = useCallback((html?: string) => {
    onUpdateRef.current({
      ...taskRef.current,
      title: titleRef.current || "Untitled",
      body: html ?? editor?.getHTML() ?? taskRef.current.body,
      column: columnRef.current,
      updatedAt: new Date().toISOString(),
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const editor = useEditor({
    extensions: [
      StarterKit,
      TipTapImage.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({ placeholder: "Write your notes, plans, or anything here…" }),
    ],
    content: task.body || "",
    onUpdate: ({ editor }) => {
      flush(editor.getHTML());
    },
  });

  function handleTitleBlur() {
    flush();
  }

  function handleColumnChange(newCol: Column) {
    setColumn(newCol);
    columnRef.current = newCol;
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
    // Reset input so the same file can be re-selected
    e.target.value = "";
  }

  function handleDelete() {
    if (confirm(`Delete "${task.title || "this task"}"?`)) onDelete(task.id);
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col rounded-xl w-full max-w-3xl"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-dark)",
          minHeight: "70vh",
          maxHeight: "calc(100vh - 4rem)",
        }}
      >
        {/* Header row: column selector + actions */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b shrink-0"
          style={{ borderColor: "var(--border-color)" }}
        >
          <div className="flex gap-1">
            {COLUMN_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleColumnChange(opt.value)}
                className="text-xs px-2 py-1 rounded transition-all font-medium"
                style={{
                  background: column === opt.value ? "#facc15" : "var(--border-color)",
                  color: column === opt.value ? "#0a0a0a" : "#a89a00",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              className="text-xs px-2 py-1 rounded font-medium transition-opacity hover:opacity-80"
              style={{ background: "rgba(127,29,29,0.6)", color: "#fca5a5" }}
            >
              Delete
            </button>
            <button
              onClick={onClose}
              className="text-xs px-2 py-1 rounded font-medium transition-opacity hover:opacity-70"
              style={{ color: "#a89a00" }}
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* Editable title */}
        <div className="px-6 pt-5 pb-1 shrink-0">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            className="w-full bg-transparent text-2xl font-bold outline-none"
            style={{ color: "var(--text-primary)" }}
            placeholder="Task title"
          />
        </div>

        {/* Toolbar */}
        <div
          className="px-5 py-1.5 flex flex-wrap items-center gap-0.5 border-b shrink-0"
          style={{ borderColor: "var(--border-color)" }}
        >
          <ToolbarBtn
            active={editor?.isActive("heading", { level: 1 })}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
            title="Heading 1"
          >
            H1
          </ToolbarBtn>
          <ToolbarBtn
            active={editor?.isActive("heading", { level: 2 })}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading 2"
          >
            H2
          </ToolbarBtn>
          <ToolbarBtn
            active={editor?.isActive("heading", { level: 3 })}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Heading 3"
          >
            H3
          </ToolbarBtn>

          <div className="w-px h-4 mx-1 shrink-0" style={{ background: "var(--border-dark)" }} />

          <ToolbarBtn
            active={editor?.isActive("bold")}
            onClick={() => editor?.chain().focus().toggleBold().run()}
            title="Bold"
          >
            <strong>B</strong>
          </ToolbarBtn>
          <ToolbarBtn
            active={editor?.isActive("italic")}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <em>I</em>
          </ToolbarBtn>
          <ToolbarBtn
            active={editor?.isActive("strike")}
            onClick={() => editor?.chain().focus().toggleStrike().run()}
            title="Strikethrough"
          >
            <s>S</s>
          </ToolbarBtn>
          <ToolbarBtn
            active={editor?.isActive("code")}
            onClick={() => editor?.chain().focus().toggleCode().run()}
            title="Inline code"
          >
            {"</>"}
          </ToolbarBtn>

          <div className="w-px h-4 mx-1 shrink-0" style={{ background: "var(--border-dark)" }} />

          <ToolbarBtn
            active={editor?.isActive("bulletList")}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            title="Bullet list"
          >
            • List
          </ToolbarBtn>
          <ToolbarBtn
            active={editor?.isActive("orderedList")}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            title="Ordered list"
          >
            1. List
          </ToolbarBtn>

          <div className="w-px h-4 mx-1 shrink-0" style={{ background: "var(--border-dark)" }} />

          <ToolbarBtn
            active={editor?.isActive("blockquote")}
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            title="Blockquote"
          >
            ❝ Quote
          </ToolbarBtn>
          <ToolbarBtn
            active={editor?.isActive("codeBlock")}
            onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
            title="Code block"
          >
            Code block
          </ToolbarBtn>

          <div className="w-px h-4 mx-1 shrink-0" style={{ background: "var(--border-dark)" }} />

          <ToolbarBtn
            onClick={() => imageInputRef.current?.click()}
            title="Insert image"
          >
            ＋ Image
          </ToolbarBtn>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
        </div>

        {/* Editor body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <EditorContent editor={editor} className="task-board-editor" />
        </div>
      </div>
    </div>
  );
}
