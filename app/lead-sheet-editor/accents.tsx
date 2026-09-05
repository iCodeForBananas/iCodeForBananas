"use client";

import { useMemo } from "react";

// ─── Accent percussion ────────────────────────────────────────────────────────
//
// The layer the toolbar calls Shimmer: the small percussion that sits on top of
// a kit rather than being one. Every one of these is a real part somebody plays
// on records — the roster is the standard pop/folk/worship accent kit:
//
//   • Shakers (egg, cabasa) — the 8th/16th-note engine under almost everything
//   • Tambourine — backbeat in a verse, straight 8ths when a chorus lifts
//   • Triangle, woodblock, claves, cowbell — the one-note timekeepers
//   • Cross-stick and finger snaps — what a quiet verse uses instead of a snare
//   • Sleigh bells, bell tree, wind chimes — the bright "lift" colours
//   • 808 hats, trap rolls, noise ticks — the same jobs done electronically
//
// Each variation is a voice plus a rhythm, since a tambourine on 16ths and a
// tambourine on the backbeat are different parts, not the same part louder.
// Everything is synthesized — no samples to ship or load.

type Ctx = BaseAudioContext;

// ── Noise ────────────────────────────────────────────────────────────────────

/**
 * Two seconds of white noise per context, played from a random offset. A fresh
 * buffer per hit is both wasted work and audibly identical every time, which is
 * what makes a machine shaker sound stamped out rather than shaken.
 */
const whiteByContext = new WeakMap<Ctx, AudioBuffer>();

function white(ctx: Ctx): AudioBuffer {
  let buf = whiteByContext.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 2), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    whiteByContext.set(ctx, buf);
  }
  return buf;
}

interface NoiseOptions {
  gain: number;
  decay: number;
  /** Rise time. Beads and brushes speak over a few ms; a stick does not. */
  attack?: number;
  highpass?: number;
  bandpass?: number;
  q?: number;
  lowpass?: number;
}

function noiseHit(ctx: Ctx, dst: AudioNode, when: number, o: NoiseOptions) {
  const buf = white(ctx);
  const src = ctx.createBufferSource();
  src.buffer = buf;

  let node: AudioNode = src;
  if (o.highpass) {
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = o.highpass;
    node.connect(hp);
    node = hp;
  }
  if (o.bandpass) {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = o.bandpass;
    bp.Q.value = o.q ?? 1;
    node.connect(bp);
    node = bp;
  }
  if (o.lowpass) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = o.lowpass;
    node.connect(lp);
    node = lp;
  }

  const attack = o.attack ?? 0.002;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(o.gain, when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + attack + o.decay);

  node.connect(g);
  g.connect(dst);
  src.start(when, Math.random() * (buf.duration - 0.5));
  src.stop(when + attack + o.decay + 0.02);
}

// ── Metal ────────────────────────────────────────────────────────────────────

/**
 * Six square waves at ratios that land on no harmonic series, bandpassed hard —
 * the TR-808 recipe for metal, and still the cheapest way to make a jingle, a
 * bell or a hat out of nothing.
 */
const METAL_RATIOS = [1, 1.34, 1.69, 2.13, 2.71, 3.42];

interface MetalOptions {
  /** Lowest partial; the rest of the cluster is stacked off it. */
  base: number;
  bandpass: number;
  q?: number;
  highpass?: number;
  gain: number;
  decay: number;
}

function metalHit(ctx: Ctx, dst: AudioNode, when: number, o: MetalOptions) {
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = o.bandpass;
  bp.Q.value = o.q ?? 1.2;

  let node: AudioNode = bp;
  if (o.highpass) {
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = o.highpass;
    bp.connect(hp);
    node = hp;
  }

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(o.gain, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + o.decay);
  node.connect(g);
  g.connect(dst);

  for (const ratio of METAL_RATIOS) {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = o.base * ratio;
    osc.connect(bp);
    osc.start(when);
    osc.stop(when + o.decay + 0.02);
  }
}

// ── Tone ─────────────────────────────────────────────────────────────────────

