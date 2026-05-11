"use client";

import React from "react";
import { Task } from "./types";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractFirstImage(html: string): string | null {
  const match = html.match(/<img[^>]+src="([^"]+)"/);
  return match ? match[1] : null;
}

interface TaskCardProps {
  task: Task;
  onClick: () => void;
}

export default function TaskCard({ task, onClick }: TaskCardProps) {
  const excerpt = stripHtml(task.body).slice(0, 100);
  const thumbnail = task.coverImage || extractFirstImage(task.body);

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg p-3 transition-all"
      style={{
        background: "var(--bg-primary)",
        border: "1px solid var(--border-color)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#facc15";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-color)";
      }}
    >
      {thumbnail && (
        <div className="w-full h-24 rounded mb-2 overflow-hidden">
          <img src={thumbnail} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
        {task.title || "Untitled"}
      </div>
      {excerpt && (
        <div
          className="mt-1 text-xs leading-relaxed"
          style={{
            color: "var(--text-secondary)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {excerpt}
        </div>
      )}
    </button>
  );
}
