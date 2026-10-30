import { asSectionHeader } from "./songText";
import {
  cueEventsFromLines,
  formatCueTag,
  readCueTokens,
  stripCueMarkers,
} from "./cues";
import { formatBeatMarker, formatTime, parseTimeMarker, stripTimeMarker } from "./timing";

// ─── Arrangement ──────────────────────────────────────────────────────────────
//
// The same song, read as a timeline instead of a page. Every lyric line is a
// clip on the lyric track, and every [drum] … [/drum] span is a clip on that
// layer's track. The text stays the source of truth: `buildArrangement` reads
// clips out of it and `applyArrangement` writes them back, so dragging a clip
// in the track editor lands in the sheet as an ordinary edit that Save and
// History can walk back.
//
// Lyric lines keep their place in the text — only their @stamps are rewritten.
// Cue lines are the arranger's own: applying regenerates all of them, which is
// what lets a clip move between sections without leaving a stray tag behind.

/** How long the last clip runs when nothing after it says otherwise. */
const TAIL_SECONDS = 6;

/** Times closer together than this are the same moment as far as a song cares. */
const EPSILON = 0.02;

/** Shortest an untimed line gets squeezed to when it has to fit somewhere. */
const MIN_FLOW = 0.5;

/** Bars an untimed line covers — two is about what a lyric phrase runs. */
const DEFAULT_LINE_BARS = 2;

/** The tempo assumed for a song whose header never names one. */
const DEFAULT_BPM = 120;

/**
 * How long a line runs when the song hasn't said: two bars at its own tempo,
 * so an untimed sheet still lands on the bar lines it would be sung against.
 */
export function defaultLineSeconds(bpm: number, beatsPerBar = 4): number {
  return (60 / Math.max(1, bpm)) * beatsPerBar * DEFAULT_LINE_BARS;
}

export interface ArrangementOptions {
  /** Length given to a line the song never timed. */
  lineSeconds?: number;
  /** The tempo the song's beat markers are read at. */
  bpm?: number;
}

/** How an arrangement is written back into the sheet. */
export interface ApplyOptions {
  /**
   * Write every marker in beats, so the arrangement follows the tempo instead
   * of the clock. Off for a song timed against a recording, which has a speed
   * of its own that no tempo field is going to change.
   */
  inBeats?: boolean;
  bpm?: number;
}

export interface LyricClip {
  id: string;
  /** Index into the sheet's lines — the clip's identity, never reordered. */
  lineIndex: number;
  /** The line as it reads on the page: marker and cue tags stripped. */
  text: string;
  start: number;
  end: number;
  /** True once the line carries its own @stamp rather than inheriting one. */
  placed: boolean;
  /** The section this line sits under, for the clip's tooltip. */
  section: string;
}

export interface SoundClip {
  id: string;
  layer: string;
  start: number;
  end: number;
  fadeIn: boolean;
  fadeOut: boolean;
}

export interface Arrangement {
  lyrics: LyricClip[];
  sounds: SoundClip[];
  /** Where the song stops — the last thing that happens in it. */
  duration: number;
}

// ─── Reading ──────────────────────────────────────────────────────────────────

/** A line that is only a stamp and cue tags — the arranger owns these. */
function isCueOnlyLine(line: string): boolean {
  const cue = readCueTokens(line);
  if (!cue) return false;
  return stripCueMarkers(stripTimeMarker(line)).trim() === "";
}

/** Lines that hold words: not headers, notes, blanks, or bare cue lines. */
function isLyricLine(line: string, seenHeader: boolean): boolean {
  if (!seenHeader) return false;
  if (!line.trim()) return false;
  if (asSectionHeader(line) !== null) return false;
  if (line.trimStart().startsWith("> ")) return false;
  return !isCueOnlyLine(line);
}

