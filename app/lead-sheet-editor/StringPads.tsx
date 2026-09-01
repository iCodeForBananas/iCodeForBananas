"use client";

import { useEffect, useRef, useState } from "react";
import type { Chord } from "./progression";

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

/**
 * The chord as something to play: a bass note under a stack of chord tones that
 * climbs rather than circling one octave, so an arpeggio through it rises.
 */
function voicing(chord: Chord): { bass: number; notes: number[] } {
  const notes = chord.intervals.map((interval) => midiToHz(chord.root + interval, 3));
  // Carry the root, and the tone above it, into the next octave — the top of
  // the swell, and what makes a three-note triad still sound like strings.
  notes.push(midiToHz(chord.root + 12, 3));
  if (chord.intervals.length > 1) notes.push(midiToHz(chord.root + chord.intervals[1] + 12, 3));
  return { bass: midiToHz(chord.bass ?? chord.root, 2), notes: notes.slice(0, 6) };
}

// ── Settings ──────────────────────────────────────────────────────────────────

export type StringStyle = "warm" | "bright" | "ethereal" | "lush" | "organ";

/** Arpeggio walks the song's own chords; drone holds one chord off the key. */
export type StringMode = "arpeggio" | "drone";

export interface StringPadsSettings {
  mode: StringMode;
  style: StringStyle;
  volume: number;
}

export const DEFAULT_STRING_SETTINGS: StringPadsSettings = {
  mode: "arpeggio",
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
  // Sheets saved before there was a mode played a drone, but the chords are
  // what a song is for — they open on the arpeggio like everything else.
  const mode: StringMode = r.mode === "drone" ? "drone" : "arpeggio";
  const volume =
    typeof r.volume === "number" && isFinite(r.volume)
      ? Math.min(1, Math.max(0, r.volume))
      : DEFAULT_STRING_SETTINGS.volume;
  return { mode, style, volume };
}

// ── Synthesis ─────────────────────────────────────────────────────────────────

const DETUNE_CENTS = [-10, -4, 0, 4, 10]; // chorus unison spread

/** The detune spread an arpeggio note gets — fewer voices, since each bar makes several. */
const NOTE_DETUNE_CENTS = [-7, 0, 7];

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
  /** Swell and tail of the drone as a whole. */
  attack: number;
  release: number;
  /** Swell and tail of one arpeggio note — a fraction of the drone's. */
  noteAttack: number;
  noteRelease: number;
}

const STYLE_SHAPES: Record<StringStyle, StyleShape> = {
  warm:     { osc: "triangle", cutoff: 1600, q: 0.9, delay: 0.033, feedback: 0.20, vibrato: 4,  vibratoHz: 4.2, attack: 1.4,  release: 1.5,  noteAttack: 0.18, noteRelease: 0.9 },
  bright:   { osc: "sawtooth", cutoff: 2800, q: 0.6, delay: 0.033, feedback: 0.20, vibrato: 0,  vibratoHz: 0,   attack: 0.8,  release: 1.5,  noteAttack: 0.06, noteRelease: 0.7 },
  ethereal: { osc: "triangle", cutoff: 1000, q: 1.8, delay: 0.033, feedback: 0.45, vibrato: 10, vibratoHz: 4.2, attack: 2.2,  release: 2.5,  noteAttack: 0.50, noteRelease: 1.8 },
  lush:     { osc: "triangle", cutoff: 1800, q: 1.2, delay: 0.033, feedback: 0.35, vibrato: 6,  vibratoHz: 3.0, attack: 2.8,  release: 2.0,  noteAttack: 0.40, noteRelease: 1.5 },
  organ:    { osc: "sine",     cutoff: 3200, q: 0.5, delay: 0.010, feedback: 0.05, vibrato: 0,  vibratoHz: 0,   attack: 0.05, release: 0.1,  noteAttack: 0.02, noteRelease: 0.12 },
};

