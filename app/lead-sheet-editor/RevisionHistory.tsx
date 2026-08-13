"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { X, GitCompare, Clock } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Revision {
  id: string;
  raw_text: string;
  created_at: string;
  /** 1-based index from newest (1 = newest, N = oldest) */
  num: number;
}

// ── Diff engine ───────────────────────────────────────────────────────────────

type DiffOp = { type: "keep" | "add" | "remove"; line: string };

/** Line-based LCS diff. Returns ops in order from old→new. */
function diffLines(aText: string, bText: string): DiffOp[] {
  const a = aText.split("\n");
  const b = bText.split("\n");
  const m = a.length;
  const n = b.length;

  // Build LCS table
  const dp: Uint16Array[] = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const ops: DiffOp[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ type: "keep", line: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: "add", line: b[j - 1] });
      j--;
    } else {
      ops.push({ type: "remove", line: a[i - 1] });
      i--;
    }
  }
  return ops.reverse();
}

/**
 * Collapse long runs of unchanged lines to ±3 context lines around each hunk.
 * Returns the same DiffOp array but with { type:"skip", line:"..." } entries
 * inserted where unchanged runs were collapsed.
 */
type DiffOpEx = DiffOp | { type: "skip"; line: string };

function collapseContext(ops: DiffOp[], ctx = 3): DiffOpEx[] {
  const result: DiffOpEx[] = [];
  const KEEP_INDICES = new Set<number>();

  // Mark which "keep" lines are within ctx lines of a change
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].type !== "keep") {
      for (let d = -ctx; d <= ctx; d++) {
        const k = i + d;
        if (k >= 0 && k < ops.length && ops[k].type === "keep") KEEP_INDICES.add(k);
      }
    }
  }

  let skipping = false;
  let skipCount = 0;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op.type === "keep" && !KEEP_INDICES.has(i)) {
      skipCount++;
      skipping = true;
    } else {
      if (skipping) {
        result.push({ type: "skip", line: `··· ${skipCount} unchanged line${skipCount !== 1 ? "s" : ""} ···` });
        skipping = false;
        skipCount = 0;
      }
      result.push(op);
    }
  }
  if (skipping) {
    result.push({ type: "skip", line: `··· ${skipCount} unchanged line${skipCount !== 1 ? "s" : ""} ···` });
  }
  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Main component ────────────────────────────────────────────────────────────

