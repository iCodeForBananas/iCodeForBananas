"use client";

import { useEffect, useState } from "react";
import { CircleDot, Minus, Plus, Square } from "lucide-react";
import { Button, IconButton, Select, TextField } from "@radix-ui/themes";

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
    <div className='flex flex-wrap items-center gap-1 px-3 py-2 print:hidden'>
      <span className='text-sm font-medium text-ink-primary select-none'>BPM</span>
      <IconButton
        type='button'
        size='3'
        variant='soft'
        color='gray'
        onClick={() => onBpmChange(bpm - 1)}
        disabled={bpm <= MIN_BPM}
        aria-label='Decrease tempo'
      >
        <Minus className='w-4 h-4' />
      </IconButton>
      <TextField.Root
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
        size='3'
        className='w-14 text-center'
      />
      <IconButton
        type='button'
        size='3'
        variant='soft'
        color='gray'
        onClick={() => onBpmChange(bpm + 1)}
        disabled={bpm >= MAX_BPM}
        aria-label='Increase tempo'
      >
        <Plus className='w-4 h-4' />
      </IconButton>
      <Select.Root size='3' value={String(beatsPerBar)} onValueChange={(v) => onBeatsPerBarChange(parseInt(v, 10))}>
        <Select.Trigger variant='soft' color='gray' aria-label='Beats per bar' title='Beats per bar — the first beat flashes brightest' />
        <Select.Content>
          {BEATS_PER_BAR_OPTIONS.map((n) => (
            <Select.Item key={n} value={String(n)}>
              /{n}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
      <Button
        type='button'
        size='3'
        variant={running ? "solid" : "soft"}
        color={running ? undefined : "gray"}
        aria-pressed={running}
        onClick={onToggle}
        title={running ? "Stop the metronome" : "Blink a silent beat over the sheet"}
      >
        {running ? <Square className='w-4 h-4' /> : <CircleDot className='w-4 h-4' />}
        {running ? "Stop" : "Start"}
      </Button>
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
        className='absolute inset-0 border-primary-solid'
        style={{
          borderWidth: downbeat ? 14 : 8,
          animation: `leadsheetRingPulse ${flashMs}ms ease-out forwards`,
        }}
      />

      {/* Dial — dark disc so the count reads the same in either theme */}
      <div className={`absolute right-4 ${lifted ? "bottom-48" : "bottom-6"} flex flex-col items-center gap-2`}>
        <div className='relative flex h-28 w-28 items-center justify-center rounded-full border-4 border-primary-solid/25 bg-surface-sunken/80 sm:h-36 sm:w-36'>
          <div
            key={`dot-${beat}`}
            className='absolute -inset-2 rounded-full border-primary-solid'
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
              stroke='var(--ds-color-primary-solid)'
              strokeOpacity={0.18}
              strokeWidth='7'
            />
            <circle
              key={`sweep-${beat}`}
              cx='50'
              cy='50'
              r={SWEEP_RADIUS}
              fill='none'
              stroke='var(--ds-color-primary-solid)'
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

          <span className='relative text-5xl font-bold tabular-nums text-primary-text sm:text-6xl'>
            {beatInBar + 1}
          </span>
        </div>
        <span className='rounded bg-surface-sunken/70 px-2 py-0.5 text-xs font-medium tabular-nums text-ink-primary'>
          {bpm} BPM · {beatsPerBar}/4
        </span>
      </div>
    </div>
  );
}
