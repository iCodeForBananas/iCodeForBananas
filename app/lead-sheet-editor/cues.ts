import type { Section } from "./shared";
import { DEFAULT_BPM, parseTimeMarker } from "./timing";

// ─── Cue tags ─────────────────────────────────────────────────────────────────
//
// Syntax: @M:SS [drum]              — start a layer
//         @M:SS [drum, claps]       — start several
//         @M:SS [/drum]             — stop one
//         @M:SS [/all]              — stop everything
//         @M:SS [drum, fade-in]     — with a fade modifier
//
// A bracket only counts as a cue when every word inside it is a known layer or
// modifier. Everything else in brackets — [G], [Am7/C], [Chorus] — is left
// alone so chords keep rendering as chords.

/** Layers the scheduler knows how to play. Adding a sound? Add its name here. */
export const CUE_LAYERS = ["drum", "claps", "shimmer", "drone"] as const;

export type CueLayer = (typeof CUE_LAYERS)[number];

const LAYER_SET: ReadonlySet<string> = new Set(CUE_LAYERS);
const MODIFIERS: ReadonlySet<string> = new Set(["fade-in", "fade-out"]);

/** How a layer reads on the page — "drum" is one word to type, many to hear. */
export const LAYER_LABELS: Record<string, string> = {
  drum: "drums",
  claps: "claps",
  shimmer: "shimmer",
  drone: "drone",
  all: "everything",
};

export const layerLabel = (layer: string) => LAYER_LABELS[layer] ?? layer;

export interface CueTokens {
  /** Layer names to start. */
  starts: string[];
  /** Layer names to stop — "all" is a wildcard for everything playing. */
  stops: string[];
  fadeIn: boolean;
  fadeOut: boolean;
}

export interface CueEvent extends CueTokens {
  time: number;
}

const CUE_TAG_RE_G = /\[([^\[\]]*)\]/g;

function isCueWord(word: string): boolean {
  if (MODIFIERS.has(word)) return true;
  if (word.startsWith("/")) return word === "/all" || LAYER_SET.has(word.slice(1));
  return LAYER_SET.has(word);
}

/** Every word inside the bracket has to be a cue word, or it isn't a cue. */
function isCueTag(inner: string): boolean {
  const words = tagWords(inner);
  if (words.length === 0 || !words.every(isCueWord)) return false;
  // A bracket of nothing but modifiers cues no layer, so it isn't one either.
  return words.some((word) => !MODIFIERS.has(word));
}

const tagWords = (inner: string) =>
  inner.split(",").map((word) => word.trim().toLowerCase()).filter(Boolean);

/**
 * Cue tokens from every cue bracket on the line, or null when the line carries
 * none. A bracket has to be cues all the way through to count — one stray word
 * and it is somebody's chord, not a cue.
 */
export function readCueTokens(line: string): CueTokens | null {
  const starts: string[] = [];
  const stops: string[] = [];
  let fadeIn = false;
  let fadeOut = false;
  let found = false;

  for (const match of line.matchAll(CUE_TAG_RE_G)) {
    if (!isCueTag(match[1])) continue;
    found = true;
    for (const word of tagWords(match[1])) {
      if (word === "fade-in") fadeIn = true;
      else if (word === "fade-out") fadeOut = true;
      else if (word.startsWith("/")) stops.push(word.slice(1));
      else starts.push(word);
    }
  }

  return found ? { starts, stops, fadeIn, fadeOut } : null;
}

/** Drop the cue brackets from a line, leaving chords and lyrics untouched. */
export function stripCueMarkers(line: string): string {
  return line
    .replace(CUE_TAG_RE_G, (full, inner: string) => (isCueTag(inner) ? "" : full))
    .replace(/\s{2,}/g, " ")
    .trimEnd();
}

/** Badge text for a cued line: which layers move, and which way. */
export function getCueTagInfo(line: string): { label: string; isStop: boolean } | null {
  const cue = readCueTokens(line);
  if (!cue) return null;
  const isStop = cue.starts.length === 0 && cue.stops.length > 0;
  const layers = cue.starts.length > 0 ? cue.starts : cue.stops;
  if (layers.length === 0) return null;
  return { label: `${layers.map(layerLabel).join(", ")} ${isStop ? "out" : "in"}`, isStop };
}

/** The tag as it is written into a sheet — the arranger's half of the parser. */
export function formatCueTag(layers: string[], stop: boolean, fade: boolean): string {
  const words = layers.map((layer) => (stop ? `/${layer}` : layer));
  if (fade) words.push(stop ? "fade-out" : "fade-in");
  return `[${words.join(", ")}]`;
}

// ─── Events ───────────────────────────────────────────────────────────────────

export interface LineCueEvent extends CueEvent {
  lineIndex: number;
}

/** Cue events in the order they fire, tagged with the line that carries them. */
export function cueEventsFromLines(
  lines: string[],
  bpm: number = DEFAULT_BPM,
): LineCueEvent[] {
  const events: LineCueEvent[] = [];
  lines.forEach((line, lineIndex) => {
    const marker = parseTimeMarker(line, bpm);
    if (!marker) return;
    const cue = readCueTokens(line);
    if (!cue || (cue.starts.length === 0 && cue.stops.length === 0)) return;
    events.push({ time: marker.start, lineIndex, ...cue });
  });
  return events.sort((a, b) => a.time - b.time);
}

export function parseCueEvents(sections: Section[], bpm: number = DEFAULT_BPM): CueEvent[] {
  return cueEventsFromLines(
    sections.flatMap((section) => (section.content ?? "").split("\n")),
    bpm
  );
}
