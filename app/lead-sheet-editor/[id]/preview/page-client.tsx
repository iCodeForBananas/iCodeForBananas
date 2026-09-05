"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import { Pencil, Plus } from "lucide-react";
import {
  type LeadSheet,
  type Section,
  type SectionType,
  inferSectionType,
  migrateSection,
  ChordLyricLine,
  getPlainText,
  printSong,
  useSongDocumentTitle,
} from "../../shared";
import { cacheSheet, getCachedSheet } from "../../offlineCache";
import { useCommands } from "@/app/components/ui/command-palette";
import { PerformanceView } from "../../PerformanceView";
import { sheetToSong } from "../../song";
import LineEditor, { type LineTarget } from "../../LineEditor";
import SectionEditor from "../../SectionEditor";
import { asSectionHeader } from "../../songText";
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
import { findYouTubeLink } from "../../youtube";
import { YouTubePanel, useYouTubePlayback } from "../../YouTubePlayer";
import {
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
import {
  DEFAULT_DRUM_SETTINGS,
  normalizeDrumSettings,
  type DrumSettings,
} from "../../DrumMachine";
import {
  useStringPads,
  DEFAULT_STRING_SETTINGS,
  normalizeStringSettings,
  type StringPadsSettings,
} from "../../StringPads";
import {
  DEFAULT_SUB_BASS_SETTINGS,
  normalizeSubBassSettings,
  type SubBassSettings,
} from "../../SubBass";
import PreviewSidebar, {
  MIN_SCALE,
  MAX_SCALE,
  MIN_COLUMN_COUNT,
  MAX_COLUMN_COUNT,
  DEFAULT_COLUMN_COUNT,
  MIN_COLUMN_WIDTH_VW,
  MAX_COLUMN_WIDTH_VW,
  DEFAULT_COLUMN_WIDTH_VW,
} from "../../PreviewSidebar";

// Per-song localStorage keys: leadSheet:${id}:fontScale, leadSheet:${id}:columnCount,
// leadSheet:${id}:columnWidthVw, leadSheet:${id}:beatsPerBar
// The metronome's BPM is not local — it lives on the song's tempo column.

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
          ? "border-danger/30 bg-danger/10 border-danger/30 dark:bg-danger/100/10"
          : "border-primary-solid/30 bg-primary-solid/10 border-line-subtle dark:bg-primary-solid/10"
      } ${className}`}
    >
      <span
        className={`text-xs font-medium ${
          error ? "text-danger dark:text-danger" : "text-primary-text text-primary-hover"
        }`}
      >
        {error ?? "Tap a line to edit it, or drag its grip to move it."}
      </span>
      <button
        type='button'
        onClick={onDone}
        className='h-7 shrink-0 rounded-lg bg-primary-solid px-2.5 text-xs font-semibold text-ink-primary hover:bg-primary-hover transition-colors duration-150'
      >
        Done
      </button>
    </div>
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
  onAddSection,
  onEditSection,
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
  /** Opens the new-section sheet, landing the section after the one given. */
  onAddSection?: (afterIndex: number) => void;
  /** Present in edit mode — makes a section's badge the way to rename it. */
  onEditSection?: (sectionIndex: number) => void;
  /** Tempo the song's beat markers are read at — the live one, not the saved one. */
  bpm?: number;
}) {
  const beatTempo = bpm ?? sheet.tempo ?? DEFAULT_BPM;
  const columnsActive = !!(columnCount || columnWidthVw);
  return (
    <div>
      <div className={`mb-8 border-b-2 border-line-strong border-line-subtle pb-6 ${columnsActive ? "max-w-3xl mx-auto" : ""}`}>
        <h1
          className={`font-bold leading-tight mb-3 text-ink-primary ${fullscreen ? "text-[3em]" : "text-[2.25em]"}`}
        >
          {sheet.title || "Untitled"}
        </h1>
        <div className='flex flex-wrap gap-6 text-[0.875em]'>
          {sheet.key && (
            <span>
              <span className='uppercase tracking-wider text-[0.75em] text-ink-muted text-ink-muted mr-1'>Key</span>
              <span className='font-bold text-ink-primary text-[1em]'>{sheet.key}</span>
            </span>
          )}
          {sheet.tempo && (
            <span>
              <span className='uppercase tracking-wider text-[0.75em] text-ink-muted text-ink-muted mr-1'>Tempo</span>
              <span className='font-bold text-ink-primary text-[1em]'>{sheet.tempo} BPM</span>
            </span>
          )}
        </div>
        {sheet.general_notes && (
          <p className={`mt-3 italic text-ink-muted text-ink-muted ${fullscreen ? "text-[1em]" : "text-[0.875em]"}`}>
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
                {onEditSection ? (
                  <button
                    type='button'
                    onClick={() => onEditSection(sectionIndex)}
                    title='Rename this section'
                    className='inline-flex items-center gap-1.5 text-[0.75em] font-bold uppercase tracking-widest px-2 py-1 rounded transition-opacity duration-150 hover:opacity-80'
                    style={{ background: "var(--ds-color-primary-solid)", color: "var(--ds-color-text-on-primary)" }}
                  >
                    {section.label || section.type}
                    <Pencil className='w-3 h-3' />
                  </button>
                ) : (
                  <span
                    className='text-[0.75em] font-bold uppercase tracking-widest px-2 py-1 rounded'
                    style={{ background: "var(--ds-color-primary-solid)", color: "var(--ds-color-text-on-primary)" }}
                  >
                    {section.label || section.type}
                  </span>
                )}
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
                          className='block w-full h-8 rounded border border-dashed border-line-strong/10 border-line-subtle hover:border-line-strong hover:bg-surface-raised transition-colors duration-150'
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
                          ? "bg-primary-solid/20 shadow-[inset_3px_0_0_0_var(--ds-color-primary-solid)] dark:bg-primary-solid/20"
                          : ""
                      } ${
                        onEditLine
                          ? "cursor-pointer py-1.5 border border-dashed border-line-strong/10 border-line-subtle hover:border-line-strong hover:bg-surface-raised active:bg-primary-solid/15 active:bg-primary-solid/20"
                          : seekable
                            ? "cursor-pointer print:cursor-auto"
                            : ""
                      }`}
                    >
                      {cueInfo && (
                        <span
                          className={`inline-flex items-center gap-1 text-[0.65em] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded mr-2 print:hidden ${
                            !cueInfo.isStop
                              ? "bg-success/15 text-success bg-success/15 text-success"
                              : "bg-danger/15 text-danger bg-danger/15 dark:text-danger"
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
                {(onInsertLine || onAddSection) && (
                  <div className='flex gap-2'>
                    {onInsertLine && (
                      <button
                        type='button'
                        onClick={() => onInsertLine(sectionIndex, lines.length)}
                        className='flex flex-1 items-center justify-center gap-1.5 rounded border border-dashed border-line-strong/15 py-2 text-[0.8em] font-medium text-ink-muted transition-colors duration-150 hover:border-primary-solid hover:bg-primary-solid/10 hover:text-ink-primary border-line-subtle text-ink-muted dark:hover:bg-primary-solid/10 dark:hover:text-ink-primary/70'
                      >
                        <Plus className='w-3.5 h-3.5' />
                        Add line
                      </button>
                    )}
                    {onAddSection && (
                      <button
                        type='button'
                        onClick={() => onAddSection(sectionIndex)}
                        title='Start a new verse, chorus or bridge after this one'
                        className='flex items-center justify-center gap-1.5 rounded border border-dashed border-line-strong/15 px-3 py-2 text-[0.8em] font-medium text-ink-muted transition-colors duration-150 hover:border-primary-solid hover:bg-primary-solid/10 hover:text-ink-primary border-line-subtle text-ink-muted dark:hover:bg-primary-solid/10 dark:hover:text-ink-primary/70'
                      >
                        <Plus className='w-3.5 h-3.5' />
                        Section
                      </button>
                    )}
                  </div>
                )}
              </div>
              {section.notes && (
                <p className={`mt-3 italic text-ink-muted text-ink-muted ${fullscreen ? "text-[1em]" : "text-[0.875em]"}`}>
                  ↳ {section.notes}
                </p>
              )}
            </div>
          );
        })}
        {onAddSection && sheet.sections.length === 0 && (
          <button
            type='button'
            onClick={() => onAddSection(-1)}
            className='flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-line-strong/15 py-3 text-[0.8em] font-medium text-ink-muted transition-colors duration-150 hover:border-primary-solid hover:bg-primary-solid/10 hover:text-ink-primary border-line-subtle text-ink-muted dark:hover:bg-primary-solid/10 dark:hover:text-ink-primary/70'
          >
            <Plus className='w-3.5 h-3.5' />
            Add section
          </button>
        )}
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
  const [performing, setPerforming] = useState(false);

  const songCommands = useMemo(
    () => [
      {
        id: "transpose:up",
        label: "Transpose up a semitone",
        group: "This song",
        keywords: "key pitch higher raise",
        run: () => setTransposeSteps((steps) => steps + 1),
      },
      {
        id: "transpose:down",
        label: "Transpose down a semitone",
        group: "This song",
        keywords: "key pitch lower drop",
        run: () => setTransposeSteps((steps) => steps - 1),
      },
      {
        id: "transpose:reset",
        label: "Back to the written key",
        group: "This song",
        keywords: "transpose reset original concert",
        run: () => setTransposeSteps(0),
      },
      {
        id: "performance",
        label: "Toggle performance mode",
        group: "This song",
        keywords: "fullscreen stage live big large play autoscroll",
        run: () => setPerforming((on) => !on),
      },
    ],
    []
  );
  useCommands("song", songCommands);

  const [editMode, setEditMode] = useState(false);
  const [editTarget, setEditTarget] = useState<LineTarget | null>(null);
  /** Index the new section lands after; -1 puts it at the top of a bare song. */
  const [sectionAfter, setSectionAfter] = useState<number | null>(null);
  /** Index of the section whose name is open for editing. */
  const [sectionEdit, setSectionEdit] = useState<number | null>(null);
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
  // The tools are open beside the sheet on a laptop, and folded to their rail
  // on a phone, where the sidebar covers the very song it controls.
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
  const [subBassSettings, setSubBassSettings] = useState<SubBassSettings>(DEFAULT_SUB_BASS_SETTINGS);
  const subRunning = activeLayers.has("sub");
  const [withVideo, setWithVideo] = useState(true);
  const [localVolume, _setLocalVolume] = useState<number | null>(null);
  const localVolumeRef = useRef<number | null>(null);
  const setLocalVolume = (v: number | null) => { localVolumeRef.current = v; _setLocalVolume(v); };
  const bpmSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drumSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stringSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subBassSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCueEventIdxRef = useRef<number>(-2); // -2 = uninitialized

  // Printing to PDF should offer the song's name, not "Preview Lead Sheet".
  useSongDocumentTitle(sheet?.title);

  // A phone has no room for the sheet and the tools side by side, so the tools
  // start folded away there and open over the song only when asked for.
  useEffect(() => {
    if (window.matchMedia("(max-width: 639px)").matches) setSidebarOpen(false);
  }, []);

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
    (sectionIndex: number, lineIndex: number, sectionLabel?: string) => {
      const section = sheet?.sections[sectionIndex];
      const label = sectionLabel ?? (section ? section.label || section.type : null);
      if (!label) return;
      setLineError(null);
      setEditTarget({ sectionIndex, lineIndex, sectionLabel: label, text: "", insert: true });
    },
    [sheet]
  );

  // Adding a part of the song: an empty section with one blank line to tap.
  const addSection = async (type: SectionType, label: string) => {
    if (!sheet || sectionAfter === null) return;
    const section: Section = {
      id: crypto.randomUUID(),
      type,
      label,
      content: "",
      notes: "",
    };
    const sections = [...sheet.sections];
    sections.splice(sectionAfter + 1, 0, section);
    setSectionAfter(null);
    try {
      if (!(await commitSections(sections))) {
        flashMoveError("This song belongs to someone else, so it can't be edited here.");
        return;
      }
      // Straight into typing it, which is what adding a chorus is really for.
      // The new section already has one empty line, so this fills that in
      // rather than pushing a second blank one under it.
      setLineError(null);
      setEditTarget({ sectionIndex: sectionAfter + 1, lineIndex: 0, sectionLabel: label, text: "" });
    } catch {
      flashMoveError("Couldn't add that section — check your connection and try again.");
    }
  };

  // Renaming a part of the song where it is read: the badge over each section
  // is the handle, so nothing has to be retyped as [Chorus] to fix a name.
  const renameSection = async (type: SectionType, label: string) => {
    if (!sheet || sectionEdit === null) return;
    const index = sectionEdit;
    setSectionEdit(null);
    const sections = sheet.sections.map((section, i) =>
      i === index ? { ...section, type, label } : section
    );
    try {
      if (!(await commitSections(sections))) {
        flashMoveError("This song belongs to someone else, so it can't be edited here.");
      }
    } catch {
      flashMoveError("Couldn't rename that section — check your connection and try again.");
    }
  };

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

  /**
   * A line that reads as a header — [Chorus] on its own, not a chord — isn't a
   * lyric at all: it starts a new part of the song, and everything below it in
   * the section belongs to that part. Same reading the text editor gives it,
   * so a song says the same thing whichever end it was typed from.
   */
  const splitAtHeader = (
    sections: Section[],
    sectionIndex: number,
    lineIndex: number,
    insert: boolean,
    label: string
  ) => {
    const source = sections[sectionIndex];
    const lines = (source.content ?? "").split("\n");
    // On an edit the header line replaced a lyric, which the new heading is
    // now standing in for; on an insert there was never a line there.
    if (!insert) lines.splice(lineIndex, 1);
    const before = lines.slice(0, lineIndex);
    const after = lines.slice(lineIndex);
    const created: Section = {
      id: crypto.randomUUID(),
      type: inferSectionType(label),
      label,
      content: after.join("\n"),
      notes: "",
    };
    const next = [...sections];
    // A section left with nothing at all goes; one with lines or a performance
    // note above the split keeps both.
    const replaced = before.length === 0 && !source.notes;
    if (replaced) next.splice(sectionIndex, 1, created);
    else next.splice(sectionIndex, 1, { ...source, content: before.join("\n") }, created);
    return {
      sections: next,
      newIndex: replaced ? sectionIndex : sectionIndex + 1,
      newLineIndex: after.length,
      label,
    };
  };

  /**
   * Take a line out of the song. Emptying the box is how a line gets deleted —
   * leaving the gap behind would only make a blank line to tap past next time.
   */
  const deleteLine = async (sectionIndex: number, lineIndex: number, andAnother: boolean) => {
    if (!sheet) return;
    setLineSaving(true);
    setLineError(null);
    const sections = sheet.sections.map((section, i) => {
      if (i !== sectionIndex) return section;
      const lines = (section.content ?? "").split("\n");
      lines.splice(lineIndex, 1);
      return { ...section, content: lines.join("\n") };
    });
    try {
      if (!(await commitSections(sections))) {
        setLineError("This song belongs to someone else, so it can't be edited here.");
        return;
      }
      // Whatever was under it has moved up into the gap, so carrying on means
      // the same index again, not the next one.
      if (andAnother) openLineInsert(sectionIndex, lineIndex);
      else setEditTarget(null);
    } catch {
      setLineError("Couldn't remove that line — check your connection and try again.");
    } finally {
      setLineSaving(false);
    }
  };

  const saveLine = async (text: string, andAnother = false) => {
    if (!sheet || !editTarget) return;
    const { sectionIndex, lineIndex, insert } = editTarget;
    // Nothing left in the box: delete the line rather than store an empty one.
    // On an insert there is no line yet, so a blank one simply never gets made.
    if (text.trim() === "") {
      if (!insert) {
        await deleteLine(sectionIndex, lineIndex, andAnother);
        return;
      }
      if (andAnother) openLineInsert(sectionIndex, lineIndex);
      else setEditTarget(null);
      return;
    }
    if (!insert && text === editTarget.text) {
      if (andAnother) openLineInsert(sectionIndex, lineIndex + 1);
      else setEditTarget(null);
      return;
    }
    setLineSaving(true);
    setLineError(null);
    const header = asSectionHeader(text);
    const split =
      header !== null ? splitAtHeader(sheet.sections, sectionIndex, lineIndex, !!insert, header) : null;
    const sections =
      split?.sections ??
      sheet.sections.map((section, i) => {
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
      // Carrying on: after a header that's the first line of the part it just
      // started, otherwise the next line down.
      if (andAnother && split) openLineInsert(split.newIndex, split.newLineIndex, split.label);
      else if (andAnother) openLineInsert(sectionIndex, lineIndex + 1);
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

  // The walk the sub bass plays is part of the arrangement, not a preference of
  // this browser — someone opening the sheet on stage should get the same notes.
  const updateSubBassSettings = (patch: Partial<SubBassSettings>) => {
    const next = { ...subBassSettings, ...patch };
    setSubBassSettings(next);
    setSheet((prev) => (prev ? { ...prev, metadata: { ...prev.metadata, subBass: next } } : prev));
    if (subBassSaveTimer.current) clearTimeout(subBassSaveTimer.current);
    subBassSaveTimer.current = setTimeout(async () => {
      const metadata = { ...sheet?.metadata, subBass: next };
      try {
        await createClient()!
          .from("lead_sheets")
          .update({ metadata, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (sheet) await cacheSheet({ ...sheet, metadata });
      } catch {
        // Offline or not the owner — the walk still plays as typed.
      }
    }, 800);
  };

  useEffect(() => () => { if (subBassSaveTimer.current) clearTimeout(subBassSaveTimer.current); }, []);

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
        setSubBassSettings(normalizeSubBassSettings(data.metadata?.subBass));
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
        setSubBassSettings(normalizeSubBassSettings(cached.metadata?.subBass));
        setOffline(true);
      }
    }
    setLoading(false);
  }

  if (authLoading || loading) {
    return (
      <div className='flex flex-col flex-1 min-h-0 bg-surface-base'>
        <div className='flex flex-col flex-1 min-h-0 p-2 sm:p-4'>
          <div className='flex flex-col flex-1 min-h-0 rounded-none border-none overflow-hidden'>
            <div className='flex-1 flex items-center justify-center text-ink-muted text-ink-muted'>Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!user || !sheet) {
    return (
      <div className='flex flex-col flex-1 min-h-0 bg-surface-base'>
        <div className='flex flex-col flex-1 min-h-0 p-2 sm:p-4'>
          <div className='flex flex-col flex-1 min-h-0 rounded-none border-none overflow-hidden'>
            <div className='flex-1 flex items-center justify-center text-ink-muted text-ink-muted'>Sheet not found.</div>
          </div>
        </div>
      </div>
    );
  }

  // Every preview tool, in one scrollable column down the left of the sheet —
  // the same element whether the sheet is fullscreen or framed by the app.
  const toolSidebar = (
    <PreviewSidebar
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      title={sheet.title}
      offline={offline}
      onAllSheets={() => router.push("/lead-sheet-editor")}
      onOpenEditor={() => router.push(`/lead-sheet-editor/${id}/edit`)}
      onArrange={() => router.push(`/lead-sheet-editor/${id}/edit?arrange=1`)}
      fullscreen={fullscreen}
      onFullscreenChange={setFullscreen}
      hasTiming={hasTiming}
      videoLink={videoLink}
      withVideo={withVideo}
      onWithVideoToggle={() => setWithVideo((v) => !v)}
      playbackOpen={playbackOpen}
      onOpenPlayback={openPlayback}
      onClosePlayback={closePlayback}
      setIds={setIds}
      setPos={setPos}
      onNextSong={goToNextSong}
      fontScale={fontScale}
      onFontScaleChange={updateFontScale}
      columnCount={columnCount}
      onColumnCountChange={updateColumnCount}
      columnWidthVw={columnWidthVw}
      onColumnWidthVwChange={updateColumnWidthVw}
      transposeSteps={transposeSteps}
      onTransposeStepsChange={setTransposeSteps}
      bpm={bpm}
      onBpmChange={updateBpm}
      beatsPerBar={beatsPerBar}
      onBeatsPerBarChange={updateBeatsPerBar}
      metronomeOn={metronomeOn}
      onMetronomeToggle={() => setMetronomeOn((on) => !on)}
      drumRunning={drumRunning}
      onDrumToggle={() => toggleLayer("drum")}
      drumSettings={effectiveDrumSettings}
      shimmerVariation={drumSettings.shimmer}
      onDrumSettingsChange={updateDrumSettings}
      clapsRunning={clapsRunning}
      onClapsToggle={() => toggleLayer("claps")}
      shimmerRunning={shimmerRunning}
      onShimmerToggle={() => toggleLayer("shimmer")}
      stringsRunning={stringsRunning}
      onStringsToggle={() => toggleLayer("strings")}
      stringSettings={stringSettings}
      onStringSettingsChange={updateStringSettings}
      songKey={soundingKey}
      progression={progression}
      subRunning={subRunning}
      onSubToggle={() => toggleLayer("sub")}
      subBassSettings={subBassSettings}
      onSubBassSettingsChange={updateSubBassSettings}
      editMode={editMode}
      onEditModeToggle={() => setEditMode((on) => !on)}
      copied={copied}
      onCopy={handleCopy}
      shared={shared}
      onShare={handleShare}
      onPrint={() => printSong(sheet.title)}
    />
  );

  return (
    <>
      {/* Print-only view: chrome-free layout that only renders when printing.
          The screen view below is hidden via print:hidden so only this prints. */}
      <div className='hidden print:block' style={{ background: "#fff", color: "var(--ds-color-text-on-primary)" }}>
        <div className='leadsheet-force-light max-w-3xl mx-auto px-2 py-4' style={{ fontSize: `${fontScale}%` }}>
          <SheetContent sheet={sheet} fullscreen={false} transposeSteps={transposeSteps} />
        </div>
      </div>

      {performing && (
        <PerformanceView
          song={sheetToSong(sheet)}
          songId={id}
          view={{ transpose: transposeSteps, capo: sheet.capo ?? 0 }}
          onExit={() => setPerforming(false)}
        />
      )}

      {/* Screen view */}
      <div className='print:hidden flex flex-col flex-1 min-h-0'>
        {fullscreen ? (
          <div className='fixed inset-0 z-50 flex bg-surface-base'>
            {toolSidebar}
            <div className='flex flex-col flex-1 min-w-0'>
              {editMode && <EditModeBanner error={moveError} onDone={() => setEditMode(false)} className='px-6 sm:px-8' />}
              <div className='flex-1 overflow-y-auto overflow-x-hidden'>
                <div className='w-full px-6 py-8 sm:px-8' style={{ fontSize: `${fontScale}%` }}>
                  <LineDndProvider onMove={editMode ? moveLine : undefined} lineTextAt={lineTextAt}>
                    <SheetContent
                      sheet={sheet}
                      onEditLine={editMode ? openLineEditor : undefined}
                      onInsertLine={editMode ? openLineInsert : undefined}
                      onMoveLine={editMode ? moveLine : undefined}
                      onAddSection={editMode ? setSectionAfter : undefined}
                      onEditSection={editMode ? setSectionEdit : undefined}
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
          </div>
        ) : (
          <div className='flex flex-col flex-1 min-h-0 p-0 sm:p-4'>
            <div className='relative flex flex-1 min-h-0 rounded-none border-none bg-surface-base overflow-hidden'>
              {toolSidebar}
              <div className='flex flex-col flex-1 min-w-0'>
                {editMode && <EditModeBanner error={moveError} onDone={() => setEditMode(false)} className='px-6 sm:px-8' />}
                {/* Scrollable content */}
                <div className='flex-1 overflow-y-auto overflow-x-hidden'>
                  <div className='w-full px-6 py-8 sm:px-8' style={{ fontSize: `${fontScale}%` }}>
                    <LineDndProvider onMove={editMode ? moveLine : undefined} lineTextAt={lineTextAt}>
                      <SheetContent
                        sheet={sheet}
                        onEditLine={editMode ? openLineEditor : undefined}
                        onInsertLine={editMode ? openLineInsert : undefined}
                        onMoveLine={editMode ? moveLine : undefined}
                        onAddSection={editMode ? setSectionAfter : undefined}
                        onEditSection={editMode ? setSectionEdit : undefined}
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
            onDelete={
              editTarget.insert
                ? undefined
                : () => deleteLine(editTarget.sectionIndex, editTarget.lineIndex, false)
            }
            onCancel={() => setEditTarget(null)}
          />
        )}

        {sectionAfter !== null && sheet && (
          <SectionEditor
            sections={sheet.sections}
            afterLabel={
              sheet.sections[sectionAfter]
                ? sheet.sections[sectionAfter].label || sheet.sections[sectionAfter].type
                : null
            }
            onAdd={addSection}
            onCancel={() => setSectionAfter(null)}
          />
        )}

        {sectionEdit !== null && sheet.sections[sectionEdit] && (
          <SectionEditor
            sections={sheet.sections}
            afterLabel={null}
            editing={sheet.sections[sectionEdit]}
            onAdd={renameSection}
            onCancel={() => setSectionEdit(null)}
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