function buildPad(
  ctx: AudioContext,
  masterGain: GainNode,
  freqs: number[],
  style: StringStyle,
): OscillatorNode[] {
  const shape = STYLE_SHAPES[style];

  // Tone shaping filter
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = shape.q;
  filter.frequency.value = shape.cutoff;
  filter.connect(masterGain);

  // Slight chorus delay
  const delay = ctx.createDelay(0.06);
  delay.delayTime.value = shape.delay;
  const fbGain = ctx.createGain();
  fbGain.gain.value = shape.feedback;
  delay.connect(fbGain);
  fbGain.connect(delay);
  delay.connect(masterGain);

  const oscs: OscillatorNode[] = [];
  const perOsc = 1 / (freqs.length * DETUNE_CENTS.length * 1.8);

  for (const freq of freqs) {
    for (const detune of DETUNE_CENTS) {
      const osc = ctx.createOscillator();
      osc.type = shape.osc;
      osc.frequency.value = freq;
      osc.detune.value = detune;

      if (shape.vibrato > 0) {
        const lfo = ctx.createOscillator();
        const lfoG = ctx.createGain();
        lfo.type = "sine";
        lfo.frequency.value = shape.vibratoHz + Math.random() * (style === "lush" ? 0.5 : 0.8);
        lfoG.gain.value = shape.vibrato;
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

/**
 * One voice of the pad: detuned oscillators that swell in at `when`, hold, and
 * ring out past the end of their hold. Every node is scheduled up front and
 * stops on its own, so the scheduler never has to come back for it.
 */
function playPadNote(
  ctx: BaseAudioContext,
  dst: AudioNode,
  freq: number,
  when: number,
  hold: number,
  peak: number,
  style: StringStyle,
) {
  const shape = STYLE_SHAPES[style];
  // A note shorter than its own swell would never reach full voice, so on a
  // fast progression the attack shortens with it rather than the note vanishing.
  const attack = Math.min(shape.noteAttack, hold * 0.6);
  const release = shape.noteRelease;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = shape.q;
  filter.frequency.value = shape.cutoff;
  filter.connect(dst);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(peak, when + attack);
  gain.gain.setValueAtTime(peak, when + hold);
  gain.gain.linearRampToValueAtTime(0, when + hold + release);
  gain.connect(filter);

  const perOsc = 1 / NOTE_DETUNE_CENTS.length;
  for (const detune of NOTE_DETUNE_CENTS) {
    const osc = ctx.createOscillator();
    osc.type = shape.osc;
    osc.frequency.value = freq;
    osc.detune.value = detune;

    const oscGain = ctx.createGain();
    oscGain.gain.value = perOsc;
    osc.connect(oscGain);
    oscGain.connect(gain);
    osc.start(when);
    osc.stop(when + hold + release + 0.05);
  }
}

// ── Arpeggio scheduler ────────────────────────────────────────────────────────

const LOOKAHEAD = 0.3;  // seconds of bars scheduled ahead of the clock
const TICK_MS = 40;     // scheduler polling interval

/**
 * The song's own progression, a bar to a chord, played as a pad that arpeggiates
 * into place: the notes of each chord enter one after another over the first
 * part of the bar and then all hold together to the end of it, so the chord
 * arrives as a swell rather than a block. The bass note is there from the
 * downbeat, holding the bar underneath.
 *
 * Returns the index of the chord currently sounding, or -1 while silent, which
 * is what puts the chord's name on the control.
 */
export function useStringArpeggio(
  chords: Chord[],
  bpm: number,
  beatsPerBar: number,
  running: boolean,
  settings: StringPadsSettings,
): number {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Badge updates waiting for their bar to actually arrive. */
  const pendingRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const nextBarRef = useRef(0);
  const chordIdxRef = useRef(0);
  const chordsRef = useRef(chords);
  const bpmRef = useRef(bpm);
  const beatsRef = useRef(beatsPerBar);
  const styleRef = useRef(settings.style);
  const volumeRef = useRef(settings.volume);
  const [activeChord, setActiveChord] = useState(-1);

  // Kept in refs so a tempo nudge, a transpose, or a new style lands on the
  // next bar instead of cutting the pad off and starting it again.
  useEffect(() => { chordsRef.current = chords; }, [chords]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { beatsRef.current = beatsPerBar; }, [beatsPerBar]);
  useEffect(() => { styleRef.current = settings.style; }, [settings.style]);
  useEffect(() => {
    volumeRef.current = settings.volume;
    if (masterRef.current && ctxRef.current) {
      masterRef.current.gain.setTargetAtTime(settings.volume, ctxRef.current.currentTime, 0.1);
    }
  }, [settings.volume]);

  useEffect(() => {
    if (!running || chords.length === 0) return;

    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = volumeRef.current;
    master.connect(ctx.destination);
    ctxRef.current = ctx;
    masterRef.current = master;

    // Start a beat into the future so the first swell isn't clipped.
    nextBarRef.current = ctx.currentTime + 0.08;
    chordIdxRef.current = 0;

    const tick = () => {
      const progression = chordsRef.current;
      if (!progression.length) return;
      const barSeconds = (60 / Math.max(20, bpmRef.current)) * Math.max(1, beatsRef.current);

      while (nextBarRef.current < ctx.currentTime + LOOKAHEAD) {
        const when = nextBarRef.current;
        const index = chordIdxRef.current % progression.length;
        const chord = progression[index];
        const style = styleRef.current;
        const { bass, notes } = voicing(chord);

        // The notes enter across the front of the bar and every one of them
        // holds to the end of it — the arpeggio is how the chord arrives, not
        // a run of separate notes.
        const step = barSeconds / (notes.length + 2);
        const peak = 0.9 / (notes.length + 1);
        notes.forEach((freq, i) => {
          playPadNote(ctx, master, freq, when + i * step, barSeconds - i * step, peak, style);
        });
        playPadNote(ctx, master, bass, when, barSeconds, peak, style);

        // The chord is scheduled before it sounds, so the badge waits for it.
        const delayMs = Math.max(0, (when - ctx.currentTime) * 1000);
        pendingRef.current.push(setTimeout(() => setActiveChord(index), delayMs));

        chordIdxRef.current += 1;
        nextBarRef.current += barSeconds;
      }
    };

    tick();
    timerRef.current = setInterval(tick, TICK_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      // A bar already scheduled would otherwise put its name on a stopped pad.
      for (const pending of pendingRef.current) clearTimeout(pending);
      pendingRef.current = [];
      // Let whatever is ringing ring out rather than cutting it dead.
      const release = STYLE_SHAPES[styleRef.current].release;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + release);
      setTimeout(() => ctx.close().catch(() => {}), (release + 0.3) * 1000);
      ctxRef.current = null;
      masterRef.current = null;
      setActiveChord(-1);
    };
  }, [running, chords.length]);

  return activeChord;
}

// ── Drone hook ────────────────────────────────────────────────────────────────

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
      const release = STYLE_SHAPES[settingsRef.current.style].release;
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
    const attackSec = STYLE_SHAPES[style].attack;
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
  progression,
  bpm,
  beatsPerBar,
  running,
  onToggle,
  settings,
  onSettingsChange,
}: {
  songKey: string | null | undefined;
  /** The song's own chords, a bar apiece. Empty when the sheet spells none. */
  progression: Chord[];
  bpm: number;
  beatsPerBar: number;
  running: boolean;
  onToggle: () => void;
  settings: StringPadsSettings;
  onSettingsChange: (patch: Partial<StringPadsSettings>) => void;
}) {
  // A song with no chords written in it has nothing to arpeggiate, so it holds
  // the key instead — the setting stays where it is, ready for a sheet that has
  // them. Both hooks are always called; only one of them is ever running.
  const canArpeggiate = progression.length > 0;
  const arpeggiating = running && settings.mode === "arpeggio" && canArpeggiate;
  const activeChord = useStringArpeggio(progression, bpm, beatsPerBar, arpeggiating, settings);
  useStringPads(songKey, running && !arpeggiating, settings);

  const playing = activeChord >= 0 && activeChord < progression.length
    ? progression[activeChord].symbol
    : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 dark:border-neutral-700 px-2 py-1 print:hidden">
      {/* On/off */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={running ? "Stop string pads" : "Start string pads"}
        title={
          running
            ? "Stop string pads"
            : arpeggiating || (settings.mode === "arpeggio" && canArpeggiate)
            ? `String pads through the song's chords: ${progression.map((c) => c.symbol).join(" ")}`
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

      {/* Chords / drone */}
      <div className="flex rounded-md overflow-hidden border border-gray-200 dark:border-neutral-700 flex-shrink-0">
        {(["arpeggio", "drone"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onSettingsChange({ mode })}
            disabled={mode === "arpeggio" && !canArpeggiate}
            className={`px-2 h-7 text-xs font-medium transition-colors duration-100 disabled:opacity-40 disabled:cursor-not-allowed ${
              settings.mode === mode
                ? "bg-violet-500 text-white"
                : "bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-neutral-400 hover:bg-gray-200 dark:hover:bg-neutral-700"
            }`}
            title={
              mode === "arpeggio"
                ? canArpeggiate
                  ? "Arpeggiate the song's own chords, a bar each"
                  : "No chords written in this song yet"
                : "Hold one chord off the song's key"
            }
          >
            {mode === "arpeggio" ? "Chords" : "Drone"}
          </button>
        ))}
      </div>

      {/* Style dropdown */}
      <select
        value={settings.style}
        onChange={(e) => onSettingsChange({ style: e.target.value as StringStyle })}
        title="Pad voice"
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

      {/* What's sounding: the chord being played, or the key it's droning on */}
      <span
        className="text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0 select-none tabular-nums"
        style={{
          background: running ? "#8b5cf6" : undefined,
          color: running ? "#fff" : undefined,
        }}
        title={
          arpeggiating
            ? "Chord playing now — read from the song's chorus"
            : "Key the chord is built from — set the song's Key in the editor"
        }
      >
        {playing ?? songKey ?? "G"}
      </span>
    </div>
  );
}