export function buildArrangement(
  rawText: string,
  options: ArrangementOptions = {},
): Arrangement {
  const lineSeconds = options.lineSeconds ?? defaultLineSeconds(DEFAULT_BPM);
  const bpm = options.bpm ?? DEFAULT_BPM;
  const lines = rawText.split("\n");
  const lyrics: LyricClip[] = [];

  let seenHeader = false;
  let section = "";
  // Where the next untimed line starts: the last moment the song actually
  // names. A song that names none of them lays itself out from the top.
  let anchor = 0;
  // Untimed lines, held back until the next stamp says how much room they get.
  let pending: LyricClip[] = [];

  /**
   * Lines nobody timed run back to back from the anchor, one default line long
   * each — squeezed evenly, never stretched, when `until` leaves less room than
   * that. A stamped line with no end of its own leads the run rather than
   * sitting outside it, so it keeps its start and shares the same spacing.
   */
  const flow = (until: number | null) => {
    if (!pending.length) return;
    const room = until === null ? null : until - anchor;
    const step =
      room !== null && room > EPSILON
        ? Math.max(MIN_FLOW, Math.min(lineSeconds, room / pending.length))
        : lineSeconds;
    pending.forEach((clip, i) => {
      clip.start = anchor + i * step;
    });
    pending = [];
  };

  lines.forEach((line, lineIndex) => {
    const header = asSectionHeader(line);
    if (header !== null) {
      seenHeader = true;
      section = header;
      return;
    }
    const marker = parseTimeMarker(line, bpm);
    // Every stamp is an anchor, cue lines included: [drum] at 1:04 is a moment
    // the song names, and the lines under it flow from there.
    if (marker) {
      flow(marker.start);
      anchor = marker.end ?? marker.start;
    }
    if (!isLyricLine(line, seenHeader)) return;
    const clip: LyricClip = {
      id: `lyric:${lineIndex}`,
      lineIndex,
      text: stripCueMarkers(stripTimeMarker(line)).trim(),
      // A stamped line keeps the start it was written with; an untimed one is
      // put in its place by `flow`, once the next stamp is known.
      start: marker ? marker.start : anchor,
      // Filled in below, once the following clip's start is known.
      end: marker?.end ?? Infinity,
      placed: marker !== null,
      section,
    };
    lyrics.push(clip);
    // A line given both a start and an end already knows its length; anything
    // else joins the run and is spaced with it.
    if (!marker || marker.end === null) pending.push(clip);
  });
  flow(null);

  // A clip runs until the next moment in the song, unless it was given its own
  // end — and an explicit end is only honoured while it fits in the gap.
  lyrics.forEach((clip, i) => {
    const next = lyrics.slice(i + 1).find((other) => other.start > clip.start + EPSILON);
    const limit = next ? next.start : clip.start + TAIL_SECONDS;
    clip.end = clip.end === Infinity ? limit : Math.min(clip.end, limit);
    // A line nobody timed runs one line long and then stops. The stamp after it
    // can be a whole section away, and a clip that stretched to reach it would
    // be claiming a length the song never said it had.
    if (!clip.placed) clip.end = Math.min(clip.end, clip.start + lineSeconds);
    if (clip.end <= clip.start) clip.end = Math.max(limit, clip.start + 1);
  });

  const sounds = buildSoundClips(lines, lyrics, bpm);

  const duration = Math.max(
    0,
    ...lyrics.map((c) => c.end),
    ...sounds.map((c) => c.end)
  );

  return { lyrics, sounds, duration };
}

/** Walks the cue events, pairing each start with the stop that closes it. */
function buildSoundClips(lines: string[], lyrics: LyricClip[], bpm: number): SoundClip[] {
  const events = cueEventsFromLines(lines, bpm);
  const lyricEnd = lyrics.length ? lyrics[lyrics.length - 1].end : 0;
  const songEnd = Math.max(lyricEnd, ...events.map((e) => e.time));

  const open = new Map<string, { start: number; fadeIn: boolean }>();
  const clips: SoundClip[] = [];
  let serial = 0;

  const close = (layer: string, at: number, fadeOut: boolean) => {
    const started = open.get(layer);
    if (!started) return;
    open.delete(layer);
    clips.push({
      id: `sound:${serial++}`,
      layer,
      start: started.start,
      end: Math.max(at, started.start + 1),
      fadeIn: started.fadeIn,
      fadeOut,
    });
  };

  for (const event of events) {
    for (const layer of event.stops) {
      if (layer === "all") {
        for (const openLayer of [...open.keys()]) close(openLayer, event.time, event.fadeOut);
      } else {
        close(layer, event.time, event.fadeOut);
      }
    }
    for (const layer of event.starts) {
      // A layer told to start while it is already running just keeps running.
      if (open.has(layer)) continue;
      open.set(layer, { start: event.time, fadeIn: event.fadeIn });
    }
  }

  // Whatever is still playing when the words run out plays to the end.
  for (const layer of [...open.keys()]) {
    close(layer, Math.max(songEnd, (open.get(layer)?.start ?? 0) + TAIL_SECONDS), false);
  }

  return clips.sort((a, b) => a.start - b.start);
}

