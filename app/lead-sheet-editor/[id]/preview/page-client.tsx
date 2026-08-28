"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Pencil,
  Maximize2,
  Minimize2,
  Printer,
  Minus,
  Plus,
  Copy,
  Check,
  Link2,
  Play,
  Youtube,
  ChevronDown,
  ChevronUp,
  Mic,
  PencilLine,
} from "lucide-react";
import {
  type LeadSheet,
  type Section,
  migrateSection,
  ChordLyricLine,
  getPlainText,
  OfflineBadge,
  printSong,
  useSongDocumentTitle,
} from "../../shared";
import { cacheSheet, getCachedSheet } from "../../offlineCache";
import LineEditor, { type LineTarget } from "../../LineEditor";
import {
  LineDndProvider,
  SortableLine,
  SortableLines,
  lineDragId,
  type LinePos,
} from "../../LineReorder";
import { serializeSheet } from "../../serialize";
import { snapshotRevision } from "../../revisions";
import { transposeKey, transposeText } from "../../../lib/transpose";
import { progressionFrom } from "../../progression";
import { buildTimeline, cueAt, lineKey, type Timeline } from "../../timing";
import { PlaybackBar, usePlayback, usePlaybackKeys } from "../../PlaybackBar";
import { findYouTubeLink, type YouTubeLink } from "../../youtube";
import { YouTubePanel, useYouTubePlayback } from "../../YouTubePlayer";
import {
  MetronomeControl,
  MetronomeOverlay,
  clampBpm,
  DEFAULT_BEATS_PER_BAR,
  DEFAULT_BPM,
} from "../../Metronome";
import {
  getCueTagInfo,
  parseCueEvents,
  stripCueMarkers,
} from "../../cues";
import { ShimmerControl } from "../../accents";
import {
  DrumMachineControl,
  DEFAULT_DRUM_SETTINGS,
  normalizeDrumSettings,
  type DrumSettings,
} from "../../DrumMachine";
import {
  StringPadsControl,
  useStringPads,
  DEFAULT_STRING_SETTINGS,
  normalizeStringSettings,
  type StringPadsSettings,
} from "../../StringPads";

// Per-song localStorage keys: leadSheet:${id}:fontScale, leadSheet:${id}:columnCount,
// leadSheet:${id}:columnWidthVw, leadSheet:${id}:beatsPerBar
// The metronome's BPM is not local — it lives on the song's tempo column.

const MIN_SCALE = 70;
const MAX_SCALE = 160;
const SCALE_STEP = 10;

const MIN_COLUMN_COUNT = 1;
const MAX_COLUMN_COUNT = 4;
const DEFAULT_COLUMN_COUNT = 2;

const MIN_COLUMN_WIDTH_VW = 15;
const MAX_COLUMN_WIDTH_VW = 50;
const COLUMN_WIDTH_VW_STEP = 5;
const DEFAULT_COLUMN_WIDTH_VW = 30;

function loadFontScale(id: string): number {
  if (typeof window === "undefined") return 100;
  try {
    const saved = localStorage.getItem(`leadSheet:${id}:fontScale`);
    const parsed = saved ? parseInt(saved) : NaN;
    if (!isNaN(parsed)) return Math.min(MAX_SCALE, Math.max(MIN_SCALE, parsed));
  } catch {}
  return 100;
}

function loadColumnCount(id: string): number {
  if (typeof window === "undefined") return DEFAULT_COLUMN_COUNT;
  try {
    const saved = localStorage.getItem(`leadSheet:${id}:columnCount`);
    const parsed = saved ? parseInt(saved) : NaN;
    if (!isNaN(parsed)) return Math.min(MAX_COLUMN_COUNT, Math.max(MIN_COLUMN_COUNT, parsed));
  } catch {}
  return DEFAULT_COLUMN_COUNT;
}

function loadColumnWidthVw(id: string): number {
  if (typeof window === "undefined") return DEFAULT_COLUMN_WIDTH_VW;
  try {
    const saved = localStorage.getItem(`leadSheet:${id}:columnWidthVw`);
    const parsed = saved ? parseInt(saved) : NaN;
    if (!isNaN(parsed)) return Math.min(MAX_COLUMN_WIDTH_VW, Math.max(MIN_COLUMN_WIDTH_VW, parsed));
  } catch {}
  return DEFAULT_COLUMN_WIDTH_VW;
}

function loadBeatsPerBar(id: string): number {
  if (typeof window === "undefined") return DEFAULT_BEATS_PER_BAR;
  try {
    const saved = localStorage.getItem(`leadSheet:${id}:beatsPerBar`);
    const parsed = saved ? parseInt(saved) : NaN;
    if (!isNaN(parsed) && parsed > 0) return parsed;
  } catch {}
  return DEFAULT_BEATS_PER_BAR;
}

function ColumnCountControl({ count, onChange }: { count: number; onChange: (next: number) => void }) {
  return (
    <div className='flex items-center gap-1 rounded-lg border border-gray-200 dark:border-neutral-700 px-1.5 py-1 print:hidden'>
      <span className='text-sm font-medium text-gray-700 dark:text-neutral-200 select-none'>Cols</span>
      <button
        type='button'
        onClick={() => onChange(count - 1)}
        disabled={count <= MIN_COLUMN_COUNT}
        className='h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200 font-medium transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-100 dark:disabled:hover:bg-neutral-800'
        aria-label='Decrease column count'
      >
        <Minus className='w-4 h-4' />
      </button>
      <span className='text-sm font-medium w-6 text-center text-gray-700 dark:text-neutral-200 select-none'>{count}</span>
      <button
        type='button'
        onClick={() => onChange(count + 1)}
        disabled={count >= MAX_COLUMN_COUNT}
        className='h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200 font-medium transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-100 dark:disabled:hover:bg-neutral-800'
        aria-label='Increase column count'
      >
        <Plus className='w-4 h-4' />
      </button>
    </div>
  );
}

function ColumnWidthControl({ width, onChange }: { width: number; onChange: (next: number) => void }) {
  return (
    <div className='flex items-center gap-1 rounded-lg border border-gray-200 dark:border-neutral-700 px-1.5 py-1 print:hidden'>
      <span className='text-sm font-medium text-gray-700 dark:text-neutral-200 select-none'>Width</span>
      <button
        type='button'
        onClick={() => onChange(width - COLUMN_WIDTH_VW_STEP)}
        disabled={width <= MIN_COLUMN_WIDTH_VW}
        className='h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200 font-medium transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-100 dark:disabled:hover:bg-neutral-800'
        aria-label='Decrease column width'
      >
        <Minus className='w-4 h-4' />
      </button>
      <span className='text-sm font-medium w-14 text-center text-gray-700 dark:text-neutral-200 select-none'>{width}vw</span>
      <button
        type='button'
        onClick={() => onChange(width + COLUMN_WIDTH_VW_STEP)}
        disabled={width >= MAX_COLUMN_WIDTH_VW}
        className='h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200 font-medium transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-100 dark:disabled:hover:bg-neutral-800'
        aria-label='Increase column width'
      >
        <Plus className='w-4 h-4' />
      </button>
    </div>
  );
}

