"use client";

import { useEffect, useRef } from "react";

/**
 * The drone: one chord, held under the song for as long as it is switched on.
 *
 * It came out with the string pads, which it shared a file with, and it is
 * back on its own terms. The pad's other half — the arpeggio that walked the
 * song's own chords — is not here: this holds a single chord and nothing else,
 * which is what a drone is, and what makes it possible to name the chord in a
 * picker rather than having to write the song first.
 */

// ── Notes and keys ────────────────────────────────────────────────────────────

const NOTE_SEMITONE: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3,
  E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8,
  A: 9, "A#": 10, Bb: 10, B: 11,
};

/** The names a picked key is offered under — one spelling per pitch. */
const ROOT_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;

/** C4 is MIDI 60. */
function midiToHz(semitone: number, octave: number): number {
  return 440 * Math.pow(2, ((octave + 1) * 12 + semitone - 69) / 12);
}

export interface DroneKey {
  semitone: number;
  minor: boolean;
}

/** Parse "G", "Am", "F#m", "Bb", "Dbm" into a root and a quality. */
export function parseKeyName(key: string | null | undefined): DroneKey | null {
  if (!key) return null;
  const m = key.trim().match(/^([A-G])([#b]?)(m?)$/i);
  if (!m) return null;
  const semitone = NOTE_SEMITONE[m[1].toUpperCase() + m[2].toLowerCase().replace("#", "#")];
  if (semitone === undefined) return null;
  return { semitone, minor: m[3].toLowerCase() === "m" };
}

/** How a resolved key reads on a control: "G", "Am". */
export const droneKeyLabel = (key: DroneKey): string =>
  ROOT_NAMES[((key.semitone % 12) + 12) % 12] + (key.minor ? "m" : "");

/**
 * Root, third and fifth spread across three octaves — a bass note with the
 * chord stacked above it, rather than one note in one place. The third is what
 * makes major and minor audibly different, which is why the picker offers both
 * rather than only the twelve roots.
 */
export function droneFrequencies({ semitone, minor }: DroneKey): number[] {
  const third = minor ? 3 : 4;
  return [
    midiToHz(semitone, 2),
    midiToHz(semitone, 3),
    midiToHz(semitone + third, 3),
    midiToHz(semitone + 7, 3),
    midiToHz(semitone, 4),
    midiToHz(semitone + third, 4),
  ];
}

// ── Settings ──────────────────────────────────────────────────────────────────

export const DRONE_STYLES = [
  { value: "warm", label: "Warm", blurb: "Soft strings with a little movement in them." },
  { value: "bright", label: "Bright", blurb: "Open and reedy — carries under a full kit." },
  { value: "ethereal", label: "Ethereal", blurb: "Slow swell, deep chorus, barely there." },
  { value: "lush", label: "Lush", blurb: "The widest and thickest of the five." },
  { value: "organ", label: "Organ", blurb: "Dead still, and on and off the instant you ask." },
] as const;

export type DroneStyle = (typeof DRONE_STYLES)[number]["value"];

const STYLE_VALUES: readonly string[] = DRONE_STYLES.map((s) => s.value);

/** The key setting that means "whatever the song is in". */
export const SONG_KEY = "song";

export interface DroneSettings {
  /** SONG_KEY, or a key name the drone holds instead. */
  key: string;
  style: DroneStyle;
  volume: number;
}

export const DEFAULT_DRONE_SETTINGS: DroneSettings = {
  key: SONG_KEY,
  style: "warm",
  volume: 0.4,
};

/**
 * Read a stored drone, from this shape or from the string pad's.
 *
 * A sheet saved while the pads existed carries `{ mode, style, volume }` under
 * `metadata.strings`. Style and volume mean the same thing here, so they are
 * kept; `mode` does not survive, because the arpeggio it could name is not one
 * of the things this plays.
 */
export function normalizeDroneSettings(raw: unknown): DroneSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_DRONE_SETTINGS;
  const r = raw as Record<string, unknown>;
  const style = (
    typeof r.style === "string" && STYLE_VALUES.includes(r.style)
      ? r.style
      : DEFAULT_DRONE_SETTINGS.style
  ) as DroneStyle;
  // An unreadable key name would leave the drone holding something nobody
  // chose, so anything that will not parse falls back to the song's own key.
  const key =
    typeof r.key === "string" && (r.key === SONG_KEY || parseKeyName(r.key)) ? r.key : SONG_KEY;
  const volume =
    typeof r.volume === "number" && isFinite(r.volume)
      ? Math.min(1, Math.max(0, r.volume))
      : DEFAULT_DRONE_SETTINGS.volume;
  return { key, style, volume };
}

/** The picker's contents. The song's own key is offered above these two. */
export const DRONE_KEY_GROUPS: { label: string; items: { value: string; label: string }[] }[] = [
  { label: "Major", items: ROOT_NAMES.map((name) => ({ value: name, label: name })) },
  { label: "Minor", items: ROOT_NAMES.map((name) => ({ value: `${name}m`, label: `${name}m` })) },
];

/** A song with no Key: line and no key picked drones on G, as it always has. */
const FALLBACK_KEY: DroneKey = { semitone: 7, minor: false };

/**
 * Which chord the drone actually holds.
 *
 * Following the song means following its transposition too — move the sheet up
 * a tone and the drone goes with it. A key picked by name is pinned instead:
 * naming one is a statement about what should sound, and a transpose control
 * that quietly overrode it would make the picker a lie.
 */
export function resolveDroneKey(
  settings: DroneSettings,
  songKey: string | null | undefined,
  transpose: number = 0,
): DroneKey {
  if (settings.key !== SONG_KEY) return parseKeyName(settings.key) ?? FALLBACK_KEY;
  const song = parseKeyName(songKey) ?? FALLBACK_KEY;
  return { semitone: (((song.semitone + transpose) % 12) + 12) % 12, minor: song.minor };
}

// ── Synthesis ─────────────────────────────────────────────────────────────────

/** Chorus unison spread, in cents. */
const DETUNE_CENTS = [-10, -4, 0, 4, 10];

interface StyleShape {
  osc: OscillatorType;
  cutoff: number;
  q: number;
  /** Chorus delay and its feedback — what gives the drone its width. */
  delay: number;
  feedback: number;
  /** Vibrato depth in cents; 0 for the styles that hold dead still. */
  vibrato: number;
  vibratoHz: number;
  /** Swell in and tail out. The tail is also how long a stop takes. */
  attack: number;
  release: number;
}

const STYLE_SHAPES: Record<DroneStyle, StyleShape> = {
  warm:     { osc: "triangle", cutoff: 1600, q: 0.9, delay: 0.033, feedback: 0.20, vibrato: 4,  vibratoHz: 4.2, attack: 1.4,  release: 1.5 },
  bright:   { osc: "sawtooth", cutoff: 2800, q: 0.6, delay: 0.033, feedback: 0.20, vibrato: 0,  vibratoHz: 0,   attack: 0.8,  release: 1.5 },
  ethereal: { osc: "triangle", cutoff: 1000, q: 1.8, delay: 0.033, feedback: 0.45, vibrato: 10, vibratoHz: 4.2, attack: 2.2,  release: 2.5 },
  lush:     { osc: "triangle", cutoff: 1800, q: 1.2, delay: 0.033, feedback: 0.35, vibrato: 6,  vibratoHz: 3.0, attack: 2.8,  release: 2.0 },
  organ:    { osc: "sine",     cutoff: 3200, q: 0.5, delay: 0.010, feedback: 0.05, vibrato: 0,  vibratoHz: 0,   attack: 0.05, release: 0.1 },
};

/** Every node that has to be stopped again, in one list. */
function buildDrone(
  ctx: AudioContext,
  master: GainNode,
  freqs: number[],
  style: DroneStyle,
): OscillatorNode[] {
  const shape = STYLE_SHAPES[style];

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = shape.q;
  filter.frequency.value = shape.cutoff;
  filter.connect(master);

  const delay = ctx.createDelay(0.06);
  delay.delayTime.value = shape.delay;
  const feedback = ctx.createGain();
  feedback.gain.value = shape.feedback;
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(master);

  const oscs: OscillatorNode[] = [];
  const perOsc = 1 / (freqs.length * DETUNE_CENTS.length * 1.8);

  for (const freq of freqs) {
    for (const detune of DETUNE_CENTS) {
      const osc = ctx.createOscillator();
      osc.type = shape.osc;
      osc.frequency.value = freq;
      osc.detune.value = detune;

      if (shape.vibrato > 0) {
        // Each voice wobbles at its own rate. Thirty of them moving in step
        // would read as one wide vibrato rather than as a choir.
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.type = "sine";
        lfo.frequency.value = shape.vibratoHz + Math.random() * (style === "lush" ? 0.5 : 0.8);
        lfoGain.gain.value = shape.vibrato;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.detune);
        lfo.start(ctx.currentTime);
        oscs.push(lfo);
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

interface DroneState {
  ctx: AudioContext;
  master: GainNode;
}

/**
 * The drone, sounding.
 *
 * Volume rides live, because it is a knob you turn while listening. The key
 * and the style do not: both decide what the oscillators are, so changing
 * either swells the old chord out and the new one in rather than jumping.
 */
export function useDrone(
  running: boolean,
  settings: DroneSettings,
  songKey: string | null | undefined,
  transpose: number = 0,
): void {
  const stateRef = useRef<DroneState | null>(null);
  const volumeRef = useRef(settings.volume);

  useEffect(() => {
    volumeRef.current = settings.volume;
    const state = stateRef.current;
    if (state) state.master.gain.setTargetAtTime(settings.volume, state.ctx.currentTime, 0.1);
  }, [settings.volume]);

  const { semitone, minor } = resolveDroneKey(settings, songKey, transpose);
  const style = settings.style;

  useEffect(() => {
    if (!running) return;

    const ctx = new AudioContext();
    const master = ctx.createGain();
    const { attack, release } = STYLE_SHAPES[style];
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(volumeRef.current, ctx.currentTime + attack);
    master.connect(ctx.destination);

    const oscs = buildDrone(ctx, master, droneFrequencies({ semitone, minor }), style);
    stateRef.current = { ctx, master };

    return () => {
      stateRef.current = null;
      // Ring out rather than cut off — a drone that stops dead is a click.
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + release);
      setTimeout(() => {
        for (const osc of oscs) osc.stop();
        ctx.close().catch(() => {});
      }, (release + 0.3) * 1000);
    };
  }, [running, semitone, minor, style]);
}
