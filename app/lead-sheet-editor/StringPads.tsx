"use client";

import { useEffect, useRef } from "react";

// ── Note / chord helpers ──────────────────────────────────────────────────────

const NOTE_SEMITONE: Record<string, number> = {
  "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3,
  "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8,
  "A": 9, "A#": 10, "Bb": 10, "B": 11,
};

function midiToHz(semitone: number, octave: number): number {
  // C4 = MIDI 60 = 261.63 Hz
  const midi = (octave + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Parse "G", "Am", "F#m", "Bb", "Dbm" → root semitone + isMinor. */
function parseKey(key: string | null | undefined): { semitone: number; minor: boolean } | null {
  if (!key) return null;
  const m = key.trim().match(/^([A-G][#b]?)(m)?$/i);
  if (!m) return null;
  const semitone = NOTE_SEMITONE[m[1]];
  if (semitone === undefined) return null;
  return { semitone, minor: !!m[2] };
}

/** Returns root / third / fifth frequencies spread across two octaves. */
function padFrequencies(semitone: number, minor: boolean): number[] {
  const third = minor ? 3 : 4;
  const fifth = 7;
  return [
    midiToHz(semitone, 2),               // sub-bass root
    midiToHz(semitone, 3),               // root
    midiToHz(semitone + third, 3),       // third
    midiToHz(semitone + fifth, 3),       // fifth
    midiToHz(semitone, 4),               // octave root
    midiToHz(semitone + third, 4),       // high third
  ];
}

// ── Settings ──────────────────────────────────────────────────────────────────

export type StringStyle = "warm" | "bright" | "ethereal" | "lush" | "organ";

export interface StringPadsSettings {
  style: StringStyle;
  volume: number;
}

export const DEFAULT_STRING_SETTINGS: StringPadsSettings = {
  style: "warm",
  volume: 0.45,
};

export function normalizeStringSettings(raw: unknown): StringPadsSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_STRING_SETTINGS;
  const r = raw as Record<string, unknown>;
  const style: StringStyle =
    r.style === "bright" ? "bright"
    : r.style === "ethereal" ? "ethereal"
    : r.style === "lush" ? "lush"
    : r.style === "organ" ? "organ"
    : "warm";
  const volume =
    typeof r.volume === "number" && isFinite(r.volume)
      ? Math.min(1, Math.max(0, r.volume))
      : DEFAULT_STRING_SETTINGS.volume;
  return { style, volume };
}

// ── Synthesis ─────────────────────────────────────────────────────────────────

const DETUNE_CENTS = [-10, -4, 0, 4, 10]; // chorus unison spread

function buildPad(
  ctx: AudioContext,
  masterGain: GainNode,
  freqs: number[],
  style: StringStyle,
): OscillatorNode[] {
  const oscType: OscillatorType =
    style === "bright" ? "sawtooth"
    : style === "organ" ? "sine"
    : "triangle";

  // Tone shaping filter
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value =
    style === "bright" ? 0.6
    : style === "ethereal" ? 1.8
    : style === "lush" ? 1.2
    : style === "organ" ? 0.5
    : 0.9;
  filter.frequency.value =
    style === "bright" ? 2800
    : style === "ethereal" ? 1000
    : style === "lush" ? 1800
    : style === "organ" ? 3200
    : 1600;
  filter.connect(masterGain);

  // Slight chorus delay
  const delay = ctx.createDelay(0.06);
  delay.delayTime.value = style === "organ" ? 0.01 : 0.033;
  const fbGain = ctx.createGain();
  fbGain.gain.value =
    style === "ethereal" ? 0.45
    : style === "lush" ? 0.35
    : style === "organ" ? 0.05
    : 0.2;
  delay.connect(fbGain);
  fbGain.connect(delay);
  delay.connect(masterGain);

  const oscs: OscillatorNode[] = [];
  const perOsc = 1 / (freqs.length * DETUNE_CENTS.length * 1.8);

  for (const freq of freqs) {
    for (const detune of DETUNE_CENTS) {
      const osc = ctx.createOscillator();
      osc.type = oscType;
      osc.frequency.value = freq;
      osc.detune.value = detune;

      // LFO vibrato (not for bright or organ)
      if (style !== "bright" && style !== "organ") {
        const lfo = ctx.createOscillator();
        const lfoG = ctx.createGain();
        lfo.type = "sine";
        lfo.frequency.value = style === "lush" ? 3.0 + Math.random() * 0.5 : 4.2 + Math.random() * 0.8;
        lfoG.gain.value = style === "ethereal" ? 10 : style === "lush" ? 6 : 4;
        lfo.connect(lfoG);
        lfoG.connect(osc.detune);
        lfo.start(ctx.currentTime);
        oscs.push(lfo as unknown as OscillatorNode);
      }

      const oscGain = ctx.createGain();
      oscGain.gain.value = perOsc;
      osc.connect(oscGain);
      oscGain.connect(filter);
      oscGain.connect(delay);
      osc.start(ctx.currentTime);
      oscs.push(osc);
    }
  }

  return oscs;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface PadState {
  ctx: AudioContext;
  masterGain: GainNode;
  oscs: OscillatorNode[];
}

export function useStringPads(
  songKey: string | null | undefined,
  running: boolean,
  settings: StringPadsSettings,
): void {
  const stateRef   = useRef<PadState | null>(null);
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // Live volume knob — no restart needed
  useEffect(() => {
    if (!stateRef.current || !running) return;
    const { ctx, masterGain } = stateRef.current;
    masterGain.gain.setTargetAtTime(settings.volume, ctx.currentTime, 0.1);
  }, [settings.volume, running]);

  // Restart when key or style changes (or running toggles)
  useEffect(() => {
    const teardown = () => {
      if (!stateRef.current) return;
      const { ctx, masterGain } = stateRef.current;
      const now = ctx.currentTime;
      const s = settingsRef.current.style;
      const release = s === "ethereal" ? 2.5 : s === "lush" ? 2.0 : s === "organ" ? 0.1 : 1.5;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.linearRampToValueAtTime(0, now + release);
      setTimeout(() => ctx.close(), (release + 0.2) * 1000);
      stateRef.current = null;
    };

    if (!running) {
      teardown();
      return;
    }

    teardown(); // stop previous before starting new

    const parsed = parseKey(songKey);
    const { semitone, minor } = parsed ?? { semitone: 7, minor: false }; // fallback: G major
    const freqs = padFrequencies(semitone, minor);

    const ctx = new AudioContext();
    const masterGain = ctx.createGain();
    const { style, volume } = settingsRef.current;
    const attackSec =
      style === "ethereal" ? 2.2
      : style === "lush" ? 2.8
      : style === "organ" ? 0.05
      : style === "bright" ? 0.8
      : 1.4;
    masterGain.gain.setValueAtTime(0, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(volume, ctx.currentTime + attackSec);
    masterGain.connect(ctx.destination);

    const oscs = buildPad(ctx, masterGain, freqs, style);
    stateRef.current = { ctx, masterGain, oscs };

    return teardown;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, songKey, settings.style]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (stateRef.current) {
      stateRef.current.ctx.close();
      stateRef.current = null;
    }
  }, []);
}

// ── Control component ─────────────────────────────────────────────────────────

/** Strings icon (violin / bow shape) */
function StringsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* Body */}
      <path d="M12 2 C8 2 5 5 5 9 C5 11 6 12.5 7 14 L6 18 C5.5 19.5 6.5 21 8 21 L16 21 C17.5 21 18.5 19.5 18 18 L17 14 C18 12.5 19 11 19 9 C19 5 16 2 12 2 Z" />
      {/* Strings */}
      <line x1="9"  y1="5"  x2="9"  y2="20" />
      <line x1="12" y1="4"  x2="12" y2="20" />
      <line x1="15" y1="5"  x2="15" y2="20" />
    </svg>
  );
}

export function StringPadsControl({
  songKey,
  running,
  onToggle,
  settings,
  onSettingsChange,
}: {
  songKey: string | null | undefined;
  running: boolean;
  onToggle: () => void;
  settings: StringPadsSettings;
  onSettingsChange: (patch: Partial<StringPadsSettings>) => void;
}) {
  useStringPads(songKey, running, settings);

  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-neutral-700 px-2 py-1 print:hidden">
      {/* On/off */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={running ? "Stop string pads" : "Start string pads"}
        title={
          running
            ? "Stop string pads"
            : songKey
            ? `String pad in ${songKey}`
            : "String pad (no key set — defaults to G)"
        }
        className={`h-8 w-8 flex items-center justify-center rounded-md transition-colors duration-150 flex-shrink-0 ${
          running
            ? "bg-violet-500 text-white hover:bg-violet-600"
            : "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 hover:bg-gray-200 dark:hover:bg-neutral-700"
        }`}
      >
        <StringsIcon />
      </button>

      {/* Style dropdown */}
      <select
        value={settings.style}
        onChange={(e) => onSettingsChange({ style: e.target.value as StringStyle })}
        title="Drone pad style"
        className="h-7 text-xs font-medium rounded-md border border-gray-200 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 px-1.5 flex-shrink-0 cursor-pointer"
      >
        <option value="warm">Warm</option>
        <option value="bright">Bright</option>
        <option value="lush">Lush</option>
        <option value="ethereal">Ethereal</option>
        <option value="organ">Organ</option>
      </select>

      {/* Volume */}
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={settings.volume}
        onChange={(e) => onSettingsChange({ volume: Number(e.target.value) })}
        aria-label={`String pads volume ${Math.round(settings.volume * 100)}%`}
        title={`Volume: ${Math.round(settings.volume * 100)}%`}
        className="w-14 h-1 accent-violet-500 flex-shrink-0"
      />

      {/* Key badge */}
      <span
        className="text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0 select-none"
        style={{
          background: running ? "#8b5cf6" : undefined,
          color: running ? "#fff" : undefined,
        }}
        title="Key the chord is built from — set the song's Key in the editor"
      >
        {songKey || "G"}
      </span>
    </div>
  );
}