function FontScaleControl({ scale, onChange }: { scale: number; onChange: (next: number) => void }) {
  return (
    <div className='flex items-center gap-1 rounded-lg border border-gray-200 dark:border-neutral-700 px-1.5 py-1 print:hidden'>
      <span className='text-sm font-medium text-gray-700 dark:text-neutral-200 select-none'>Size</span>
      <button
        type='button'
        onClick={() => onChange(scale - SCALE_STEP)}
        disabled={scale <= MIN_SCALE}
        className='h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200 font-medium transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-100 dark:disabled:hover:bg-neutral-800'
        aria-label='Decrease text size'
      >
        <Minus className='w-4 h-4' />
      </button>
      <span className='text-sm font-medium w-12 text-center text-gray-700 dark:text-neutral-200 select-none'>{scale}%</span>
      <button
        type='button'
        onClick={() => onChange(scale + SCALE_STEP)}
        disabled={scale >= MAX_SCALE}
        className='h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200 font-medium transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-100 dark:disabled:hover:bg-neutral-800'
        aria-label='Increase text size'
      >
        <Plus className='w-4 h-4' />
      </button>
    </div>
  );
}

function TransposeControl({ steps, onChange }: { steps: number; onChange: (next: number) => void }) {
  const offsetLabel = steps > 0 ? `+${steps}` : steps < 0 ? `${steps}` : "±0";
  return (
    <div className='flex items-center gap-1 rounded-lg border border-gray-200 dark:border-neutral-700 px-1.5 py-1 print:hidden'>
      <button
        type='button'
        onClick={() => onChange(steps - 1)}
        title='Transpose down one semitone'
        aria-label='Transpose down one semitone'
        className='h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200 font-medium transition-colors duration-150'
      >
        <ArrowDown className='w-4 h-4' />
      </button>
      <span className='text-sm font-medium px-1 text-center text-gray-700 dark:text-neutral-200 select-none whitespace-nowrap'>
        Transpose {offsetLabel}
      </span>
      <button
        type='button'
        onClick={() => onChange(steps + 1)}
        title='Transpose up one semitone'
        aria-label='Transpose up one semitone'
        className='h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200 font-medium transition-colors duration-150'
      >
        <ArrowUp className='w-4 h-4' />
      </button>
    </div>
  );
}