export function RevisionHistory({
  sheetId,
  currentRawText,
  onRestore,
  onClose,
}: {
  sheetId: string;
  currentRawText: string;
  onRestore: (rawText: string) => void;
  onClose: () => void;
}) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selA, setSelA]         = useState<Revision | null>(null);
  const [selB, setSelB]         = useState<Revision | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Load revisions
  const load = useCallback(async () => {
    setLoading(true);
    const sb = createClient();
    if (!sb) { setLoading(false); return; }
    const { data } = await sb
      .from("lead_sheet_revisions")
      .select("id, raw_text, created_at")
      .eq("lead_sheet_id", sheetId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (data) {
      setRevisions(data.map((r, i) => ({ ...r, num: i + 1 })));
    }
    setLoading(false);
  }, [sheetId]);

  useEffect(() => { load(); }, [load]);

  // Clicking a revision:
  //   • if nothing selected, set as A
  //   • if A is selected and we click something else, set as B (so we diff A vs B)
  //   • if we click the already-selected A or B, deselect it
  function handleSelect(rev: Revision) {
    if (selA?.id === rev.id) { setSelA(null); return; }
    if (selB?.id === rev.id) { setSelB(null); return; }
    if (!selA) { setSelA(rev); return; }
    setSelB(rev);
  }

  // Build diff — always diff older→newer so "adds" appear as additions
  const diffOps: DiffOpEx[] | null = (() => {
    if (!selA || !selB) return null;
    // selA is newer (lower num), selB is older (higher num) — or vice versa; sort by date
    const [older, newer] = new Date(selA.created_at) < new Date(selB.created_at)
      ? [selA, selB]
      : [selB, selA];
    return collapseContext(diffLines(older.raw_text, newer.raw_text));
  })();

  const addCount    = diffOps?.filter((o) => o.type === "add").length ?? 0;
  const removeCount = diffOps?.filter((o) => o.type === "remove").length ?? 0;

  // Restore a version (replace editor content)
  function handleRestore(rev: Revision) {
    if (!confirm(`Restore to revision #${rev.num} (${formatDate(rev.created_at)})? The editor will be updated and you can save to keep this version.`)) return;
    onRestore(rev.raw_text);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-yellow-400" />
          <span className="font-semibold text-lg">Revision History</span>
          {!loading && (
            <span className="text-sm text-white/40">{revisions.length} revision{revisions.length !== 1 ? "s" : ""}</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors text-sm"
        >
          <X className="w-4 h-4" />
          Close
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Revision list */}
        <div className="w-64 shrink-0 border-r border-white/10 overflow-y-auto flex flex-col">
          {loading ? (
            <div className="p-6 text-white/40 text-sm">Loading...</div>
          ) : revisions.length === 0 ? (
            <div className="p-6 text-white/40 text-sm">No revisions yet. Save the sheet to start tracking history.</div>
          ) : (
            <>
              <div className="p-3 text-xs text-white/40 border-b border-white/10">
                Click to select A, click again for B — then see the diff.
              </div>
              {/* Current version at top */}
              <button
                className={`w-full text-left px-4 py-3 border-b border-white/10 transition-colors ${
                  selA?.id === "current" || selB?.id === "current"
                    ? selA?.id === "current"
                      ? "bg-indigo-900/50 text-indigo-300"
                      : "bg-yellow-900/40 text-yellow-300"
                    : "hover:bg-white/5 text-white/70"
                }`}
                onClick={() => handleSelect({ id: "current", raw_text: currentRawText, created_at: new Date().toISOString(), num: 0 })}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono font-semibold">Current</span>
                  {selA?.id === "current" && <span className="text-[10px] font-bold bg-indigo-500 text-white rounded px-1">A</span>}
                  {selB?.id === "current" && <span className="text-[10px] font-bold bg-yellow-500 text-black rounded px-1">B</span>}
                </div>
                <div className="text-xs text-white/30 mt-0.5">Unsaved / current</div>
              </button>
              {revisions.map((rev) => {
                const isA = selA?.id === rev.id;
                const isB = selB?.id === rev.id;
                return (
                  <button
                    key={rev.id}
                    onClick={() => handleSelect(rev)}
                    className={`w-full text-left px-4 py-3 border-b border-white/5 transition-colors ${
                      isA
                        ? "bg-indigo-900/50 text-indigo-300"
                        : isB
                        ? "bg-yellow-900/40 text-yellow-300"
                        : "hover:bg-white/5 text-white/70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono font-semibold">#{rev.num}</span>
                      <div className="flex items-center gap-1">
                        {isA && <span className="text-[10px] font-bold bg-indigo-500 text-white rounded px-1">A</span>}
                        {isB && <span className="text-[10px] font-bold bg-yellow-500 text-black rounded px-1">B</span>}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRestore(rev); }}
                          className="text-[10px] text-white/30 hover:text-yellow-400 px-1 rounded transition-colors"
                          title="Restore this version"
                        >
                          Restore
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-white/40 mt-0.5" title={formatDate(rev.created_at)}>
                      {relativeTime(rev.created_at)}
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* Diff panel */}
        <div className="flex-1 overflow-y-auto min-w-0">
          {!selA && !selB ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-white/30">
              <GitCompare className="w-10 h-10" />
              <p className="text-sm">Select two versions from the list to compare them</p>
            </div>
          ) : selA && !selB ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-white/30">
              <GitCompare className="w-10 h-10" />
              <p className="text-sm">Now select a second version to diff against</p>
            </div>
          ) : diffOps ? (
            <div className="flex flex-col h-full">
              {/* Diff header */}
              <div className="shrink-0 flex items-center gap-4 px-6 py-3 border-b border-white/10 text-sm">
                <span className="text-white/50">
                  {[selA, selB].sort((a, b) => new Date(a!.created_at).getTime() - new Date(b!.created_at).getTime())
                    .map((r) => (r!.id === "current" ? "Current" : `#${r!.num}`))
                    .join(" → ")}
                </span>
                <span className="text-green-400">+{addCount}</span>
                <span className="text-red-400">−{removeCount}</span>
                {addCount === 0 && removeCount === 0 && (
                  <span className="text-white/40">No differences</span>
                )}
              </div>
              {/* Diff lines */}
              <div className="flex-1 overflow-y-auto font-mono text-sm">
                {diffOps.map((op, i) => (
                  <div
                    key={i}
                    className={`px-6 py-px whitespace-pre-wrap break-all leading-5 ${
                      op.type === "add"
                        ? "bg-green-950/60 text-green-300"
                        : op.type === "remove"
                        ? "bg-red-950/60 text-red-300"
                        : op.type === "skip"
                        ? "text-white/25 text-center text-xs py-1 bg-white/5"
                        : "text-white/60"
                    }`}
                  >
                    {op.type === "add" ? "+ " : op.type === "remove" ? "− " : op.type === "skip" ? "" : "  "}
                    {op.line === "" ? " " : op.line}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