interface ToneOptions {
  freq: number;
  /** Pitch to fall to across the hit, for the knock in a wood sound. */
  to?: number;
  type?: OscillatorType;
  gain: number;
  decay: number;
}

function toneHit(ctx: Ctx, dst: AudioNode, when: number, o: ToneOptions) {
  const osc = ctx.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, when);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, when + o.decay);

  const g = ctx.createGain();
  g.gain.setValueAtTime(o.gain, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + o.decay);

  osc.connect(g);
  g.connect(dst);
  osc.start(when);
  osc.stop(when + o.decay + 0.02);
}

// ── Voices ───────────────────────────────────────────────────────────────────
//
// Every voice takes `accent`, which is the difference between a shaker's down
// stroke and its up stroke. Level alone would only make it louder; these open
// the filter or lengthen the ring as well, the way a harder stroke does.

/** Random ±10% so a steady 16th part breathes instead of ticking. */
const human = () => 0.9 + Math.random() * 0.2;

function eggShaker(ctx: Ctx, dst: AudioNode, when: number, accent: boolean) {
  noiseHit(ctx, dst, when, {
    highpass: 3200,
    bandpass: accent ? 6800 : 6000,
    q: 0.9,
    gain: (accent ? 0.3 : 0.17) * human(),
    attack: 0.004,
    decay: accent ? 0.075 : 0.05,
  });
}

function cabasa(ctx: Ctx, dst: AudioNode, when: number, accent: boolean) {
  // Steel beads on a steel shell: brighter and drier than a seed shaker.
  noiseHit(ctx, dst, when, {
    highpass: 5000,
    bandpass: accent ? 9000 : 8000,
    q: 0.7,
    gain: (accent ? 0.24 : 0.13) * human(),
    attack: 0.002,
    decay: accent ? 0.05 : 0.032,
  });
}

function tambourine(ctx: Ctx, dst: AudioNode, when: number, accent: boolean) {
  // The jingles are the sound; the shell only says a hand hit it.
  metalHit(ctx, dst, when, {
    base: 760,
    bandpass: 7200,
    q: 1.1,
    highpass: 4500,
    gain: (accent ? 0.2 : 0.11) * human(),
    decay: accent ? 0.3 : 0.12,
  });
  noiseHit(ctx, dst, when, {
    highpass: 3000,
    gain: (accent ? 0.1 : 0.05) * human(),
    decay: 0.03,
  });
}

function triangle(ctx: Ctx, dst: AudioNode, when: number, accent: boolean) {
  // Struck once, it rings for a bar and a half — the long tail is the point.
  metalHit(ctx, dst, when, {
    base: 2100,
    bandpass: 6400,
    q: 3.5,
    gain: accent ? 0.12 : 0.075,
    decay: accent ? 1.6 : 1.1,
  });
}

function sleighBells(ctx: Ctx, dst: AudioNode, when: number, accent: boolean) {
  // A strap of them never lands together; the spread is what says "sleigh".
  for (let i = 0; i < 3; i++) {
    metalHit(ctx, dst, when + Math.random() * 0.012, {
      base: 1500 + Math.random() * 500,
      bandpass: 8600,
      q: 1.4,
      highpass: 5200,
      gain: (accent ? 0.1 : 0.06) * human(),
      decay: accent ? 0.34 : 0.22,
    });
  }
}

function bellTree(ctx: Ctx, dst: AudioNode, when: number) {
  // A run up the bar, which is what a bell tree is for: the lift into a chorus.
  for (let i = 0; i < 9; i++) {
    metalHit(ctx, dst, when + i * 0.028, {
      base: 1700 * Math.pow(1.11, i),
      bandpass: 9000,
      q: 2.2,
      highpass: 5000,
      gain: 0.05,
      decay: 0.5,
    });
  }
}

function windChimes(ctx: Ctx, dst: AudioNode, when: number) {
  // Unstruck and unordered — chimes brushed once, not played.
  for (let i = 0; i < 7; i++) {
    metalHit(ctx, dst, when + Math.random() * 0.5, {
      base: 1400 + Math.random() * 1800,
      bandpass: 7500,
      q: 3,
      gain: 0.035,
      decay: 0.9,
    });
  }
}

