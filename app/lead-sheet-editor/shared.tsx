"use client";

import { useEffect } from "react";
import { WifiOff } from "lucide-react";
import ChordHoverPopover from "../components/ChordHoverPopover";
import { formatTime, parseTimeMarker, stripTimeMarker } from "./timing";

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

/**
 * Free-form per-song settings kept on the sheet's `metadata` jsonb column —
 * playback preferences that belong to the song rather than the device.
 * Anything reading it must tolerate missing or unexpected values (rows created
 * before a key existed, sheets cached offline).
 */
export interface LeadSheetMetadata {
  /** Drum machine state; see normalizeDrumSettings in DrumMachine.tsx. */
  drums?: { pattern?: string; kick?: string; snare?: string; volume?: number };
  /** String pad state; see normalizeStringSettings in StringPads.tsx. */
  strings?: { mode?: string; style?: string; volume?: number };
}

export interface LeadSheet {
  id: string;
  title: string;
  key: string;
  tempo: number | null;
  general_notes: string;
  sections: Section[];
  metadata?: LeadSheetMetadata | null;
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

// ─── Offline indicator ────────────────────────────────────────────────────────

export function OfflineBadge() {
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
      <WifiOff className="w-3.5 h-3.5" />
      Offline — showing cached version
    </span>
  );
}

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

// ─── Print / document title ───────────────────────────────────────────────────

/** What a printed song should be called — also the Save-as-PDF filename. */
export function printableTitle(title: string | undefined): string {
  return title?.trim() || "Untitled Lead Sheet";
}

/**
 * Browsers name the "Save as PDF" file after the document title, so while a
 * song is on screen the tab carries the song's name rather than the route's
 * generic one. Restores the previous title when leaving the page.
 */
export function useSongDocumentTitle(title: string | undefined) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = printableTitle(title);
    return () => {
      document.title = previous;
    };
  }, [title]);
}

/**
 * Print with the song's name in hand. The title is already set by
 * `useSongDocumentTitle`, but the router can rewrite it when route metadata
 * resolves, so it's pinned once more at the moment the dialog opens.
 */
export function printSong(title: string | undefined) {
  document.title = printableTitle(title);
  window.print();
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
  showTime = false,
}: {
  line: string;
  large?: boolean;
  /** Render the line's `@m:ss` cue as a chip. Off everywhere the timing is noise. */
  showTime?: boolean;
}) {
  const marker = parseTimeMarker(line);
  const body = marker ? stripTimeMarker(line) : line;
  const segments = parseChordProLine(body);
  const hasChords = segments.some((s) => s.chord);

  const timeChip = showTime && marker && (
    <span className="mr-2 select-none rounded bg-black/5 px-1.5 py-0.5 align-middle font-mono text-[0.7em] text-black/40 dark:bg-white/10 dark:text-white/40 print:hidden">
      {formatTime(marker.start)}
    </span>
  );

  if (!hasChords) {
    return (
      <p
        className={`leadsheet-lyric font-mono whitespace-pre-wrap break-words ${large ? "text-[1.5em]" : "text-[1em]"} leading-relaxed text-black dark:text-white`}
      >
        {timeChip}
        {body || "\u00A0"}
      </p>
    );
  }

  return (
    <p className={`font-mono whitespace-pre-wrap break-words ${large ? "text-[1.5em]" : "text-[1em]"} leading-relaxed`}>
      {timeChip}
      {segments.map((seg, i) => (
        <span key={i}>
          {seg.chord && (
            <ChordHoverPopover chord={seg.chord}>
              <span className="leadsheet-chord font-bold text-amber-600 dark:text-yellow-400">
                [{seg.chord}]
              </span>
            </ChordHoverPopover>
          )}
          <span className="leadsheet-lyric text-black dark:text-white">{seg.lyric}</span>
        </span>
      ))}
    </p>
  );
}
