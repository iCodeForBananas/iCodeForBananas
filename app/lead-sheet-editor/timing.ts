import type { Section } from "./shared";

// ─── Line timing markers ──────────────────────────────────────────────────────
//
// A content line can start with a time marker saying when it comes in:
//
//   @0:12 [G]Driving down an [D]empty road
//   @0:18-0:24 [Em]windows down          ← explicit end, leaves a gap after
//   @1:05.5 half-second precision works too
//
// A marker claims every line after it until the next marker, so marking just
// the first line of a section highlights that whole section. Lines before the
// first marker are a pre-roll and never light up.

const TIME = String.raw`\d{1,3}(?::[0-5]?\d)?(?:\.\d{1,3})?`;
const MARKER_RE = new RegExp(String.raw`^\s*@(${TIME})(?:\s*-\s*@?(${TIME}))?(?=\s|$)\s*`);

// Seconds appended to the final cue so the last line stays lit for a beat.
const TAIL_SECONDS = 6;

export interface TimeMarker {
  start: number;
  end: number | null;
}

export function parseTimeMarker(line: string): TimeMarker | null {
  const m = line.match(MARKER_RE);
  if (!m) return null;
  return { start: toSeconds(m[1]), end: m[2] !== undefined ? toSeconds(m[2]) : null };
}

/** The line as it should be displayed — marker removed. */
export function stripTimeMarker(line: string): string {
  return line.replace(MARKER_RE, "");
}

export function hasTimeMarkers(sections: Section[]): boolean {
  return sections.some((s) =>
    (s.content ?? "").split("\n").some((line) => parseTimeMarker(line) !== null)
  );
}

function toSeconds(raw: string): number {
  const [mins, secs] = raw.includes(":") ? raw.split(":") : ["0", raw];
  return parseInt(mins, 10) * 60 + parseFloat(secs);
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

export function buildTimeline(sections: Section[]): Timeline {
  const cues: Cue[] = [];
  const lineCue = new Map<string, number>();

  sections.forEach((section, sectionIndex) => {
    const lines = (section.content ?? "").split("\n");
    lines.forEach((line, lineIndex) => {
      const marker = parseTimeMarker(line);
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

/** Writes `@m:ss` onto the given lines, replacing any marker already there. */
export function applyStamps(rawText: string, stamps: Map<number, number>): string {
  return rawText
    .split("\n")
    .map((line, i) => {
      const seconds = stamps.get(i);
      if (seconds === undefined) return line;
      return `@${formatMarker(seconds)} ${stripTimeMarker(line)}`;
    })
    .join("\n");
}

export function clearAllMarkers(rawText: string): string {
  return rawText
    .split("\n")
    .map((line) => (parseTimeMarker(line) ? stripTimeMarker(line) : line))
    .join("\n");
}
