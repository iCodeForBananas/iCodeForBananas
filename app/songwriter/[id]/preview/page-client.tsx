"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/app/components/ui/button";
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
import { goTo } from "../../offlineNav";
import { useCommands } from "@/app/components/ui/command-palette";
import { PerformanceView } from "../../PerformanceView";
import { sheetToSong } from "../../song";
import InlineLineInput from "../../InlineLineInput";
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
import { transposeText } from "../../../lib/transpose";
import { buildTimeline, cueAt, lineKey, type Timeline } from "../../timing";
import { PlaybackBar, usePlayback, usePlaybackKeys } from "../../PlaybackBar";
import { findYouTubeLink } from "../../youtube";
import { YouTubePanel, useYouTubePlayback } from "../../YouTubePlayer";
import {
  clampBpm,
  DEFAULT_BPM,
} from "../../Tempo";
import {
  getCueTagInfo,
  parseCueEvents,
  stripCueMarkers,
} from "../../cues";
import { DEFAULT_KIT, kitFromMetadata, kitToMetadata, type KitSettings } from "../../kit";
import { KitPlayer } from "../../KitPlayer";
import styles from "../../songwriter.module.css";
import TopBar from "../../TopBar";
import LibraryDrawer from "../../LibraryDrawer";
import { useLeadSheetLibrary } from "../../useLibrary";
import { useAutoFit } from "../../useAutoFit";
import { readPanelOpen, writePanelOpen } from "../../panelStorage";
import { track } from "@/app/lib/analytics";
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

/** Nothing sounding. Hoisted so the memo below keeps one identity for it. */
const NO_LAYERS: ReadonlySet<string> = new Set<string>();

// Per-song localStorage keys: leadSheet:${id}:fontScale, leadSheet:${id}:columnCount,
// leadSheet:${id}:columnWidthVw
// The tempo is not local — it lives on the song's tempo column.

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
      className={`flex items-center justify-between gap-2 border-t py-2 print:hidden ${
        error
          ? "border-danger/30 bg-danger/10"
          : "border-primary-solid/30 bg-primary-solid/10"
      } ${className}`}
    >
      <span
        className={`text-xs font-medium ${
          error ? "text-danger" : "text-primary-text"
        }`}
      >
        {error ?? "Edit a line where it is, or drag its grip to move it."}
      </span>
      <Button variant="primary" type='button' size='sm' onClick={onDone} className='shrink-0'>
        Done
      </Button>
    </div>
  );
}

const samePos = (a: LinePos | null, sectionIndex: number, lineIndex: number) =>
  !!a && a.sectionIndex === sectionIndex && a.lineIndex === lineIndex;

