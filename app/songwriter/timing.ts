import type { Section } from "./shared";

// ─── Line timing markers ──────────────────────────────────────────────────────
//
// A content line can start with a time marker saying when it comes in:
//
//   @0:12 [G]Driving down an [D]empty road
//   @0:18-0:24 [Em]windows down          ← explicit end, leaves a gap after
//   @1:05.5 half-second precision works too
//
// Or in beats, counted from the top of the song:
//
//   @b16 [G]Driving down an [D]empty road   ← beat 16, wherever the tempo puts it
//   @b16-b24 [Em]windows down
//
// A clock marker is a fixed moment; a beat marker is a place in the music, so
// reading it back at a different tempo moves it. A song timed against a
// recording wants the clock — the recording isn't going to change speed — and
// anything played to a click wants beats, which is what the arranger writes.
//
// A marker claims every line after it until the next marker, so marking just
// the first line of a section highlights that whole section. Lines before the
// first marker are a pre-roll and never light up.

const TIME = String.raw`\d{1,3}(?::[0-5]?\d)?(?:\.\d{1,3})?`;
const BEATS = String.raw`b\d{1,4}(?:\.\d{1,3})?`;
const VALUE = `(?:${BEATS}|${TIME})`;
const MARKER_RE = new RegExp(String.raw`^\s*@(${VALUE})(?:\s*-\s*@?(${VALUE}))?(?=\s|$)\s*`, "i");

// Seconds appended to the final cue so the last line stays lit for a beat.
const TAIL_SECONDS = 6;

/** The tempo a song is read at when its header never names one. */
export const DEFAULT_BPM = 120;

const isBeats = (raw: string) => raw[0] === "b" || raw[0] === "B";

export interface TimeMarker {
  start: number;
  end: number | null;
  /** True when written in beats, so the tempo — not the clock — placed it. */
  inBeats: boolean;
}

export function parseTimeMarker(line: string, bpm: number = DEFAULT_BPM): TimeMarker | null {
  const m = line.match(MARKER_RE);
  if (!m) return null;
  return {
    start: toSeconds(m[1], bpm),
    end: m[2] !== undefined ? toSeconds(m[2], bpm) : null,
    inBeats: isBeats(m[1]),
  };
}

/** The line as it should be displayed — marker removed. */
export function stripTimeMarker(line: string): string {
  return line.replace(MARKER_RE, "");
}

/** True when the song is written in beats, so tempo edits should re-flow it. */
export function hasBeatMarkers(rawText: string): boolean {
  return rawText.split("\n").some((line) => parseTimeMarker(line)?.inBeats === true);
}

/**
 * The tempo named in the header block — the tempo every beat marker in the song
 * is read against. Only the block above the first section counts, so a lyric
 * that happens to say "tempo" can't rewrite the song's clock.
 */
export function readTempo(rawText: string, fallback: number = DEFAULT_BPM): number {
  for (const line of rawText.split("\n")) {
    if (/^\s*\[[^[\]]+\]\s*$/.test(line)) break;
    const tempo = line.match(/\bTempo:\s*(\d+)\b/i);
    if (tempo) return Math.min(300, Math.max(30, parseInt(tempo[1], 10)));
  }
  return fallback;
}

export function hasTimeMarkers(sections: Section[]): boolean {
  return sections.some((s) =>
    (s.content ?? "").split("\n").some((line) => parseTimeMarker(line) !== null)
  );
}

function toSeconds(raw: string, bpm: number): number {
  if (isBeats(raw)) return (parseFloat(raw.slice(1)) * 60) / Math.max(1, bpm);
  const [mins, secs] = raw.includes(":") ? raw.split(":") : ["0", raw];
  return parseInt(mins, 10) * 60 + parseFloat(secs);
}

