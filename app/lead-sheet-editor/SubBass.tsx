"use client";

import { useEffect, useRef, useState } from "react";

// ─── Sub bass walk-down ───────────────────────────────────────────────────────
//
// A pitched drum: one deep sine thump per step, walking down a line of notes
// you type out. Every hit is the same "dong" — a fast pitch drop into a low
// fundamental, the way an 808 kick is built — so a run of them reads as a drum
// part that happens to have notes in it rather than as a bass guitar.
//
// The walk is the point. Notes are written as bare names — G F# F E — and the
// octave each one lands in is worked out rather than typed: every note is
// placed below the one before it, so the line only ever descends, and the whole
// walk resets to the top of its range when it loops. That means the same four
// letters give you a walk-down without anyone having to think about octaves.
//
// This layer never reads the song's chords. The notes it plays are the notes
// you gave it, which is what makes it usable on a sheet whose chords aren't
// written down.

const NOTE_SEMITONE: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** C4 = MIDI 60 = 261.63 Hz. */
function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * The bottom of the walk. Below about 30 Hz a sine is felt rather than heard on
 * anything but a subwoofer, so a long note list plateaus down here instead of
 * descending into silence.
 */
const FLOOR_MIDI = 24; // C1, ~32.7 Hz

/** The top — a walk above this isn't sub bass any more. B3, the top of MAX_OCTAVE. */
const CEIL_MIDI = 59;

/** More notes than this is a song, not a walk. */
export const MAX_NOTES = 32;

export interface ParsedNote {
  /** Pitch class, 0 = C. */
  semitone: number;
  /** The octave written after the letter, or null to let the walk place it. */
  octave: number | null;
}

/**
 * A typed note line as pitch classes. Notes are separated by spaces, commas or
 * dashes, so "G F# F E", "G, F#, F, E" and "G-F#-F-E" all read the same — a
 * walk-down gets written all three ways.
 *
 * A note may carry its own octave — "G2" — which pins it there and overrides
 * the walk. Anything unreadable is dropped rather than failing the whole line,
 * since this is parsed on every keystroke while someone is still typing.
 */
