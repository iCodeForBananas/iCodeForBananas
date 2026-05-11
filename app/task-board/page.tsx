"use client";

import React, { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import TaskCard from "./TaskCard";
import TaskModal from "./TaskModal";
import { Task, Column } from "./types";

const STORAGE_KEY = "icfb-task-board";

const COLUMNS: { id: Column; label: string; hint: string }[] = [
  { id: "backlog", label: "Backlog", hint: "Priority-ordered to-do" },
  { id: "in-progress", label: "In Progress", hint: "Being worked on" },
  { id: "done", label: "Done", hint: "Completed" },
];

export default function TaskBoardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<Column | null>(null);
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setTasks(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      // ignore
    }
  }, [tasks]);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  function addTask(column: Column) {
    if (!newTitle.trim()) return;
    const task: Task = {
      id: uuidv4(),
      title: newTitle.trim(),
      body: "",
      column,
      order: tasks.filter((t) => t.column === column).length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setTasks((prev) => [...prev, task]);
    setNewTitle("");
    setAddingTo(null);
    setSelectedTaskId(task.id);
  }

  const updateTask = useCallback((updated: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setSelectedTaskId(null);
  }, []);

  function cancelAdd() {
    setAddingTo(null);
    setNewTitle("");
  }

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
          {tasks.length} task{tasks.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Columns */}
      <div className="flex-1 flex gap-4 p-4 overflow-x-auto min-h-0">
        {COLUMNS.map((col) => {
          const colTasks = tasks
            .filter((t) => t.column === col.id)
            .sort((a, b) => a.order - b.order);
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
                  onClick={() => {
                    setAddingTo(col.id);
                    setNewTitle("");
                  }}
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

      {/* Task detail modal — keyed by id so it remounts on task switch */}
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
