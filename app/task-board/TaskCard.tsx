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

const STATUS_LABEL: Record<string, string> = {
  "backlog": "Not Started",
  "in-progress": "In Progress",
};

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  "backlog": { background: "#f3f4f6", color: "#6b7280" },
  "in-progress": { background: "#fef9c3", color: "#854d0e" },
};

export default function TaskCard({ task, onClick }: TaskCardProps) {
  const excerpt = stripHtml(task.body).slice(0, 100);
  const thumbnail = extractFirstImage(task.body);
  const statusLabel = STATUS_LABEL[task.board_column];
  const statusStyle = STATUS_STYLE[task.board_column];

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl p-5 transition-all"
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#facc15";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#e5e7eb";
      }}
    >
      {thumbnail && (
        <div className="w-full h-24 rounded mb-2 overflow-hidden">
          <img src={thumbnail} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-lg" style={{ color: "#111827" }}>
          {task.title || "Untitled"}
        </div>
        {statusLabel && (
          <span
            className="shrink-0 text-sm px-3 py-1 rounded-full font-medium"
            style={statusStyle}
          >
            {statusLabel}
          </span>
        )}
      </div>
      {excerpt && (
        <div
          className="mt-2 text-base leading-relaxed"
          style={{
            color: "#6b7280",
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