export function parseNoteList(text: string): ParsedNote[] {
  const notes: ParsedNote[] = [];
  for (const token of text.split(/[\s,|/–—-]+/)) {
    if (!token) continue;
    const m = token.match(/^([A-Ga-g][#b]?)(\d)?$/);
    if (!m) continue;
    const semitone = NOTE_SEMITONE[m[1][0].toUpperCase() + (m[1][1] ?? "")];
    if (semitone === undefined) continue;
    notes.push({ semitone, octave: m[2] === undefined ? null : Number(m[2]) });
    if (notes.length >= MAX_NOTES) break;
  }
  return notes;
}

export interface WalkStep {
  /** How the note reads on the badge, after transposition — "F#2". */
  label: string;
  midi: number;
  hz: number;
}

/**
 * The notes as pitches, each one below the last.
 *
 * A note with no octave of its own starts from the octave above and drops by
 * octaves until it clears the previous step — which is what turns four letters
 * into a walk-down, and what makes a repeated note ("G G") fall an octave
 * rather than sit still. A note that would fall below the floor stays at the
 * lowest octave that clears it, so the bottom of a long walk flattens out
 * instead of disappearing.
 *
 * `transposeSteps` follows the sheet on screen, the same way the pads do: the
 * notes are stored as they were typed and sound in the key being read.
 */
export function buildWalk(
  notes: ParsedNote[],
  startOctave: number,
  transposeSteps = 0,
): WalkStep[] {
  const preferFlats = transposeSteps < 0;
  const steps: WalkStep[] = [];
  let previous: number | null = null;

  for (const note of notes) {
    const pitchClass = (((note.semitone + transposeSteps) % 12) + 12) % 12;
    let midi: number;

    if (note.octave !== null) {
      // Written octaves are taken at their word — they are how you break out of
      // the descent and jump the walk back up partway through.
      midi = (note.octave + 1) * 12 + pitchClass;
    } else {
      midi = (startOctave + 1) * 12 + pitchClass;
      if (previous !== null) {
        // Climb to just above the last note, then step down past it — which
        // lands on the nearest note of that name below the one before it.
        while (midi <= previous) midi += 12;
        while (midi >= previous) midi -= 12;
        // Out of room at the bottom. Twelve pitch classes and a floor can't
        // descend forever, so the walk takes the lowest octave still worth
        // hearing and carries on down from there, the way a bass player who
        // ran out of neck starts the run again.
        while (midi < FLOOR_MIDI) midi += 12;
      }
    }

    // Kept in range by octaves, never by semitones: clamping to the nearest
    // legal pitch would quietly change which note sounds, and a walk that plays
    // a note you didn't write is worse than one that plays it an octave off.
    while (midi > CEIL_MIDI) midi -= 12;
    while (midi < FLOOR_MIDI) midi += 12;

    const octave = Math.floor(midi / 12) - 1;
    const names = preferFlats ? FLAT_NAMES : SHARP_NAMES;
    steps.push({ label: `${names[midi % 12]}${octave}`, midi, hz: midiToHz(midi) });
    previous = midi;
  }

  return steps;
}

// ── Settings ──────────────────────────────────────────────────────────────────

/** How much of a bar one note gets. */
export type SubBassRate = "2bar" | "bar" | "half" | "beat";

/**
 * The voice of a single hit — how much of it is felt and how much is heard.
 *
 * The four run from the deepest to the most forward: `sub` is nearly a pure
 * sine you feel more than hear, `round` adds enough octave to carry on a
 * laptop, `punch` is the drum end of it, and `808` is the long saturated one
 * that slides from the note before it. They are stored by these names rather
 * than by index so a new voice can be added anywhere in the list.
 */
export type SubBassTone = "sub" | "round" | "punch" | "808";

export interface SubBassSettings {
  /** The walk as typed, e.g. "G F# F E". Parsed by parseNoteList. */
  notes: string;
  /** Octave the walk starts from before it begins descending. */
  octave: number;
  rate: SubBassRate;
  tone: SubBassTone;
  volume: number;
}

export const DEFAULT_SUB_BASS_SETTINGS: SubBassSettings = {
  notes: "G F# F E",
  octave: 2,
  rate: "bar",
  tone: "sub",
  volume: 0.7,
};

const RATES: SubBassRate[] = ["2bar", "bar", "half", "beat"];
export const TONES: SubBassTone[] = ["sub", "round", "punch", "808"];

/**
 * Octaves the walk can start from. Below 1 there is no room left to descend
 * before the floor; above 3 it stops being bass. Every note of every octave in
 * this range fits between FLOOR_MIDI and CEIL_MIDI, so the octave on the label
 * is always the octave you hear.
 */
export const MIN_OCTAVE = 1;
export const MAX_OCTAVE = 3;

/** Coerce whatever came back from the database into usable settings. */
export function normalizeSubBassSettings(raw: unknown): SubBassSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_SUB_BASS_SETTINGS;
  const r = raw as Record<string, unknown>;
  const octave =
    typeof r.octave === "number" && isFinite(r.octave)
      ? Math.round(Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, r.octave)))
      : DEFAULT_SUB_BASS_SETTINGS.octave;
  const volume =
    typeof r.volume === "number" && isFinite(r.volume)
      ? Math.min(1, Math.max(0, r.volume))
      : DEFAULT_SUB_BASS_SETTINGS.volume;
  return {
    notes: typeof r.notes === "string" ? r.notes.slice(0, 200) : DEFAULT_SUB_BASS_SETTINGS.notes,
    octave,
    rate: RATES.includes(r.rate as SubBassRate) ? (r.rate as SubBassRate) : DEFAULT_SUB_BASS_SETTINGS.rate,
    tone: TONES.includes(r.tone as SubBassTone) ? (r.tone as SubBassTone) : DEFAULT_SUB_BASS_SETTINGS.tone,
    volume,
  };
}

export function isDefaultSubBassSettings(s: SubBassSettings): boolean {
  return (
    s.notes === DEFAULT_SUB_BASS_SETTINGS.notes &&
    s.octave === DEFAULT_SUB_BASS_SETTINGS.octave &&
    s.rate === DEFAULT_SUB_BASS_SETTINGS.rate &&
    s.tone === DEFAULT_SUB_BASS_SETTINGS.tone &&
    s.volume === DEFAULT_SUB_BASS_SETTINGS.volume
  );
}

