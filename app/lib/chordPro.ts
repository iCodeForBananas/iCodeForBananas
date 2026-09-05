// ─── ChordPro ────────────────────────────────────────────────────────────────
//
// The canonical form a song is stored in. Two properties matter more than
// completeness:
//
//   Round-tripping. formatChordPro(parseChordPro(text)) is stable, so opening a
//   song and saving it without touching anything cannot rewrite it. A parser
//   that quietly reformats turns every save into a diff nobody asked for.
//
//   Losslessness. Anything not understood is carried through rather than
//   dropped. A directive this version has never heard of survives a save.

export type SectionKind =
  | "intro"
  | "verse"
  | "pre-chorus"
  | "chorus"
  | "bridge"
  | "outro"
  | "other";

const SECTION_KINDS: SectionKind[] = [
  "intro",
  "verse",
  "pre-chorus",
  "chorus",
  "bridge",
  "outro",
  "other",
];

/** ChordPro's own abbreviations, which people type and other tools emit. */
const SHORTHAND: Record<string, SectionKind> = {
  sov: "verse",
  soc: "chorus",
  sob: "bridge",
};
const END_SHORTHAND = new Set(["eov", "eoc", "eob"]);

/**
 * A run of lyric with at most one chord, which lands on its first character.
 * A chord with no lyric after it (a bar of instrumental) has an empty text.
 */
export interface Segment {
  chord: string | null;
  text: string;
}

export type Line =
  | { kind: "lyric"; segments: Segment[] }
  | { kind: "comment"; text: string }
  | { kind: "blank" }
  /** A directive inside a section that this version does not understand. */
  | { kind: "unknown"; raw: string };

export interface Section {
  kind: SectionKind;
  /** What this section is called, when it is called something. */
  label: string | null;
  lines: Line[];
}

export interface Meta {
  title?: string;
  artist?: string;
  /** The key the song is written in. Canonical; no transform rewrites it. */
  key?: string;
  /** A capo the song is normally played with. A default, not a transform. */
  capo?: number;
  tempo?: number;
  time?: string;
  /** Directives carried through untouched so a save cannot lose them. */
  extra?: { name: string; value: string }[];
}

export interface Song {
  meta: Meta;
  sections: Section[];
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

const DIRECTIVE_RE = /^\{\s*([a-zA-Z_-]+)\s*(?::\s*([\s\S]*?))?\s*\}$/;

/** Split a lyric line on its bracketed chords. */
export function parseLine(line: string): Segment[] {
  const segments: Segment[] = [];
  let pending: string | null = null;
  for (const part of line.split(/(\[[^\]]*\])/g)) {
    if (part.startsWith("[") && part.endsWith("]")) {
      // Two chords in a row: the first governs a run with no lyric under it.
      if (pending !== null) segments.push({ chord: pending, text: "" });
      pending = part.slice(1, -1).trim();
    } else if (part !== "") {
      segments.push({ chord: pending, text: part });
      pending = null;
    }
  }
  if (pending !== null) segments.push({ chord: pending, text: "" });
  return segments;
}

/** pre-chorus, pre_chorus and prechorus are the same section. */
const squash = (name: string) => name.replace(/[-_]/g, "").toLowerCase();

const numeric = (value: string): number | undefined => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
};

