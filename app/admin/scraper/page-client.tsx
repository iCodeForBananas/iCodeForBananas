"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import BentoPageLayout from "@/app/components/BentoPageLayout";
import { Plus, Pencil, Trash2, RefreshCw, X } from "lucide-react";

interface ScraperSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  last_scraped_at: string | null;
  last_status: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface ScrapeResult {
  id: string;
  name: string;
  url: string;
  status: "success" | "error";
  error?: string;
  detail?: string;
}

interface RunReport {
  summary: { total: number; succeeded: number; failed: number } | null;
  results: ScrapeResult[];
  fatalError: string | null;
  stack?: string;
}

// The route always answers with JSON, but a crash upstream (proxy, build error, auth redirect)
// can still return HTML. Surface that body instead of a bare "Unexpected token '<'".
async function parseJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const snippet = text.trim().slice(0, 500) || "(empty response body)";
    throw new Error(`HTTP ${res.status} ${res.statusText} — server returned non-JSON: ${snippet}`);
  }
}

function fmtTime(s: string | null): string {
  if (!s) return "Never";
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

// Plain-text version of the run report, for pasting into a bug report or an LLM.
function formatRunReport(report: RunReport): string {
  const lines: string[] = [];
  if (report.summary) {
    lines.push(
      `Scrape run: ${report.summary.succeeded}/${report.summary.total} succeeded, ${report.summary.failed} failed`
    );
  }
  if (report.fatalError) {
    lines.push(`FATAL: ${report.fatalError}`);
    if (report.stack) lines.push(report.stack);
  }
  for (const r of report.results) {
    lines.push(`[${r.status}] ${r.name} — ${r.url}`);
    if (r.error) lines.push(`  ${r.error}`);
    if (r.detail) lines.push(`  ${r.detail}`);
  }
  return lines.join("\n");
}

export default function ScraperAdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [sources, setSources] = useState<ScraperSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [runReport, setRunReport] = useState<RunReport | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const sb = createClient();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => setAuthToken(data.session?.access_token ?? null));
    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      setAuthToken(session?.access_token ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Success toasts auto-dismiss; errors stay put so they can be read and copied.
  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    if (type === "success") setTimeout(() => setMessage(null), 4000);
  };

  const load = useCallback(async (token: string | null) => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/scraper/sources", { headers: { Authorization: `Bearer ${token}` } });
      const data = await parseJsonResponse(res);
      if (!data.success) throw new Error((data.error as string) ?? "Failed to load sources");
      setSources((data.sources as ScraperSource[]) ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sources");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authToken) load(authToken);
  }, [authToken, load]);

  const openAddForm = () => {
    setEditingId(null);
    setFormName("");
    setFormUrl("");
    setFormEnabled(true);
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = (source: ScraperSource) => {
    setEditingId(source.id);
    setFormName(source.name);
    setFormUrl(source.url);
    setFormEnabled(source.enabled);
    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setFormError(null);
  };

  const submitForm = async () => {
    if (!authToken) return;
    if (!formName.trim() || !formUrl.trim()) {
      setFormError("Name and URL are required.");
      return;
    }
    setFormSaving(true);
    setFormError(null);
    try {
      const res = await fetch(editingId ? `/api/scraper/sources/${editingId}` : "/api/scraper/sources", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ name: formName.trim(), url: formUrl.trim(), enabled: formEnabled }),
      });
      const data = await parseJsonResponse(res);
      if (!data.success) throw new Error((data.error as string) ?? "Failed to save source");
      closeForm();
      showMessage("success", editingId ? "Source updated." : "Source added.");
      load(authToken);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save source");
    } finally {
      setFormSaving(false);
    }
  };

  const toggleEnabled = async (source: ScraperSource) => {
    if (!authToken) return;
    setSources((prev) => prev.map((s) => (s.id === source.id ? { ...s, enabled: !s.enabled } : s)));
    try {
      const res = await fetch(`/api/scraper/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ enabled: !source.enabled }),
      });
      const data = await parseJsonResponse(res);
      if (!data.success) throw new Error((data.error as string) ?? "Failed to update source");
    } catch (e) {
      setSources((prev) => prev.map((s) => (s.id === source.id ? { ...s, enabled: source.enabled } : s)));
      showMessage("error", e instanceof Error ? e.message : "Failed to update source");
    }
  };

  const deleteSource = async (source: ScraperSource) => {
    if (!authToken) return;
    if (!confirm(`Delete "${source.name}"?`)) return;
    try {
      const res = await fetch(`/api/scraper/sources/${source.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await parseJsonResponse(res);
      if (!data.success) throw new Error((data.error as string) ?? "Failed to delete source");
      setSources((prev) => prev.filter((s) => s.id !== source.id));
      showMessage("success", "Source deleted.");
    } catch (e) {
      showMessage("error", e instanceof Error ? e.message : "Failed to delete source");
    }
  };

  const runNow = async () => {
    if (!authToken) return;
    setRunning(true);
    setRunReport(null);
    setMessage(null);
    try {
      const res = await fetch("/api/scraper/run", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await parseJsonResponse(res);

      if (!data.success) {
        setRunReport({
          summary: null,
          results: [],
          fatalError: (data.error as string) ?? `Scrape run failed (HTTP ${res.status} ${res.statusText})`,
          stack: data.stack as string | undefined,
        });
        return;
      }

      const summary = data.summary as RunReport["summary"];
      const results = (data.results as ScrapeResult[]) ?? [];
      setRunReport({ summary, results, fatalError: null });

      if (summary && summary.failed === 0) {
        showMessage("success", `Scrape run complete: ${summary.succeeded}/${summary.total} succeeded.`);
      }
      load(authToken);
    } catch (e) {
      setRunReport({
        summary: null,
        results: [],
        fatalError: e instanceof Error ? e.message : "Scrape run failed",
        stack: e instanceof Error ? e.stack : undefined,
      });
    } finally {
      setRunning(false);
    }
  };

  if (authLoading) {
    return (
      <main className='flex-1 flex items-center justify-center' style={{ background: "var(--bg-primary)" }}>
        <span className='text-sm' style={{ color: "var(--text-secondary)" }}>Loading…</span>
      </main>
    );
  }

  if (!user) {
    return (
      <main className='flex-1 flex flex-col items-center justify-center gap-3' style={{ background: "var(--bg-primary)" }}>
        <p className='text-sm' style={{ color: "var(--text-secondary)" }}>Sign in to manage the scraper.</p>
        <a
          href='/login'
          className='text-sm font-semibold px-4 py-2 rounded'
          style={{ background: "#facc15", color: "#0a0a0a" }}
        >
          Sign In
        </a>
      </main>
    );
  }

  const inputStyle =
    "w-full rounded-lg px-3 py-2 text-sm bg-white dark:bg-neutral-900 text-black dark:text-white";
  const cellStyle = "px-3 py-2 align-top";
  const thStyle = "px-3 py-2 text-left text-xs font-bold uppercase tracking-wider";

  return (
    <BentoPageLayout title='Scraper Admin'>
      <div className='flex items-center justify-between gap-3 mb-4 flex-wrap'>
        <div className='flex items-center gap-2'>
          <button
            onClick={openAddForm}
            className='flex items-center gap-2 rounded bg-black px-4 py-2 text-sm font-medium text-yellow-400 hover:bg-black/80 transition-colors'
          >
            <Plus className='w-4 h-4' />
            Add Source
          </button>
          <button
            onClick={runNow}
            disabled={running}
            className='flex items-center gap-2 rounded border border-[#373A40]/30 dark:border-white/30 px-4 py-2 text-sm font-medium text-black dark:text-white/80 hover:border-black dark:hover:border-white transition-colors disabled:opacity-50'
          >
            <RefreshCw className={`w-4 h-4 ${running ? "animate-spin" : ""}`} />
            {running ? "Running…" : "Run Scraper Now"}
          </button>
        </div>
      </div>

      {message && (
        <div
          className='rounded-lg p-3 mb-4 text-sm'
          style={
            message.type === "success"
              ? { background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" }
              : { background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }
          }
        >
          {message.text}
        </div>
      )}

      {error && (
        <div className='rounded-lg p-3 mb-4 text-sm' style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}>
          {error}
        </div>
      )}

      {runReport && (
        <div
          className='rounded-lg mb-4 overflow-hidden'
          style={
            runReport.fatalError || runReport.results.some((r) => r.status === "error")
              ? { border: "1px solid #fecaca", background: "#fef2f2" }
              : { border: "1px solid #bbf7d0", background: "#f0fdf4" }
          }
        >
          <div className='flex items-start justify-between gap-3 px-3 py-2' style={{ borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
            <h2 className='text-sm font-bold' style={{ color: runReport.fatalError ? "#b91c1c" : "#111" }}>
              {runReport.fatalError
                ? "Scrape run failed"
                : `Scrape run: ${runReport.summary?.succeeded ?? 0} succeeded, ${runReport.summary?.failed ?? 0} failed`}
            </h2>
            <div className='flex items-center gap-2 shrink-0'>
              <button
                onClick={() => navigator.clipboard.writeText(formatRunReport(runReport))}
                className='text-xs underline text-black/60 hover:text-black'
              >
                Copy
              </button>
              <button onClick={() => setRunReport(null)} className='text-black/50 hover:text-black' aria-label='Dismiss'>
                <X className='w-4 h-4' />
              </button>
            </div>
          </div>

          {runReport.fatalError && (
            <pre className='px-3 py-2 text-xs whitespace-pre-wrap break-words' style={{ color: "#b91c1c" }}>
              {runReport.fatalError}
              {runReport.stack ? `\n\n${runReport.stack}` : ""}
            </pre>
          )}

          {runReport.results.length > 0 && (
            <ul className='divide-y' style={{ borderColor: "rgba(0,0,0,0.08)" }}>
              {runReport.results.map((r) => (
                <li key={r.id} className='px-3 py-2'>
                  <div className='flex items-center gap-2 text-sm'>
                    <span
                      className='inline-block rounded px-1.5 py-0.5 text-xs font-medium shrink-0'
                      style={
                        r.status === "success"
                          ? { background: "#dcfce7", color: "#15803d" }
                          : { background: "#fee2e2", color: "#b91c1c" }
                      }
                    >
                      {r.status}
                    </span>
                    <span className='font-medium text-black truncate'>{r.name}</span>
                    <span className='text-xs text-black/50 truncate'>{r.url}</span>
                  </div>
                  {r.error && (
                    <pre
                      className='mt-1 text-xs whitespace-pre-wrap break-words'
                      style={{ color: "#b91c1c" }}
                    >
                      {r.error}
                      {r.detail ? `\n${r.detail}` : ""}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!runReport.fatalError && runReport.results.length === 0 && (
            <p className='px-3 py-2 text-xs text-black/60'>
              No enabled sources to scrape. Enable at least one source below.
            </p>
          )}
        </div>
      )}

      {formOpen && (
        <div
          className='rounded-lg p-4 mb-4 dark:bg-neutral-800 dark:border-neutral-700'
          style={{ border: "1px solid var(--border-color)", background: "var(--bg-secondary, #f9fafb)" }}
        >
          <div className='flex items-center justify-between mb-3'>
            <h2 className='text-sm font-bold text-black dark:text-yellow-400'>
              {editingId ? "Edit Source" : "Add Source"}
            </h2>
            <button onClick={closeForm} className='text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white'>
              <X className='w-4 h-4' />
            </button>
          </div>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-end'>
            <div className='flex-1'>
              <label className='block text-xs font-medium mb-1 text-black/60 dark:text-white/60'>Name</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className={inputStyle}
                style={{ border: "1px solid var(--border-color)" }}
                placeholder='Source name'
              />
            </div>
            <div className='flex-[2]'>
              <label className='block text-xs font-medium mb-1 text-black/60 dark:text-white/60'>URL</label>
              <input
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                className={inputStyle}
                style={{ border: "1px solid var(--border-color)" }}
                placeholder='https://example.com'
              />
            </div>
            <label className='flex items-center gap-2 text-sm text-black dark:text-white/80 pb-2'>
              <input type='checkbox' checked={formEnabled} onChange={(e) => setFormEnabled(e.target.checked)} />
              Enabled
            </label>
            <button
              onClick={submitForm}
              disabled={formSaving}
              className='rounded bg-black px-4 py-2 text-sm font-medium text-yellow-400 hover:bg-black/80 transition-colors disabled:opacity-50'
            >
              {formSaving ? "Saving…" : editingId ? "Save" : "Add"}
            </button>
          </div>
          {formError && <p className='text-xs text-red-600 dark:text-red-400 mt-2'>{formError}</p>}
        </div>
      )}

      {loading && sources.length === 0 && (
        <div className='text-center py-16 text-sm' style={{ color: "var(--text-secondary)" }}>
          Loading sources…
        </div>
      )}

      {!loading && sources.length === 0 && !error && (
        <div className='text-center py-16 text-sm' style={{ color: "var(--text-secondary)" }}>
          No scraper sources yet.
        </div>
      )}

      {sources.length > 0 && (
        <div className='overflow-x-auto rounded-lg' style={{ border: "1px solid var(--border-color)" }}>
          <table className='w-full text-sm border-collapse'>
            <thead>
              <tr
                className='bg-gray-50 dark:bg-neutral-800 text-black dark:text-yellow-400'
                style={{ borderBottom: "1px solid var(--border-color)" }}
              >
                <th className={thStyle}>Name</th>
                <th className={thStyle}>URL</th>
                <th className={thStyle}>Enabled</th>
                <th className={thStyle}>Last Scraped</th>
                <th className={thStyle}>Status</th>
                <th className={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr
                  key={source.id}
                  className='text-black dark:text-neutral-100 hover:bg-gray-50 dark:hover:bg-neutral-800/60'
                  style={{ borderTop: "1px solid var(--border-color)" }}
                >
                  <td className={`${cellStyle} font-medium`}>{source.name}</td>
                  <td className={`${cellStyle} max-w-[16rem]`}>
                    <a
                      href={source.url}
                      target='_blank'
                      rel='noopener noreferrer'
                      title={source.url}
                      className='text-blue-600 dark:text-blue-400 underline truncate block'
                    >
                      {source.url}
                    </a>
                  </td>
                  <td className={cellStyle}>
                    <button
                      onClick={() => toggleEnabled(source)}
                      role='switch'
                      aria-checked={source.enabled}
                      className='relative inline-flex h-5 w-9 items-center rounded-full transition-colors'
                      style={{ background: source.enabled ? "#facc15" : "#d1d5db" }}
                    >
                      <span
                        className='inline-block h-4 w-4 transform rounded-full bg-white transition-transform'
                        style={{ transform: source.enabled ? "translateX(18px)" : "translateX(2px)" }}
                      />
                    </button>
                  </td>
                  <td className={`${cellStyle} whitespace-nowrap`}>{fmtTime(source.last_scraped_at)}</td>
                  <td className={`${cellStyle} max-w-[24rem]`}>
                    {source.last_status ? (
                      <>
                        <span
                          className='inline-block rounded px-2 py-0.5 text-xs font-medium'
                          style={
                            source.last_status === "success"
                              ? { background: "#f0fdf4", color: "#15803d" }
                              : { background: "#fef2f2", color: "#b91c1c" }
                          }
                        >
                          {source.last_status}
                        </span>
                        {source.last_error && (
                          <pre className='mt-1 text-xs whitespace-pre-wrap break-words text-red-600 dark:text-red-400'>
                            {source.last_error}
                          </pre>
                        )}
                      </>
                    ) : (
                      <span className='text-xs text-black/40 dark:text-white/40'>—</span>
                    )}
                  </td>
                  <td className={cellStyle}>
                    <div className='flex items-center gap-1.5'>
                      <button
                        onClick={() => openEditForm(source)}
                        className='p-1.5 text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition-colors'
                        aria-label='Edit'
                      >
                        <Pencil className='w-4 h-4' />
                      </button>
                      <button
                        onClick={() => deleteSource(source)}
                        className='p-1.5 text-black/40 dark:text-white/40 hover:text-red-500 transition-colors'
                        aria-label='Delete'
                      >
                        <Trash2 className='w-4 h-4' />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </BentoPageLayout>
  );
}
