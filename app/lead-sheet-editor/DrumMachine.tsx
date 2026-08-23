"use client";

import { useEffect, useRef, useState } from "react";

// ── Patterns ────────────────────────────────────────────────────────────────
// 16 steps of 16th notes. 1 = hit, 0 = rest.

interface Pattern {
  name: string;
  kick: number[];
  snare: number[];
  hihat: number[];
}

export const DRUM_PATTERNS: Pattern[] = [
  // ── Core indie / folk ──────────────────────────────────────────────────────
  {
    name: "Folk Stomp",
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  },
  {
    name: "Indie Kick",
    kick:  [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "Half-time",
    kick:  [1,0,0,0, 0,0,0,0, 0,1,0,0, 0,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    hihat: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
  },
  {
    name: "Stomp & Brush",
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,1, 0,0,0,0],
    snare: [0,0,1,0, 1,0,0,1, 0,0,1,0, 1,0,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "Shuffle",
    kick:  [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,1,0,0],
    snare: [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,1],
    hihat: [1,0,1,0, 0,1,0,0, 1,0,1,0, 0,1,0,0],
  },
  // ── Grooves ───────────────────────────────────────────────────────────────
  {
    name: "4 on the Floor",
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [0,1,0,1, 0,1,0,1, 0,1,0,1, 0,1,0,1],
  },
  {
    name: "Swing Beat",
    // Kick 1+3, snare 2+4, hi-hat on swung 8ths (triplet feel: beat + skip + late)
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [1,0,0,1, 1,0,0,1, 1,0,0,1, 1,0,0,1],
  },
  {
    name: "Sexy Beat",
    // Kick 1 + 3 with a pickup on the "and" of 4 that leans into the next bar,
    // snare 2 + 4, straight 8th hats for the sultry R&B push-and-pull.
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,1,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  },
  {
    name: "Boom-Chick",
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,1,0, 0,0,0,0, 1,0,1,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "Reggae One Drop",
    kick:  [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  },
  {
    name: "Bossa Nova",
    kick:  [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,0],
    snare: [0,0,1,0, 0,1,0,0, 0,0,1,0, 0,1,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "Slow Groove",
    kick:  [1,0,0,0, 0,0,0,1, 0,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,1,0],
    hihat: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
  },
  {
    name: "March",
    kick:  [1,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    snare: [0,0,1,0, 0,0,1,0, 1,0,1,0, 0,0,1,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  },
  {
    name: "Waltz Feel",
    // 3 beats mapped to 12 of 16 steps (last 4 silent, loop still 16)
    kick:  [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,1,0,0, 0,0,0,0],
    hihat: [1,0,0,0, 1,0,0,0, 1,0,0,0, 0,0,0,0],
  },
  // ── Sparse / simple ───────────────────────────────────────────────────────
  {
    name: "Kick Only",
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "1 & 4",
    // Kick on beat 1, snare on beats 2, 3, 4
    kick:  [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "Pulse",
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  // ── Dance floor ───────────────────────────────────────────────────────────
  {
    name: "Disco Floor",
    // Four on the floor with driving 16th hats instead of offbeat 8ths —
    // busier and more forward than the plain "4 on the Floor" above.
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
  },
  {
    name: "Two-Step",
    // UK garage skip: kick pulled off the downbeat, snare with a 16th push on
    // the "a" of 2, offbeat hats closing with a stutter into the next bar.
    kick:  [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,0],
    hihat: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,1],
  },
  {
    name: "Stomp Clap",
    // Arena chant: stomp, stomp, clap, rest. No hats — the space is the hook.
    kick:  [1,0,0,0, 1,0,0,0, 0,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  // ── Hip-hop, funk & R&B ───────────────────────────────────────────────────
  {
    name: "Boom Bap",
    // Kick on 1 with the classic "and of 2" / "and of 3" answer, hard backbeat.
    kick:  [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  },
  {
    name: "Funk Break",
    // Breakbeat syncopation — kick on the "a" of 1, snare answering off the
    // grid, hats stuttering into 2 and 4.
    kick:  [1,0,0,1, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,1,0],
    hihat: [1,0,1,0, 1,0,1,1, 1,0,1,0, 1,0,1,1],
  },
  {
    name: "Second Line",
    // New Orleans street beat: the shuffle-adjacent parade groove that funk
    // grew out of. Kick and snare trade syncopations all bar.
    kick:  [1,0,0,1, 0,0,0,0, 1,0,0,0, 0,0,1,0],
    snare: [0,0,0,0, 0,0,1,0, 0,0,1,1, 0,0,0,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  },
  // ── Latin & global ────────────────────────────────────────────────────────
  {
    name: "Tresillo Pop",
    // The 3+3+2 kick that runs under a huge slice of modern pop.
    kick:  [1,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  },
  {
    name: "Dembow",
    // Reggaeton's engine: kick on 1 and 3, snare on the "a"/"and" pairs that
    // give it the boom-ch-boom-chick lurch.
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    snare: [0,0,0,1, 0,0,1,0, 0,0,0,1, 0,0,1,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  },
  {
    name: "Afrobeats",
    // Kick pushing off the "and" of 2 and into the bar line, clap landing late
    // on 4, shaker-style 16th fills between.
    kick:  [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,1, 1,0,0,0],
    hihat: [1,0,1,1, 1,0,1,0, 1,0,1,1, 1,0,1,0],
  },
  {
    name: "Samba Step",
    // Surdo on the "a" of each half bar, tamborim-style snare cutting across
    // it, constant 16ths underneath.
    kick:  [1,0,0,1, 0,0,0,0, 1,0,0,1, 0,0,0,0],
    snare: [0,0,1,0, 0,0,1,0, 0,0,0,1, 0,0,1,0],
    hihat: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
  },
  // ── Airy & emotional ──────────────────────────────────────────────────────
  {
    name: "Heartbeat",
    // Lub-dub twice a bar, nothing else. Pairs with the dance grooves as the
    // drop-out section.
    kick:  [1,0,1,0, 0,0,0,0, 1,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "Floating",
    // One kick a bar, hats breathing on the quarter and the "and" of 2 — open
    // enough to leave the melody all the room.
    kick:  [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    hihat: [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
  },
  {
    name: "Rainfall",
    // Scattered offbeat 16ths over a kick that lands late — unsettled, no
    // backbeat to lock onto.
    kick:  [1,0,0,0, 0,0,0,0, 0,0,0,1, 0,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    hihat: [0,0,1,0, 0,1,0,0, 0,0,1,0, 0,1,0,1],
  },
  {
    name: "6/8 Ballad",
    // Two dotted-quarter pulses across 12 of the 16 steps, like Waltz Feel —
    // the slow-dance feel.
    kick:  [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,0,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 0,0,0,0],
  },
];

// ── Dropdown grouping ────────────────────────────────────────────────────────
//
// Presentation only — the scheduler still works off DRUM_PATTERNS order, and a
// pattern missing from every group still shows up under "More", so adding one
// can never make it vanish from the picker.

const PATTERN_GROUP_NAMES: { label: string; names: string[] }[] = [
  { label: "Backbeat & rock",     names: ["Half-time", "Slow Groove", "March", "Stomp Clap"] },
  { label: "Roots & folk",        names: ["Folk Stomp", "Indie Kick", "Stomp & Brush", "Boom-Chick"] },
  { label: "Dance floor",         names: ["4 on the Floor", "Disco Floor", "Two-Step"] },
  { label: "Hip-hop, funk & R&B", names: ["Sexy Beat", "Boom Bap", "Funk Break", "Second Line"] },
  { label: "Latin & global",      names: ["Tresillo Pop", "Dembow", "Afrobeats", "Samba Step", "Bossa Nova", "Reggae One Drop"] },
  { label: "Jazz & swing",        names: ["Shuffle", "Swing Beat"] },
  { label: "Airy & emotional",    names: ["Heartbeat", "Floating", "Rainfall", "6/8 Ballad", "Waltz Feel"] },
  { label: "Sparse",              names: ["Kick Only", "1 & 4", "Pulse"] },
];

export const PATTERN_GROUPS: { label: string; items: { name: string; index: number }[] }[] = (() => {
  const indexOf = new Map(DRUM_PATTERNS.map((p, i) => [p.name, i]));
  const grouped = PATTERN_GROUP_NAMES.map(({ label, names }) => ({
    label,
    items: names
      .filter((name) => indexOf.has(name))
      .map((name) => ({ name, index: indexOf.get(name)! })),
  })).filter((g) => g.items.length > 0);

  const placed = new Set(grouped.flatMap((g) => g.items.map((i) => i.name)));
  const rest = DRUM_PATTERNS.map((p, i) => ({ name: p.name, index: i })).filter((p) => !placed.has(p.name));
  return rest.length ? [...grouped, { label: "More", items: rest }] : grouped;
})();

// ── Settings ─────────────────────────────────────────────────────────────────

export type KickStyle  = "folk" | "808";
export type SnareStyle = "regular" | "brush";

/** What the drum machine remembers per song — stored on the sheet's metadata. */
export interface DrumSettings {
  /** Pattern name rather than index, so reordering DRUM_PATTERNS can't reassign it. */
  pattern: string;
  kick: KickStyle;
  snare: SnareStyle;
  volume: number;
}

export const DEFAULT_DRUM_SETTINGS: DrumSettings = {
  pattern: DRUM_PATTERNS[0].name,
  kick: "folk",
  snare: "regular",
  volume: 0.8,
};

/** Coerce whatever came back from the database into usable settings. */
export function normalizeDrumSettings(raw: unknown): DrumSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_DRUM_SETTINGS;
  const r = raw as Record<string, unknown>;
  const known = DRUM_PATTERNS.some((p) => p.name === r.pattern);
  const volume = typeof r.volume === "number" && isFinite(r.volume) ? r.volume : DEFAULT_DRUM_SETTINGS.volume;
  return {
    pattern: known ? (r.pattern as string) : DEFAULT_DRUM_SETTINGS.pattern,
    kick:    r.kick === "808" ? "808" : "folk",
    snare:   r.snare === "brush" ? "brush" : "regular",
    volume:  Math.min(1, Math.max(0, volume)),
  };
}

/** Index of a pattern by name; falls back to the first pattern. */
export function patternIndex(name: string): number {
  const i = DRUM_PATTERNS.findIndex((p) => p.name === name);
  return i === -1 ? 0 : i;
}

export function isDefaultDrumSettings(s: DrumSettings): boolean {
  return (
    s.pattern === DEFAULT_DRUM_SETTINGS.pattern &&
    s.kick === DEFAULT_DRUM_SETTINGS.kick &&
    s.snare === DEFAULT_DRUM_SETTINGS.snare &&
    s.volume === DEFAULT_DRUM_SETTINGS.volume
  );
}

// ── Text form ────────────────────────────────────────────────────────────────
//
// The settings also live in the song text as a preamble line, alongside Key and
// Tempo, so they can be read and edited by hand:
//
//   Drums: Stomp & Brush, folk kick, brush snare, 80%
//
// No pattern name contains a comma, so comma-separated fields parse cleanly.

const DRUMS_LINE_RE = /\bDrums:\s*([^\n|]*)/i;

/** The `Drums: …` line as written into the song text. */
export function formatDrumSettings(s: DrumSettings): string {
  return `Drums: ${s.pattern}, ${s.kick} kick, ${s.snare} snare, ${Math.round(s.volume * 100)}%`;
}

/**
 * Reads a `Drums: …` line, in whatever order the fields were typed. Returns
 * null when the line isn't there at all — which is different from a line that's
 * present but garbled, where the defaults stand in for the unreadable parts.
 */
export function parseDrumSettingsLine(line: string): DrumSettings | null {
  const m = line.match(DRUMS_LINE_RE);
  if (!m) return null;

  const fields = m[1].split(",").map((f) => f.trim()).filter(Boolean);
  const settings = { ...DEFAULT_DRUM_SETTINGS };

  for (const field of fields) {
    const lower = field.toLowerCase();
    const pattern = DRUM_PATTERNS.find((p) => p.name.toLowerCase() === lower);
    if (pattern) {
      settings.pattern = pattern.name;
    } else if (/\bfolk\b/.test(lower) && /kick/.test(lower)) {
      settings.kick = "folk";
    } else if (/\b808\b/.test(lower)) {
      settings.kick = "808";
    } else if (/\bbrush(ed)?\b/.test(lower)) {
      settings.snare = "brush";
    } else if (/\b(regular|snare)\b/.test(lower)) {
      settings.snare = "regular";
    } else {
      const pct = lower.match(/^(\d{1,3})\s*%$/);
      if (pct) settings.volume = Math.min(1, Math.max(0, parseInt(pct[1], 10) / 100));
    }
  }

  return settings;
}

/** Strips the `Drums: …` line's text so it never shows up as a performance note. */
export function stripDrumSettings(line: string): string {
  return line.replace(DRUMS_LINE_RE, "").trim();
}

export function hasDrumSettingsLine(line: string): boolean {
  return DRUMS_LINE_RE.test(line);
}

// ── Synthesis ────────────────────────────────────────────────────────────────

/** Roland TR-808 kick for pop/indie: punchy sine with fast pitch drop, ~650ms decay */
function playKick808(ctx: BaseAudioContext, dst: AudioNode, when: number) {
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.type = "sine";

  // Fast pitch sweep — gives the Roland "thump" punch character
  // 100 Hz -> 55 Hz in 30ms (the attack punch), then settles at 30 Hz
  osc.frequency.setValueAtTime(100, when);
  osc.frequency.exponentialRampToValueAtTime(55, when + 0.03);
  osc.frequency.exponentialRampToValueAtTime(30, when + 0.35);

  // Instant attack, ~650ms decay — pop kick, not a sustained bass note
  g.gain.setValueAtTime(1.0, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.65);

  // Light waveshaper for body warmth without harshness
  const ws = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i * 2) / 256 - 1;
    curve[i] = Math.tanh(2 * x) / Math.tanh(2);
  }
  ws.curve = curve;
  ws.oversample = "2x";

  osc.connect(g);
  g.connect(ws);
  ws.connect(dst);
  osc.start(when);
  osc.stop(when + 0.7);
}

function playKick(ctx: BaseAudioContext, dst: AudioNode, when: number) {
  // Warm sine body with pitch drop — indie folk thump
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(160, when);
  osc.frequency.exponentialRampToValueAtTime(42, when + 0.075);
  g.gain.setValueAtTime(0.9, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.45);
  osc.connect(g);
  g.connect(dst);
  osc.start(when);
  osc.stop(when + 0.46);

  // Short noise transient click for attack definition
  const len = Math.ceil(ctx.sampleRate * 0.015);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * ((len - i) / len) ** 2;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.45, when);
  src.connect(cg);
  cg.connect(dst);
  src.start(when);
}

function playSnare(ctx: BaseAudioContext, dst: AudioNode, when: number) {
  // Bandpass noise for brush/snare body
  const len = Math.ceil(ctx.sampleRate * 0.22);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1800;
  bp.Q.value = 0.7;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.55, when);
  ng.gain.exponentialRampToValueAtTime(0.001, when + 0.18);
  noiseSrc.connect(bp);
  bp.connect(ng);
  ng.connect(dst);
  noiseSrc.start(when);
  noiseSrc.stop(when + 0.22);

  // Tone body for snare crack
  const osc = ctx.createOscillator();
  const og = ctx.createGain();
  osc.frequency.setValueAtTime(200, when);
  osc.frequency.exponentialRampToValueAtTime(70, when + 0.06);
  og.gain.setValueAtTime(0.28, when);
  og.gain.exponentialRampToValueAtTime(0.001, when + 0.08);
  osc.connect(og);
  og.connect(dst);
  osc.start(when);
  osc.stop(when + 0.09);
}

/**
 * Pink noise — 1/f rolloff via Paul Kellet's economy filter. Flat white noise
 * reads as hiss or, gated hard enough, as a snap; brushed nylon on a coated
 * head has most of its energy low and a gentle slope above it.
 *
 * One buffer per context, since a sweep needs far more noise than a single
 * stroke consumes and regenerating it per hit is wasted work.
 */
const pinkNoiseByContext = new WeakMap<BaseAudioContext, AudioBuffer>();

function pinkNoise(ctx: BaseAudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 2), ctx.sampleRate);
  const data = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return buf;
}

function getPinkNoise(ctx: BaseAudioContext): AudioBuffer {
  let buf = pinkNoiseByContext.get(ctx);
  if (!buf) {
    buf = pinkNoise(ctx);
    pinkNoiseByContext.set(ctx, buf);
  }
  return buf;
}

/**
 * Brushed snare — a sweep across the head, not a stroke onto it.
 *
 * The character is entirely in the envelope: any fast attack, however quiet,
 * reads as a slap or a snap. So there is no transient here at all. The gain
 * swells in over 60ms and the band sweeps upward across the stroke, which is
 * the brush travelling over the coating.
 */
const BRUSH_ATTACK = 0.06;
const BRUSH_DECAY  = 0.44;

function playSnareBrush(ctx: BaseAudioContext, dst: AudioNode, when: number) {
  const buf = getPinkNoise(ctx);

  // Brushes speak before the beat: start the swell early so its peak lands on
  // the beat instead of dragging 60ms behind it. Clamped in case we're
  // scheduling something already due.
  const start = Math.max(ctx.currentTime, when - BRUSH_ATTACK);
  const peak  = start + BRUSH_ATTACK;

  const src = ctx.createBufferSource();
  src.buffer = buf;

  // Below this is drum body rather than brush, and it muddies the sweep.
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1100;

  // Wide and shallow — a resonant peak whistles instead of whispering.
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 0.5;
  bp.frequency.setValueAtTime(2000, start);
  bp.frequency.linearRampToValueAtTime(4300, peak + 0.22);

  // Shaves the top fizz that would otherwise read as tape hiss.
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 7500;

  // Pink noise carries far less energy than white, and the three filters take
  // more still, so this sits well above 1 to land at a peak just under the old
  // brush — quieter than a stick, but present.
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(1.1, peak);
  g.gain.exponentialRampToValueAtTime(0.001, peak + BRUSH_DECAY);

  src.connect(hp);
  hp.connect(bp);
  bp.connect(lp);
  lp.connect(g);
  g.connect(dst);
  // A random window keeps consecutive strokes from sounding stamped out of the
  // same sample. The buffer is long enough that a stroke never runs off the end.
  src.start(start, Math.random() * (buf.duration - 1));
  src.stop(peak + BRUSH_DECAY + 0.05);

  // A whisper of head resonance so the sweep sits on a drum rather than in
  // open air. Same soft envelope — an instant attack here is what snapped.
  const body = ctx.createBufferSource();
  body.buffer = buf;

  const bodyBp = ctx.createBiquadFilter();
  bodyBp.type = "bandpass";
  bodyBp.frequency.value = 420;
  bodyBp.Q.value = 0.9;

  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0, start);
  bg.gain.linearRampToValueAtTime(0.17, peak);
  bg.gain.exponentialRampToValueAtTime(0.001, peak + 0.2);

  body.connect(bodyBp);
  bodyBp.connect(bg);
  bg.connect(dst);
  body.start(start, Math.random() * (buf.duration - 1));
  body.stop(peak + 0.25);
}

function playHihat(ctx: BaseAudioContext, dst: AudioNode, when: number) {
  const len = Math.ceil(ctx.sampleRate * 0.07);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 8000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.22, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
  src.connect(hp);
  hp.connect(g);
  g.connect(dst);
  src.start(when);
  src.stop(when + 0.07);
}

/** Hand clap — 3 layered noise bursts 9ms apart, bandpassed around 2400 Hz */
function playClap(ctx: BaseAudioContext, dst: AudioNode, when: number) {
  for (let i = 0; i < 3; i++) {
    const t = when + i * 0.009;
    const len = Math.ceil(ctx.sampleRate * 0.06);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let j = 0; j < len; j++) d[j] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 900;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2400;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.48 - i * 0.11, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.055 - i * 0.006);
    src.connect(hp); hp.connect(bp); bp.connect(g); g.connect(dst);
    src.start(t); src.stop(t + 0.07);
  }
}

/** Shimmer — soft high-freq noise on every step for a continuous airy sparkle texture */
function playShimmer(ctx: BaseAudioContext, dst: AudioNode, when: number) {
  const len = Math.ceil(ctx.sampleRate * 0.14);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.055, when + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.11);
  src.connect(hp); hp.connect(g); g.connect(dst);
  src.start(when); src.stop(when + 0.14);
}

// ── WAV export ────────────────────────────────────────────────────────────────

/** Encode an AudioBuffer as a 16-bit PCM WAV Blob. */
function encodeWav(buffer: AudioBuffer): Blob {
  const numCh  = buffer.numberOfChannels;
  const sr     = buffer.sampleRate;
  const len    = buffer.length;
  const bitsPS = 16;
  const bytesPS = bitsPS / 8;
  const dataLen = len * numCh * bytesPS;
  const ab = new ArrayBuffer(44 + dataLen);
  const view = new DataView(ab);

  const str = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };
  str(0,  "RIFF");
  view.setUint32(4,  36 + dataLen, true);
  str(8,  "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);          // subchunk1 size
  view.setUint16(20, 1,  true);          // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * bytesPS, true);
  view.setUint16(32, numCh * bytesPS, true);
  view.setUint16(34, bitsPS, true);
  str(36, "data");
  view.setUint32(40, dataLen, true);

  let offset = 44;
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

/** Render the current drum settings to a WAV Blob using OfflineAudioContext. */
async function renderDrumToWav(
  bpm: number,
  patternIdx: number,
  kickStyle: KickStyle,
  snareStyle: SnareStyle,
  clapsEnabled: boolean,
  shimmerEnabled: boolean,
  volume: number,
  durationSec: number,
): Promise<Blob> {
  const SR = 44100;
  const totalFrames = Math.ceil(SR * durationSec);
  const ctx = new OfflineAudioContext(2, totalFrames, SR);

  const master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);

  const stepDur = 15 / bpm; // seconds per 16th note
  const pat = DRUM_PATTERNS[patternIdx];
  let when = 0;
  let step = 0;

  while (when < durationSec) {
    if (pat.kick[step]) {
      if (kickStyle === "808") playKick808(ctx, master, when);
      else playKick(ctx, master, when);
    }
    if (pat.snare[step]) {
      if (snareStyle === "brush") playSnareBrush(ctx, master, when);
      else playSnare(ctx, master, when);
    }
    if (pat.hihat[step]) playHihat(ctx, master, when);
    if (clapsEnabled && (step === 4 || step === 12)) playClap(ctx, master, when);
    if (shimmerEnabled) playShimmer(ctx, master, when);

    when += stepDur;
    step = (step + 1) % 16;
  }

  const rendered = await ctx.startRendering();
  return encodeWav(rendered);
}

// ── Scheduler hook ────────────────────────────────────────────────────────────

const LOOKAHEAD = 0.12;  // seconds ahead to schedule
const TICK_MS   = 22;    // scheduler polling interval

/**
 * `drumsEnabled` is what the kit itself does while the loop runs: turn it off
 * and the claps or the shimmer can carry a section on their own, which is how
 * the arranger plays a claps-only chorus.
 */
export function useDrumScheduler(
  bpm: number,
  patternIdx: number,
  running: boolean,
  volume: number,
  kickStyle: KickStyle,
  snareStyle: SnareStyle,
  clapsEnabled: boolean,
  shimmerEnabled: boolean,
  drumsEnabled = true,
): number {
  const ctxRef            = useRef<AudioContext | null>(null);
  const masterRef         = useRef<GainNode | null>(null);
  const nextTimeRef       = useRef(0);
  const stepRef           = useRef(0);
  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const patternIdxRef     = useRef(patternIdx);
  const bpmRef            = useRef(bpm);
  const volumeRef         = useRef(volume);
  const kickStyleRef      = useRef(kickStyle);
  const snareStyleRef     = useRef(snareStyle);
  const clapsEnabledRef   = useRef(clapsEnabled);
  const shimmerEnabledRef = useRef(shimmerEnabled);
  const drumsEnabledRef   = useRef(drumsEnabled);
  const [activeStep, setActiveStep] = useState(-1);

  // Keep refs in sync so the scheduler loop picks up changes without restart
  useEffect(() => { patternIdxRef.current = patternIdx; }, [patternIdx]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { kickStyleRef.current = kickStyle; }, [kickStyle]);
  useEffect(() => { snareStyleRef.current = snareStyle; }, [snareStyle]);
  useEffect(() => { clapsEnabledRef.current = clapsEnabled; }, [clapsEnabled]);
  useEffect(() => { shimmerEnabledRef.current = shimmerEnabled; }, [shimmerEnabled]);
  useEffect(() => { drumsEnabledRef.current = drumsEnabled; }, [drumsEnabled]);
  useEffect(() => {
    volumeRef.current = volume;
    if (masterRef.current) masterRef.current.gain.value = volume;
  }, [volume]);

  useEffect(() => {
    if (!running) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      stepRef.current = 0;
      setActiveStep(-1);
      return;
    }

    // Create AudioContext lazily on first play
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
      masterRef.current = ctxRef.current.createGain();
      masterRef.current.gain.value = volumeRef.current;
      masterRef.current.connect(ctxRef.current.destination);
    } else if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume();
    }

    const ctx = ctxRef.current;
    const dst = masterRef.current!;

    // Start slightly in the future so first note isn't clipped
    nextTimeRef.current = ctx.currentTime + 0.05;
    stepRef.current = 0;

    const tick = () => {
      const stepDur = 15 / bpmRef.current; // 60 / (bpm * 4) seconds per 16th note
      const pat     = DRUM_PATTERNS[patternIdxRef.current];

      while (nextTimeRef.current < ctx.currentTime + LOOKAHEAD) {
        const step = stepRef.current;
        const when = nextTimeRef.current;

        if (drumsEnabledRef.current) {
          if (pat.kick[step]) {
            if (kickStyleRef.current === "808") playKick808(ctx, dst, when);
            else playKick(ctx, dst, when);
          }
          if (pat.snare[step]) {
            if (snareStyleRef.current === "brush") playSnareBrush(ctx, dst, when);
            else playSnare(ctx, dst, when);
          }
          if (pat.hihat[step]) playHihat(ctx, dst, when);
        }
        // Claps on beats 2 and 4 (steps 4 and 12)
        if (clapsEnabledRef.current && (step === 4 || step === 12)) playClap(ctx, dst, when);
        // Shimmer on every step — continuous high-freq sparkle
        if (shimmerEnabledRef.current) playShimmer(ctx, dst, when);

        // Update visual indicator at the right moment
        const delayMs = Math.max(0, (when - ctx.currentTime) * 1000);
        setTimeout(() => setActiveStep(step), delayMs);

        stepRef.current = (step + 1) % 16;
        nextTimeRef.current += stepDur;
      }
    };

    tick();
    timerRef.current = setInterval(tick, TICK_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [running]);

  // Clean up AudioContext on component unmount
  useEffect(() => {
    return () => {
      ctxRef.current?.close();
    };
  }, []);

  return activeStep;
}

// ── DrumMachineControl component ──────────────────────────────────────────────

export function DrumMachineControl({
  bpm,
  running,
  onToggle,
  settings,
  onSettingsChange,
  clapsEnabled,
  shimmerEnabled,
}: {
  bpm: number;
  running: boolean;
  onToggle: () => void;
  settings: DrumSettings;
  /** Called with just the fields that changed; the owner merges and persists. */
  onSettingsChange: (patch: Partial<DrumSettings>) => void;
  /** Passed through to the scheduler — toggle is a standalone button in the toolbar. */
  clapsEnabled: boolean;
  /** Passed through to the scheduler — toggle is a standalone button in the toolbar. */
  shimmerEnabled: boolean;
}) {
  const { kick: kickStyle, snare: snareStyle, volume } = settings;
  const patternIdx = patternIndex(settings.pattern);
  // Claps and shimmer are layers of their own: either one runs the scheduler
  // even with the kit off, so a claps-only or shimmer-only section works.
  const schedulerRunning = running || clapsEnabled || shimmerEnabled;
  const activeStep = useDrumScheduler(
    bpm, patternIdx, schedulerRunning, volume, kickStyle, snareStyle,
    clapsEnabled, shimmerEnabled, running,
  );
  const pat = DRUM_PATTERNS[patternIdx];

  const [showDlPicker, setShowDlPicker] = useState(false);
  const [dlMinutes, setDlMinutes] = useState("2");
  const [rendering, setRendering] = useState(false);

  async function handleDownload() {
    const mins = parseFloat(dlMinutes);
    if (!mins || mins <= 0) return;
    setRendering(true);
    try {
      const blob = await renderDrumToWav(
        bpm, patternIdx, kickStyle, snareStyle,
        clapsEnabled, shimmerEnabled, volume, mins * 60,
      );
      const patName = settings.pattern.toLowerCase().replace(/\s+/g, "-");
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `drums-${patName}-${bpm}bpm-${mins}min-${ts}.wav`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      setShowDlPicker(false);
    } finally {
      setRendering(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-neutral-700 px-2 py-1 print:hidden">
      {/* Toggle button */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={running ? "Stop drums" : "Start drums"}
        title={running ? "Stop drums" : "Start drums"}
        className={`h-8 w-8 flex items-center justify-center rounded-md transition-colors duration-150 flex-shrink-0 ${
          running
            ? "bg-indigo-500 text-white hover:bg-indigo-600"
            : "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 hover:bg-gray-200 dark:hover:bg-neutral-700"
        }`}
      >
        {/* Drum icon */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <ellipse cx="12" cy="8" rx="10" ry="4" />
          <path d="M2 8v8c0 2.2 4.5 4 10 4s10-1.8 10-4V8" />
          <line x1="2" y1="12" x2="22" y2="12" />
        </svg>
      </button>

      {/* Pattern selector */}
      <select
        value={patternIdx}
        onChange={(e) => onSettingsChange({ pattern: DRUM_PATTERNS[Number(e.target.value)].name })}
        aria-label="Drum pattern"
        className="h-8 text-xs rounded-md border border-gray-200 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 px-1 focus:outline-none"
      >
        {PATTERN_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.items.map((item) => (
              <option key={item.name} value={item.index}>
                {item.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {/* Kick style toggle: Folk / 808 */}
      <div className="flex rounded-md overflow-hidden border border-gray-200 dark:border-neutral-700 flex-shrink-0">
        {(["folk", "808"] as const).map((style) => (
          <button
            key={style}
            type="button"
            onClick={() => onSettingsChange({ kick: style })}
            className={`px-2 h-7 text-xs font-medium transition-colors duration-100 ${
              kickStyle === style
                ? style === "808"
                  ? "bg-orange-500 text-white"
                  : "bg-indigo-500 text-white"
                : "bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-neutral-400 hover:bg-gray-200 dark:hover:bg-neutral-700"
            }`}
            aria-label={`${style === "808" ? "TR-808" : "Folk"} kick`}
            title={style === "808" ? "TR-808 sub-bass kick" : "Folk acoustic kick"}
          >
            {style === "808" ? "808" : "Folk"}
          </button>
        ))}
      </div>

      {/* Snare style toggle: Regular / Brush */}
      <div className="flex rounded-md overflow-hidden border border-gray-200 dark:border-neutral-700 flex-shrink-0">
        {(["regular", "brush"] as const).map((style) => (
          <button
            key={style}
            type="button"
            onClick={() => onSettingsChange({ snare: style })}
            className={`px-2 h-7 text-xs font-medium transition-colors duration-100 ${
              snareStyle === style
                ? style === "brush"
                  ? "bg-emerald-600 text-white"
                  : "bg-indigo-500 text-white"
                : "bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-neutral-400 hover:bg-gray-200 dark:hover:bg-neutral-700"
            }`}
            aria-label={`${style === "brush" ? "Brushed" : "Regular"} snare`}
            title={style === "brush" ? "Brushed snare" : "Regular snare"}
          >
            {style === "brush" ? "Brush" : "Snare"}
          </button>
        ))}
      </div>

      {/* 16-step indicator — visible whenever something is sounding */}
      {schedulerRunning && (
        <div className="flex gap-px" aria-hidden="true">
          {Array.from({ length: 16 }, (_, i) => {
            const hasKit  = running && (pat.kick[i] || pat.snare[i] || pat.hihat[i]);
            const hasClap = clapsEnabled && (i === 4 || i === 12);
            const hasHit  = hasKit || hasClap || shimmerEnabled;
            return (
              <div
                key={i}
                className={`w-1 h-3 rounded-sm transition-colors duration-75 ${
                  i === activeStep
                    ? "bg-indigo-500"
                    : hasHit
                    ? "bg-gray-400 dark:bg-neutral-500"
                    : "bg-gray-200 dark:bg-neutral-700"
                }`}
              />
            );
          })}
        </div>
      )}

      {/* Volume slider */}
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => onSettingsChange({ volume: Number(e.target.value) })}
        aria-label={`Drum volume ${Math.round(volume * 100)}%`}
        title={`Volume: ${Math.round(volume * 100)}%`}
        className="w-14 h-1 accent-indigo-500 flex-shrink-0"
      />

      {/* Download WAV */}
      {!showDlPicker ? (
        <button
          type="button"
          onClick={() => setShowDlPicker(true)}
          title="Download drum track as WAV"
          aria-label="Download drum track as WAV"
          className="h-7 px-2 text-xs font-medium rounded-md border border-gray-200 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-neutral-400 hover:bg-gray-200 dark:hover:bg-neutral-700 flex-shrink-0"
        >
          ↓ WAV
        </button>
      ) : (
        <div className="flex items-center gap-1 flex-shrink-0">
          <input
            type="number"
            min={0.1}
            max={60}
            step={0.5}
            value={dlMinutes}
            onChange={(e) => setDlMinutes(e.target.value)}
            aria-label="Duration in minutes"
            title="Duration in minutes"
            className="w-14 h-7 text-xs rounded-md border border-gray-200 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 px-1.5 focus:outline-none"
          />
          <span className="text-[10px] text-gray-400 dark:text-neutral-500">min</span>
          <button
            type="button"
            onClick={handleDownload}
            disabled={rendering}
            className="h-7 px-2 text-xs font-medium rounded-md border border-indigo-400 bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 flex-shrink-0"
          >
            {rendering ? "…" : "↓"}
          </button>
          <button
            type="button"
            onClick={() => setShowDlPicker(false)}
            aria-label="Cancel download"
            className="h-7 px-1.5 text-xs rounded-md border border-gray-200 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-800 text-gray-400 hover:bg-gray-200 dark:hover:bg-neutral-700 flex-shrink-0"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
