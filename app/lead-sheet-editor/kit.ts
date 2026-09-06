/**
 * The kit: everything the song plays under itself, as one thing.
 *
 * The drums, the claps and the accent each already knew how to store
 * themselves — this is the layer above that, which says what the whole kit
 * sounds like and which parts of it are switched on. A preset is a named point
 * in that space, and applying one writes every field at once.
 *
 * The drum settings underneath are unchanged and still stored under the key
 * they have always used, so a song saved before any of this existed opens with
 * exactly the sound it had.
 */
import { accentByName, isAccentName } from "./accents";
import {
  DEFAULT_DRUM_SETTINGS,
  DRUM_PATTERNS,
  normalizeDrumSettings,
  type DrumSettings,
  type KickStyle,
  type SnareStyle,
} from "./DrumMachine";

// ── Layers ────────────────────────────────────────────────────────────────────

/**
 * The parts that can be playing, in the order they read on screen.
 *
 * These names are the same strings the arranger's cue layers use, so a kit
 * switched on here and a `[drum]` cue in the song text mean the same thing.
 */
export const KIT_LAYERS = ["drum", "claps", "shimmer"] as const;
export type KitLayer = (typeof KIT_LAYERS)[number];

export const LAYER_LABELS: Record<KitLayer, string> = {
  drum: "Drums",
  claps: "Claps",
  shimmer: "Percussion",
};

export function normalizeLayers(raw: unknown): KitLayer[] {
  if (!Array.isArray(raw)) return [];
  return KIT_LAYERS.filter((l) => raw.includes(l));
}

// ── The kit ───────────────────────────────────────────────────────────────────

export interface KitSettings {
  /**
   * The preset this kit came from, or null once something was changed.
   *
   * Kept so the designer can say "Trap 808, edited" rather than losing the
   * name the moment a step is toggled. It is a label, never a source of truth:
   * everything that sounds is in `drums`.
   */
  preset: string | null;
  layers: KitLayer[];
  drums: DrumSettings;
}

export const DEFAULT_KIT: KitSettings = {
  preset: null,
  layers: [],
  drums: DEFAULT_DRUM_SETTINGS,
};

/**
 * Reassemble the kit from a sheet's metadata.
 *
 * The drum settings are read from the key they have always used, so this works
 * on a sheet that predates the kit entirely — that sheet simply has no `kit`
 * key, which means no preset name and nothing switched on, and the player
 * starts silent exactly as it used to.
 *
 * A sheet may also still carry `subBass` and `strings` from the pad and the
 * bass walk-down. Those are not read any more, and not written either; nothing
 * deletes them, so a row keeps whatever it had.
 */
export function kitFromMetadata(metadata: Record<string, unknown> | null | undefined): KitSettings {
  const meta = metadata ?? {};
  const kit = (meta.kit ?? {}) as Record<string, unknown>;
  return {
    preset: typeof kit.preset === "string" ? kit.preset : null,
    layers: normalizeLayers(kit.layers),
    drums: normalizeDrumSettings(meta.drums),
  };
}

/**
 * The kit as the patch to write back onto a sheet's metadata.
 *
 * Split across the two keys it was read from rather than nested under one: the
 * arranger, the WAV render and the `Drums:` line all still read
 * `metadata.drums`, and moving it would break every one of them for a gain of
 * nothing.
 */
export function kitToMetadata(kit: KitSettings): Record<string, unknown> {
  return {
    drums: kit.drums,
    kit: { preset: kit.preset, layers: kit.layers },
  };
}

export function hasLayer(kit: KitSettings, layer: KitLayer): boolean {
  return kit.layers.includes(layer);
}

export function toggleLayer(kit: KitSettings, layer: KitLayer): KitSettings {
  const layers = hasLayer(kit, layer)
    ? kit.layers.filter((l) => l !== layer)
    : KIT_LAYERS.filter((l) => l === layer || kit.layers.includes(l));
  return { ...kit, layers };
}

/** Whether anything at all would sound. */
export function kitIsSilent(kit: KitSettings): boolean {
  return kit.layers.length === 0;
}

// ── Presets ───────────────────────────────────────────────────────────────────

export interface KitPreset {
  name: string;
  group: string;
  /** The one line the card has room for. */
  blurb: string;
  /** Suggested tempo. Applied only when the caller asks for it. */
  bpm: number;
  layers: KitLayer[];
  pattern: string;
  kick: KickStyle;
  snare: SnareStyle;
  shimmer: string;
  drumVolume: number;
}

/**
 * Every preset names a pattern from DRUM_PATTERNS and an accent from
 * ACCENT_VARIATIONS. `kitPresetProblems` proves that at test time, so a renamed
 * pattern fails the suite rather than silently falling back to Folk Stomp on
 * somebody's song.
 */
