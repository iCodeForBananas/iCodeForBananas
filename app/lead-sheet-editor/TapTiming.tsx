"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Undo2, SkipForward, X, Check } from "lucide-react";
import {
  applyStamps,
  clearAllMarkers,
  formatTime,
  parseTimeMarker,
  stampableLines,
  stripTimeMarker,
} from "./timing";

/**
 * Timing a song by ear: start the clock alongside the recording and tap once
 * as each line comes in. Taps become `@m:ss` markers on those lines, which is
 * what the preview's playback follows.
 */
export default function TapTiming({
  rawText,
  onApply,
  onClose,
}: {
  rawText: string;
  onApply: (nextText: string) => void;
  onClose: () => void;
}) {
  const lines = useMemo(() => rawText.split("\n"), [rawText]);
  const targets = useMemo(() => stampableLines(rawText), [rawText]);
  const targetSet = useMemo(() => new Set(targets), [targets]);

  // Existing markers carry over, so re-timing one section doesn't wipe the rest.
  const [stamps, setStamps] = useState<Map<number, number>>(() => {
    const seeded = new Map<number, number>();
    for (const i of stampableLines(rawText)) {
      const marker = parseTimeMarker(rawText.split("\n")[i]);
      if (marker) seeded.set(i, marker.start);
    }
    return seeded;
  });
  const [cursor, setCursor] = useState(0);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const baseRef = useRef(0);
  const anchorRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!running) return;
    baseRef.current = elapsedRef.current;
    anchorRef.current = performance.now();
    let raf = 0;
    let lastPublished = -1;
    const tick = () => {
      const t = baseRef.current + (performance.now() - anchorRef.current) / 1000;
      elapsedRef.current = t;
      // Taps read elapsedRef, so the display only needs to tick once a second.
      const second = Math.floor(t);
      if (second !== lastPublished) {
        lastPublished = second;
        setElapsed(t);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const done = cursor >= targets.length;

  function tap() {
    if (!running || done) return;
    const lineIndex = targets[cursor];
    setStamps((prev) => new Map(prev).set(lineIndex, elapsedRef.current));
    setCursor((c) => c + 1);
  }

  function skip() {
    if (done) return;
    setCursor((c) => c + 1);
  }

  function undo() {
    if (cursor === 0) return;
    const lineIndex = targets[cursor - 1];
    setStamps((prev) => {
      const next = new Map(prev);
      next.delete(lineIndex);
      return next;
    });
    setCursor((c) => c - 1);
  }

  function reset() {
    setRunning(false);
    elapsedRef.current = 0;
    baseRef.current = 0;
    setElapsed(0);
    setCursor(0);
    setStamps(new Map());
  }

  function apply() {
    onApply(applyStamps(rawText, stamps));
    onClose();
  }

  function clearTimings() {
    onApply(clearAllMarkers(rawText));
    onClose();
  }

  // Deliberately un-deps'd: the handler closes over cursor/running, and this
  // component only re-renders about once a second while the clock runs.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (!running) setRunning(true);
        else tap();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        undo();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // Keep the line you're about to tap in the middle of the list.
  useEffect(() => {
    listRef.current?.querySelector("[data-cursor]")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [cursor]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-2 sm:p-6">
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-white/15 bg-black">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-sm font-medium text-white">Tap Timing</h2>
            <p className="text-xs text-white/40">
              Start the song, then tap Space as each line comes in.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-2xl tabular-nums text-yellow-400">{formatTime(elapsed)}</span>
            <button
              onClick={onClose}
              aria-label="Close tap timing"
              className="text-white/50 transition-colors hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Lines */}
        <div ref={listRef} className="flex-1 space-y-1 overflow-auto px-4 py-3">
          {lines.map((line, i) => {
            const isTarget = targetSet.has(i);
            const stamp = stamps.get(i);
            const atCursor = isTarget && !done && targets[cursor] === i;
            const isHeader = /^\s*\[[^\[\]]+\]\s*$/.test(line);
            if (!line.trim()) return <div key={i} className="h-2" />;
            return (
              <div
                key={i}
                data-cursor={atCursor || undefined}
                className={`flex items-baseline gap-2 rounded px-2 py-1 font-mono text-sm ${
                  atCursor ? "bg-yellow-400/20 ring-1 ring-yellow-400" : ""
                }`}
              >
                <span
                  className={`w-12 shrink-0 text-right text-xs tabular-nums ${
                    stamp !== undefined ? "text-yellow-400" : "text-white/20"
                  }`}
                >
                  {stamp !== undefined ? formatTime(stamp) : isTarget ? "—" : ""}
                </span>
                <span
                  className={
                    isHeader
                      ? "font-bold uppercase tracking-widest text-white/70"
                      : isTarget
                        ? "text-white"
                        : "text-white/40"
                  }
                >
                  {stripTimeMarker(line)}
                </span>
              </div>
            );
          })}
          {targets.length === 0 && (
            <p className="py-8 text-center text-sm text-white/40">
              Nothing to time yet — add a section like [Verse 1] with some lines under it.
            </p>
          )}
        </div>

        {/* Transport */}
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-4 py-3">
          <button
            onClick={() => setRunning((r) => !r)}
            className="flex h-10 items-center gap-2 rounded bg-black px-4 text-sm font-medium text-yellow-400 ring-1 ring-white/30 transition-colors hover:ring-white"
          >
            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {running ? "Pause" : elapsed > 0 ? "Resume" : "Start"}
          </button>
          <button
            onClick={tap}
            disabled={!running || done}
            className="h-10 flex-1 rounded bg-yellow-400 px-4 text-sm font-medium text-black transition-colors hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {done ? "All lines timed" : "Tap line in  (Space)"}
          </button>
          <button
            onClick={undo}
            disabled={cursor === 0}
            title="Undo last tap (Backspace)"
            aria-label="Undo last tap"
            className="flex h-10 w-10 items-center justify-center rounded text-white/70 ring-1 ring-white/30 transition-colors hover:text-white hover:ring-white disabled:opacity-30"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={skip}
            disabled={done}
            title="Skip this line (↓)"
            aria-label="Skip this line"
            className="flex h-10 w-10 items-center justify-center rounded text-white/70 ring-1 ring-white/30 transition-colors hover:text-white hover:ring-white disabled:opacity-30"
          >
            <SkipForward className="h-4 w-4" />
          </button>
          <button
            onClick={reset}
            title="Start over"
            aria-label="Start over"
            className="flex h-10 w-10 items-center justify-center rounded text-white/70 ring-1 ring-white/30 transition-colors hover:text-white hover:ring-white"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <div className="w-px self-stretch bg-white/20" />
          <button
            onClick={clearTimings}
            className="h-10 rounded px-3 text-sm font-medium text-white/50 transition-colors hover:text-white"
          >
            Clear all
          </button>
          <button
            onClick={apply}
            disabled={stamps.size === 0}
            className="flex h-10 items-center gap-2 rounded bg-yellow-400 px-4 text-sm font-medium text-black transition-colors hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Check className="h-4 w-4" />
            Save {stamps.size} time{stamps.size === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
