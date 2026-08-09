"use client";

import { useEffect, useState } from "react";
import { CircleDot, Minus, Plus, Square } from "lucide-react";

export const MIN_BPM = 30;
export const MAX_BPM = 240;
export const DEFAULT_BPM = 90;
export const DEFAULT_BEATS_PER_BAR = 4;
export const BEATS_PER_BAR_OPTIONS = [2, 3, 4, 6];

export function clampBpm(value: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(value)));
}

// Radius of the beat-progress ring, in the dial's 100×100 viewBox. The ring is
// drawn with pathLength="1" so its CSS sweep is radius-independent.
const SWEEP_RADIUS = 44;

/**
 * Absolute beat count since the metronome started, derived from the clock on
 * every frame rather than accumulated — a dropped frame shifts nothing.
 */
function useBeat(bpm: number, running: boolean): number {
  const [beat, setBeat] = useState(-1);

  useEffect(() => {
    if (!running || bpm <= 0) return;
    const interval = 60000 / bpm;
    const startedAt = performance.now();
    let current = -1;
    let raf = 0;
    const tick = () => {
      const next = Math.floor((performance.now() - startedAt) / interval);
      if (next !== current) {
        current = next;
        setBeat(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bpm, running]);

  return beat;
}

// ─── Toolbar control ──────────────────────────────────────────────────────────

export function MetronomeControl({
  bpm,
  onBpmChange,
  beatsPerBar,
  onBeatsPerBarChange,
  running,
  onToggle,
}: {
  bpm: number;
  onBpmChange: (next: number) => void;
  beatsPerBar: number;
  onBeatsPerBarChange: (next: number) => void;
  running: boolean;
  onToggle: () => void;
}) {
  // Held locally so the field can be empty mid-edit without snapping back.
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className='flex items-center gap-1 rounded-lg border border-gray-200 dark:border-neutral-700 px-1.5 py-1 print:hidden'>
      <span className='text-sm font-medium text-gray-700 dark:text-neutral-200 select-none'>BPM</span>
      <button
        type='button'
        onClick={() => onBpmChange(bpm - 1)}
        disabled={bpm <= MIN_BPM}
        className='h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200 font-medium transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed'
        aria-label='Decrease tempo'
      >
        <Minus className='w-4 h-4' />
      </button>
      <input
        type='number'
        inputMode='numeric'
        min={MIN_BPM}
        max={MAX_BPM}
        value={draft ?? bpm}
        onChange={(e) => {
          setDraft(e.target.value);
          const parsed = parseInt(e.target.value, 10);
          if (!isNaN(parsed) && parsed >= MIN_BPM && parsed <= MAX_BPM) onBpmChange(parsed);
        }}
        onBlur={() => setDraft(null)}
        aria-label='Beats per minute'
        className='h-10 w-14 rounded-lg bg-gray-100 dark:bg-neutral-800 text-center text-sm font-medium text-gray-700 dark:text-neutral-200 outline-none focus:ring-1 focus:ring-gray-400'
      />
      <button
        type='button'
        onClick={() => onBpmChange(bpm + 1)}
        disabled={bpm >= MAX_BPM}
        className='h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200 font-medium transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed'
        aria-label='Increase tempo'
      >
        <Plus className='w-4 h-4' />
      </button>
      <select
        value={beatsPerBar}
        onChange={(e) => onBeatsPerBarChange(parseInt(e.target.value, 10))}
        aria-label='Beats per bar'
        title='Beats per bar — the first beat flashes brightest'
        className='h-10 rounded-lg bg-gray-100 dark:bg-neutral-800 px-1 text-sm font-medium text-gray-700 dark:text-neutral-200 outline-none'
      >
        {BEATS_PER_BAR_OPTIONS.map((n) => (
          <option key={n} value={n}>
            /{n}
          </option>
        ))}
      </select>
      <button
        type='button'
        onClick={onToggle}
        title={running ? "Stop the metronome" : "Blink a silent beat over the sheet"}
        className={`h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium transition-colors duration-150 ${
          running
            ? "bg-yellow-400 text-black hover:bg-yellow-300"
            : "bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200"
        }`}
      >
        {running ? <Square className='w-4 h-4' /> : <CircleDot className='w-4 h-4' />}
        {running ? "Stop" : "Start"}
      </button>
    </div>
  );
}

// ─── Blinking overlay ─────────────────────────────────────────────────────────

/**
 * A silent beat you can catch out of the corner of your eye: the whole viewport
 * is ringed in yellow and a big dial counts the bar. Nothing here takes clicks,
 * so the sheet underneath stays usable while it runs.
 *
 * Mount it only while the metronome is running — the beat count starts fresh
 * with the component, so stopping and starting always begins on one.
 */
export function MetronomeOverlay({
  bpm,
  beatsPerBar,
  running,
  lifted,
}: {
  bpm: number;
  beatsPerBar: number;
  running: boolean;
  /** Sit above the playback transport when it's open. */
  lifted: boolean;
}) {
  const beat = useBeat(bpm, running);
  if (!running || beat < 0) return null;

  const beatInBar = ((beat % beatsPerBar) + beatsPerBar) % beatsPerBar;
  const downbeat = beatInBar === 0;
  const beatMs = 60000 / bpm;
  // Blink for a slice of the beat, capped so fast tempos still read as flashes.
  const flashMs = Math.min(260, beatMs * 0.55);

  return (
    <div className='pointer-events-none fixed inset-0 z-[55] print:hidden' aria-hidden='true'>
      {/* Viewport ring — keyed on the beat so the fade restarts each time */}
      <div
        key={`ring-${beat}`}
        className='absolute inset-0 border-yellow-400'
        style={{
          borderWidth: downbeat ? 14 : 8,
          animation: `leadsheetRingPulse ${flashMs}ms ease-out forwards`,
        }}
      />

      {/* Dial — dark disc so the count reads the same in either theme */}
      <div className={`absolute right-4 ${lifted ? "bottom-48" : "bottom-6"} flex flex-col items-center gap-2`}>
        <div className='relative flex h-28 w-28 items-center justify-center rounded-full border-4 border-yellow-400/25 bg-black/80 sm:h-36 sm:w-36'>
          <div
            key={`dot-${beat}`}
            className='absolute -inset-2 rounded-full border-yellow-400'
            style={{
              borderWidth: downbeat ? 12 : 6,
              animation: `leadsheetBeatPulse ${flashMs}ms ease-out forwards`,
            }}
          />

          {/* Sweep to the next beat: empties on the beat and fills clockwise,
              closing the circle exactly as the next one lands. */}
          <svg className='absolute inset-1' viewBox='0 0 100 100' aria-hidden='true'>
            <circle
              cx='50'
              cy='50'
              r={SWEEP_RADIUS}
              fill='none'
              stroke='#facc15'
              strokeOpacity={0.18}
              strokeWidth='7'
            />
            <circle
              key={`sweep-${beat}`}
              cx='50'
              cy='50'
              r={SWEEP_RADIUS}
              fill='none'
              stroke='#facc15'
              strokeWidth='7'
              strokeLinecap='round'
              transform='rotate(-90 50 50)'
              pathLength={1}
              style={{
                strokeDasharray: 1,
                animation: `leadsheetBeatSweep ${beatMs}ms linear forwards`,
              }}
            />
          </svg>

          <span className='relative text-5xl font-bold tabular-nums text-yellow-400 sm:text-6xl'>
            {beatInBar + 1}
          </span>
        </div>
        <span className='rounded bg-black/70 px-2 py-0.5 text-xs font-medium tabular-nums text-white'>
          {bpm} BPM · {beatsPerBar}/4
        </span>
      </div>
    </div>
  );
}