// ── Text form ─────────────────────────────────────────────────────────────────
//
// The walk also lives in the song text as a preamble line, alongside Key, Tempo
// and Drums, so it can be typed by hand and so the arranger — which reads the
// text rather than the sheet's metadata — plays the notes this song actually
// walks down instead of the ones it ships with:
//
//   Sub bass: G F# F E, oct 2, bar, round, 70%
//
// Notes come first and are the only field allowed spaces, so splitting on
// commas parses cleanly.

const SUB_BASS_LINE_RE = /\bSub bass:\s*([^\n|]*)/i;

const RATE_WORDS: Record<string, SubBassRate> = {
  "2 bars": "2bar", "2bar": "2bar", "2 bar": "2bar",
  "bar": "bar", "1 bar": "bar", "1bar": "bar",
  "half bar": "half", "half": "half", "½ bar": "half", "½bar": "half",
  "beat": "beat", "1 beat": "beat",
};

const RATE_WORD_OUT: Record<SubBassRate, string> = {
  "2bar": "2 bars",
  bar: "bar",
  half: "half bar",
  beat: "beat",
};

/** The `Sub bass: …` line as written into the song text. */
export function formatSubBassSettings(s: SubBassSettings): string {
  const parts = [
    s.notes.trim() || DEFAULT_SUB_BASS_SETTINGS.notes,
    `oct ${s.octave}`,
    RATE_WORD_OUT[s.rate],
    s.tone,
    `${Math.round(s.volume * 100)}%`,
  ];
  return `Sub bass: ${parts.join(", ")}`;
}

/**
 * Reads a `Sub bass: …` line, in whatever order the fields were typed. Returns
 * null when the line isn't there at all — which is different from a line that's
 * present but garbled, where the defaults stand in for the unreadable parts.
 */
export function parseSubBassSettingsLine(line: string): SubBassSettings | null {
  const m = line.match(SUB_BASS_LINE_RE);
  if (!m) return null;

  const fields = m[1].split(",").map((f) => f.trim()).filter(Boolean);
  const settings = { ...DEFAULT_SUB_BASS_SETTINGS };
  let sawNotes = false;

  for (const field of fields) {
    const lower = field.toLowerCase();
    const octave = lower.match(/^oct(?:ave)?\s*(\d)$/);
    const percent = lower.match(/^(\d{1,3})\s*%$/);

    if (octave) {
      settings.octave = Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, parseInt(octave[1], 10)));
    } else if (percent) {
      settings.volume = Math.min(1, Math.max(0, parseInt(percent[1], 10) / 100));
    } else if (RATE_WORDS[lower]) {
      settings.rate = RATE_WORDS[lower];
    } else if (!sawNotes && parseNoteList(field).length > 0) {
      // Notes are the only field that can hold spaces, and "sub" reads as a
      // tone rather than a walk, so the note list has to be claimed first.
      settings.notes = field;
      sawNotes = true;
    } else if (TONES.includes(lower as SubBassTone)) {
      settings.tone = lower as SubBassTone;
    }
  }

  return settings;
}

/** Strips the `Sub bass: …` line's text so it never shows up as a note. */
export function stripSubBassSettings(line: string): string {
  return line.replace(SUB_BASS_LINE_RE, "").trim();
}

export function hasSubBassSettingsLine(line: string): boolean {
  return SUB_BASS_LINE_RE.test(line);
}

/** Beats one note lasts, given the song's bar length. */
export function stepBeats(rate: SubBassRate, beatsPerBar: number): number {
  const bar = Math.max(1, beatsPerBar);
  if (rate === "2bar") return bar * 2;
  if (rate === "bar") return bar;
  if (rate === "half") return Math.max(1, bar / 2);
  return 1;
}

// ── Synthesis ─────────────────────────────────────────────────────────────────