function cowbell(ctx: Ctx, dst: AudioNode, when: number, accent: boolean) {
  // Two detuned squares through a narrow band — the 808 cowbell, near enough.
  const g = accent ? 0.24 : 0.15;
  toneHit(ctx, dst, when, { freq: 540, type: "square", gain: g * 0.5, decay: accent ? 0.3 : 0.18 });
  toneHit(ctx, dst, when, { freq: 800, type: "square", gain: g * 0.4, decay: accent ? 0.28 : 0.16 });
}

function woodblock(ctx: Ctx, dst: AudioNode, when: number, accent: boolean) {
  toneHit(ctx, dst, when, {
    freq: accent ? 1350 : 1150,
    to: 900,
    gain: accent ? 0.3 : 0.2,
    decay: 0.055,
  });
  noiseHit(ctx, dst, when, { bandpass: 2600, q: 1.6, gain: 0.08, decay: 0.012 });
}

function clave(ctx: Ctx, dst: AudioNode, when: number, accent: boolean) {
  // Higher and drier than a block, with almost no body behind it.
  toneHit(ctx, dst, when, { freq: 2450, gain: accent ? 0.26 : 0.19, decay: 0.06 });
  toneHit(ctx, dst, when, { freq: 1230, gain: accent ? 0.1 : 0.07, decay: 0.04 });
}

function crossStick(ctx: Ctx, dst: AudioNode, when: number, accent: boolean) {
  // Stick laid on the head, tip on the rim: a knock with a little shell under it.
  toneHit(ctx, dst, when, { freq: 420, to: 330, gain: accent ? 0.22 : 0.16, decay: 0.07 });
  noiseHit(ctx, dst, when, {
    bandpass: 1700,
    q: 2.2,
    gain: accent ? 0.18 : 0.12,
    decay: 0.045,
  });
}

function fingerSnap(ctx: Ctx, dst: AudioNode, when: number, accent: boolean) {
  // Tighter and higher than a clap, and one pair of hands rather than a room.
  noiseHit(ctx, dst, when, {
    highpass: 1200,
    bandpass: 2700,
    q: 3.2,
    gain: accent ? 0.6 : 0.42,
    decay: 0.045,
  });
  toneHit(ctx, dst, when, { freq: 900, to: 500, gain: 0.05, decay: 0.03 });
}

function hat808(ctx: Ctx, dst: AudioNode, when: number, accent: boolean) {
  // Closed on the beat, open on the accent — the whole part is that contrast.
  metalHit(ctx, dst, when, {
    base: 800,
    bandpass: 11000,
    q: 0.9,
    highpass: 8000,
    gain: accent ? 0.11 : 0.08,
    decay: accent ? 0.24 : 0.045,
  });
}

function trapHat(ctx: Ctx, dst: AudioNode, when: number, accent: boolean, stepDur: number) {
  // The roll is the genre: an accent step becomes a triplet inside its own step.
  const hits = accent ? 3 : 1;
  for (let i = 0; i < hits; i++) {
    metalHit(ctx, dst, when + (i * stepDur) / hits, {
      base: 860,
      bandpass: 12000,
      q: 0.8,
      highpass: 9000,
      gain: 0.11,
      decay: 0.035,
    });
  }
}

function noiseTick(ctx: Ctx, dst: AudioNode, when: number, accent: boolean) {
  // The programmed shaker of modern pop: noise, gated hard, no body at all.
  noiseHit(ctx, dst, when, {
    highpass: 9000,
    gain: (accent ? 0.13 : 0.08) * human(),
    attack: 0.001,
    decay: accent ? 0.04 : 0.025,
  });
}

/**
 * Air sparkle — the shimmer this layer started as, kept exactly as it sounded
 * so songs that were mixed against it don't change under them.
 */
