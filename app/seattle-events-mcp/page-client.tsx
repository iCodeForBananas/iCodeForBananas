"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import BentoPageLayout from "@/app/components/BentoPageLayout";

interface SeattleEvent {
  name: string;
  venue: string;
  time: string;
  description: string;
  link: string;
}

const PAGE_SIZE = 50;

function fmtTime(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Builds a windowed page-number list with "…" gaps, e.g. [1, "…", 4, 5, 6, "…", 12]
function pageWindow(current: number, total: number): (number | "…")[] {
  const pages: (number | "…")[] = [];
  const add = (n: number) => pages.push(n);
  const span = 1;
  const start = Math.max(1, current - span);
  const end = Math.min(total, current + span);

  add(1);
  if (start > 2) pages.push("…");
  for (let n = Math.max(2, start); n <= Math.min(total - 1, end); n++) add(n);
  if (end < total - 1) pages.push("…");
  if (total > 1) add(total);

  return pages;
}

export default function SeattleEventsMcpPage() {
  const [events, setEvents] = useState<SeattleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/seattle-events?limit=1000");
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Failed to load events");
      setEvents(data.events ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const start = (clampedPage - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, events.length);
  const pageEvents = useMemo(() => events.slice(start, end), [events, start, end]);
  const pages = useMemo(() => pageWindow(clampedPage, totalPages), [clampedPage, totalPages]);

  const cellStyle = "px-3 py-2 align-top";
  const thStyle = "px-3 py-2 text-left text-xs font-bold uppercase tracking-wider";

  return (
    <BentoPageLayout title="Seattle Events MCP">
      {error && (
        <div
          className="rounded-lg p-3 mb-4 text-sm"
          style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}
        >
          {error}
        </div>
      )}

      {loading && events.length === 0 && (
        <div className="text-center py-16 text-sm" style={{ color: "var(--text-secondary)" }}>
          Loading events…
        </div>
      )}

      {!loading && events.length === 0 && !error && (
        <div className="text-center py-16 text-sm" style={{ color: "var(--text-secondary)" }}>
          No events yet.
        </div>
      )}

      {events.length > 0 && (
        <>
          <div
            className="overflow-x-auto rounded-lg"
            style={{ border: "1px solid var(--border-color)" }}
          >
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr
                  className="bg-gray-50 dark:bg-neutral-800 text-black dark:text-yellow-400"
                  style={{ borderBottom: "1px solid var(--border-color)" }}
                >
                  <th className={thStyle}>Name</th>
                  <th className={thStyle}>Venue</th>
                  <th className={thStyle}>Time</th>
                  <th className={thStyle}>Description</th>
                  <th className={thStyle}>Link</th>
                </tr>
              </thead>
              <tbody>
                {pageEvents.map((event) => (
                  <tr
                    key={event.link}
                    className="text-black dark:text-neutral-100 hover:bg-gray-50 dark:hover:bg-neutral-800/60"
                    style={{ borderTop: "1px solid var(--border-color)" }}
                  >
                    <td className={`${cellStyle} font-medium`}>{event.name}</td>
                    <td className={cellStyle}>{event.venue}</td>
                    <td className={`${cellStyle} whitespace-nowrap`}>{fmtTime(event.time)}</td>
                    <td className={`${cellStyle} max-w-xs`} title={event.description}>
                      <span className="line-clamp-2">{event.description}</span>
                    </td>
                    <td className={`${cellStyle} max-w-[10rem]`}>
                      <a
                        href={event.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={event.link}
                        className="text-blue-600 dark:text-blue-400 underline truncate block"
                      >
                        {event.link}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Showing {start + 1}–{end} of {events.length}
            </span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={clampedPage === 1}
                className="text-xs px-2.5 py-1.5 rounded font-medium disabled:opacity-40 transition-colors"
                style={{ border: "1px solid var(--border-color)", color: "var(--foreground)" }}
              >
                ← Prev
              </button>

              {pages.map((n, i) =>
                n === "…" ? (
                  <span key={`ellipsis-${i}`} className="text-xs px-1" style={{ color: "var(--text-secondary)" }}>
                    …
                  </span>
                ) : (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className="text-xs px-2.5 py-1.5 rounded font-medium transition-colors"
                    style={
                      n === clampedPage
                        ? { background: "#facc15", color: "#0a0a0a" }
                        : { border: "1px solid var(--border-color)", color: "var(--foreground)" }
                    }
                  >
                    {n}
                  </button>
                )
              )}

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={clampedPage === totalPages}
                className="text-xs px-2.5 py-1.5 rounded font-medium disabled:opacity-40 transition-colors"
                style={{ border: "1px solid var(--border-color)", color: "var(--foreground)" }}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </BentoPageLayout>
  );
}