export const KIT_PRESETS: KitPreset[] = [
  // ── Trap and hip-hop ────────────────────────────────────────────────────────
  {
    name: "Trap 808",
    group: "Trap & hip-hop",
    blurb: "Sliding 808, rolling hats, claps on the backbeat.",
    bpm: 140,
    layers: ["drum", "claps", "shimmer"],
    pattern: "Tresillo Pop",
    kick: "808",
    snare: "regular",
    shimmer: "Trap Rolls",
    drumVolume: 0.8,
  },
  {
    name: "Boom Bap",
    group: "Trap & hip-hop",
    blurb: "Dusty backbeat, cross-stick, no frills.",
    bpm: 90,
    layers: ["drum"],
    pattern: "Boom Bap",
    kick: "folk",
    snare: "regular",
    shimmer: "Cross-Stick",
    drumVolume: 0.85,
  },
  {
    name: "Drill",
    group: "Trap & hip-hop",
    blurb: "Sparse kit, 808 kick, hats doing the work.",
    bpm: 142,
    layers: ["drum", "shimmer"],
    pattern: "Dembow",
    kick: "808",
    snare: "regular",
    shimmer: "808 Hats",
    drumVolume: 0.7,
  },

  // ── Songwriter ──────────────────────────────────────────────────────────────
  {
    name: "Folk Stomp",
    group: "Songwriter",
    blurb: "Stomp, clap, shaker. A room with no drum kit in it.",
    bpm: 112,
    layers: ["drum", "claps", "shimmer"],
    pattern: "Folk Stomp",
    kick: "folk",
    snare: "brush",
    shimmer: "Egg Shaker",
    drumVolume: 0.85,
  },
  {
    name: "Campfire",
    group: "Songwriter",
    blurb: "Brushes and a tambourine, held well back.",
    bpm: 96,
    layers: ["drum", "shimmer"],
    pattern: "Brush Shuffle",
    kick: "folk",
    snare: "brush",
    shimmer: "Tambourine",
    drumVolume: 0.7,
  },
  {
    name: "Big Chorus",
    group: "Songwriter",
    blurb: "Everything in, for the part where everyone joins in.",
    bpm: 120,
    layers: ["drum", "claps", "shimmer"],
    pattern: "Big Chorus",
    kick: "folk",
    snare: "regular",
    shimmer: "Tambourine Backbeat",
    drumVolume: 0.9,
  },

  // ── Soul and R&B ────────────────────────────────────────────────────────────
  {
    name: "Neo Soul",
    group: "Soul & R&B",
    blurb: "Loose pocket, brushes, nothing on the front of the beat.",
    bpm: 84,
    layers: ["drum"],
    pattern: "Neo Soul",
    kick: "folk",
    snare: "brush",
    shimmer: "Cross-Stick",
    drumVolume: 0.75,
  },
  {
    name: "Quiet Storm",
    group: "Soul & R&B",
    blurb: "Slow, wide, 808 kick with the snare brushed.",
    bpm: 72,
    layers: ["drum"],
    pattern: "Quiet Storm",
    kick: "808",
    snare: "brush",
    shimmer: "Finger Snaps",
    drumVolume: 0.65,
  },
  {
    name: "Slow Jam",
    group: "Soul & R&B",
    blurb: "Snaps on the backbeat, nothing hurried.",
    bpm: 68,
    layers: ["drum", "shimmer"],
    pattern: "Slow Jam",
    kick: "808",
    snare: "regular",
    shimmer: "Finger Snaps",
    drumVolume: 0.7,
  },

  // ── Dance floor ─────────────────────────────────────────────────────────────
  {
    name: "Four on the Floor",
    group: "Dance floor",
    blurb: "Kick on every beat, shaker over the top.",
    bpm: 124,
    layers: ["drum", "shimmer"],
    pattern: "4 on the Floor",
    kick: "808",
    snare: "regular",
    shimmer: "Digital Shaker",
    drumVolume: 0.85,
  },
  {
    name: "Disco",
    group: "Dance floor",
    blurb: "Open hats and claps, straight through.",
    bpm: 118,
    layers: ["drum", "claps", "shimmer"],
    pattern: "Disco Floor",
    kick: "folk",
    snare: "regular",
    shimmer: "Cabasa",
    drumVolume: 0.85,
  },
  {
    name: "Afrobeats",
    group: "Dance floor",
    blurb: "Rolling pattern with a woodblock riding it.",
    bpm: 106,
    layers: ["drum", "shimmer"],
    pattern: "Afrobeats",
    kick: "folk",
    snare: "regular",
    shimmer: "Woodblock",
    drumVolume: 0.8,
  },

  // ── Band ────────────────────────────────────────────────────────────────────
  {
    name: "Rock Backbeat",
    group: "Band",
    blurb: "Two and four, hats throughout.",
    bpm: 128,
    layers: ["drum"],
    pattern: "Half-time",
    kick: "folk",
    snare: "regular",
    shimmer: "Tambourine Backbeat",
    drumVolume: 0.9,
  },
  {
    name: "Reggae",
    group: "Band",
    blurb: "One drop, and the space around it.",
    bpm: 74,
    layers: ["drum"],
    pattern: "Reggae One Drop",
    kick: "folk",
    snare: "regular",
    shimmer: "Cross-Stick",
    drumVolume: 0.8,
  },
  {
    name: "Bossa Nova",
    group: "Band",
    blurb: "Brushes and claves, brushed light.",
    bpm: 132,
    layers: ["drum", "shimmer"],
    pattern: "Bossa Nova",
    kick: "folk",
    snare: "brush",
    shimmer: "Claves",
    drumVolume: 0.7,
  },

  // ── Sparse ──────────────────────────────────────────────────────────────────
  {
    name: "Pulse Only",
    group: "Sparse",
    blurb: "A heartbeat and nothing else, for a verse that needs room.",
    bpm: 88,
    layers: ["drum"],
    pattern: "Heartbeat",
    kick: "folk",
    snare: "regular",
    shimmer: "Air Sparkle",
    drumVolume: 0.7,
  },
  {
    name: "Shaker Only",
    group: "Sparse",
    blurb: "No kit at all — just the thing keeping time.",
    bpm: 92,
    layers: ["shimmer"],
    pattern: "Kick Only",
    kick: "folk",
    snare: "regular",
    shimmer: "Egg Shaker",
    drumVolume: 0.7,
  },
];

