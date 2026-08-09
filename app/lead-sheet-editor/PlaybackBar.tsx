"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Rewind, FastForward, X, Crosshair } from "lucide-react";
import { formatTime, nextCueAfter, type Cue, type Timeline } from "./timing";

const NUDGE_SECONDS = 5;

export interface Playback {
  time: number;
  playing: boolean;
  toggle: () => void;
  seek: (seconds: number) => void;
  nudge: (seconds: number) => void;
  restart: () => void;
  stop: () => void;
}

/**
 * Wall-clock transport for following along with a song. The clock itself runs
 * on rAF, but `time` is only published ten times a second — the sheet re-renders
 * off it, and sixty renders a second buys nothing a player can see.
 */
export function usePlayback(duration: number): Playback {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const timeRef = useRef(0);
  const baseRef = useRef(0);
  const anchorRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    baseRef.current = timeRef.current;
    anchorRef.current = performance.now();
    let lastPublished = -1;

    const tick = () => {
      const t = baseRef.current + (performance.now() - anchorRef.current) / 1000;
      if (duration > 0 && t >= duration) {
        timeRef.current = duration;
        setTime(duration);
        setPlaying(false);
        return;
      }
      timeRef.current = t;
      const decisecond = Math.floor(t * 10);
      if (decisecond !== lastPublished) {
        lastPublished = decisecond;
        setTime(t);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing, duration]);

  const seek = useCallback(
    (seconds: number) => {
      const clamped = Math.min(duration, Math.max(0, seconds));
      timeRef.current = clamped;
      baseRef.current = clamped;
      anchorRef.current = performance.now();
      setTime(clamped);
    },
    [duration]
  );

  const toggle = useCallback(() => {
    // Hitting play at the end starts the song over rather than sitting still.
    setPlaying((p) => {
      if (!p && duration > 0 && timeRef.current >= duration) seek(0);
      return !p;
    });
  }, [duration, seek]);

  const restart = useCallback(() => seek(0), [seek]);
  const nudge = useCallback((seconds: number) => seek(timeRef.current + seconds), [seek]);
  const stop = useCallback(() => setPlaying(false), []);

  return { time, playing, toggle, seek, nudge, restart, stop };
}

/** Space / arrows drive the transport, except while the user is typing. */
export function usePlaybackKeys(playback: Playback, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.code === "Space") {
        e.preventDefault();
        playback.toggle();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        playback.nudge(-NUDGE_SECONDS);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        playback.nudge(NUDGE_SECONDS);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, playback]);
}

export function PlaybackBar({
  playback,
  timeline,
  activeCue,
  follow,
  onFollowChange,
  onClose,
}: {
  playback: Playback;
  timeline: Timeline;
  activeCue: Cue | null;
  follow: boolean;
  onFollowChange: (next: boolean) => void;
  onClose: () => void;
}) {
  const { time, playing } = playback;
  const upNext = nextCueAfter(timeline, time);
  const progress = timeline.duration > 0 ? (time / timeline.duration) * 100 : 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-gray-200 bg-white/95 backdrop-blur dark:border-gray-700 dark:bg-gray-900/95 print:hidden">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3">
        {/* Scrubber */}
        <div className="flex items-center gap-3">
          <span className="w-12 shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">
            {formatTime(time)}
          </span>
          <div className="relative flex-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div className="h-full rounded-full bg-yellow-400" style={{ width: `${progress}%` }} />
            </div>
            {/* Cue ticks — every line you've timed, so you can see the shape of the song */}
            {timeline.cues.map((cue) => (
              <span
                key={cue.index}
                className="pointer-events-none absolute top-1/2 h-2 w-px -translate-y-1/2 bg-gray-400/60 dark:bg-gray-500"
                style={{ left: `${(cue.start / (timeline.duration || 1)) * 100}%` }}
              />
            ))}
            <input
              type="range"
              min={0}
              max={Math.max(timeline.duration, 0.1)}
              step={0.1}
              value={time}
              onChange={(e) => playback.seek(parseFloat(e.target.value))}
              aria-label="Seek"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
          <span className="w-12 shrink-0 text-right font-mono text-xs text-gray-500 dark:text-gray-400">
            {formatTime(timeline.duration)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={playback.restart}
            aria-label="Back to start"
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700 transition-colors duration-150 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => playback.nudge(-NUDGE_SECONDS)}
            aria-label="Back 5 seconds"
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700 transition-colors duration-150 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <Rewind className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={playback.toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="flex h-10 items-center gap-2 rounded-lg bg-black px-5 text-sm font-medium text-yellow-400 transition-colors duration-150 hover:bg-black/80"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            onClick={() => playback.nudge(NUDGE_SECONDS)}
            aria-label="Forward 5 seconds"
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700 transition-colors duration-150 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <FastForward className="h-4 w-4" />
          </button>

          {/* What you should be playing right now */}
          <div className="min-w-0 flex-1 px-2">
            {activeCue ? (
              <div className="min-w-0">
                <span className="mr-2 rounded px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest" style={{ background: "#facc15", color: "#000" }}>
                  {activeCue.sectionLabel}
                </span>
                <span className="truncate align-middle font-mono text-sm text-gray-700 dark:text-gray-200">
                  {activeCue.text}
                </span>
              </div>
            ) : (
              <span className="font-mono text-sm text-gray-400 dark:text-gray-500">
                {upNext ? `Starts in ${Math.ceil(upNext.start - time)}s` : "—"}
              </span>
            )}
            {activeCue && upNext && (
              <div className="truncate text-xs text-gray-400 dark:text-gray-500">
                Next in {Math.max(0, Math.ceil(upNext.start - time))}s · {upNext.text || upNext.sectionLabel}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onFollowChange(!follow)}
            title="Keep the current line scrolled into view"
            className={`flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors duration-150 ${
              follow
                ? "bg-yellow-400 text-black hover:bg-yellow-300"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            <Crosshair className="h-4 w-4" />
            Follow
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close playback"
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700 transition-colors duration-150 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
