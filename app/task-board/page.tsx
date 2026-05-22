"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createClient } from "@/utils/supabase/client";
import BentoPageLayout from "@/app/components/BentoPageLayout";
import { useAuth } from "@/app/hooks/useAuth";
import TaskCard from "./TaskCard";
import TaskModal from "./TaskModal";
import InlineTaskEditor from "./InlineTaskEditor";
import { Task, Column } from "./types";

// ── Sortable task card ────────────────────────────────────────────────────────

function SortableTaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.25 : 1,
        cursor: isDragging ? "grabbing" : "grab",
        touchAction: "none",
      }}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} onClick={onClick} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TaskBoardPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user, loading: authLoading } = useAuth();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // ── Data ────────────────────────────────────────────────────

  useEffect(() => {
    if (!supabase || !user) { setTasks([]); return; }
    setLoadingTasks(true);
    supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setTasks(data as Task[]);
        setLoadingTasks(false);
      });
  }, [supabase, user]);

  const updateTask = useCallback(async (updated: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    if (!supabase) return;
    const { error } = await supabase
      .from("tasks")
      .update({
        title: updated.title,
        body: updated.body,
        board_column: updated.board_column,
        sort_order: updated.sort_order,
        updated_at: updated.updated_at,
      })
      .eq("id", updated.id);
    if (error) console.error("Failed to update task:", error);
  }, [supabase]);

  const deleteTask = useCallback(async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setSelectedTaskId(null);
    if (!supabase) return;
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) console.error("Failed to delete task:", error);
  }, [supabase]);

  async function addTask() {
    if (!newTitle.trim() || !supabase || !user) return;
    const visibleCount = tasks.filter((t) => t.board_column !== "done").length;
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id,
        title: newTitle.trim(),
        body: "",
        board_column: "backlog" as Column,
        sort_order: visibleCount,
      })
      .select()
      .single();
    if (error || !data) { console.error("Failed to add task:", error); return; }
    setTasks((prev) => [...prev, data as Task]);
    setNewTitle("");
    setIsAdding(false);
    setSelectedTaskId(data.id);
  }

  // ── DnD handlers ────────────────────────────────────────────

  function handleDragStart({ active }: DragStartEvent) {
    setActiveTaskId(active.id as string);
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveTaskId(null);
    if (!over || active.id === over.id) return;

    const visible = tasks
      .filter((t) => t.board_column !== "done")
      .sort((a, b) => a.sort_order - b.sort_order);

    const oldIndex = visible.findIndex((t) => t.id === active.id);
    const newIndex = visible.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(visible, oldIndex, newIndex).map((t, i) => ({ ...t, sort_order: i }));

    setTasks((prev) => {
      const done = prev.filter((t) => t.board_column === "done");
      return [...reordered, ...done];
    });

    if (!supabase) return;
    await Promise.all(
      reordered.map((t) =>
        supabase
          .from("tasks")
          .update({ sort_order: t.sort_order, updated_at: new Date().toISOString() })
          .eq("id", t.id),
      ),
    );
  }

  // ── Derived ─────────────────────────────────────────────────

  const visibleTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.board_column !== "done")
        .sort((a, b) => a.sort_order - b.sort_order),
    [tasks],
  );

  const activeTask = tasks.find((t) => t.id === activeTaskId) ?? null;
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  const copyAllTasks = useCallback(async () => {
    const active = tasks.filter((t) => t.board_column !== "done");
    if (active.length === 0) return;
    const text = active
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((t) => {
        const body = t.body
          ? t.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
          : "";
        return body ? `## ${t.title}\n\n${body}` : `## ${t.title}`;
      })
      .join("\n\n---\n\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [tasks]);

  // ── Auth guards ─────────────────────────────────────────────

  if (authLoading) {
    return (
      <main className="flex-1 flex items-center justify-center" style={{ background: "var(--bg-primary)" }}>
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Loading…</span>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-3" style={{ background: "var(--bg-primary)" }}>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Sign in to use the Task Board.</p>
        <a href="/login" className="text-sm font-semibold px-4 py-2 rounded" style={{ background: "#facc15", color: "#0a0a0a" }}>
          Sign In
        </a>
      </main>
    );
  }

  // ── Render ───────────────────────────────────────────────────

  return (
    <BentoPageLayout title='Task Board'>
      {/* Action bar */}
      <div className="flex items-center justify-end mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={copyAllTasks}
            disabled={visibleTasks.length === 0}
            className="text-sm px-4 py-2 rounded font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb" }}
          >
            {copied ? "Copied!" : "Copy All"}
          </button>
          <button
            onClick={() => { setIsAdding(true); setNewTitle(""); }}
            className="text-sm px-4 py-2 rounded font-semibold transition-opacity hover:opacity-80"
            style={{ background: "#facc15", color: "#0a0a0a" }}
          >
            + Add task
          </button>
        </div>
      </div>

      {/* Task list */}
      <div className="flex flex-col gap-2 max-w-2xl mx-auto w-full">
          {/* Inline add form */}
          {isAdding && (
            <div
              className="rounded-lg p-3 shrink-0"
              style={{ background: "#f9fafb", border: "1px solid #facc15" }}
            >
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addTask();
                  if (e.key === "Escape") { setIsAdding(false); setNewTitle(""); }
                }}
                placeholder="Task title…"
                className="w-full bg-transparent text-sm outline-none"
                style={{ color: "#111827" }}
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={addTask}
                  className="text-xs px-2 py-1 rounded font-semibold"
                  style={{ background: "#facc15", color: "#0a0a0a" }}
                >
                  Add
                </button>
                <button
                  onClick={() => { setIsAdding(false); setNewTitle(""); }}
                  className="text-xs px-2 py-1 rounded transition-opacity hover:opacity-70"
                  style={{ color: "#6b7280" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Featured first task — inline editable */}
          {visibleTasks[0] && (
            <InlineTaskEditor
              key={visibleTasks[0].id}
              task={visibleTasks[0]}
              onUpdate={updateTask}
              onExpand={() => setSelectedTaskId(visibleTasks[0].id)}
            />
          )}

          {/* Remaining tasks — sortable */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={visibleTasks.slice(1).map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {visibleTasks.slice(1).map((task) => (
                  <SortableTaskCard
                    key={task.id}
                    task={task}
                    onClick={() => setSelectedTaskId(task.id)}
                  />
                ))}
              </div>
            </SortableContext>

            <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
              {activeTask && (
                <div
                  style={{
                    transform: "scale(1.03) rotate(1deg)",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.15), 0 0 0 1px rgba(250,204,21,0.5)",
                    borderRadius: "0.5rem",
                    opacity: 0.95,
                    pointerEvents: "none",
                  }}
                >
                  <TaskCard task={activeTask} onClick={() => {}} />
                </div>
              )}
            </DragOverlay>
          </DndContext>

          {visibleTasks.length === 0 && !isAdding && (
            <div
              className="text-center py-16 text-sm select-none"
              style={{ color: "#6b7280" }}
            >
              No tasks yet — add one to get started.
            </div>
          )}
      </div>

      {/* Task detail modal */}
      {selectedTask && (
        <TaskModal
          key={selectedTask.id}
          task={selectedTask}
          onUpdate={updateTask}
          onDelete={deleteTask}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </BentoPageLayout>
  );
}
