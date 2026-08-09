"use client";

import { memo, useCallback, useEffect, useMemo, useState, use } from "react";
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
} from "lucide-react";
import { type LeadSheet, type Section, migrateSection, ChordLyricLine, getPlainText, OfflineBadge } from "../../shared";
import { cacheSheet, getCachedSheet } from "../../offlineCache";
import { transposeText } from "../../../lib/transpose";
import { buildTimeline, cueAt, lineKey, type Timeline } from "../../timing";
import { PlaybackBar, usePlayback, usePlaybackKeys } from "../../PlaybackBar";

// Per-song localStorage keys: leadSheet:${id}:fontScale, leadSheet:${id}:columnCount, leadSheet:${id}:columnWidthVw

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

function ColumnCountControl({ count, onChange }: { count: number; onChange: (next: number) => void }) {
  return (
    <div className='flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 px-1.5 py-1 print:hidden'>
      <span className='text-sm font-medium text-gray-700 dark:text-gray-200 select-none'>Cols</span>
      <button
        type='button'
        onClick={() => onChange(count - 1)}
        disabled={count <= MIN_COLUMN_COUNT}
        className='h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-100 dark:disabled:hover:bg-gray-800'
        aria-label='Decrease column count'
      >
        <Minus className='w-4 h-4' />
      </button>
      <span className='text-sm font-medium w-6 text-center text-gray-700 dark:text-gray-200 select-none'>{count}</span>
      <button
        type='button'
        onClick={() => onChange(count + 1)}
        disabled={count >= MAX_COLUMN_COUNT}
        className='h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-100 dark:disabled:hover:bg-gray-800'
        aria-label='Increase column count'
      >
        <Plus className='w-4 h-4' />
      </button>
    </div>
  );
}

function ColumnWidthControl({ width, onChange }: { width: number; onChange: (next: number) => void }) {
  return (
    <div className='flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 px-1.5 py-1 print:hidden'>
      <span className='text-sm font-medium text-gray-700 dark:text-gray-200 select-none'>Width</span>
      <button
        type='button'
        onClick={() => onChange(width - COLUMN_WIDTH_VW_STEP)}
        disabled={width <= MIN_COLUMN_WIDTH_VW}
        className='h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-100 dark:disabled:hover:bg-gray-800'
        aria-label='Decrease column width'
      >
        <Minus className='w-4 h-4' />
      </button>
      <span className='text-sm font-medium w-14 text-center text-gray-700 dark:text-gray-200 select-none'>{width}vw</span>
      <button
        type='button'
        onClick={() => onChange(width + COLUMN_WIDTH_VW_STEP)}
        disabled={width >= MAX_COLUMN_WIDTH_VW}
        className='h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-100 dark:disabled:hover:bg-gray-800'
        aria-label='Increase column width'
      >
        <Plus className='w-4 h-4' />
      </button>
    </div>
  );
}

function FontScaleControl({ scale, onChange }: { scale: number; onChange: (next: number) => void }) {
  return (
    <div className='flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 px-1.5 py-1 print:hidden'>
      <span className='text-sm font-medium text-gray-700 dark:text-gray-200 select-none'>Size</span>
      <button
        type='button'
        onClick={() => onChange(scale - SCALE_STEP)}
        disabled={scale <= MIN_SCALE}
        className='h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-100 dark:disabled:hover:bg-gray-800'
        aria-label='Decrease text size'
      >
        <Minus className='w-4 h-4' />
      </button>
      <span className='text-sm font-medium w-12 text-center text-gray-700 dark:text-gray-200 select-none'>{scale}%</span>
      <button
        type='button'
        onClick={() => onChange(scale + SCALE_STEP)}
        disabled={scale >= MAX_SCALE}
        className='h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-100 dark:disabled:hover:bg-gray-800'
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
    <div className='flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 px-1.5 py-1 print:hidden'>
      <button
        type='button'
        onClick={() => onChange(steps - 1)}
        title='Transpose down one semitone'
        aria-label='Transpose down one semitone'
        className='h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium transition-colors duration-150'
      >
        <ArrowDown className='w-4 h-4' />
      </button>
      <span className='text-sm font-medium px-1 text-center text-gray-700 dark:text-gray-200 select-none whitespace-nowrap'>
        Transpose {offsetLabel}
      </span>
      <button
        type='button'
        onClick={() => onChange(steps + 1)}
        title='Transpose up one semitone'
        aria-label='Transpose up one semitone'
        className='h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium transition-colors duration-150'
      >
        <ArrowUp className='w-4 h-4' />
      </button>
    </div>
  );
}