// ─── Writing ──────────────────────────────────────────────────────────────────

/**
 * `m:ss`, with a fraction only when the clip actually sits between seconds.
 * Whole seconds are what a person reads back, so they stay the common case.
 */
export function formatArrangementTime(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds * 100) / 100);
  const whole = Math.floor(safe);
  const frac = safe - whole;
  if (frac < 0.005) return formatTime(whole);
  return formatTime(whole) + frac.toFixed(2).slice(1).replace(/0$/, "");
}

interface CueLine {
  time: number;
  text: string;
}

/** How a moment is written into the sheet — `1:04` or `b32`. */
type StampFormat = (seconds: number) => string;

/** One line per moment: everything starting at 1:04 shares a single tag. */
function generateCueLines(
  sounds: SoundClip[],
  duration: number,
  stamp: StampFormat,
): CueLine[] {
  const starts = new Map<string, { time: number; layers: string[]; fade: boolean }>();
  const stops = new Map<string, { time: number; layers: string[]; fade: boolean }>();

  const add = (
    bucket: Map<string, { time: number; layers: string[]; fade: boolean }>,
    time: number,
    layer: string,
    fade: boolean
  ) => {
    const key = `${time.toFixed(2)}:${fade}`;
    const group = bucket.get(key) ?? { time, layers: [], fade };
    group.layers.push(layer);
    bucket.set(key, group);
  };

  for (const clip of [...sounds].sort((a, b) => a.start - b.start)) {
    add(starts, clip.start, clip.layer, clip.fadeIn);
    // A layer that runs to the end of the song needs no stop tag to say so —
    // unless it fades out, which is something the last seconds have to be told.
    const runsOut = clip.end >= duration - EPSILON;
    if (!runsOut || clip.fadeOut) add(stops, clip.end, clip.layer, clip.fadeOut);
  }

  const lines: CueLine[] = [];
  for (const [, group] of stops) {
    // Everything stopping at once is what [/all] is for, and it stays readable
    // however many layers the song grows.
    const playing = sounds.filter(
      (clip) => clip.start < group.time - EPSILON && clip.end >= group.time - EPSILON
    );
    const stopsEverything =
      playing.length > 0 && playing.every((clip) => group.layers.includes(clip.layer));
    const layers = stopsEverything && group.layers.length > 1 ? ["all"] : group.layers;
    lines.push({
      time: group.time,
      text: `@${stamp(group.time)} ${formatCueTag(layers, true, group.fade)}`,
    });
  }
  for (const [, group] of starts) {
    lines.push({
      time: group.time,
      text: `@${stamp(group.time)} ${formatCueTag(group.layers, false, group.fade)}`,
    });
  }

  // Stops before starts at the same moment, so a hand-off reads in the order
  // it happens rather than turning a layer off right after turning it on.
  return lines.sort((a, b) => a.time - b.time || a.text.localeCompare(b.text));
}

/**
 * The song with the arrangement written into it. Lyric lines keep their text
 * and their place; their stamps, and every cue line, come from the clips.
 */