function airSparkle(ctx: Ctx, dst: AudioNode, when: number) {
  noiseHit(ctx, dst, when, {
    highpass: 6000,
    gain: 0.055,
    attack: 0.015,
    decay: 0.095,
  });
}

function blip(ctx: Ctx, dst: AudioNode, when: number, accent: boolean) {
  toneHit(ctx, dst, when, {
    freq: accent ? 2200 : 1750,
    to: 1100,
    type: "triangle",
    gain: accent ? 0.16 : 0.11,
    decay: 0.06,
  });
}

/** Riser — one noise swell stretched across the whole bar, for a build. */
function riser(ctx: Ctx, dst: AudioNode, when: number, _accent: boolean, stepDur: number) {
  const bar = stepDur * 16;
  const buf = white(ctx);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(700, when);
  bp.frequency.exponentialRampToValueAtTime(9000, when + bar);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(0.16, when + bar * 0.92);
  g.gain.exponentialRampToValueAtTime(0.0001, when + bar);

  src.connect(bp);
  bp.connect(g);
  g.connect(dst);
  src.start(when, Math.random() * (buf.duration - 0.5));
  src.stop(when + bar + 0.02);
}

// ── Rhythms ──────────────────────────────────────────────────────────────────
//
// Sixteen sixteenth notes: 0 rest, 1 hit, 2 accent.

const SIXTEENTHS         = [2,1,1,1, 2,1,1,1, 2,1,1,1, 2,1,1,1];
const SIXTEENTHS_FLAT    = [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1];
const SIXTEENTHS_BACKBEAT= [1,1,1,1, 2,1,1,1, 1,1,1,1, 2,1,1,1];
const EIGHTHS            = [2,0,1,0, 1,0,1,0, 2,0,1,0, 1,0,1,0];
const EIGHTHS_BACKBEAT   = [1,0,1,0, 2,0,1,0, 1,0,1,0, 2,0,1,0];
const QUARTERS           = [2,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0];
const BACKBEAT           = [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0];
// One-bar son clave — the 3-side and the 2-side squeezed into a bar, which is
// how pop borrows it. Tresillo is the same idea with the last two dropped.
const CLAVE              = [1,0,0,1, 0,0,1,0, 0,0,1,0, 1,0,0,0];
const TRESILLO           = [2,0,0,1, 0,0,1,0, 0,0,0,0, 0,0,0,0];
const TRAP                = [1,1,1,1, 1,1,2,1, 1,1,1,1, 1,1,2,1];
const DOWNBEAT           = [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0];

// ── Variations ───────────────────────────────────────────────────────────────

export interface AccentVariation {
  name: string;
  /** Dropdown heading; order here is the order they appear. */
  group: string;
  /** What the part is and where it's usually played — the select's tooltip. */
  description: string;
  /** 16 sixteenth notes: 0 rest, 1 hit, 2 accent. */
  pattern: number[];
  play: (ctx: Ctx, dst: AudioNode, when: number, accent: boolean, stepDur: number) => void;
}

const ORGANIC = "Organic & acoustic";
const ELECTRONIC = "Electronic";
const BRIGHT = "Uplifting & bright";