/** Beats a moment falls on — the arranger's half of the beat parser. */
export function toBeats(seconds: number, bpm: number): number {
  return (Math.max(0, seconds) * Math.max(1, bpm)) / 60;
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/** `m:ss` for a marker written back into the sheet — the format the parser reads. */
export function formatMarker(seconds: number): string {
  return formatTime(seconds);
}

/**
 * `b<beats>` — a marker that stays where it is in the music when the tempo
 * moves. Rounded to a thousandth of a beat, which is far finer than anything
 * anyone drags and keeps the text readable.
 */
export function formatBeatMarker(seconds: number, bpm: number): string {
  return `b${Math.round(toBeats(seconds, bpm) * 1000) / 1000}`;
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export interface CueLine {
  sectionIndex: number;
  lineIndex: number;
}

export interface Cue {
  index: number;
  start: number;
  /** When this cue stops being current — the next cue's start unless one was given. */
  end: number;
  lines: CueLine[];
  /** First line of the cue, marker stripped — what the transport bar shows. */
  text: string;
  sectionLabel: string;
}

export interface Timeline {
  cues: Cue[];
  duration: number;
  /** Cue index for a `${sectionIndex}:${lineIndex}` key, so rendering is a lookup. */
  lineCue: Map<string, number>;
}

export const lineKey = (sectionIndex: number, lineIndex: number) => `${sectionIndex}:${lineIndex}`;

export function buildTimeline(sections: Section[], bpm: number = DEFAULT_BPM): Timeline {
  const cues: Cue[] = [];
  const lineCue = new Map<string, number>();

  sections.forEach((section, sectionIndex) => {
    const lines = (section.content ?? "").split("\n");
    lines.forEach((line, lineIndex) => {
      const marker = parseTimeMarker(line, bpm);
      if (marker) {
        cues.push({
          index: cues.length,
          start: marker.start,
          end: marker.end ?? Infinity,
          lines: [],
          text: stripTimeMarker(line).trim(),
          sectionLabel: section.label || section.type,
        });
      }
      const current = cues[cues.length - 1];
      if (!current) return; // pre-roll: lines above the first marker
      if (line.trim() === "") return; // blank spacers don't need highlighting
      current.lines.push({ sectionIndex, lineIndex });
      lineCue.set(lineKey(sectionIndex, lineIndex), current.index);
    });
  });

  // Out-of-order markers would make the timeline run backwards; sorting keeps
  // playback monotonic no matter what order the lines were typed in.
  cues.sort((a, b) => a.start - b.start);
  cues.forEach((cue, i) => {
    cue.index = i;
    for (const line of cue.lines) lineCue.set(lineKey(line.sectionIndex, line.lineIndex), i);
  });

  cues.forEach((cue, i) => {
    const next = cues[i + 1];
    const implicitEnd = next ? next.start : cue.start + TAIL_SECONDS;
    // An explicit end is only honoured while it fits before the next cue.
    cue.end = cue.end === Infinity ? implicitEnd : Math.min(cue.end, implicitEnd);
    if (cue.end <= cue.start) cue.end = implicitEnd;
  });

  const duration = cues.length ? cues[cues.length - 1].end : 0;
  return { cues, duration, lineCue };
}

export function cueAt(timeline: Timeline, seconds: number): Cue | null {
  for (const cue of timeline.cues) {
    if (seconds >= cue.start && seconds < cue.end) return cue;
  }
  return null;
}

/** The next cue that hasn't started yet — used for the "up next" countdown. */
export function nextCueAfter(timeline: Timeline, seconds: number): Cue | null {
  return timeline.cues.find((cue) => cue.start > seconds) ?? null;
}

// ─── Stamping markers into raw editor text ────────────────────────────────────

/**
 * Lines the tap-timing tool can stamp: real content, not section headers,
 * performance notes, the title block, or blanks.
 */
export function stampableLines(rawText: string): number[] {
  const lines = rawText.split("\n");
  const indexes: number[] = [];
  let seenHeader = false;
  lines.forEach((line, i) => {
    if (/^\s*\[[^\[\]]+\]\s*$/.test(line)) {
      seenHeader = true;
      return;
    }
    if (!seenHeader) return;
    if (!line.trim()) return;
    if (line.startsWith("> ")) return;
    indexes.push(i);
  });
  return indexes;
}

/**
 * Writes a marker onto the given lines, replacing any marker already there.
 * Tapping happens on the clock, so a `bpm` is what turns those taps into the
 * beats a beat-timed song is written in.
 */
export function applyStamps(
  rawText: string,
  stamps: Map<number, number>,
  bpm?: number,
): string {
  return rawText
    .split("\n")
    .map((line, i) => {
      const seconds = stamps.get(i);
      if (seconds === undefined) return line;
      const marker = bpm ? formatBeatMarker(seconds, bpm) : formatMarker(seconds);
      return `@${marker} ${stripTimeMarker(line)}`;
    })
    .join("\n");
}

export function clearAllMarkers(rawText: string): string {
  return rawText
    .split("\n")
    .map((line) => (parseTimeMarker(line) ? stripTimeMarker(line) : line))
    .join("\n");
}