export function applyArrangement(
  rawText: string,
  arrangement: Arrangement,
  options: ApplyOptions = {},
): string {
  // Beats or the clock — decided once, here, so that a lyric line and the cue
  // above it can never end up written in two different languages.
  const bpm = options.bpm ?? DEFAULT_BPM;
  const stamp: StampFormat = options.inBeats
    ? (seconds) => formatBeatMarker(seconds, bpm)
    : (seconds) => formatArrangementTime(seconds);

  const original = rawText.split("\n");
  const byLine = new Map(arrangement.lyrics.map((clip) => [clip.lineIndex, clip]));
  // Clips can be dragged past each other, so what comes "next" is a question
  // about the timeline, not about the order the lines happen to sit in.
  const inTime = [...arrangement.lyrics].sort((a, b) => a.start - b.start);

  /** Rewritten lines, each remembering the moment it belongs to. */
  const kept: { text: string; time: number | null }[] = [];
  /** Where each cue line used to sit, so an untouched one goes back there. */
  const homes = new Map<string, number>();
  let firstHeader = -1;

  original.forEach((line, lineIndex) => {
    if (isCueOnlyLine(line)) {
      // Regenerated below — but remember the spot, so a cue nobody moved lands
      // back in the section it was written in rather than beside the nearest
      // lyric, which can be a section away.
      if (!homes.has(line.trim())) homes.set(line.trim(), kept.length);
      return;
    }
    const clip = byLine.get(lineIndex);
    if (!clip) {
      if (firstHeader < 0 && asSectionHeader(line) !== null) firstHeader = kept.length;
      // An inline cue tag on a non-lyric line is still the arranger's to own.
      kept.push({ text: readCueTokens(line) ? stripCueMarkers(line) : line, time: null });
      return;
    }

    const body = stripCueMarkers(stripTimeMarker(line)).trimStart();
    if (!clip.placed) {
      kept.push({ text: body, time: null });
      return;
    }

    const next = inTime.find((other) => other.start > clip.start + EPSILON);
    // An end only needs writing when the clip stops short of what follows it,
    // leaving a real gap; otherwise the next line's start says it already. The
    // last line has nothing after it, so it only needs one when it was given a
    // length of its own rather than the tail every last line gets.
    const gap = next
      ? clip.end < next.start - EPSILON
      : Math.abs(clip.end - clip.start - TAIL_SECONDS) > EPSILON;
    const marker = gap
      ? `@${stamp(clip.start)}-${stamp(clip.end)}`
      : `@${stamp(clip.start)}`;
    kept.push({ text: `${marker} ${body}`.trimEnd(), time: clip.start });
  });

  const duration = Math.max(
    0,
    ...arrangement.lyrics.map((c) => c.end),
    ...arrangement.sounds.map((c) => c.end)
  );

  // Each cue line goes just above the first line that hasn't happened yet,
  // which puts it in the section it belongs to without anyone having to say so.
  // A lyric on the same beat counts as not-yet: the drums come in and then the
  // line lands, which is the order they're read in as much as heard in.
  const insertions: { at: number; text: string }[] = [];
  for (const cue of generateCueLines(arrangement.sounds, duration, stamp)) {
    const home = homes.get(cue.text);
    if (home !== undefined) {
      homes.delete(cue.text);
      insertions.push({ at: home, text: cue.text });
      continue;
    }

    // Nothing later than the cue means it belongs after the last timed line —
    // or, in a song nobody has timed at all, at the top of the first section.
    let lastTimed = -1;
    let at = -1;
    for (let i = 0; i < kept.length; i++) {
      const time = kept[i].time;
      if (time === null) continue;
      if (time >= cue.time - EPSILON) {
        at = i;
        break;
      }
      lastTimed = i;
    }
    if (at < 0) {
      if (lastTimed >= 0) at = lastTimed + 1;
      else at = firstHeader >= 0 ? firstHeader + 1 : kept.length;
    }
    // Nothing can live above the first section header — that's the title block.
    if (firstHeader >= 0 && at <= firstHeader) at = firstHeader + 1;
    insertions.push({ at, text: cue.text });
  }

  const out: string[] = [];
  // Sorted by landing spot, not by time: two cues can want the same slot, and
  // a later one can land higher up the page when the song loops back on itself.
  const pending = [...insertions].sort((a, b) => a.at - b.at);
  kept.forEach((line, i) => {
    while (pending.length && pending[0].at <= i) out.push(pending.shift()!.text);
    out.push(line.text);
  });
  for (const rest of pending) out.push(rest.text);

  return out.join("\n");
}