export const PRESET_GROUPS: { label: string; items: KitPreset[] }[] = (() => {
  const order: string[] = [];
  const byGroup = new Map<string, KitPreset[]>();
  for (const preset of KIT_PRESETS) {
    if (!byGroup.has(preset.group)) {
      byGroup.set(preset.group, []);
      order.push(preset.group);
    }
    byGroup.get(preset.group)!.push(preset);
  }
  return order.map((label) => ({ label, items: byGroup.get(label)! }));
})();

/**
 * Every preset field that names something in another table, checked against
 * that table. Returns the problems rather than throwing, so the test can print
 * all of them at once instead of one per run.
 */
export function kitPresetProblems(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const preset of KIT_PRESETS) {
    if (seen.has(preset.name)) problems.push(`duplicate preset name: ${preset.name}`);
    seen.add(preset.name);
    if (!DRUM_PATTERNS.some((p) => p.name === preset.pattern)) {
      problems.push(`${preset.name}: no pattern named "${preset.pattern}"`);
    }
    if (!isAccentName(preset.shimmer) || accentByName(preset.shimmer).name !== preset.shimmer) {
      problems.push(`${preset.name}: no accent named "${preset.shimmer}"`);
    }
    if (preset.drumVolume < 0 || preset.drumVolume > 1) {
      problems.push(`${preset.name}: drumVolume ${preset.drumVolume} is outside 0-1`);
    }
    if (preset.layers.length === 0) problems.push(`${preset.name}: nothing switched on`);
  }
  return problems;
}

export function presetByName(name: string | null): KitPreset | null {
  if (!name) return null;
  return KIT_PRESETS.find((p) => p.name === name) ?? null;
}

/**
 * The kit a preset describes.
 *
 * A beat written by hand does not survive it: applying a preset picks that
 * preset's pattern, which means dropping the edited steps, because keeping them
 * would leave the pattern name saying one thing and the beat sounding like
 * another.
 */
export function applyPreset(preset: KitPreset): KitSettings {
  return {
    preset: preset.name,
    layers: [...preset.layers],
    drums: {
      pattern: preset.pattern,
      steps: null,
      kick: preset.kick,
      snare: preset.snare,
      shimmer: preset.shimmer,
      volume: preset.drumVolume,
    },
  };
}

/**
 * Whether a kit still matches the preset it names, so the designer can show
 * "Trap 808" or "Trap 808, edited" without keeping a dirty flag that has to be
 * cleared in every code path that changes something.
 */
export function matchesPreset(kit: KitSettings): boolean {
  const preset = presetByName(kit.preset);
  if (!preset) return false;
  return (
    kit.drums.pattern === preset.pattern &&
    kit.drums.steps === null &&
    kit.drums.kick === preset.kick &&
    kit.drums.snare === preset.snare &&
    kit.drums.shimmer === preset.shimmer &&
    kit.drums.volume === preset.drumVolume &&
    kit.layers.length === preset.layers.length &&
    preset.layers.every((l) => kit.layers.includes(l))
  );
}
