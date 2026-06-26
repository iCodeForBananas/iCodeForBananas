"use client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SectionType =
  | "intro"
  | "verse"
  | "pre-chorus"
  | "chorus"
  | "bridge"
  | "outro"
  | "other";

export interface Section {
  id: string;
  type: SectionType;
  label: string;
  content: string;
  notes: string;
  chords?: string;
  lyrics?: string;
}

export interface LeadSheet {
  id: string;
  title: string;
  key: string;
  tempo: number | null;
  general_notes: string;
  sections: Section[];
  created_at: string;
  updated_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const SECTION_TYPES: SectionType[] = [
  "intro",
  "verse",
  "pre-chorus",
  "chorus",
  "bridge",
  "outro",
  "other",
];

export const KEYS = [
  "C","C#","D","D#","E","F","F#","G","G#","A","A#","B",
  "Cm","C#m","Dm","D#m","Em","Fm","F#m","Gm","G#m","Am","A#m","Bm",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function makeSection(type: SectionType = "verse"): Section {
  return {
    id: crypto.randomUUID(),
    type,
    label: type.charAt(0).toUpperCase() + type.slice(1),
    content: "",
    notes: "",
  };
}

export function migrateSection(s: Section): Section {
  if (s.content !== undefined && s.content !== "") return s;
  const legacy = s.lyrics ?? "";
  return { ...s, content: legacy, chords: undefined, lyrics: undefined };
}

export function getPlainText(sheet: LeadSheet): string {
  const lines: string[] = [];
  lines.push(sheet.title || "Untitled");
  const meta: string[] = [];
  if (sheet.key) meta.push(`Key: ${sheet.key}`);
  if (sheet.tempo) meta.push(`Tempo: ${sheet.tempo} BPM`);
  if (meta.length) lines.push(meta.join("  "));
  if (sheet.general_notes) lines.push(sheet.general_notes);
  for (const section of sheet.sections) {
    lines.push("");
    lines.push((section.label || section.type).toUpperCase());
    lines.push(section.content ?? "");
    if (section.notes) lines.push(`↳ ${section.notes}`);
  }
  return lines.join("\n").trimEnd();
}

// ─── ChordPro parser ──────────────────────────────────────────────────────────

interface Segment {
  chord: string;
  lyric: string;
}

function parseChordProLine(line: string): Segment[] {
  const segments: Segment[] = [];
  const parts = line.split(/(\[[^\]]*\])/g);
  let pendingChord = "";
  for (const part of parts) {
    if (part.startsWith("[") && part.endsWith("]")) {
      pendingChord = part.slice(1, -1);
    } else {
      segments.push({ chord: pendingChord, lyric: part });
      pendingChord = "";
    }
  }
  if (pendingChord) segments.push({ chord: pendingChord, lyric: "" });
  return segments;
}

// ─── ChordLyricLine ───────────────────────────────────────────────────────────

export function ChordLyricLine({
  line,
  large = false,
}: {
  line: string;
  large?: boolean;
}) {
  const segments = parseChordProLine(line);
  const hasChords = segments.some((s) => s.chord);

  if (!hasChords) {
    return (
      <p
        className={`font-mono whitespace-pre ${large ? "text-[1.5em]" : "text-[1em]"} leading-relaxed text-black dark:text-white`}
      >
        {line || "\u00A0"}
      </p>
    );
  }

  return (
    <p className={`font-mono whitespace-pre-wrap ${large ? "text-[1.5em]" : "text-[1em]"} leading-relaxed`}>
      {segments.map((seg, i) => (
        <span key={i}>
          {seg.chord && (
            <span className="font-bold text-amber-600 dark:text-yellow-400">
              [{seg.chord}]
            </span>
          )}
          <span className="text-black dark:text-white">{seg.lyric}</span>
        </span>
      ))}
    </p>
  );
}