interface ToneShape {
  /** How far above the note the hit starts, in octaves — the "d" of the dong. */
  dropOctaves: number;
  /** How long that drop takes. Short reads as a click, long as a swoop. */
  dropTime: number;
  /** Longest a hit rings for, however much room the step leaves it. */
  maxDecay: number;
  /** Level of the octave-up harmonic that makes the pitch audible on a phone. */
  harmonic: number;
  /** Level of the noise transient on the attack. */
  click: number;
  /**
   * How hard the fundamental is driven into a soft clipper, 0 for none. Odd
   * harmonics of a 45 Hz sine land in the range a laptop can actually move air
   * at, which is the whole trick behind an 808 that reads as huge on a phone
   * and still measures as sub on a meter.
   */
  drive: number;
  /**
   * Seconds spent sliding up or down from the previous note instead of
   * starting on this one. This is the part that makes a run of 808s read as
   * one instrument being played rather than a row of separate hits.
   */
  glide: number;
  /**
   * Make-up trim, so every voice peaks in the same place.
   *
   * A driven voice sums its clipped branch on top of the clean one and comes
   * out well past full scale — rendering one 808 hit through an
   * OfflineAudioContext peaked at 1.40 before this existed, and anything over
   * 1.0 is clipped by the destination into something that is distorted by
   * accident rather than by design. 0.62 brings that back to about 0.87, in
   * line with the other three. Measured rather than guessed.
   */
  level: number;
}

const TONE_SHAPES: Record<SubBassTone, ToneShape> = {
  // Nearly a pure sine — the deepest of the four, and the one that needs a
  // real speaker to hear rather than feel.
  sub:   { dropOctaves: 1.6, dropTime: 0.055, maxDecay: 1.10, harmonic: 0.05, click: 0.00, drive: 0.00, glide: 0,     level: 1.00 },
  // Enough of an octave above the fundamental to carry the note on a laptop.
  round: { dropOctaves: 1.2, dropTime: 0.070, maxDecay: 1.40, harmonic: 0.22, click: 0.04, drive: 0.00, glide: 0,     level: 1.00 },
  // The drum end of it: fast drop, hard front, short tail.
  punch: { dropOctaves: 2.2, dropTime: 0.022, maxDecay: 0.55, harmonic: 0.14, click: 0.16, drive: 0.00, glide: 0,     level: 1.00 },
  // The long one. Barely any drop, because the pitch is the point and a swoop
  // would smear it; a hard front from the clipper instead of from a noise
  // burst; and a tail that runs as long as the step will let it.
  "808": { dropOctaves: 0.5, dropTime: 0.018, maxDecay: 2.60, harmonic: 0.10, click: 0.06, drive: 0.85, glide: 0.055, level: 0.62 },
};

/**
 * Soft-clip curve for the drive stage — tanh, sampled.
 *
 * Built once per context and shared: a WaveShaper's curve is a Float32Array the
 * node only reads, so every 808 in a song can point at the same one, and
 * rebuilding a 1k table per hit at sixteenth-note rates is exactly the kind of
 * per-note allocation that makes a scheduler stutter.
 */
type DriveCurve = Float32Array<ArrayBuffer>;

const driveCurveByContext = new WeakMap<BaseAudioContext, DriveCurve>();

function driveCurve(ctx: BaseAudioContext): DriveCurve {
  const cached = driveCurveByContext.get(ctx);
  if (cached) return cached;
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * 4)) as DriveCurve;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 2.2);
  }
  driveCurveByContext.set(ctx, curve);
  return curve;
}

/**
 * One hit. Everything is scheduled up front against `when` and stops on its
 * own, so the scheduler never has to come back for a note it already placed.
 *
 * `hold` is the room the step leaves — a hit never rings past its own step, so
 * turning the rate up tightens the notes rather than smearing them together.
 */