export function parseChordPro(text: string): Song {
  const meta: Meta = {};
  const sections: Section[] = [];
  let current: Section | null = null;

  /** Lines before any environment still belong somewhere. */
  const section = (): Section => {
    if (!current) {
      current = { kind: "other", label: null, lines: [] };
      sections.push(current);
    }
    return current;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const directive = line.match(DIRECTIVE_RE);

    if (!directive) {
      if (line === "") {
        // Blank lines between sections are structure, not content.
        if (current) current.lines.push({ kind: "blank" });
      } else {
        section().lines.push({ kind: "lyric", segments: parseLine(raw) });
      }
      continue;
    }

    const name = directive[1].toLowerCase();
    const value = directive[2] ?? "";

    const startKind =
      SHORTHAND[name] ??
      (name.startsWith("start_of_")
        ? SECTION_KINDS.find((k) => squash(k) === squash(name.slice("start_of_".length)))
        : undefined);

    if (startKind) {
      current = { kind: startKind, label: value || null, lines: [] };
      sections.push(current);
      continue;
    }
    if (END_SHORTHAND.has(name) || name.startsWith("end_of_")) {
      current = null;
      continue;
    }

    switch (name) {
      case "title":
      case "t":
        meta.title = value;
        continue;
      case "artist":
      case "subtitle":
      case "st":
        meta.artist = value;
        continue;
      case "key":
        meta.key = value;
        continue;
      case "capo":
        meta.capo = numeric(value);
        continue;
      case "tempo":
        meta.tempo = numeric(value);
        continue;
      case "time":
        meta.time = value;
        continue;
      case "comment":
      case "c":
        section().lines.push({ kind: "comment", text: value });
        continue;
      default:
        // Unknown at the top is metadata; unknown inside a section is content.
        if (current) current.lines.push({ kind: "unknown", raw: line });
        else (meta.extra ??= []).push({ name, value });
    }
  }

  // A trailing blank line is whitespace, not an empty line of the song.
  for (const s of sections) {
    while (s.lines.at(-1)?.kind === "blank") s.lines.pop();
  }
  return { meta, sections: sections.filter((s) => s.lines.length > 0) };
}

// ─── Formatting ──────────────────────────────────────────────────────────────

export function formatLine(segments: Segment[]): string {
  return segments
    .map((s) => (s.chord === null ? s.text : `[${s.chord}]${s.text}`))
    .join("");
}

/** The environment name a kind is written under. */
const environment = (kind: SectionKind) => `start_of_${kind.replace("-", "_")}`;

export function formatChordPro(song: Song): string {
  const out: string[] = [];
  const { meta } = song;

  if (meta.title !== undefined) out.push(`{title: ${meta.title}}`);
  if (meta.artist !== undefined) out.push(`{artist: ${meta.artist}}`);
  if (meta.key !== undefined) out.push(`{key: ${meta.key}}`);
  if (meta.capo !== undefined) out.push(`{capo: ${meta.capo}}`);
  if (meta.tempo !== undefined) out.push(`{tempo: ${meta.tempo}}`);
  if (meta.time !== undefined) out.push(`{time: ${meta.time}}`);
  for (const { name, value } of meta.extra ?? []) {
    out.push(value === "" ? `{${name}}` : `{${name}: ${value}}`);
  }

  for (const section of song.sections) {
    if (out.length) out.push("");
    const named = section.label ? `${environment(section.kind)}: ${section.label}` : environment(section.kind);
    // An "other" section with no label had no environment to begin with, so
    // writing one would invent structure the song did not have.
    const bare = section.kind === "other" && !section.label;
    if (!bare) out.push(`{${named}}`);
    for (const line of section.lines) {
      if (line.kind === "lyric") out.push(formatLine(line.segments));
      else if (line.kind === "comment") out.push(`{comment: ${line.text}}`);
      else if (line.kind === "unknown") out.push(line.raw);
      else out.push("");
    }
    if (!bare) out.push(`{end_of_${section.kind.replace("-", "_")}}`);
  }
  return out.join("\n");
}

// ─── Chords over lyrics ──────────────────────────────────────────────────────

/**
 * Lay one line out as two rows of text, a chord row above a lyric row, with
 * every chord starting at the column its lyric does.
 *
 * This is why the document pane is fixed-advance: alignment here is counted in
 * characters and only holds if every character is the same width. See
 * scripts/typography-check.mjs.
 *
 * A chord wider than the lyric under it pushes the rest of the line right, and
 * the lyric row is padded to match so the two never drift apart. Two chords
 * always keep at least one space between them, because "Cmaj7D" is not
 * readable as two chords.
 */
export function layoutLine(segments: Segment[]): { chords: string; lyrics: string } {
  let chords = "";
  let lyrics = "";

  for (const segment of segments) {
    if (segment.chord !== null) {
      const start = Math.max(lyrics.length, chords.length === 0 ? 0 : chords.length + 1);
      lyrics = lyrics.padEnd(start);
      chords = chords.padEnd(start) + segment.chord;
    }
    lyrics += segment.text;
  }
  return { chords: chords.trimEnd(), lyrics };
}