function PlayControl({
  hasTiming,
  open,
  onOpen,
  onClose,
}: {
  hasTiming: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <button
      type='button'
      onClick={open ? onClose : onOpen}
      disabled={!hasTiming}
      title={
        hasTiming
          ? "Follow along in time with the song"
          : "Add @0:12 style timings to lines in the editor to enable playback"
      }
      className={`h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed print:hidden ${
        open
          ? "bg-yellow-400 text-black hover:bg-yellow-300"
          : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
      }`}
    >
      <Play className='w-4 h-4' />
      {open ? "Playing" : "Play"}
    </button>
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
      className='h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-100 dark:disabled:hover:bg-gray-800 print:hidden'
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
}) {
  const columnsActive = !!(columnCount || columnWidthVw);
  return (
    <div>
      <div className={`mb-8 border-b-2 border-black dark:border-gray-600 pb-6 ${columnsActive ? "max-w-3xl mx-auto" : ""}`}>
        <h1
          className={`font-bold leading-tight mb-3 text-black dark:text-gray-100 ${fullscreen ? "text-[3em]" : "text-[2.25em]"}`}
        >
          {sheet.title || "Untitled"}
        </h1>
        <div className='flex flex-wrap gap-6 text-[0.875em]'>
          {sheet.key && (
            <span>
              <span className='uppercase tracking-wider text-[0.75em] text-black/50 dark:text-white/40 mr-1'>Key</span>
              <span className='font-bold text-black dark:text-gray-100 text-[1em]'>{sheet.key}</span>
            </span>
          )}
          {sheet.tempo && (
            <span>
              <span className='uppercase tracking-wider text-[0.75em] text-black/50 dark:text-white/40 mr-1'>Tempo</span>
              <span className='font-bold text-black dark:text-gray-100 text-[1em]'>{sheet.tempo} BPM</span>
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
              <div className='space-y-3 overflow-x-auto'>
                {lines.map((line, i) => {
                  if (line.trim() === "") return <div key={i} className='h-3' />;
                  const cueIndex = timeline?.lineCue.get(lineKey(sectionIndex, i));
                  const active = cueIndex !== undefined && cueIndex === activeCueIndex;
                  return (
                    <div
                      key={i}
                      data-active-cue={active || undefined}
                      onClick={
                        cueIndex !== undefined && onSeekToLine
                          ? () => onSeekToLine(sectionIndex, i)
                          : undefined
                      }
                      className={`-mx-2 rounded px-2 transition-colors duration-150 ${
                        active
                          ? "bg-yellow-200/70 shadow-[inset_3px_0_0_0_#facc15] dark:bg-yellow-400/20"
                          : ""
                      } ${cueIndex !== undefined && onSeekToLine ? "cursor-pointer print:cursor-auto" : ""}`}
                    >
                      <ChordLyricLine
                        line={transposeSteps !== 0 ? transposeText(line, transposeSteps) : line}
                        large={fullscreen}
                        showTime={!!timeline}
                      />
                    </div>
                  );
                })}
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
  const [setIds, setSetIds] = useState<string[] | null>(null);
  const [setPos, setSetPos] = useState(0);
  const [playbackOpen, setPlaybackOpen] = useState(false);
  const [follow, setFollow] = useState(true);
  const [autoPlay, setAutoPlay] = useState(false);

  // ─── Timed playback ─────────────────────────────────────────────────────────

  const timeline = useMemo(() => buildTimeline(sheet?.sections ?? []), [sheet]);
  const hasTiming = timeline.cues.length > 0;
  const playback = usePlayback(timeline.duration);
  const { seek, toggle, stop, time } = playback;
  const activeCue = playbackOpen ? cueAt(timeline, time) : null;
  const activeCueIndex = activeCue?.index ?? null;
  usePlaybackKeys(playback, playbackOpen);

  const seekToLine = useCallback(
    (sectionIndex: number, lineIndex: number) => {
      const cueIndex = timeline.lineCue.get(lineKey(sectionIndex, lineIndex));
      if (cueIndex === undefined) return;
      seek(timeline.cues[cueIndex].start);
    },
    [timeline, seek]
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

  // Arriving from the editor's Play button: open the transport and start rolling
  // once the sheet (and therefore the timeline) is actually loaded.
  useEffect(() => {
    if (!autoPlay || !hasTiming || playbackOpen) return;
    setAutoPlay(false);
    setPlaybackOpen(true);
    seek(0);
    toggle();
  }, [autoPlay, hasTiming, playbackOpen, seek, toggle]);

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
        setOffline(false);
        await cacheSheet(data);
      }
    } catch {
      const cached = await getCachedSheet(id);
      if (cached) {
        setSheet({ ...cached, sections: cached.sections.map(migrateSection) });
        setOffline(true);
      }
    }
    setLoading(false);
  }

  if (authLoading || loading) {
    return (
      <div className='flex flex-col flex-1 min-h-0 bg-white dark:bg-gray-900'>
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
      <div className='flex flex-col flex-1 min-h-0 bg-white dark:bg-gray-900'>
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
          <div className='fixed inset-0 z-50 bg-white dark:bg-gray-900 overflow-y-auto'>
            <div className='w-full py-8'>
              {/* Toolbar (kept constrained while content below goes full-width) */}
              <div className='max-w-3xl mx-auto px-4'>
              <div className='flex flex-wrap items-center justify-between gap-3 mb-8'>
                <button
                  onClick={() => setFullscreen(false)}
                  className='h-10 flex items-center gap-2 px-3 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors duration-150 text-sm font-medium'
                >
                  <ArrowLeft className='w-4 h-4' />
                  Exit Fullscreen
                </button>
                {offline && <OfflineBadge />}
                <div className='flex flex-wrap items-center gap-2'>
                  <FontScaleControl scale={fontScale} onChange={updateFontScale} />
                  <ColumnCountControl count={columnCount} onChange={updateColumnCount} />
                  <ColumnWidthControl width={columnWidthVw} onChange={updateColumnWidthVw} />
                  <TransposeControl steps={transposeSteps} onChange={setTransposeSteps} />
                  <PlayControl hasTiming={hasTiming} open={playbackOpen} onOpen={openPlayback} onClose={closePlayback} />
                  <div className='w-px self-stretch bg-gray-300 dark:bg-gray-600' />
                  {setIds && <NextSongControl setIds={setIds} pos={setPos} onNext={goToNextSong} />}
                  <button
                    onClick={handleCopy}
                    className={`h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium transition-colors duration-150 ${
                      copied
                        ? "bg-blue-100 hover:bg-blue-200 text-blue-700"
                        : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                    }`}
                  >
                    {copied ? <Check className='w-4 h-4' /> : <Copy className='w-4 h-4' />}
                    {copied ? "Copied!" : "Copy Text"}
                  </button>
                  <button
                    onClick={handleShare}
                    className={`h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium transition-colors duration-150 ${
                      shared
                        ? "bg-blue-100 hover:bg-blue-200 text-blue-700"
                        : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                    }`}
                  >
                    {shared ? <Check className='w-4 h-4' /> : <Link2 className='w-4 h-4' />}
                    {shared ? "Link Copied!" : "Share"}
                  </button>
                  <button
                    onClick={() => window.print()}
                    className='h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors duration-150'
                  >
                    <Printer className='w-4 h-4' /> Print
                  </button>
                  <button
                    onClick={() => setFullscreen(false)}
                    className='h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors duration-150'
                  >
                    <Minimize2 className='w-4 h-4' /> Exit
                  </button>
                  <div className='w-px self-stretch bg-gray-300 dark:bg-gray-600' />
                  <button
                    onClick={() => router.push(`/lead-sheet-editor/${id}/edit`)}
                    className='h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium bg-black hover:bg-black/80 text-yellow-400 transition-colors duration-150'
                  >
                    <Pencil className='w-4 h-4' />
                    Edit
                  </button>
                </div>
              </div>
              </div>
              <div style={{ fontSize: `${fontScale}%` }}>
                <SheetContent
                  sheet={sheet}
                  fullscreen
                  columnCount={columnCount}
                  columnWidthVw={columnWidthVw}
                  transposeSteps={transposeSteps}
                  timeline={playbackOpen ? timeline : undefined}
                  activeCueIndex={activeCueIndex}
                  onSeekToLine={playbackOpen ? seekToLine : undefined}
                />
              </div>
              {playbackOpen && <div className='h-44' />}
            </div>
          </div>
        ) : (
          <div className='flex flex-col flex-1 min-h-0 p-0 sm:p-4'>
            <div
              className='flex flex-col flex-1 min-h-0 rounded-none border-none bg-white dark:bg-gray-900 overflow-hidden'
            >
              {/* Toolbar */}
              <div className='shrink-0'>
                <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-4'>
                  <button
                    onClick={() => router.push("/lead-sheet-editor")}
                    className='h-10 flex items-center gap-2 px-3 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors duration-150 text-sm font-medium'
                  >
                    <ArrowLeft className='w-4 h-4' />
                    All Sheets
                  </button>
                  {offline && <OfflineBadge />}
                  <div className='flex flex-wrap items-center gap-2'>
                    <FontScaleControl scale={fontScale} onChange={updateFontScale} />
                    <ColumnCountControl count={columnCount} onChange={updateColumnCount} />
                    <ColumnWidthControl width={columnWidthVw} onChange={updateColumnWidthVw} />
                    <TransposeControl steps={transposeSteps} onChange={setTransposeSteps} />
                    <PlayControl hasTiming={hasTiming} open={playbackOpen} onOpen={openPlayback} onClose={closePlayback} />
                    <div className='w-px self-stretch bg-gray-300 dark:bg-gray-600' />
                    {setIds && <NextSongControl setIds={setIds} pos={setPos} onNext={goToNextSong} />}
                    <button
                      onClick={handleCopy}
                      className={`h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium transition-colors duration-150 ${
                        copied
                          ? "bg-blue-100 hover:bg-blue-200 text-blue-700"
                          : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                      }`}
                    >
                      {copied ? <Check className='w-4 h-4' /> : <Copy className='w-4 h-4' />}
                      {copied ? "Copied!" : "Copy Text"}
                    </button>
                    <button
                      onClick={handleShare}
                      className={`h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium transition-colors duration-150 ${
                        shared
                          ? "bg-blue-100 hover:bg-blue-200 text-blue-700"
                          : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                      }`}
                    >
                      {shared ? <Check className='w-4 h-4' /> : <Link2 className='w-4 h-4' />}
                      {shared ? "Link Copied!" : "Share"}
                    </button>
                    <button
                      onClick={() => window.print()}
                      className='h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors duration-150'
                    >
                      <Printer className='w-4 h-4' /> Print
                    </button>
                    <button
                      onClick={() => setFullscreen(true)}
                      className='h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors duration-150'
                    >
                      <Maximize2 className='w-4 h-4' /> Fullscreen
                    </button>
                    <div className='w-px self-stretch bg-gray-300 dark:bg-gray-600' />
                    <button
                      onClick={() => router.push(`/lead-sheet-editor/${id}/edit`)}
                      className='h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium bg-black hover:bg-black/80 text-yellow-400 transition-colors duration-150'
                    >
                      <Pencil className='w-4 h-4' />
                      Edit
                    </button>
                  </div>
                </div>
              </div>

              {/* Scrollable content */}
              <div className='flex-1 overflow-auto'>
                <div className='w-full py-8 px-4 sm:px-0' style={{ fontSize: `${fontScale}%` }}>
                  <SheetContent
                    sheet={sheet}
                    fullscreen={false}
                    columnCount={columnCount}
                    columnWidthVw={columnWidthVw}
                    transposeSteps={transposeSteps}
                    timeline={playbackOpen ? timeline : undefined}
                    activeCueIndex={activeCueIndex}
                    onSeekToLine={playbackOpen ? seekToLine : undefined}
                  />
                  {playbackOpen && <div className='h-44' />}
                </div>
              </div>
            </div>
          </div>
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