export function playSubHit(
  ctx: BaseAudioContext,
  dst: AudioNode,
  hz: number,
  when: number,
  hold: number,
  tone: SubBassTone,
  /**
   * The note before this one, for the voices that slide. Null on the first hit
   * of a run, where there is nothing to slide from and the pitch drop stands in.
   */
  fromHz: number | null = null,
) {
  const shape = TONE_SHAPES[tone];
  const decay = Math.max(0.12, Math.min(shape.maxDecay, hold * 0.92));
  const attack = 0.004;

  const body = ctx.createGain();
  body.gain.setValueAtTime(0, when);
  body.gain.linearRampToValueAtTime(shape.level, when + attack);
  body.gain.exponentialRampToValueAtTime(0.0008, when + decay);
  body.connect(dst);

  // Fundamental: starts above the note and falls into it. The drop is what
  // makes a sustained sine read as a struck thing.
  //
  // A gliding voice starts on the previous note instead and slides, which is a
  // different gesture: the drop says "struck", the glide says "still the same
  // string". A repeated note has nothing to slide across, so it drops.
  const osc = ctx.createOscillator();
  osc.type = "sine";
  const glideFrom = shape.glide > 0 && fromHz !== null && Math.abs(fromHz - hz) > 0.5 ? fromHz : null;
  if (glideFrom !== null) {
    osc.frequency.setValueAtTime(glideFrom, when);
    osc.frequency.exponentialRampToValueAtTime(hz, when + Math.min(shape.glide, decay));
  } else {
    osc.frequency.setValueAtTime(hz * Math.pow(2, shape.dropOctaves), when);
    osc.frequency.exponentialRampToValueAtTime(hz, when + Math.min(shape.dropTime, decay));
  }
  const oscGain = ctx.createGain();
  oscGain.gain.value = 0.9;
  osc.connect(oscGain);

  if (shape.drive > 0) {
    // Clipped and clean in parallel rather than in series. All-clipped loses
    // the weight the fundamental is there for; this keeps the sine underneath
    // and lays the harmonics it needs to be heard on top of it.
    const shaper = ctx.createWaveShaper();
    shaper.curve = driveCurve(ctx);
    shaper.oversample = "2x";
    const driveIn = ctx.createGain();
    driveIn.gain.value = 1 + shape.drive * 3;
    const driveOut = ctx.createGain();
    driveOut.gain.value = shape.drive * 0.32;
    // Above the fundamental only: the clipper's low harmonics would just add
    // more of what is already there, and its top end is where the note lives
    // on a speaker too small to reproduce it.
    const shape_hp = ctx.createBiquadFilter();
    shape_hp.type = "highpass";
    shape_hp.frequency.value = Math.max(80, hz * 1.5);
    oscGain.connect(driveIn);
    driveIn.connect(shaper);
    shaper.connect(shape_hp);
    shape_hp.connect(driveOut);
    driveOut.connect(body);
  }

  oscGain.connect(body);
  osc.start(when);
  osc.stop(when + decay + 0.05);

  // The octave above, decaying faster than the fundamental. A 40 Hz sine on a
  // phone speaker is inaudible; this is the part that tells you which note it
  // was, and it is gone before the weight underneath it is.
  if (shape.harmonic > 0) {
    const harm = ctx.createOscillator();
    harm.type = "sine";
    harm.frequency.setValueAtTime(hz * 2, when);
    const harmGain = ctx.createGain();
    harmGain.gain.setValueAtTime(0, when);
    harmGain.gain.linearRampToValueAtTime(shape.harmonic, when + attack);
    harmGain.gain.exponentialRampToValueAtTime(0.0008, when + decay * 0.45);
    harm.connect(harmGain);
    harmGain.connect(dst);
    harm.start(when);
    harm.stop(when + decay * 0.45 + 0.05);
  }

  // A few milliseconds of filtered noise on the front — the beater, not a note.
  if (shape.click > 0) {
    const len = Math.max(1, Math.ceil(ctx.sampleRate * 0.012));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * ((len - i) / len) ** 2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const clickGain = ctx.createGain();
    clickGain.gain.value = shape.click;
    src.connect(lp);
    lp.connect(clickGain);
    clickGain.connect(dst);
    src.start(when);
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

const LOOKAHEAD = 0.3; // seconds of steps scheduled ahead of the clock
const TICK_MS = 40;    // scheduler polling interval

/**
 * Walks the notes at the song's tempo, looping back to the top of the walk when
 * it runs out. Tempo, note list, octave and tone all live in refs, so editing
 * any of them lands on the next step rather than restarting the walk under the
 * player's hands.
 *
 * Returns the index of the step sounding now, or -1 while silent — which is
 * what puts the note's name on the control.
 */
export function useSubBassWalk(
  walk: WalkStep[],
  bpm: number,
  beatsPerBar: number,
  running: boolean,
  settings: SubBassSettings,
): number {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Badge updates waiting for their step to actually arrive. */
  const pendingRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const nextStepRef = useRef(0);
  const indexRef = useRef(0);
  const walkRef = useRef(walk);
  const bpmRef = useRef(bpm);
  const beatsRef = useRef(beatsPerBar);
  const rateRef = useRef(settings.rate);
  const toneRef = useRef(settings.tone);
  const volumeRef = useRef(settings.volume);
  const [activeStep, setActiveStep] = useState(-1);

  useEffect(() => { walkRef.current = walk; }, [walk]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { beatsRef.current = beatsPerBar; }, [beatsPerBar]);
  useEffect(() => { rateRef.current = settings.rate; }, [settings.rate]);
  useEffect(() => { toneRef.current = settings.tone; }, [settings.tone]);
  useEffect(() => {
    volumeRef.current = settings.volume;
    if (masterRef.current && ctxRef.current) {
      masterRef.current.gain.setTargetAtTime(settings.volume, ctxRef.current.currentTime, 0.05);
    }
  }, [settings.volume]);

  // A walk that changes length mid-run would leave the index pointing past the
  // end; the modulo in the loop handles that, but the walk starts over rather
  // than picking up in the middle of a line nobody typed.
  const walkLength = walk.length;

  useEffect(() => {
    if (!running || walkLength === 0) return;

    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = volumeRef.current;
    master.connect(ctx.destination);
    ctxRef.current = ctx;
    masterRef.current = master;

    // Start a beat into the future so the first hit isn't clipped.
    nextStepRef.current = ctx.currentTime + 0.06;
    indexRef.current = 0;

    const tick = () => {
      const steps = walkRef.current;
      if (!steps.length) return;
      const beatSeconds = 60 / Math.max(20, bpmRef.current);
      const holdSeconds = beatSeconds * stepBeats(rateRef.current, beatsRef.current);

      while (nextStepRef.current < ctx.currentTime + LOOKAHEAD) {
        const when = nextStepRef.current;
        const index = indexRef.current % steps.length;
        // The note before this one in the walk, which the gliding voices slide
        // from. On the very first hit there is none.
        const prev = indexRef.current === 0
          ? null
          : steps[(indexRef.current - 1) % steps.length].hz;
        playSubHit(ctx, master, steps[index].hz, when, holdSeconds, toneRef.current, prev);

        // The hit is scheduled before it sounds, so the badge waits for it.
        const delayMs = Math.max(0, (when - ctx.currentTime) * 1000);
        pendingRef.current.push(setTimeout(() => setActiveStep(index), delayMs));

        indexRef.current += 1;
        nextStepRef.current += holdSeconds;
      }
    };

    tick();
    timerRef.current = setInterval(tick, TICK_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      // A step already scheduled would otherwise put its name on a stopped walk.
      for (const pending of pendingRef.current) clearTimeout(pending);
      pendingRef.current = [];
      // Let the last hit ring out rather than cutting it dead.
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + 0.25);
      setTimeout(() => ctx.close().catch(() => {}), 500);
      ctxRef.current = null;
      masterRef.current = null;
      setActiveStep(-1);
    };
  }, [running, walkLength]);

  return activeStep;
}

/** The walk a settings object describes, ready to play. */
export function walkFromSettings(settings: SubBassSettings, transposeSteps = 0): WalkStep[] {
  return buildWalk(parseNoteList(settings.notes), settings.octave, transposeSteps);
}

// ── Names ─────────────────────────────────────────────────────────────────────

export const TONE_LABELS: Record<SubBassTone, string> = {
  sub: "Sub",
  round: "Round",
  punch: "Punch",
  "808": "808",
};

/** What each voice is for, in the one line the picker has room for. */
export const TONE_BLURBS: Record<SubBassTone, string> = {
  sub: "Deep and clean. Felt more than heard on a laptop.",
  round: "Deep with an octave on top, so the note reads anywhere.",
  punch: "Short and hard. Sits with the kick rather than under it.",
  "808": "Long, saturated, slides between notes. The trap one.",
};