function PlayControl({
  hasTiming,
  videoLink,
  withVideo,
  onWithVideoToggle,
  open,
  onOpen,
  onClose,
}: {
  hasTiming: boolean;
  /** A YouTube link found in the song, or null. */
  videoLink: YouTubeLink | null;
  /** Whether the YouTube video is included in playback (only relevant when videoLink != null). */
  withVideo: boolean;
  onWithVideoToggle: () => void;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const playBtnClass = `h-10 flex items-center gap-1.5 px-3 text-sm font-medium transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed ${
    videoLink ? "rounded-l-lg" : "rounded-lg"
  } ${
    open
      ? "bg-yellow-400 text-black hover:bg-yellow-300"
      : "bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200"
  }`;

  return (
    <div className='flex items-center print:hidden'>
      <button
        type='button'
        onClick={open ? onClose : onOpen}
        disabled={!hasTiming}
        title={
          !hasTiming
            ? "Add @0:12 style timings to lines in the editor to enable playback"
            : "Follow along in time with the song"
        }
        className={playBtnClass}
      >
        <Play className='w-4 h-4' />
        {open ? "Playing" : "Play"}
      </button>
      {videoLink && (
        <button
          type='button'
          onClick={onWithVideoToggle}
          title={withVideo ? "YouTube video enabled — click to play without it" : "Click to play with the linked YouTube video"}
          className={`h-10 flex items-center px-2 rounded-r-lg border-l text-sm transition-colors duration-150 ${
            open
              ? withVideo
                ? "bg-yellow-300 text-black border-yellow-500/60 hover:bg-yellow-200"
                : "bg-yellow-400 text-black/40 border-yellow-500/40 hover:bg-yellow-300"
              : withVideo
                ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border-gray-200 dark:border-neutral-600 hover:bg-blue-200 dark:hover:bg-blue-900/60"
                : "bg-gray-100 dark:bg-neutral-800 text-gray-400 dark:text-neutral-500 border-gray-200 dark:border-neutral-700 hover:bg-gray-200 dark:hover:bg-neutral-700"
          }`}
        >
          <Youtube className='w-4 h-4' />
        </button>
      )}
    </div>
  );
}

/**
 * The switch between reading the song and fixing it. Edit mode stays on the
 * preview — same page, same layout, lines just become tap targets.
 */
function LineEditControl({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type='button'
      onClick={onToggle}
      aria-pressed={active}
      title={active ? "Stop editing lines" : "Tap a line to edit just that line"}
      className={`h-9 flex items-center gap-1.5 px-2.5 rounded-lg text-sm font-medium transition-colors duration-150 print:hidden ${
        active
          ? "bg-yellow-400 text-black hover:bg-yellow-300"
          : "bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200"
      }`}
    >
      <PencilLine className='w-4 h-4' />
      <span className='hidden sm:inline'>{active ? "Editing" : "Edit Lines"}</span>
    </button>
  );
}

function EditModeBanner({
  onDone,
  error = null,
  className = "",
}: {
  onDone: () => void;
  /** Takes the banner over when a drag couldn't be saved. */
  error?: string | null;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 border-t py-1.5 print:hidden ${
        error
          ? "border-red-300/60 bg-red-50 dark:border-red-400/20 dark:bg-red-500/10"
          : "border-yellow-300/60 bg-yellow-50 dark:border-yellow-400/20 dark:bg-yellow-400/10"
      } ${className}`}
    >
      <span
        className={`text-xs font-medium ${
          error ? "text-red-700 dark:text-red-400" : "text-yellow-800 dark:text-yellow-300"
        }`}
      >
        {error ?? "Tap a line to edit it, or drag its grip to move it."}
      </span>
      <button
        type='button'
        onClick={onDone}
        className='h-7 shrink-0 rounded-lg bg-yellow-400 px-2.5 text-xs font-semibold text-black hover:bg-yellow-300 transition-colors duration-150'
      >
        Done
      </button>
    </div>
  );
}

function NextSongControl({
  setIds,
  pos,
  onNext,
}: {
  setIds: string[];
  pos: number;
  onNext: (nextId: string, nextPos: number) => void;
}) {
  const isLast = pos >= setIds.length - 1;
  return (
    <button
      type='button'
      onClick={() => !isLast && onNext(setIds[pos + 1], pos + 1)}
      disabled={isLast}
      className='h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200 transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-100 dark:disabled:hover:bg-neutral-800 print:hidden'
    >
      {isLast ? "End of Set" : "Next"}
      {!isLast && <ArrowRight className='w-4 h-4' />}
    </button>
  );
}

const SheetContent = memo(function SheetContent({
  sheet,
  fullscreen,
  columnCount,
  columnWidthVw,
  transposeSteps = 0,
  timeline,
  activeCueIndex = null,
  onSeekToLine,
  onEditLine,
  onInsertLine,
  onMoveLine,
  bpm,
}: {
  sheet: LeadSheet;
  fullscreen: boolean;
  columnCount?: number;
  columnWidthVw?: number;
  transposeSteps?: number;
  /** Present only while playback is open — otherwise the sheet renders untouched. */
  timeline?: Timeline;
  activeCueIndex?: number | null;
  onSeekToLine?: (sectionIndex: number, lineIndex: number) => void;
  /** Present only in edit mode — it turns every line into a tap target. */
  onEditLine?: (sectionIndex: number, lineIndex: number) => void;
  /** Opens a blank line at an index that doesn't exist yet — the end of a section. */
  onInsertLine?: (sectionIndex: number, lineIndex: number) => void;
  /** Present in edit mode — gives every line a grip and accepts the drop. */
  onMoveLine?: (from: LinePos, to: LinePos) => void;
  /** Tempo the song's beat markers are read at — the live one, not the saved one. */
  bpm?: number;
}) {
  const beatTempo = bpm ?? sheet.tempo ?? DEFAULT_BPM;
  const columnsActive = !!(columnCount || columnWidthVw);
  return (
    <div>
      <div className={`mb-8 border-b-2 border-black dark:border-neutral-600 pb-6 ${columnsActive ? "max-w-3xl mx-auto" : ""}`}>
        <h1
          className={`font-bold leading-tight mb-3 text-black dark:text-neutral-100 ${fullscreen ? "text-[3em]" : "text-[2.25em]"}`}
        >
          {sheet.title || "Untitled"}
        </h1>
        <div className='flex flex-wrap gap-6 text-[0.875em]'>
          {sheet.key && (
            <span>
              <span className='uppercase tracking-wider text-[0.75em] text-black/50 dark:text-white/40 mr-1'>Key</span>
              <span className='font-bold text-black dark:text-neutral-100 text-[1em]'>{sheet.key}</span>
            </span>
          )}
          {sheet.tempo && (
            <span>
              <span className='uppercase tracking-wider text-[0.75em] text-black/50 dark:text-white/40 mr-1'>Tempo</span>
              <span className='font-bold text-black dark:text-neutral-100 text-[1em]'>{sheet.tempo} BPM</span>
            </span>
          )}
        </div>
        {sheet.general_notes && (
          <p className={`mt-3 italic text-black/60 dark:text-white/50 ${fullscreen ? "text-[1em]" : "text-[0.875em]"}`}>
            {sheet.general_notes}
          </p>
        )}
      </div>

      <div
        className={`space-y-10 ${columnsActive ? "leadsheet-columns" : ""}`}
        style={
          columnsActive
            ? ({
                "--leadsheet-col-count": columnCount,
                "--leadsheet-col-width": columnWidthVw ? `${columnWidthVw}vw` : undefined,
                width:
                  columnWidthVw && columnCount
                    ? `calc(${columnCount} * ${columnWidthVw}vw + ${(columnCount - 1) * 2}rem)`
                    : undefined,
                maxWidth: "100%",
                marginLeft: "auto",
                marginRight: "auto",
              } as React.CSSProperties)
            : undefined
        }
      >
        {sheet.sections.map((section: Section, sectionIndex: number) => {
          const lines = (section.content ?? "").split("\n");
          return (
            <div key={section.id} style={{ breakInside: "avoid" }}>
              <div className='mb-4'>
                <span
                  className='text-[0.75em] font-bold uppercase tracking-widest px-2 py-1 rounded'
                  style={{ background: "#facc15", color: "#000" }}
                >
                  {section.label || section.type}
                </span>
              </div>
              {/* No overflow-x here: long lines wrap rather than scroll sideways,
                  so nothing renders a horizontal scrollbar on screen or in print. */}
              <div className='space-y-3'>
                <SortableLines enabled={!!onMoveLine} sectionIndex={sectionIndex} count={lines.length}>
                {lines.map((line, i) => {
                  // The grip and the row travel together; without reordering the
                  // row is returned exactly as it always was.
                  const dragId = lineDragId(sectionIndex, i);
                  const withGrip = (row: React.ReactNode) =>
                    onMoveLine ? (
                      <SortableLine key={dragId} id={dragId}>
                        {row}
                      </SortableLine>
                    ) : (
                      row
                    );
                  if (line.trim() === "") {
                    // Editing makes the gaps tappable too — a blank line is
                    // where the next lyric goes.
                    return withGrip(
                      onEditLine ? (
                        <button
                          key={i}
                          type='button'
                          onClick={() => onEditLine(sectionIndex, i)}
                          aria-label={`Edit blank line ${i + 1}`}
                          className='block w-full h-8 rounded border border-dashed border-black/10 dark:border-white/15 hover:border-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-400/10 transition-colors duration-150'
                        />
                      ) : (
                        <div key={i} className='h-3' />
                      )
                    );
                  }
                  const cueInfo  = getCueTagInfo(line);
                  const displayLine = cueInfo ? stripCueMarkers(line) : line;
                  const cueIndex = timeline?.lineCue.get(lineKey(sectionIndex, i));
                  const active = cueIndex !== undefined && cueIndex === activeCueIndex;
                  // Editing wins over seeking: a tap in edit mode is meant for
                  // the keyboard, not the transport.
                  const seekable = !onEditLine && cueIndex !== undefined && !!onSeekToLine;
                  return withGrip(
                    <div
                      key={i}
                      data-active-cue={active || undefined}
                      role={onEditLine || seekable ? "button" : undefined}
                      tabIndex={onEditLine ? 0 : undefined}
                      onClick={
                        onEditLine
                          ? () => onEditLine(sectionIndex, i)
                          : seekable
                            ? () => onSeekToLine!(sectionIndex, i)
                            : undefined
                      }
                      onKeyDown={
                        onEditLine
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onEditLine(sectionIndex, i);
                              }
                            }
                          : undefined
                      }
                      className={`rounded px-2 transition-colors duration-150 ${
                        active
                          ? "bg-yellow-200/70 shadow-[inset_3px_0_0_0_#facc15] dark:bg-yellow-400/20"
                          : ""
                      } ${
                        onEditLine
                          ? "cursor-pointer py-1.5 border border-dashed border-black/10 dark:border-white/15 hover:border-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-400/10 active:bg-yellow-100 dark:active:bg-yellow-400/20"
                          : seekable
                            ? "cursor-pointer print:cursor-auto"
                            : ""
                      }`}
                    >
                      {cueInfo && (
                        <span
                          className={`inline-flex items-center gap-1 text-[0.65em] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded mr-2 print:hidden ${
                            !cueInfo.isStop
                              ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400"
                              : "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400"
                          }`}
                        >
                          🥁 {cueInfo.label}
                        </span>
                      )}
                      <ChordLyricLine
                        line={transposeSteps !== 0 ? transposeText(displayLine, transposeSteps) : displayLine}
                        large={fullscreen}
                        showTime={!!timeline}
                        bpm={beatTempo}
                      />
                    </div>
                  );
                })}
                </SortableLines>
                {onInsertLine && (
                  <button
                    type='button'
                    onClick={() => onInsertLine(sectionIndex, lines.length)}
                    className='flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-black/15 py-2 text-[0.8em] font-medium text-black/40 transition-colors duration-150 hover:border-yellow-400 hover:bg-yellow-50 hover:text-black/70 dark:border-white/20 dark:text-white/40 dark:hover:bg-yellow-400/10 dark:hover:text-white/70'
                  >
                    <Plus className='w-3.5 h-3.5' />
                    Add line
                  </button>
                )}
              </div>
              {section.notes && (
                <p className={`mt-3 italic text-black/50 dark:text-white/40 ${fullscreen ? "text-[1em]" : "text-[0.875em]"}`}>
                  ↳ {section.notes}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default function PreviewLeadSheet({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [sheet, setSheet] = useState<LeadSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fontScale, setFontScale] = useState(() => loadFontScale(id));
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [columnCount, setColumnCount] = useState(() => loadColumnCount(id));
  const [columnWidthVw, setColumnWidthVw] = useState(() => loadColumnWidthVw(id));
  const [transposeSteps, setTransposeSteps] = useState(0);
  // Edit mode is a layer over the preview, not a different page: the song keeps
  // its size, columns and key, and every line becomes something you can tap.
  const [editMode, setEditMode] = useState(false);
  const [editTarget, setEditTarget] = useState<LineTarget | null>(null);
  const [lineSaving, setLineSaving] = useState(false);
  const [lineError, setLineError] = useState<string | null>(null);
  // A failed drag has no sheet open to report into, so it borrows the banner.
  const [moveError, setMoveError] = useState<string | null>(null);
  const moveErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashMoveError = (message: string) => {
    setMoveError(message);
    if (moveErrorTimer.current) clearTimeout(moveErrorTimer.current);
    moveErrorTimer.current = setTimeout(() => setMoveError(null), 5000);
  };
  const [setIds, setSetIds] = useState<string[] | null>(null);
  const [setPos, setSetPos] = useState(0);
  const [playbackOpen, setPlaybackOpen] = useState(false);
  const [toolbarOpen,      setToolbarOpen     ] = useState(true);
  const [follow, setFollow] = useState(true);
  const [autoPlay, setAutoPlay] = useState(false);
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const [beatsPerBar, setBeatsPerBar] = useState(() => loadBeatsPerBar(id));
  const [metronomeOn, setMetronomeOn] = useState(false);
  // Open-ended layer state: any cue tag layer name lives here.
  // Currently wired: "drum", "claps", "shimmer", "drone". Future layers are
  // tracked automatically and just need synthesis code to act on them.
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set());
  const drumRunning    = activeLayers.has("drum");
  const clapsRunning   = activeLayers.has("claps");
  const shimmerRunning = activeLayers.has("shimmer");
  const droneRunning   = activeLayers.has("drone");
  const toggleLayer = (name: string) =>
    setActiveLayers((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  const [drumSettings, setDrumSettings] = useState<DrumSettings>(DEFAULT_DRUM_SETTINGS);
  const [stringSettings, setStringSettings] = useState<StringPadsSettings>(DEFAULT_STRING_SETTINGS);
  const stringsRunning = activeLayers.has("strings");
  const [withVideo, setWithVideo] = useState(true);
  const [localVolume, _setLocalVolume] = useState<number | null>(null);
  const localVolumeRef = useRef<number | null>(null);
  const setLocalVolume = (v: number | null) => { localVolumeRef.current = v; _setLocalVolume(v); };
  const bpmSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drumSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stringSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCueEventIdxRef = useRef<number>(-2); // -2 = uninitialized

  // Printing to PDF should offer the song's name, not "Preview Lead Sheet".
  useSongDocumentTitle(sheet?.title);

  // ─── Timed playback ─────────────────────────────────────────────────────────

  const timeline = useMemo(() => buildTimeline(sheet?.sections ?? [], bpm), [sheet, bpm]);
  const hasTiming = timeline.cues.length > 0;

  // What the string pads play: the song's own chords, in the key on screen.
  const progression = useMemo(
    () => progressionFrom(sheet?.sections ?? [], transposeSteps),
    [sheet, transposeSteps]
  );
  const soundingKey = useMemo(
    () => (sheet?.key ? transposeKey(sheet.key, transposeSteps) : null),
    [sheet?.key, transposeSteps]
  );

  // A [drone] cue holds the key under the section it covers. It is the same pad
  // the Strings control plays, but driven by the sheet rather than by hand, so
  // an arrangement laid out on the tracks sounds the same here as it did there.
  useStringPads(soundingKey, droneRunning, { ...stringSettings, mode: "drone" });

  // A YouTube link in the song promotes the recording to the transport's clock.
  // The stopwatch stays wired up underneath as the fallback for a video that
  // won't embed.
  const videoLink = useMemo(() => findYouTubeLink(sheet), [sheet]);
  const stopwatch = usePlayback(timeline.duration);
  const video = useYouTubePlayback(playbackOpen && withVideo ? videoLink : null, timeline.duration);
  const videoDrivesPlayback = !!videoLink && withVideo && video.status !== "error";
  const playback = videoDrivesPlayback ? video.playback : stopwatch;
  const { seek, toggle, stop, time } = playback;
  const activeCue = playbackOpen ? cueAt(timeline, time) : null;
  const activeCueIndex = activeCue?.index ?? null;
  usePlaybackKeys(playback, playbackOpen);

  // ── Cue timeline automation ────────────────────────────────────────────────
  const cueEvents = useMemo(
    () => (sheet ? parseCueEvents(sheet.sections, bpm) : []),
    [sheet, bpm]
  );

  // When playback closes, reset the tracker (leave drum state for manual control).
  useEffect(() => {
    if (!playbackOpen) {
      lastCueEventIdxRef.current = -2;
      if (fadeTimerRef.current) { clearInterval(fadeTimerRef.current); fadeTimerRef.current = null; }
      setLocalVolume(null);
      setActiveLayers(new Set());
    }
  }, [playbackOpen]);

  // Watch the playback clock and fire cue events at their marked times.
  useEffect(() => {
    if (!playbackOpen || cueEvents.length === 0) return;

    let idx = -1;
    for (let i = 0; i < cueEvents.length; i++) {
      if (cueEvents[i].time <= time) idx = i;
      else break;
    }

    if (idx !== lastCueEventIdxRef.current) {
      lastCueEventIdxRef.current = idx;

      if (idx < 0) {
        // Seeked before first event — reset everything
        setActiveLayers(new Set());
        if (fadeTimerRef.current) { clearInterval(fadeTimerRef.current); fadeTimerRef.current = null; }
        setLocalVolume(null);
        return;
      }

      const ev = cueEvents[idx];
      if (fadeTimerRef.current) { clearInterval(fadeTimerRef.current); fadeTimerRef.current = null; }

      // ── Stops ────────────────────────────────────────────────────────────
      if (ev.stops.length > 0) {
        const stopAll = ev.stops.includes("all");
        const stoppingDrum = stopAll || ev.stops.includes("drum");

        // Remove stopped layers from the set (except "drum" on fade-out — handled below)
        setActiveLayers((prev) => {
          const next = new Set(prev);
          if (stopAll) { next.clear(); }
          else { ev.stops.forEach((l) => { if (l !== "drum" || !ev.fadeOut) next.delete(l); }); }
          return next;
        });

        if (stoppingDrum) {
          if (ev.fadeOut) {
            const startVol = localVolumeRef.current ?? drumSettings.volume;
            let elapsed = 0;
            const FADE_MS = 4000, STEP_MS = 50;
            setLocalVolume(startVol);
            fadeTimerRef.current = setInterval(() => {
              elapsed += STEP_MS;
              const frac = Math.min(elapsed / FADE_MS, 1);
              setLocalVolume(startVol * (1 - frac));
              if (frac >= 1) {
                clearInterval(fadeTimerRef.current!); fadeTimerRef.current = null;
                setActiveLayers((prev) => { const next = new Set(prev); next.delete("drum"); return next; });
                setLocalVolume(null);
              }
            }, STEP_MS);
          } else {
            setLocalVolume(null);
          }
        }
      }

      // ── Starts ───────────────────────────────────────────────────────────
      if (ev.starts.length > 0) {
        const startingDrum = ev.starts.includes("drum");

        // Add non-drum layers immediately; drum handled below for fade support
        setActiveLayers((prev) => {
          const next = new Set(prev);
          ev.starts.forEach((l) => { if (l !== "drum" || !ev.fadeIn) next.add(l); });
          return next;
        });

        if (startingDrum) {
          if (ev.fadeIn) {
            const targetVol = drumSettings.volume;
            setLocalVolume(0);
            setActiveLayers((prev) => new Set([...prev, "drum"]));
            let elapsed = 0;
            const FADE_MS = 4000, STEP_MS = 50;
            fadeTimerRef.current = setInterval(() => {
              elapsed += STEP_MS;
              const frac = Math.min(elapsed / FADE_MS, 1);
              setLocalVolume(targetVol * frac);
              if (frac >= 1) {
                clearInterval(fadeTimerRef.current!); fadeTimerRef.current = null;
                setLocalVolume(null);
              }
            }, STEP_MS);
          }
          // non-fade drum already added above
        }
      }
    }
  }, [time, playbackOpen, cueEvents, drumSettings.volume]);

  const seekToLine = useCallback(
    (sectionIndex: number, lineIndex: number) => {
      const cueIndex = timeline.lineCue.get(lineKey(sectionIndex, lineIndex));
      if (cueIndex === undefined) return;
      seek(timeline.cues[cueIndex].start);
    },
    [timeline, seek]
  );

  // A tapped line opens as it is *stored* — brackets, cue tags and @0:12
  // markers included — so what comes back can go straight back into the song.
  const openLineEditor = useCallback(
    (sectionIndex: number, lineIndex: number) => {
      if (!sheet) return;
      const section = sheet.sections[sectionIndex];
      if (!section) return;
      setLineError(null);
      setEditTarget({
        sectionIndex,
        lineIndex,
        sectionLabel: section.label || section.type,
        text: (section.content ?? "").split("\n")[lineIndex] ?? "",
      });
    },
    [sheet]
  );

  // A line that doesn't exist yet: the end of a section, or the gap under the
  // line just saved. Nothing is written until it's saved, so backing out of one
  // leaves the song exactly as it was.
  const openLineInsert = useCallback(
    (sectionIndex: number, lineIndex: number) => {
      if (!sheet) return;
      const section = sheet.sections[sectionIndex];
      if (!section) return;
      setLineError(null);
      setEditTarget({
        sectionIndex,
        lineIndex,
        sectionLabel: section.label || section.type,
        text: "",
        insert: true,
      });
    },
    [sheet]
  );

  /**
   * Write a new set of sections to the song. Returns false when the update
   * touched no row, which is RLS turning down an edit to someone else's song.
   */
  const commitSections = async (sections: Section[]): Promise<boolean> => {
    if (!sheet) return false;
    const updatedAt = new Date().toISOString();
    const next: LeadSheet = { ...sheet, sections, updated_at: updatedAt };
    const sb = createClient()!;
    const { data, error } = await sb
      .from("lead_sheets")
      .update({ sections, updated_at: updatedAt })
      .eq("id", id)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) return false;
    setSheet(next);
    await cacheSheet(next);
    // A line fixed on stage belongs in History like one typed in the editor.
    // It rides along after the save, so a failed snapshot never costs the edit.
    snapshotRevision(sb, id, serializeSheet(next)).catch(() => {});
    return true;
  };

  /** Every line of the song, section by section, ready to be spliced. */
  const linesOf = (sections: Section[]) => sections.map((s) => (s.content ?? "").split("\n"));

  // Dropped somewhere new: pull the line out of where it was and put it back in
  // at the other end. Within a section that's a reorder; across two it's a move,
  // and the drop side decided whether it lands above or below the line it hit.
  const moveLine = async (from: LinePos, to: LinePos) => {
    if (!sheet) return;
    const lines = linesOf(sheet.sections);
    const source = lines[from.sectionIndex];
    const target = lines[to.sectionIndex];
    if (!source || !target) return;
    const [text] = source.splice(from.lineIndex, 1);
    if (text === undefined) return;
    const at = Math.max(0, Math.min(target.length, to.lineIndex));
    target.splice(at, 0, text);
    const sections = sheet.sections.map((section, i) => ({ ...section, content: lines[i].join("\n") }));
    try {
      const ok = await commitSections(sections);
      if (!ok) flashMoveError("This song belongs to someone else, so it can't be edited here.");
    } catch {
      flashMoveError("Couldn't move that line — check your connection and try again.");
    }
  };

  const saveLine = async (text: string, andAnother = false) => {
    if (!sheet || !editTarget) return;
    const { sectionIndex, lineIndex, insert } = editTarget;
    if (!insert && text === editTarget.text) {
      if (andAnother) openLineInsert(sectionIndex, lineIndex + 1);
      else setEditTarget(null);
      return;
    }
    setLineSaving(true);
    setLineError(null);
    const sections = sheet.sections.map((section, i) => {
      if (i !== sectionIndex) return section;
      const lines = (section.content ?? "").split("\n");
      if (insert) lines.splice(lineIndex, 0, text);
      else lines[lineIndex] = text;
      return { ...section, content: lines.join("\n") };
    });
    try {
      if (!(await commitSections(sections))) {
        setLineError("This song belongs to someone else, so it can't be edited here.");
        return;
      }
      // Carrying on down the section: the next line opens where this one left
      // off, so a verse is typed in one go.
      if (andAnother) openLineInsert(sectionIndex, lineIndex + 1);
      else setEditTarget(null);
    } catch {
      setLineError("Couldn't save that line — check your connection and try again.");
    } finally {
      setLineSaving(false);
    }
  };

  /** The text of a line being dragged, for the card that follows the finger. */
  const lineTextAt = useCallback(
    ({ sectionIndex, lineIndex }: LinePos) =>
      (sheet?.sections[sectionIndex]?.content ?? "").split("\n")[lineIndex] ?? "",
    [sheet]
  );

  const openPlayback = () => {
    if (!hasTiming) return;
    setPlaybackOpen(true);
    seek(0);
  };

  const closePlayback = () => {
    stop();
    setPlaybackOpen(false);
  };

  // Arriving from the editor's Play button: open the transport once the sheet
  // (and therefore the timeline) is loaded, then start rolling as soon as the
  // clock is live — with a video, that's once the player has loaded.
  useEffect(() => {
    if (!autoPlay || !hasTiming) return;
    if (!playbackOpen) {
      setPlaybackOpen(true);
      seek(0);
      return;
    }
    if (!playback.ready) return;
    setAutoPlay(false);
    toggle();
  }, [autoPlay, hasTiming, playbackOpen, playback.ready, seek, toggle]);

  // Keep the current line on screen. Scrolling only on cue changes means the
  // page stays still while a line is being sung.
  useEffect(() => {
    if (!playbackOpen || !follow || activeCueIndex === null) return;
    const el = document.querySelector("[data-active-cue]");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeCueIndex, playbackOpen, follow]);

  useEffect(() => {
    if (user) loadSheet();
  }, [user, id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const set = params.get("set");
    const pos = params.get("pos");
    setSetIds(set ? set.split(",").filter(Boolean) : null);
    setSetPos(pos ? parseInt(pos) || 0 : 0);
    setAutoPlay(params.get("play") === "1");
  }, [id]);

  const goToNextSong = (nextId: string, nextPos: number) => {
    if (!setIds) return;
    router.push(`/lead-sheet-editor/${nextId}/preview?set=${setIds.join(",")}&pos=${nextPos}`);
  };

  const handleCopy = async () => {
    if (!sheet) return;
    await navigator.clipboard.writeText(getPlainText(sheet));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/lead-sheet-editor/share/${id}`);
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  };

  const updateFontScale = (next: number) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    setFontScale(clamped);
    try {
      localStorage.setItem(`leadSheet:${id}:fontScale`, String(clamped));
    } catch {}
  };

  const updateColumnCount = (next: number) => {
    const clamped = Math.min(MAX_COLUMN_COUNT, Math.max(MIN_COLUMN_COUNT, next));
    setColumnCount(clamped);
    try {
      localStorage.setItem(`leadSheet:${id}:columnCount`, String(clamped));
    } catch {}
  };

  // The metronome tempo is the song's tempo, so changing it here writes back to
  // the sheet — debounced, since it moves a beat at a time on the +/- buttons.
  const updateBpm = (next: number) => {
    const clamped = clampBpm(next);
    setBpm(clamped);
    setSheet((prev) => (prev ? { ...prev, tempo: clamped } : prev));
    if (bpmSaveTimer.current) clearTimeout(bpmSaveTimer.current);
    bpmSaveTimer.current = setTimeout(async () => {
      try {
        await createClient()!
          .from("lead_sheets")
          .update({ tempo: clamped, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (sheet) await cacheSheet({ ...sheet, tempo: clamped });
      } catch {
        // Offline or not the owner — the metronome still runs at the new tempo.
      }
    }, 800);
  };

  useEffect(() => () => { if (bpmSaveTimer.current) clearTimeout(bpmSaveTimer.current); }, []);
  useEffect(() => () => { if (moveErrorTimer.current) clearTimeout(moveErrorTimer.current); }, []);

  // The drum machine's pattern and voicing are part of how the song is played,
  // so they ride along on the sheet's metadata instead of living on this device.
  // Debounced like the tempo — the volume slider fires on every drag.
  const updateDrumSettings = (patch: Partial<DrumSettings>) => {
    const next = { ...drumSettings, ...patch };
    setDrumSettings(next);
    setSheet((prev) => (prev ? { ...prev, metadata: { ...prev.metadata, drums: next } } : prev));
    if (drumSaveTimer.current) clearTimeout(drumSaveTimer.current);
    drumSaveTimer.current = setTimeout(async () => {
      const metadata = { ...sheet?.metadata, drums: next };
      try {
        await createClient()!
          .from("lead_sheets")
          .update({ metadata, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (sheet) await cacheSheet({ ...sheet, metadata });
      } catch {
        // Offline or not the owner — the kit still plays with the new settings.
      }
    }, 800);
  };

  useEffect(() => () => { if (drumSaveTimer.current) clearTimeout(drumSaveTimer.current); }, []);

  const updateStringSettings = (patch: Partial<StringPadsSettings>) => {
    const next = { ...stringSettings, ...patch };
    setStringSettings(next);
    setSheet((prev) => (prev ? { ...prev, metadata: { ...prev.metadata, strings: next } } : prev));
    if (stringSaveTimer.current) clearTimeout(stringSaveTimer.current);
    stringSaveTimer.current = setTimeout(async () => {
      const metadata = { ...sheet?.metadata, strings: next };
      try {
        await createClient()!
          .from("lead_sheets")
          .update({ metadata, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (sheet) await cacheSheet({ ...sheet, metadata });
      } catch {}
    }, 800);
  };

  useEffect(() => () => { if (stringSaveTimer.current) clearTimeout(stringSaveTimer.current); }, []);

  // When a fade is in progress, override the volume without touching persisted settings
  const effectiveDrumSettings = localVolume !== null
    ? { ...drumSettings, volume: localVolume }
    : drumSettings;

  const updateBeatsPerBar = (next: number) => {
    setBeatsPerBar(next);
    try {
      localStorage.setItem(`leadSheet:${id}:beatsPerBar`, String(next));
    } catch {}
  };

  const updateColumnWidthVw = (next: number) => {
    const clamped = Math.min(MAX_COLUMN_WIDTH_VW, Math.max(MIN_COLUMN_WIDTH_VW, next));
    setColumnWidthVw(clamped);
    try {
      localStorage.setItem(`leadSheet:${id}:columnWidthVw`, String(clamped));
    } catch {}
  };

  async function loadSheet() {
    setLoading(true);
    try {
      const { data, error } = await createClient()!.from("lead_sheets").select("*").eq("id", id).single();
      if (error) throw error;
      if (data) {
        setSheet({ ...data, sections: data.sections.map(migrateSection) });
        setBpm(data.tempo ? clampBpm(data.tempo) : DEFAULT_BPM);
        setDrumSettings(normalizeDrumSettings(data.metadata?.drums));
        setStringSettings(normalizeStringSettings(data.metadata?.strings));
        setOffline(false);
        await cacheSheet(data);
      }
    } catch {
      const cached = await getCachedSheet(id);
      if (cached) {
        setSheet({ ...cached, sections: cached.sections.map(migrateSection) });
        setBpm(cached.tempo ? clampBpm(cached.tempo) : DEFAULT_BPM);
        setDrumSettings(normalizeDrumSettings(cached.metadata?.drums));
        setStringSettings(normalizeStringSettings(cached.metadata?.strings));
        setOffline(true);
      }
    }
    setLoading(false);
  }

  if (authLoading || loading) {
    return (
      <div className='flex flex-col flex-1 min-h-0 bg-white dark:bg-black'>
        <div className='flex flex-col flex-1 min-h-0 p-2 sm:p-4'>
          <div className='flex flex-col flex-1 min-h-0 rounded-none border-none overflow-hidden'>
            <div className='flex-1 flex items-center justify-center text-black/50 dark:text-white/40'>Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!user || !sheet) {
    return (
      <div className='flex flex-col flex-1 min-h-0 bg-white dark:bg-black'>
        <div className='flex flex-col flex-1 min-h-0 p-2 sm:p-4'>
          <div className='flex flex-col flex-1 min-h-0 rounded-none border-none overflow-hidden'>
            <div className='flex-1 flex items-center justify-center text-black/50 dark:text-white/40'>Sheet not found.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Print-only view: chrome-free layout that only renders when printing.
          The screen view below is hidden via print:hidden so only this prints. */}
      <div className='hidden print:block' style={{ background: "#fff", color: "#000" }}>
        <div className='leadsheet-force-light max-w-3xl mx-auto px-2 py-4' style={{ fontSize: `${fontScale}%` }}>
          <SheetContent sheet={sheet} fullscreen={false} transposeSteps={transposeSteps} />
        </div>
      </div>

      {/* Screen view */}
      <div className='print:hidden flex flex-col flex-1 min-h-0'>
        {fullscreen ? (
          <div className='fixed inset-0 z-50 bg-white dark:bg-black overflow-y-auto overflow-x-hidden'>
            <div className='w-full'>
              {/* Toolbar (kept constrained while content below goes full-width) */}
              <div className='sticky top-0 z-10 bg-white dark:bg-black border-b border-gray-200 dark:border-neutral-800 print:hidden'>
                <div className='max-w-3xl mx-auto px-4'>
                  {/* Always-visible header strip */}
                  <div className='flex items-center justify-between gap-2 py-2'>
                    <div className='flex items-center gap-2 min-w-0'>
                      <button
                        onClick={() => setFullscreen(false)}
                        className='h-9 flex items-center gap-1.5 px-2.5 rounded-lg bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200 transition-colors duration-150 text-sm font-medium shrink-0'
                      >
                        <ArrowLeft className='w-4 h-4' />
                        Exit
                      </button>
                      {offline && <OfflineBadge />}
                      <span className='text-sm font-semibold text-gray-800 dark:text-neutral-100 truncate'>
                        {sheet.title}
                      </span>
                    </div>
                    <div className='flex items-center gap-1.5 shrink-0'>
                      <PlayControl hasTiming={hasTiming} videoLink={videoLink} withVideo={withVideo} onWithVideoToggle={() => setWithVideo((v) => !v)} open={playbackOpen} onOpen={openPlayback} onClose={closePlayback} />
                      <LineEditControl active={editMode} onToggle={() => setEditMode((on) => !on)} />
                      {setIds && <NextSongControl setIds={setIds} pos={setPos} onNext={goToNextSong} />}
                      <button
                        onClick={() => setToolbarOpen((o) => !o)}
                        title={toolbarOpen ? "Hide controls" : "Show controls"}
                        className='h-9 w-9 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-500 dark:text-neutral-400 transition-colors duration-150'
                      >
                        {toolbarOpen ? <ChevronUp className='w-4 h-4' /> : <ChevronDown className='w-4 h-4' />}
                      </button>
                    </div>
                  </div>

                  {/* Collapsible controls panel */}
                  <div
                    className='overflow-hidden transition-all duration-300 ease-in-out'
                    style={{ maxHeight: toolbarOpen ? "500px" : "0px", opacity: toolbarOpen ? 1 : 0 }}
                  >
                    <div className='pb-3 pt-1'>
                      {/* Row 1: Display */}
                      <div className='flex flex-wrap items-center gap-2 mb-2'>
                        <span className='text-xs font-medium text-gray-400 dark:text-neutral-500 uppercase tracking-wide w-12 shrink-0'>Display</span>
                        <FontScaleControl scale={fontScale} onChange={updateFontScale} />
                        <ColumnCountControl count={columnCount} onChange={updateColumnCount} />
                        <ColumnWidthControl width={columnWidthVw} onChange={updateColumnWidthVw} />
                        <TransposeControl steps={transposeSteps} onChange={setTransposeSteps} />
                      </div>
                      {/* Row 2: Audio */}
                      <div className='flex flex-wrap items-center gap-2 mb-2'>
                        <span className='text-xs font-medium text-gray-400 dark:text-neutral-500 uppercase tracking-wide w-12 shrink-0'>Audio</span>
                        <MetronomeControl
                          bpm={bpm}
                          onBpmChange={updateBpm}
                          beatsPerBar={beatsPerBar}
                          onBeatsPerBarChange={updateBeatsPerBar}
                          running={metronomeOn}
                          onToggle={() => setMetronomeOn((on) => !on)}
                        />
                        <DrumMachineControl
                          bpm={bpm}
                          running={drumRunning}
                          onToggle={() => toggleLayer("drum")}
                          settings={effectiveDrumSettings}
                          onSettingsChange={updateDrumSettings}
                          clapsEnabled={clapsRunning}
                          shimmerEnabled={shimmerRunning}
                        />
                        <button
                          type="button"
                          onClick={() => toggleLayer("claps")}
                          title="Hand claps on beats 2 & 4"
                          className={`h-8 px-2.5 text-xs font-medium rounded-lg border transition-colors duration-100 flex-shrink-0 ${
                            clapsRunning
                              ? "bg-amber-400 text-white border-amber-400"
                              : "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 border-gray-200 dark:border-neutral-700 hover:bg-gray-200 dark:hover:bg-neutral-700"
                          }`}
                        >
                          Claps
                        </button>
                        <ShimmerControl
                          running={shimmerRunning}
                          onToggle={() => toggleLayer("shimmer")}
                          variation={drumSettings.shimmer}
                          onVariationChange={(shimmer) => updateDrumSettings({ shimmer })}
                          bpm={bpm}
                        />
                        <StringPadsControl
                          songKey={soundingKey}
                          progression={progression}
                          bpm={bpm}
                          beatsPerBar={beatsPerBar}
                          running={stringsRunning}
                          onToggle={() => toggleLayer("strings")}
                          settings={stringSettings}
                          onSettingsChange={updateStringSettings}
                        />
                        <button
                          type="button"
                          onClick={() => router.push(`/lead-sheet-editor/${id}/edit?arrange=1`)}
                          title="Lay the song out on tracks and record takes onto them"
                          className='h-8 flex items-center gap-1.5 px-2.5 text-xs font-medium rounded-lg border bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 border-gray-200 dark:border-neutral-700 hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors duration-100 flex-shrink-0'
                        >
                          <Mic className='w-3.5 h-3.5' /> Arrange
                        </button>
                      </div>
                      {/* Row 3: Share */}
                      <div className='flex flex-wrap items-center gap-2'>
                        <span className='text-xs font-medium text-gray-400 dark:text-neutral-500 uppercase tracking-wide w-12 shrink-0'>Share</span>
                        <button
                          onClick={handleCopy}
                          className={`h-8 flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors duration-150 ${
                            copied
                              ? "bg-blue-100 hover:bg-blue-200 text-blue-700"
                              : "bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200"
                          }`}
                        >
                          {copied ? <Check className='w-3.5 h-3.5' /> : <Copy className='w-3.5 h-3.5' />}
                          {copied ? "Copied!" : "Copy Text"}
                        </button>
                        <button
                          onClick={handleShare}
                          className={`h-8 flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors duration-150 ${
                            shared
                              ? "bg-blue-100 hover:bg-blue-200 text-blue-700"
                              : "bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200"
                          }`}
                        >
                          {shared ? <Check className='w-3.5 h-3.5' /> : <Link2 className='w-3.5 h-3.5' />}
                          {shared ? "Link Copied!" : "Share"}
                        </button>
                        <button
                          onClick={() => printSong(sheet.title)}
                          className='h-8 flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200 transition-colors duration-150'
                        >
                          <Printer className='w-3.5 h-3.5' /> Print
                        </button>
                        <button
                          onClick={() => router.push(`/lead-sheet-editor/${id}/edit`)}
                          className='h-8 flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-medium bg-black hover:bg-black/80 text-yellow-400 transition-colors duration-150'
                        >
                          <Pencil className='w-3.5 h-3.5' />
                          Edit
                        </button>
                      </div>
                    </div>
                  </div>
                  {editMode && <EditModeBanner error={moveError} onDone={() => setEditMode(false)} className='-mx-4 px-4' />}
                </div>
              </div>
              <div className='py-8' style={{ fontSize: `${fontScale}%` }}>
                <LineDndProvider onMove={editMode ? moveLine : undefined} lineTextAt={lineTextAt}>
                <SheetContent
                  sheet={sheet}
                  onEditLine={editMode ? openLineEditor : undefined}
                  onInsertLine={editMode ? openLineInsert : undefined}
                  onMoveLine={editMode ? moveLine : undefined}
                  fullscreen
                  columnCount={columnCount}
                  columnWidthVw={columnWidthVw}
                  transposeSteps={transposeSteps}
                  timeline={playbackOpen ? timeline : undefined}
                  activeCueIndex={activeCueIndex}
                  onSeekToLine={playbackOpen ? seekToLine : undefined}
                  bpm={bpm}
                />
                </LineDndProvider>
              </div>
              {playbackOpen && <div className='h-44' />}
            </div>
          </div>
        ) : (
          <div className='flex flex-col flex-1 min-h-0 p-0 sm:p-4'>
            <div
              className='flex flex-col flex-1 min-h-0 rounded-none border-none bg-white dark:bg-black overflow-hidden'
            >
              {/* Toolbar */}
              <div className='shrink-0 border-b border-gray-200 dark:border-neutral-800 print:hidden'>
                {/* Always-visible header strip */}
                <div className='flex items-center justify-between gap-2 px-4 py-2 sm:px-6'>
                  <div className='flex items-center gap-2 min-w-0'>
                    <button
                      onClick={() => router.push("/lead-sheet-editor")}
                      className='h-9 flex items-center gap-1.5 px-2.5 rounded-lg bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200 transition-colors duration-150 text-sm font-medium shrink-0'
                    >
                      <ArrowLeft className='w-4 h-4' />
                      All Sheets
                    </button>
                    {offline && <OfflineBadge />}
                    <span className='text-sm font-semibold text-gray-800 dark:text-neutral-100 truncate'>
                      {sheet.title}
                    </span>
                  </div>
                  <div className='flex items-center gap-1.5 shrink-0'>
                    <PlayControl hasTiming={hasTiming} videoLink={videoLink} withVideo={withVideo} onWithVideoToggle={() => setWithVideo((v) => !v)} open={playbackOpen} onOpen={openPlayback} onClose={closePlayback} />
                    <LineEditControl active={editMode} onToggle={() => setEditMode((on) => !on)} />
                    {setIds && <NextSongControl setIds={setIds} pos={setPos} onNext={goToNextSong} />}
                    <button
                      onClick={() => setToolbarOpen((o) => !o)}
                      title={toolbarOpen ? "Hide controls" : "Show controls"}
                      className='h-9 w-9 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-500 dark:text-neutral-400 transition-colors duration-150'
                    >
                      {toolbarOpen ? <ChevronUp className='w-4 h-4' /> : <ChevronDown className='w-4 h-4' />}
                    </button>
                  </div>
                </div>

                {/* Collapsible controls panel */}
                <div
                  className='overflow-hidden transition-all duration-300 ease-in-out'
                  style={{ maxHeight: toolbarOpen ? "500px" : "0px", opacity: toolbarOpen ? 1 : 0 }}
                >
                  <div className='px-4 pb-3 pt-1 sm:px-6'>
                    {/* Row 1: Display */}
                    <div className='flex flex-wrap items-center gap-2 mb-2'>
                      <span className='text-xs font-medium text-gray-400 dark:text-neutral-500 uppercase tracking-wide w-12 shrink-0'>Display</span>
                      <FontScaleControl scale={fontScale} onChange={updateFontScale} />
                      <ColumnCountControl count={columnCount} onChange={updateColumnCount} />
                      <ColumnWidthControl width={columnWidthVw} onChange={updateColumnWidthVw} />
                      <TransposeControl steps={transposeSteps} onChange={setTransposeSteps} />
                      <button
                        onClick={() => setFullscreen(true)}
                        className='h-8 flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200 transition-colors duration-150'
                      >
                        <Maximize2 className='w-3.5 h-3.5' /> Fullscreen
                      </button>
                    </div>
                    {/* Row 2: Audio */}
                    <div className='flex flex-wrap items-center gap-2 mb-2'>
                      <span className='text-xs font-medium text-gray-400 dark:text-neutral-500 uppercase tracking-wide w-12 shrink-0'>Audio</span>
                      <MetronomeControl
                        bpm={bpm}
                        onBpmChange={updateBpm}
                        beatsPerBar={beatsPerBar}
                        onBeatsPerBarChange={updateBeatsPerBar}
                        running={metronomeOn}
                        onToggle={() => setMetronomeOn((on) => !on)}
                      />
                      <DrumMachineControl
                        bpm={bpm}
                        running={drumRunning}
                        onToggle={() => toggleLayer("drum")}
                        settings={effectiveDrumSettings}
                        onSettingsChange={updateDrumSettings}
                        clapsEnabled={clapsRunning}
                        shimmerEnabled={shimmerRunning}
                      />
                      <button
                        type="button"
                        onClick={() => toggleLayer("claps")}
                        title="Hand claps on beats 2 & 4"
                        className={`h-8 px-2.5 text-xs font-medium rounded-lg border transition-colors duration-100 flex-shrink-0 ${
                          clapsRunning
                            ? "bg-amber-400 text-white border-amber-400"
                            : "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 border-gray-200 dark:border-neutral-700 hover:bg-gray-200 dark:hover:bg-neutral-700"
                        }`}
                      >
                        Claps
                      </button>
                      <ShimmerControl
                        running={shimmerRunning}
                        onToggle={() => toggleLayer("shimmer")}
                        variation={drumSettings.shimmer}
                        onVariationChange={(shimmer) => updateDrumSettings({ shimmer })}
                        bpm={bpm}
                      />
                      <StringPadsControl
                        songKey={soundingKey}
                        progression={progression}
                        bpm={bpm}
                        beatsPerBar={beatsPerBar}
                        running={stringsRunning}
                        onToggle={() => toggleLayer("strings")}
                        settings={stringSettings}
                        onSettingsChange={updateStringSettings}
                      />
                      <button
                        type="button"
                        onClick={() => router.push(`/lead-sheet-editor/${id}/edit?arrange=1`)}
                        title="Lay the song out on tracks and record takes onto them"
                        className='h-8 flex items-center gap-1.5 px-2.5 text-xs font-medium rounded-lg border bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 border-gray-200 dark:border-neutral-700 hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors duration-100 flex-shrink-0'
                      >
                        <Mic className='w-3.5 h-3.5' /> Arrange
                      </button>
                    </div>
                    {/* Row 3: Share */}
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='text-xs font-medium text-gray-400 dark:text-neutral-500 uppercase tracking-wide w-12 shrink-0'>Share</span>
                      <button
                        onClick={handleCopy}
                        className={`h-8 flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors duration-150 ${
                          copied
                            ? "bg-blue-100 hover:bg-blue-200 text-blue-700"
                            : "bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200"
                        }`}
                      >
                        {copied ? <Check className='w-3.5 h-3.5' /> : <Copy className='w-3.5 h-3.5' />}
                        {copied ? "Copied!" : "Copy Text"}
                      </button>
                      <button
                        onClick={handleShare}
                        className={`h-8 flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors duration-150 ${
                          shared
                            ? "bg-blue-100 hover:bg-blue-200 text-blue-700"
                            : "bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200"
                        }`}
                      >
                        {shared ? <Check className='w-3.5 h-3.5' /> : <Link2 className='w-3.5 h-3.5' />}
                        {shared ? "Link Copied!" : "Share"}
                      </button>
                      <button
                        onClick={() => printSong(sheet.title)}
                        className='h-8 flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200 transition-colors duration-150'
                      >
                        <Printer className='w-3.5 h-3.5' /> Print
                      </button>
                      <button
                        onClick={() => router.push(`/lead-sheet-editor/${id}/edit`)}
                        className='h-8 flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-medium bg-black hover:bg-black/80 text-yellow-400 transition-colors duration-150'
                      >
                        <Pencil className='w-3.5 h-3.5' />
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
                {editMode && <EditModeBanner error={moveError} onDone={() => setEditMode(false)} className='px-4 sm:px-6' />}
              </div>

              {/* Scrollable content */}
              <div className='flex-1 overflow-y-auto overflow-x-hidden'>
                <div className='w-full py-8 px-4 sm:px-0' style={{ fontSize: `${fontScale}%` }}>
                  <LineDndProvider onMove={editMode ? moveLine : undefined} lineTextAt={lineTextAt}>
                  <SheetContent
                    sheet={sheet}
                    onEditLine={editMode ? openLineEditor : undefined}
                    onInsertLine={editMode ? openLineInsert : undefined}
                    onMoveLine={editMode ? moveLine : undefined}
                    fullscreen={false}
                    columnCount={columnCount}
                    columnWidthVw={columnWidthVw}
                    transposeSteps={transposeSteps}
                    timeline={playbackOpen ? timeline : undefined}
                    activeCueIndex={activeCueIndex}
                    onSeekToLine={playbackOpen ? seekToLine : undefined}
                  bpm={bpm}
                  />
                  </LineDndProvider>
                </div>
                {playbackOpen && <div className='h-44' />}
              </div>
            </div>
          </div>
        )}

        {metronomeOn && (
          <MetronomeOverlay
            bpm={bpm}
            beatsPerBar={beatsPerBar}
            running={metronomeOn}
            lifted={playbackOpen}
          />
        )}

        {playbackOpen && videoLink && withVideo && (
          <YouTubePanel link={videoLink} status={video.status} mount={video.mount} />
        )}

        {editTarget && (
          <LineEditor
            key={`${editTarget.sectionIndex}:${editTarget.lineIndex}:${editTarget.insert ? "new" : "edit"}`}
            target={editTarget}
            transposeSteps={transposeSteps}
            saving={lineSaving}
            error={lineError}
            onSave={saveLine}
            onCancel={() => setEditTarget(null)}
          />
        )}

        {playbackOpen && (
          <PlaybackBar
            playback={playback}
            timeline={timeline}
            activeCue={activeCue}
            follow={follow}
            onFollowChange={setFollow}
            onClose={closePlayback}
          />
        )}
      </div>
    </>
  );
}
