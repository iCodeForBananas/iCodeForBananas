"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Undo2, SkipForward, X, Check } from "lucide-react";
import { Button, Dialog, IconButton, Separator } from "@radix-ui/themes";
import {
  applyStamps,
  clearAllMarkers,
  formatTime,
  hasBeatMarkers,
  parseTimeMarker,
  readTempo,
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
  const bpm = useMemo(() => readTempo(rawText), [rawText]);
  // Taps land on the clock. A song already written in beats wants them
  // converted; so does a song with no markers at all, which is a new one, and
  // new songs are laid out in beats.
  const inBeats = useMemo(
    () => hasBeatMarkers(rawText) || !lines.some((line) => parseTimeMarker(line)),
    [rawText, lines]
  );
  const targets = useMemo(() => stampableLines(rawText), [rawText]);
  const targetSet = useMemo(() => new Set(targets), [targets]);

  // Existing markers carry over, so re-timing one section doesn't wipe the rest.
  const [stamps, setStamps] = useState<Map<number, number>>(() => {
    const seeded = new Map<number, number>();
    for (const i of stampableLines(rawText)) {
      const marker = parseTimeMarker(rawText.split("\n")[i], readTempo(rawText));
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
    onApply(applyStamps(rawText, stamps, inBeats ? bpm : undefined));
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
    // Escape is Radix Dialog's. Nothing takes focus on open, so Space reaches the
    // tap handler above instead of pressing whichever button got focused.
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content
        maxWidth="42rem"
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="flex max-h-[90vh] flex-col overflow-hidden p-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-line-subtle px-4 py-3">
          <div>
            <Dialog.Title size="3" mb="0">
              Tap Timing
            </Dialog.Title>
            <Dialog.Description size="1" color="gray">
              Start the song, then tap Space as each line comes in.
            </Dialog.Description>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-2xl tabular-nums text-primary-text">{formatTime(elapsed)}</span>
            <IconButton variant="ghost" color="gray" onClick={onClose} aria-label="Close tap timing">
              <X className="h-4 w-4" />
            </IconButton>
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
                  atCursor ? "bg-primary-solid/20 ring-1 ring-focus" : ""
                }`}
              >
                <span
                  className={`w-12 shrink-0 text-right text-xs tabular-nums ${
                    stamp !== undefined ? "text-primary-text" : "text-ink-muted"
                  }`}
                >
                  {stamp !== undefined ? formatTime(stamp) : isTarget ? "—" : ""}
                </span>
                <span
                  className={
                    isHeader
                      ? "font-bold uppercase tracking-widest text-ink-muted"
                      : isTarget
                        ? "text-ink-primary"
                        : "text-ink-muted"
                  }
                >
                  {stripTimeMarker(line)}
                </span>
              </div>
            );
          })}
          {targets.length === 0 && (
            <p className="py-8 text-center text-sm text-ink-muted">
              Nothing to time yet — add a section like [Verse 1] with some lines under it.
            </p>
          )}
        </div>

        {/* Transport */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line-subtle px-4 py-3">
          <Button size="3" variant="surface" onClick={() => setRunning((r) => !r)}>
            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {running ? "Pause" : elapsed > 0 ? "Resume" : "Start"}
          </Button>
          <Button size="3" onClick={tap} disabled={!running || done} className="flex-1">
            {done ? "All lines timed" : "Tap line in  (Space)"}
          </Button>
          <IconButton size="3" variant="surface" color="gray" onClick={undo} disabled={cursor === 0} title="Undo last tap (Backspace)" aria-label="Undo last tap">
            <Undo2 className="h-4 w-4" />
          </IconButton>
          <IconButton size="3" variant="surface" color="gray" onClick={skip} disabled={done} title="Skip this line (↓)" aria-label="Skip this line">
            <SkipForward className="h-4 w-4" />
          </IconButton>
          <IconButton size="3" variant="surface" color="gray" onClick={reset} title="Start over" aria-label="Start over">
            <RotateCcw className="h-4 w-4" />
          </IconButton>
          <Separator orientation="vertical" size="2" />
          <Button size="3" variant="ghost" color="gray" onClick={clearTimings}>
            Clear all
          </Button>
          <Button size="3" onClick={apply} disabled={stamps.size === 0}>
            <Check className="h-4 w-4" />
            Save {stamps.size} time{stamps.size === 1 ? "" : "s"}
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