export const ACCENT_VARIATIONS: AccentVariation[] = [
  // ── Organic ────────────────────────────────────────────────────────────────
  {
    name: "Egg Shaker",
    group: ORGANIC,
    description: "Steady 16ths with the down stroke on each beat — the engine under a folk track",
    pattern: SIXTEENTHS,
    play: eggShaker,
  },
  {
    name: "Shaker 8ths",
    group: ORGANIC,
    description: "Half the speed, twice the room — a verse that shouldn't be busy",
    pattern: EIGHTHS,
    play: eggShaker,
  },
  {
    name: "Cabasa",
    group: ORGANIC,
    description: "Steel beads on 16ths: drier and brighter than a shaker",
    pattern: SIXTEENTHS,
    play: cabasa,
  },
  {
    name: "Tambourine",
    group: ORGANIC,
    description: "Straight 8ths leaning on 2 and 4 — the standard chorus part",
    pattern: EIGHTHS_BACKBEAT,
    play: tambourine,
  },
  {
    name: "Tambourine Backbeat",
    group: ORGANIC,
    description: "Nothing but 2 and 4, the way a verse takes it",
    pattern: BACKBEAT,
    play: tambourine,
  },
  {
    name: "Triangle",
    group: ORGANIC,
    description: "One ring a beat, left to hang — country, folk and hymn tunes",
    pattern: QUARTERS,
    play: triangle,
  },
  {
    name: "Woodblock",
    group: ORGANIC,
    description: "A dry knock on every beat — a click you can actually keep time to",
    pattern: QUARTERS,
    play: woodblock,
  },
  {
    name: "Claves",
    group: ORGANIC,
    description: "One-bar son clave, the pattern most Latin-leaning pop borrows",
    pattern: CLAVE,
    play: clave,
  },
  {
    name: "Cowbell",
    group: ORGANIC,
    description: "Quarter notes, unmissable — Latin rock and anything that wants more of it",
    pattern: QUARTERS,
    play: cowbell,
  },
  {
    name: "Cross-Stick",
    group: ORGANIC,
    description: "Stick on the rim at 2 and 4 — what a quiet verse plays instead of a snare",
    pattern: BACKBEAT,
    play: crossStick,
  },
  {
    name: "Finger Snaps",
    group: ORGANIC,
    description: "Snaps on the backbeat: doo-wop, lo-fi, anything with no drums at all",
    pattern: BACKBEAT,
    play: fingerSnap,
  },

  // ── Electronic ─────────────────────────────────────────────────────────────
  {
    name: "Air Sparkle",
    group: ELECTRONIC,
    description: "A continuous high sheen across every 16th — the original shimmer",
    pattern: SIXTEENTHS_FLAT,
    play: airSparkle,
  },
  {
    name: "808 Hats",
    group: ELECTRONIC,
    description: "Closed hats on 16ths, opening on each beat",
    pattern: SIXTEENTHS,
    play: hat808,
  },
  {
    name: "Trap Rolls",
    group: ELECTRONIC,
    description: "16th hats that break into triplet rolls twice a bar",
    pattern: TRAP,
    play: trapHat,
  },
  {
    name: "Digital Shaker",
    group: ELECTRONIC,
    description: "Gated noise on 16ths — the programmed shaker of modern pop",
    pattern: SIXTEENTHS_BACKBEAT,
    play: noiseTick,
  },
  {
    name: "Blip Pulse",
    group: ELECTRONIC,
    description: "A synthetic tick on every 8th, like a sequencer keeping you honest",
    pattern: EIGHTHS,
    play: blip,
  },
  {
    name: "Tresillo Ticks",
    group: ELECTRONIC,
    description: "The 3-3-2 accent every modern pop record is built on",
    pattern: TRESILLO,
    play: blip,
  },

  // ── Bright ─────────────────────────────────────────────────────────────────
  {
    name: "Sleigh Bells",
    group: BRIGHT,
    description: "Bells on 8ths — the fastest way to make a chorus sound like it lifted",
    pattern: EIGHTHS,
    play: sleighBells,
  },
  {
    name: "Tambourine Lift",
    group: BRIGHT,
    description: "Driving 16ths with the backbeat pushed — a chorus at full tilt",
    pattern: SIXTEENTHS_BACKBEAT,
    play: tambourine,
  },
  {
    name: "Bell Tree",
    group: BRIGHT,
    description: "One run up the bells at the top of each bar",
    pattern: DOWNBEAT,
    play: (ctx, dst, when) => bellTree(ctx, dst, when),
  },
  {
    name: "Wind Chimes",
    group: BRIGHT,
    description: "A soft brushed cluster once a bar, under a held chord",
    pattern: DOWNBEAT,
    play: (ctx, dst, when) => windChimes(ctx, dst, when),
  },
  {
    name: "Riser",
    group: BRIGHT,
    description: "A noise swell across the whole bar — a build into whatever comes next",
    pattern: DOWNBEAT,
    play: riser,
  },
];

