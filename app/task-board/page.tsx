"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import TaskCard from "./TaskCard";
import TaskModal from "./TaskModal";
import { Task, Column } from "./types";

const COLUMNS: { id: Column; label: string; hint: string }[] = [
  { id: "backlog", label: "Backlog", hint: "Priority-ordered to-do" },
  { id: "in-progress", label: "In Progress", hint: "Being worked on" },
  { id: "done", label: "Done", hint: "Completed" },
];

export default function TaskBoardPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user, loading: authLoading } = useAuth();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<Column | null>(null);
  const [newTitle, setNewTitle] = useState("");

  // Load tasks when user becomes available
  useEffect(() => {
    if (!supabase || !user) {
      setTasks([]);
      return;
    }
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

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  async function addTask(column: Column) {
    if (!newTitle.trim() || !supabase || !user) return;

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id,
        title: newTitle.trim(),
        body: "",
        board_column: column,
        sort_order: tasks.filter((t) => t.board_column === column).length,
      })
      .select()
      .single();

    if (error || !data) {
      console.error("Failed to add task:", error);
      return;
    }

    setTasks((prev) => [...prev, data as Task]);
    setNewTitle("");
    setAddingTo(null);
    setSelectedTaskId(data.id);
  }

  const updateTask = useCallback(
    async (updated: Task) => {
      // Optimistic update
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
    },
    [supabase],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      setSelectedTaskId(null);

      if (!supabase) return;
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) console.error("Failed to delete task:", error);
    },
    [supabase],
  );

  function cancelAdd() {
    setAddingTo(null);
    setNewTitle("");
  }

  // ── Auth / loading states ──────────────────────────────────

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
        <a
          href="/login"
          className="text-sm font-semibold px-4 py-2 rounded"
          style={{ background: "#facc15", color: "#0a0a0a" }}
        >
          Sign In
        </a>
      </main>
    );
  }

  // ── Board ──────────────────────────────────────────────────

  return (
    <main
      className="flex-1 flex flex-col min-h-0 overflow-hidden"
      style={{ background: "var(--bg-primary)" }}
    >
      {/* Page header */}
      <div
        className="px-5 py-3 flex items-center gap-3 shrink-0 border-b"
        style={{ borderColor: "var(--border-color)" }}
      >
        <h1
          className="text-base font-bold uppercase tracking-widest"
          style={{ color: "var(--text-primary)" }}
        >
          Task Board
        </h1>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {loadingTasks ? "Loading…" : `${tasks.length} task${tasks.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Columns */}
      <div className="flex-1 flex gap-4 p-4 overflow-x-auto min-h-0">
        {COLUMNS.map((col) => {
          const colTasks = tasks
            .filter((t) => t.board_column === col.id)
            .sort((a, b) => a.sort_order - b.sort_order);
          const isAdding = addingTo === col.id;

          return (
            <div
              key={col.id}
              className="flex flex-col rounded-lg shrink-0"
              style={{
                width: "300px",
                minWidth: "260px",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
              }}
            >
              {/* Column header */}
              <div
                className="px-4 py-3 flex items-center justify-between shrink-0 border-b"
                style={{ borderColor: "var(--border-color)" }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="font-semibold text-sm"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {col.label}
                  </span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                    style={{
                      background: "var(--border-color)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {colTasks.length}
                  </span>
                </div>
                <button
                  onClick={() => { setAddingTo(col.id); setNewTitle(""); }}
                  className="text-xs px-2 py-1 rounded font-semibold transition-opacity hover:opacity-80"
                  style={{ background: "#facc15", color: "#0a0a0a" }}
                >
                  + Add
                </button>
              </div>

              {/* Task list */}
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
                {/* Inline add form */}
                {isAdding && (
                  <div
                    className="rounded-lg p-3"
                    style={{
                      background: "var(--bg-primary)",
                      border: "1px solid #facc15",
                    }}
                  >
                    <input
                      autoFocus
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addTask(col.id);
                        if (e.key === "Escape") cancelAdd();
                      }}
                      placeholder="Task title…"
                      className="w-full bg-transparent text-sm outline-none"
                      style={{ color: "var(--text-primary)" }}
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => addTask(col.id)}
                        className="text-xs px-2 py-1 rounded font-semibold"
                        style={{ background: "#facc15", color: "#0a0a0a" }}
                      >
                        Add
                      </button>
                      <button
                        onClick={cancelAdd}
                        className="text-xs px-2 py-1 rounded transition-opacity hover:opacity-70"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {colTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={() => setSelectedTaskId(task.id)}
                  />
                ))}

                {colTasks.length === 0 && !isAdding && (
                  <div
                    className="text-xs text-center py-8 select-none"
                    style={{ color: "var(--border-dark)" }}
                  >
                    {col.hint}
                  </div>
                )}
              </div>
            </div>
          );
        })}
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
    </main>
  );
}