/** Edit mode's handle on the lines: each one an input, edited where it sits. */
interface LineEditing {
  /** A new line that isn't in the song yet — the end of a section, or under one just entered. */
  draft: LinePos | null;
  /** A line whose input should take the caret as soon as it appears. */
  focus: LinePos | null;
  onFocused: () => void;
  /** `insert` means `pos` is the draft, so the text goes in rather than over. */
  onCommit: (pos: LinePos, text: string, insert: boolean, andAnother: boolean) => void;
  onDelete: (pos: LinePos, expected: string) => void;
  onDraft: (pos: LinePos) => void;
  onDiscardDraft: () => void;
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
  editing,
  onMoveLine,
  onAddSection,
  onEditSection,
  bpm,
  kit,
}: {
  sheet: LeadSheet;
  fullscreen: boolean;
  columnCount?: number;
  columnWidthVw?: number;
  transposeSteps?: number;
  /** For the reference's third chip — the kit's preset name, or "Custom kit". */
  kit?: KitSettings;
  /** Present only while playback is open — otherwise the sheet renders untouched. */
  timeline?: Timeline;
  activeCueIndex?: number | null;
  onSeekToLine?: (sectionIndex: number, lineIndex: number) => void;
  /** Present only in edit mode — it turns every line into an input, edited in place. */
  editing?: LineEditing;
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
      {/* The song's bar: the full width of the sheet, whatever the columns
          below are doing. Title, then the capo with the song's notes beside
          it, then tempo and pattern. Key doesn't get a chip of its own: the
          reference has no slot for it here, and it's still readable (and
          editable) as `Key: G` in Freeform. */}
      <div
        data-testid='sheet-bar'
        className={`w-full flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-subtle ${fullscreen ? "mb-8 pb-6" : "mb-6 pb-3"}`}
      >
        <h1
          className={`font-bold leading-tight text-ink-primary ${fullscreen ? "text-[1.75em]" : "text-[1.5em]"}`}
        >
          {sheet.title || "Untitled"}
        </h1>
        <span className={`${styles.chip} ${sheet.capo ? styles.chipAccent : ""} text-[0.875em]`}>
          {sheet.capo ? `Capo ${sheet.capo}` : "No capo"}
        </span>
        {sheet.general_notes ? (
          <p className='flex-1 min-w-[12rem] italic text-ink-muted text-[0.875em]'>{sheet.general_notes}</p>
        ) : (
          <div className='flex-1' />
        )}
        <div className='flex flex-wrap gap-2 text-[0.875em]'>
          {sheet.tempo && <span className={styles.chip}>{sheet.tempo} bpm</span>}
          <span className={styles.chip}>{kit?.preset ?? "Custom kit"}</span>
        </div>
      </div>

      <div
        className={`space-y-8 ${columnsActive ? "leadsheet-columns" : ""}`}
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
                    className='inline-flex items-center gap-2 text-[0.75em] font-bold uppercase tracking-widest px-2 py-1 rounded-md transition-opacity duration-150 hover:opacity-80'
                    style={{ background: "var(--ds-color-primary-solid)", color: "var(--ds-color-text-on-primary)" }}
                  >
                    {section.label || section.type}
                    <Pencil className='w-3 h-3' />
                  </button>
                ) : (
                  <span
                    className='text-[0.75em] font-bold uppercase tracking-widest px-2 py-1 rounded-md'
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
                  const sectionName = section.label || section.type;
                  // The new line goes in above whatever is at its index, and
                  // isn't one of the sortable rows until it's saved. It has no
                  // grip yet, so it keeps the grip's width to line up.
                  const draftRow = (lineIndex: number) =>
                    editing && samePos(editing.draft, sectionIndex, lineIndex) ? (
                      <div key={`draft:${lineIndex}`} className='flex items-stretch gap-1'>
                        <div className='w-10 shrink-0' />
                        <InlineLineInput
                          value=''
                          label={`${sectionName}, new line`}
                          autoFocus
                          onCommit={(text, another) =>
                            editing.onCommit({ sectionIndex, lineIndex }, text, true, another)
                          }
                          onDelete={editing.onDiscardDraft}
                        />
                      </div>
                    ) : null;
                  if (editing) {
                    const pos = { sectionIndex, lineIndex: i };
                    return [
                      draftRow(i),
                      withGrip(
                        // Keyed by the text, so a save that changes the line
                        // starts the input over from what the song now says.
                        <InlineLineInput
                          key={`${i}:${line}`}
                          value={line}
                          label={`${sectionName}, line ${i + 1}`}
                          autoFocus={samePos(editing.focus, sectionIndex, i)}
                          onFocused={editing.onFocused}
                          onCommit={(text, another) => editing.onCommit(pos, text, false, another)}
                          onDelete={(expected) => editing.onDelete(pos, expected)}
                        />
                      ),
                      i === lines.length - 1 ? draftRow(lines.length) : null,
                    ];
                  }
                  if (line.trim() === "") {
                    return <div key={i} data-fit-line className='h-3' />;
                  }
                  const cueInfo  = getCueTagInfo(line);
                  const displayLine = cueInfo ? stripCueMarkers(line) : line;
                  const cueIndex = timeline?.lineCue.get(lineKey(sectionIndex, i));
                  const active = cueIndex !== undefined && cueIndex === activeCueIndex;
                  const seekable = cueIndex !== undefined && !!onSeekToLine;
                  return (
                    <div
                      key={i}
                      data-fit-line
                      data-active-cue={active || undefined}
                      role={seekable ? "button" : undefined}
                      onClick={seekable ? () => onSeekToLine!(sectionIndex, i) : undefined}
                      className={`rounded-md px-2 transition-colors duration-150 ${
                        active
                          ? "bg-primary-solid/20 shadow-[inset_3px_0_0_0_var(--ds-color-primary-solid)]"
                          : ""
                      } ${seekable ? "cursor-pointer print:cursor-auto" : ""}`}
                    >
                      {cueInfo && (
                        <span
                          className={`inline-flex items-center gap-1 text-[0.65em] font-bold tracking-wide uppercase px-2 py-1 rounded-md mr-2 print:hidden ${
                            !cueInfo.isStop
                              ? "bg-success/15 text-success bg-success/15 text-success"
                              : "bg-danger/15 text-danger"
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
                {(editing || onAddSection) && (
                  <div className='flex gap-2'>
                    {editing && (
                      <Button
                        type='button'
                        variant='secondary'
                        onClick={() => editing.onDraft({ sectionIndex, lineIndex: lines.length })}
                        className='flex-1'
                      >
                        <Plus className='w-3.5 h-3.5' />
                        Add line
                      </Button>
                    )}
                    {onAddSection && (
                      <Button
                        type='button'
                        variant='secondary'
                        onClick={() => onAddSection(sectionIndex)}
                        title='Start a new verse, chorus or bridge after this one'
                      >
                        <Plus className='w-3.5 h-3.5' />
                        Section
                      </Button>
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
          <Button type='button' size='lg' variant='secondary' onClick={() => onAddSection(-1)} className='w-full'>
            <Plus className='w-3.5 h-3.5' />
            Add section
          </Button>
        )}
      </div>
    </div>
  );
});

export default function PreviewLeadSheet({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  // Fetched here, on the page's own mount, rather than inside the drawer —
  // the drawer only exists in the tree once it's open, and a hook inside it
  // wouldn't fire until then. This is what makes opening the drawer instant:
  // the list (and its IndexedDB copy, for offline) is already in hand.
  const {
    sheets: librarySheets,
    visibleSheets: libraryVisibleSheets,
    offline: libraryOffline,
    cachedIds: libraryCachedIds,
    query: libraryQuery,
    setQuery: setLibraryQuery,
    createSheet,
  } = useLeadSheetLibrary();
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
  /** A new line being typed in edit mode, not in the song until it's saved. */
  const [lineDraft, setLineDraft] = useState<LinePos | null>(null);
  /** A line whose input should take the caret when it appears (a new section's first). */
  const [lineFocus, setLineFocus] = useState<LinePos | null>(null);
  const leaveEditMode = () => {
    setEditMode(false);
    setLineDraft(null);
    setLineFocus(null);
  };
  /** Index the new section lands after; -1 puts it at the top of a bare song. */
  const [sectionAfter, setSectionAfter] = useState<number | null>(null);
  /** Index of the section whose name is open for editing. */
  const [sectionEdit, setSectionEdit] = useState<number | null>(null);
  // A failed drag or line save has no sheet open to report into, so it
  // borrows the banner.
  const [moveError, setMoveError] = useState<string | null>(null);
  const moveErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashMoveError = (message: string) => {
    setMoveError(message);
    if (moveErrorTimer.current) clearTimeout(moveErrorTimer.current);
    moveErrorTimer.current = setTimeout(() => setMoveError(null), 5000);
  };
  const [playbackOpen, setPlaybackOpen] = useState(false);
  // Both panels default open on a wide screen and closed on a narrow one —
  // the reference's own `showLib`/`showDrums: window.innerWidth > 820` —
  // but only for a first-time visitor with nothing stored yet. Starts false
  // (SSR-safe; matches whatever the server rendered) and is corrected in the
  // mount effect below, which also restores a stored preference.
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [drumsOpen, setDrumsOpen] = useState(false);
  // Auto-fit on by default, matching the reference — the text size stepper
  // only takes over once A-/A+ is pressed.
  const [autoFit, setAutoFit] = useState(true);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [follow, setFollow] = useState(true);
  const [autoPlay, setAutoPlay] = useState(false);
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  // Open-ended layer state: any cue tag layer name lives here, and the cue
  // events during a timed playback are what write it. Every name the kit knows
  // is wired — drum, claps, shimmer, drone. A cue naming something else is
  // still tracked here and simply makes no sound, which is what a song still
  // carrying a [sub] from before that layer was removed now does.
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set());
  const [kit, setKit] = useState<KitSettings>(DEFAULT_KIT);
  /**
   * The kit's own transport, which is not the same as the song's.
   *
   * Pressing play on the kit sounds whatever the kit has switched on and loops
   * it. Timed playback is the other way round: the song's cues decide what is
   * sounding bar by bar, and this stands aside for them.
   */
  const [kitPlaying, setKitPlaying] = useState(false);
  const [withVideo, setWithVideo] = useState(true);
  const [localVolume, _setLocalVolume] = useState<number | null>(null);
  const localVolumeRef = useRef<number | null>(null);
  const setLocalVolume = (v: number | null) => { localVolumeRef.current = v; _setLocalVolume(v); };
  const bpmSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kitSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCueEventIdxRef = useRef<number>(-2); // -2 = uninitialized

  // Printing to PDF should offer the song's name, not "Preview Lead Sheet".
  useSongDocumentTitle(sheet?.title);

  // A phone has no room for the sheet and a side panel together, so both
  // start folded away there and open over the song only when asked for; a
  // wide screen gets both open by default, same as the reference — but only
  // when Michael hasn't opened or closed one before, in which case that
  // preference wins regardless of width. This runs once, well before the
  // panels themselves first render (they're gated behind the sheet's own
  // async load), so there's no flash of the wrong state to suppress.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 821px)").matches;
    const nextLibrary = readPanelOpen("library") ?? wide;
    let nextDrums = readPanelOpen("drums") ?? wide;
    // Both restoring open on a narrow screen would stack two near-full-width
    // overlays on top of each other — the same clash the toggle handlers
    // below already prevent by closing one when the other opens. This is a
    // one-time adjustment for this render, not a preference change, so it's
    // never written back — reopening on a wide screen still restores both.
    if (!wide && nextLibrary && nextDrums) nextDrums = false;
    setLibraryOpen(nextLibrary);
    setDrumsOpen(nextDrums);
  }, []);

  // Mutually exclusive on a narrow screen — opening one closes the other,
  // the reference's own toggleLib/toggleDrums. Wide enough for both to have
  // their own column and this is a no-op. Only the panel Michael actually
  // asked to open or close is written to storage; the other one's forced
  // close here is a transient side effect of screen width, not a changed
  // preference, so its own stored value is left exactly as it was.
  const narrow = () => !window.matchMedia("(min-width: 821px)").matches;
  const toggleLibrary = () => {
    setLibraryOpen((open) => {
      const next = !open;
      writePanelOpen("library", next);
      if (next && narrow()) setDrumsOpen(false);
      return next;
    });
  };
  const toggleDrums = () => {
    setDrumsOpen((open) => {
      const next = !open;
      writePanelOpen("drums", next);
      if (next && narrow()) setLibraryOpen(false);
      return next;
    });
  };
  // The backdrop click that dismisses an overlay drawer on a narrow screen —
  // a deliberate close same as the toggle button, so it persists too.
  const closeLibrary = () => {
    setLibraryOpen(false);
    writePanelOpen("library", false);
  };
  const closeDrums = () => {
    setDrumsOpen(false);
    writePanelOpen("drums", false);
  };

  // The reference's fit(): binary-search the largest size/column-count that
  // lays the sheet out without overflow. Play mode only — editing lines or
  // fullscreen each need the size pinned, not recalculated out from under
  // a tap in progress.
  useAutoFit({
    enabled: autoFit && !editMode && !fullscreen,
    containerRef: stageRef,
    contentRef: sheetRef,
    minScale: MIN_SCALE,
    maxScale: MAX_SCALE,
    minCols: MIN_COLUMN_COUNT,
    maxCols: MAX_COLUMN_COUNT,
    scale: fontScale,
    cols: columnCount,
    onFit: ({ scale, cols }) => {
      updateFontScale(scale);
      updateColumnCount(cols);
    },
    deps: [sheet?.id, sheet?.sections, transposeSteps, libraryOpen, drumsOpen],
  });

  // ─── Timed playback ─────────────────────────────────────────────────────────

  const timeline = useMemo(() => buildTimeline(sheet?.sections ?? [], bpm), [sheet, bpm]);
  const hasTiming = timeline.cues.length > 0;

  // A YouTube link in the song promotes the recording to the transport's clock.
  // The stopwatch stays wired up underneath as the fallback for a video that
  // won't embed.
  const videoLink = useMemo(() => findYouTubeLink(sheet), [sheet]);
  const stopwatch = usePlayback(timeline.duration);
  // YouTube itself is never available offline, however the sheet got here.
  const video = useYouTubePlayback(playbackOpen && withVideo && !offline ? videoLink : null, timeline.duration);
  const videoDrivesPlayback = !!videoLink && withVideo && !offline && video.status !== "error";
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

  // Which layers are sounding right now. The song's cues own this while a timed
  // playback is running; the rest of the time it is the kit's own set, gated on
  // the kit's transport.
  const cueDriven = playbackOpen && cueEvents.length > 0;
  const soundingLayers = useMemo(
    () => (cueDriven ? activeLayers : kitPlaying ? new Set<string>(kit.layers) : NO_LAYERS),
    [cueDriven, activeLayers, kitPlaying, kit.layers],
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
            const startVol = localVolumeRef.current ?? kit.drums.volume;
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
            const targetVol = kit.drums.volume;
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
  }, [time, playbackOpen, cueEvents, kit.drums.volume]);

  const seekToLine = useCallback(
    (sectionIndex: number, lineIndex: number) => {
      const cueIndex = timeline.lineCue.get(lineKey(sectionIndex, lineIndex));
      if (cueIndex === undefined) return;
      seek(timeline.cues[cueIndex].start);
    },
    [timeline, seek]
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
      // The new section already has one empty line, so the caret goes there
      // rather than into a second blank one under it.
      setLineFocus({ sectionIndex: sectionAfter + 1, lineIndex: 0 });
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
    const next: LeadSheet = { ...sheet, sections, updated_at: new Date().toISOString() };
    if (!(await persistSheet(next))) return false;
    setSheet(next);
    return true;
  };

  /** The write behind commitSections, without touching what's on screen. */
  const persistSheet = async (next: LeadSheet): Promise<boolean> => {
    const sb = createClient()!;
    const { data, error } = await sb
      .from("lead_sheets")
      .update({ sections: next.sections, updated_at: next.updated_at })
      .eq("id", id)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) return false;
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
   * Lines edited in place show the change at once and write it behind the
   * scenes. Every edit reads the sheet as the last edit left it, not as the
   * last render saw it, and the writes go out one after another — so moving
   * straight from one line to the next can't lose the first.
   */
  const latestSheet = useRef<LeadSheet | null>(null);
  useEffect(() => {
    latestSheet.current = sheet;
  }, [sheet]);
  const lineWrites = useRef<Promise<void>>(Promise.resolve());

  const applyLineEdit = (
    edit: (sections: Section[]) => Section[] | null,
    failure: string
  ) => {
    const base = latestSheet.current;
    if (!base) return;
    const sections = edit(base.sections);
    if (!sections) return;
    const next: LeadSheet = { ...base, sections, updated_at: new Date().toISOString() };
    latestSheet.current = next;
    setSheet(next);
    lineWrites.current = lineWrites.current.then(async () => {
      let message: string | null = null;
      try {
        if (!(await persistSheet(next))) {
          message = "This song belongs to someone else, so it can't be edited here.";
        }
      } catch {
        message = failure;
      }
      if (!message) return;
      flashMoveError(message);
      // Put the song back as it was, unless something newer has already
      // been laid over this edit.
      if (latestSheet.current === next) {
        latestSheet.current = base;
        setSheet(base);
      }
    });
  };

  /**
   * Take a line out of the song — the bin beside it, or emptying it. The gap
   * isn't kept, since it would only be a blank line to tap past next time.
   * `expected` is what the line should say; if a save that landed first moved
   * something else into this spot, nothing is deleted.
   */
  const removeLine = ({ sectionIndex, lineIndex }: LinePos, expected?: string) => {
    applyLineEdit((sections) => {
      const section = sections[sectionIndex];
      if (!section) return null;
      const lines = (section.content ?? "").split("\n");
      if (lineIndex >= lines.length) return null;
      if (expected !== undefined && lines[lineIndex] !== expected) return null;
      lines.splice(lineIndex, 1);
      return sections.map((s, i) => (i === sectionIndex ? { ...s, content: lines.join("\n") } : s));
    }, "Couldn't remove that line — check your connection and try again.");
  };

  /**
   * A line left or entered in place. The same rules the line sheet had: an
   * emptied line is deleted, a new one left empty is never made, and a lone
   * [Chorus] starts a new part of the song. `andAnother` (Enter) opens a new
   * line underneath.
   */
  const commitLine = (pos: LinePos, text: string, insert: boolean, andAnother: boolean) => {
    const { sectionIndex, lineIndex } = pos;
    const stored = (latestSheet.current?.sections[sectionIndex]?.content ?? "").split("\n")[lineIndex];
    if (text.trim() === "") {
      if (!insert && stored !== undefined && stored.trim() !== "") removeLine(pos, stored);
      // Whatever was under a deleted line has moved up into its place, so
      // carrying on means the same index again.
      const gone = !insert && stored !== undefined && stored.trim() !== "";
      setLineDraft(andAnother ? { sectionIndex, lineIndex: gone || insert ? lineIndex : lineIndex + 1 } : null);
      return;
    }
    if (!insert && text === stored) {
      setLineDraft(andAnother ? { sectionIndex, lineIndex: lineIndex + 1 } : null);
      return;
    }
    const header = asSectionHeader(text);
    let split: ReturnType<typeof splitAtHeader> | null = null;
    applyLineEdit((sections) => {
      if (!sections[sectionIndex]) return null;
      if (header !== null) {
        split = splitAtHeader(sections, sectionIndex, lineIndex, insert, header);
        return split.sections;
      }
      return sections.map((section, i) => {
        if (i !== sectionIndex) return section;
        const lines = (section.content ?? "").split("\n");
        if (insert) lines.splice(lineIndex, 0, text);
        else lines[lineIndex] = text;
        return { ...section, content: lines.join("\n") };
      });
    }, "Couldn't save that line — check your connection and try again.");
    // Carrying on: after a header that's the first line of the part it just
    // started, otherwise the next line down.
    const made = split as ReturnType<typeof splitAtHeader> | null;
    if (!andAnother) setLineDraft(null);
    else if (made) setLineDraft({ sectionIndex: made.newIndex, lineIndex: made.newLineIndex });
    else setLineDraft({ sectionIndex, lineIndex: lineIndex + 1 });
  };

  const lineEditing: LineEditing = {
    draft: lineDraft,
    focus: lineFocus,
    onFocused: () => setLineFocus(null),
    onCommit: commitLine,
    onDelete: (pos, expected) => removeLine(pos, expected),
    onDraft: (pos) => setLineDraft(pos),
    onDiscardDraft: () => setLineDraft(null),
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
    setAutoPlay(params.get("play") === "1");
    // The Freeform page's own "Edit lines" segment lands here with this —
    // same door the old "Edit Lines" sidebar toggle used, just reachable
    // from the other page too now that the switch is shared chrome.
    if (params.get("mode") === "lines") setEditMode(true);
  }, [id]);

  const handleCopy = async () => {
    if (!sheet) return;
    await navigator.clipboard.writeText(getPlainText(sheet));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    // A private song's share link opens for nobody, so sharing it is what
    // makes it unlisted.
    if (sheet && (sheet.visibility ?? "private") === "private") {
      try {
        await createClient()!.from("lead_sheets").update({ visibility: "unlisted" }).eq("id", id);
        setSheet((prev) => (prev ? { ...prev, visibility: "unlisted" } : prev));
      } catch {
        // Offline or not the owner — the link is copied anyway; the picker on
        // the library page is where visibility ultimately gets fixed up.
      }
    }
    await navigator.clipboard.writeText(`${window.location.origin}/songwriter/share/${id}`);
    track("share", { method: "link", content_type: "song", item_id: id });
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

  // The tempo here is the song's tempo, so changing it here writes back to
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
        // Offline or not the owner — playback still runs at the new tempo.
      }
    }, 800);
  };

  useEffect(() => () => { if (bpmSaveTimer.current) clearTimeout(bpmSaveTimer.current); }, []);
  useEffect(() => () => { if (moveErrorTimer.current) clearTimeout(moveErrorTimer.current); }, []);

  /**
   * The kit is part of how the song is played, so it rides along on the sheet's
   * metadata rather than living on this device — someone opening the sheet on
   * stage gets the same beat, the same bass and the same voices.
   *
   * Written back under the four keys it was read from, which is what keeps the
   * arranger and the `Drums:` line in the song text working unchanged. Debounced
   * like the tempo, because a level slider fires on every pixel of a drag.
   */
  const updateKit = (next: KitSettings) => {
    setKit(next);
    const patch = kitToMetadata(next);
    setSheet((prev) => (prev ? { ...prev, metadata: { ...prev.metadata, ...patch } } : prev));
    if (kitSaveTimer.current) clearTimeout(kitSaveTimer.current);
    kitSaveTimer.current = setTimeout(async () => {
      const metadata = { ...sheet?.metadata, ...patch };
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

  useEffect(() => () => { if (kitSaveTimer.current) clearTimeout(kitSaveTimer.current); }, []);

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
        setKit(kitFromMetadata(data.metadata));
        setOffline(false);
        await cacheSheet(data);
      }
    } catch {
      const cached = await getCachedSheet(id);
      if (cached) {
        setSheet({ ...cached, sections: cached.sections.map(migrateSection) });
        setBpm(cached.tempo ? clampBpm(cached.tempo) : DEFAULT_BPM);
        setKit(kitFromMetadata(cached.metadata));
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

  // The reference's "drums" panel — now the kit's actual pattern grid,
  // tempo and volume, inlined directly rather than a dialog's summary row.
  const drumsPanel = (
    <PreviewSidebar
      open={drumsOpen}
      // Only ever called with false — the backdrop click that dismisses the
      // overlay on a narrow screen. A real close, so it persists.
      onOpenChange={() => closeDrums()}
      offline={offline}
      onArrange={() => goTo(router, `/songwriter/${id}/edit?arrange=1`)}
      fullscreen={fullscreen}
      onFullscreenChange={setFullscreen}
      hasTiming={hasTiming}
      videoLink={videoLink}
      withVideo={withVideo}
      onWithVideoToggle={() => setWithVideo((v) => !v)}
      playbackOpen={playbackOpen}
      onOpenPlayback={openPlayback}
      onClosePlayback={closePlayback}
      columnCount={columnCount}
      onColumnCountChange={updateColumnCount}
      columnWidthVw={columnWidthVw}
      onColumnWidthVwChange={updateColumnWidthVw}
      transposeSteps={transposeSteps}
      onTransposeStepsChange={setTransposeSteps}
      bpm={bpm}
      onBpmChange={updateBpm}
      kit={kit}
      onKitChange={updateKit}
      kitPlaying={kitPlaying}
      onKitPlayingChange={setKitPlaying}
      songKey={sheet?.key ?? null}
      transpose={transposeSteps}
      songTitle={sheet?.title ?? null}
      copied={copied}
      onCopy={handleCopy}
      shared={shared}
      onShare={handleShare}
      onPrint={() => printSong(sheet.title)}
    />
  );

  const libraryPanel = libraryOpen && (
    <LibraryDrawer
      activeId={id}
      // Auto-closes after picking a song on a narrow screen so the sheet
      // isn't left hidden behind the drawer — a side effect of the pick,
      // not a "keep this closed" statement, so it doesn't persist.
      onNavigate={() => { if (narrow()) setLibraryOpen(false); }}
      onClose={closeLibrary}
      sheets={librarySheets}
      visibleSheets={libraryVisibleSheets}
      query={libraryQuery}
      onQueryChange={setLibraryQuery}
      offline={libraryOffline}
      cachedIds={libraryCachedIds}
      onCreateSheet={createSheet}
    />
  );

  // Left out of fullscreen on purpose: that mode's job is to clear every
  // bit of chrome but the sheet (both panels are still one tap away there
  // via the rail this component no longer has — fullscreen keeps its own
  // minimal exit affordance below).
  const topBar = (
    <TopBar
      onLibraryClick={toggleLibrary}
      libraryOpen={libraryOpen}
      mode={editMode ? "lines" : "play"}
      onModeChange={(next) => {
        if (next === "free") {
          goTo(router, `/songwriter/${id}/edit`);
          return;
        }
        if (next === "lines") setEditMode(true);
        else leaveEditMode();
      }}
      rightSlot={
        !editMode ? (
          <div className={styles.sizectl} role='group' aria-label='Text size'>
            <Button
              variant='secondary'
              size='lg'
              onClick={() => { setAutoFit(false); updateFontScale(fontScale - 10); }}
              disabled={fontScale <= MIN_SCALE}
              aria-label='Smaller text'
            >
              A−
            </Button>
            <Button variant='secondary' size='lg'
              onClick={() => setAutoFit(true)}
              aria-pressed={autoFit}
            >
              Fit
            </Button>
            <Button variant='secondary' size='lg'
              onClick={() => { setAutoFit(false); updateFontScale(fontScale + 10); }}
              disabled={fontScale >= MAX_SCALE}
              aria-label='Larger text'
            >
              A+
            </Button>
          </div>
        ) : undefined
      }
      drumsOpen={drumsOpen}
      onDrumsToggle={toggleDrums}
      drumsPlaying={kitPlaying}
      onBackToSongs={() => goTo(router, "/songwriter")}
    />
  );

  return (
    <>
      {/* Print-only view: chrome-free layout that only renders when printing.
          The screen view below is hidden via print:hidden so only this prints. */}
      <div className='hidden print:block' style={{ background: "#fff", color: "var(--ds-palette-light-foreground)" }}>
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
            <div className='flex flex-col flex-1 min-w-0'>
              {editMode && <EditModeBanner error={moveError} onDone={leaveEditMode} className='px-6 sm:px-8' />}
              <div className='flex-1 overflow-y-auto overflow-x-hidden'>
                <div className='w-full px-6 py-8 sm:px-8' style={{ fontSize: `${fontScale}%` }}>
                  <LineDndProvider onMove={editMode ? moveLine : undefined} lineTextAt={lineTextAt}>
                    <SheetContent
                      sheet={sheet}
                      editing={editMode ? lineEditing : undefined}
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
                      kit={kit}
                    />
                  </LineDndProvider>
                </div>
                {playbackOpen && <div className='h-44' />}
              </div>
            </div>
            {drumsPanel}
          </div>
        ) : (
          <div className='flex flex-col flex-1 min-h-0'>
            {topBar}
            {/* The reference's `.body`: the library and drums panels sit beside
                the sheet as their own flex columns above 820px, and as
                absolutely-positioned overlay drawers below it (see
                `.sidePanel` in the CSS module). */}
            <div className='relative flex flex-1 min-h-0 overflow-hidden'>
              {libraryPanel}
              <div className='flex flex-col flex-1 min-w-0'>
                {editMode && <EditModeBanner error={moveError} onDone={leaveEditMode} className='px-6 sm:px-8' />}
                {/* Scrollable content — the reference's `.stage`. The scrollbar's
                    room is reserved even when there is nothing to scroll, so a
                    fit that adds or removes the scrollbar does not change the
                    width it was measured at and set off another fit. */}
                <div ref={stageRef} className='flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]'>
                  <div ref={sheetRef} className='w-full px-6 py-8 sm:px-8' style={{ fontSize: `${fontScale}%` }}>
                    <LineDndProvider onMove={editMode ? moveLine : undefined} lineTextAt={lineTextAt}>
                      <SheetContent
                        sheet={sheet}
                        editing={editMode ? lineEditing : undefined}
                        onMoveLine={editMode ? moveLine : undefined}
                        onAddSection={editMode ? setSectionAfter : undefined}
                        onEditSection={editMode ? setSectionEdit : undefined}
                        fullscreen={false}
                        columnCount={columnCount}
                        columnWidthVw={autoFit ? undefined : columnWidthVw}
                        transposeSteps={transposeSteps}
                        timeline={playbackOpen ? timeline : undefined}
                        activeCueIndex={activeCueIndex}
                        onSeekToLine={playbackOpen ? seekToLine : undefined}
                        bpm={bpm}
                        kit={kit}
                      />
                    </LineDndProvider>
                  </div>
                  {playbackOpen && <div className='h-44' />}
                </div>
              </div>
              {drumsPanel}
            </div>
          </div>
        )}

        {/* The kit, playing. Mounted here rather than inside the designer so
            that closing the designer does not stop the music, and outside the
            sidebar so that collapsing the sidebar does not either. */}
        <KitPlayer
          kit={kit}
          layers={soundingLayers}
          bpm={bpm}
          drumVolume={localVolume}
          songKey={sheet?.key ?? null}
          transpose={transposeSteps}
        />

        {playbackOpen && videoLink && withVideo && !offline && (
          <YouTubePanel link={videoLink} status={video.status} mount={video.mount} />
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