/** What the layer plays when a song has never said otherwise. */
export const DEFAULT_ACCENT = "Air Sparkle";

const BY_NAME = new Map(ACCENT_VARIATIONS.map((v) => [v.name, v]));

/** The named variation, or the default — an unknown name never silences the layer. */
export function accentByName(name: string | undefined): AccentVariation {
  return (name && BY_NAME.get(name)) || BY_NAME.get(DEFAULT_ACCENT)!;
}

export function isAccentName(name: unknown): name is string {
  return typeof name === "string" && BY_NAME.has(name);
}

/** Matches a name however it was typed — the song text is edited by hand. */
export function accentNameFrom(text: string): string | null {
  const lower = text.trim().toLowerCase();
  return ACCENT_VARIATIONS.find((v) => v.name.toLowerCase() === lower)?.name ?? null;
}

export const ACCENT_GROUPS: { label: string; items: AccentVariation[] }[] = (() => {
  const order = [ORGANIC, ELECTRONIC, BRIGHT];
  return order
    .map((label) => ({ label, items: ACCENT_VARIATIONS.filter((v) => v.group === label) }))
    .filter((g) => g.items.length > 0);
})();

/** Play whatever this variation puts on `step`, or nothing. */
export function playAccentStep(
  ctx: Ctx,
  dst: AudioNode,
  when: number,
  variation: AccentVariation,
  step: number,
  stepDur: number
) {
  const level = variation.pattern[step % 16];
  if (!level) return;
  variation.play(ctx, dst, when, level === 2, stepDur);
}

// ── Audition ─────────────────────────────────────────────────────────────────

/**
 * One bar of a variation, on its own, so picking from a list of twenty is done
 * by ear rather than by name. Used when the layer isn't already running — when
 * it is, the change is audible in the loop itself.
 */
export function auditionAccent(name: string, bpm: number) {
  const variation = accentByName(name);
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);

  const stepDur = 15 / Math.min(300, Math.max(30, bpm));
  const start = ctx.currentTime + 0.06;
  for (let step = 0; step < 16; step++) {
    playAccentStep(ctx, master, start + step * stepDur, variation, step, stepDur);
  }
  const bar = stepDur * 16;
  setTimeout(() => ctx.close().catch(() => {}), (bar + 2) * 1000);
}

// ── Control ──────────────────────────────────────────────────────────────────

/**
 * The Shimmer layer's toolbar control: a toggle, and the variation it plays.
 * Same shape as the drum machine's — a switch plus what the switch turns on.
 */
export function ShimmerControl({
  running,
  onToggle,
  variation,
  onVariationChange,
  bpm,
}: {
  running: boolean;
  onToggle: () => void;
  /** Variation name; an unknown one falls back to the default. */
  variation: string;
  onVariationChange: (name: string) => void;
  /** Tempo the one-bar audition plays at. */
  bpm: number;
}) {
  const current = useMemo(() => accentByName(variation), [variation]);

  return (
    <div className='flex flex-wrap items-center gap-1 px-3 py-2 print:hidden'>
      <button
        type='button'
        onClick={onToggle}
        aria-pressed={running}
        title={`${current.name} — ${current.description}`}
        className={`h-8 px-2.5 text-xs font-medium rounded-md border transition-colors duration-100 flex-shrink-0 ${
          running
            ? "bg-track-4 text-ink-primary border-track-4"
            : "bg-surface-raised text-ink-primary border-line-subtle hover:bg-surface-overlay"
        }`}
      >
        Shimmer
      </button>
      <select
        value={current.name}
        onChange={(e) => {
          onVariationChange(e.target.value);
          // The audition is for choosing; when the layer is already running,
          // the change speaks for itself on the next bar.
          if (!running) auditionAccent(e.target.value, bpm);
        }}
        aria-label='Shimmer accent'
        title={current.description}
        className='h-8 max-w-[9.5rem] text-xs rounded-md border border-line-subtle bg-surface-raised text-ink-primary px-1 focus:outline-none'
      >
        {ACCENT_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.items.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
