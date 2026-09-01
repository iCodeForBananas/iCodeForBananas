"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Copy,
  Link2,
  Maximize2,
  Mic,
  Minimize2,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  PencilLine,
  Play,
  Plus,
  Printer,
  Youtube,
} from "lucide-react";
import { OfflineBadge } from "./shared";
import type { YouTubeLink } from "./youtube";
import type { Chord } from "./progression";
import { MetronomeControl } from "./Metronome";
import { ShimmerControl } from "./accents";
import { DrumMachineControl, type DrumSettings } from "./DrumMachine";
import { StringPadsControl, type StringPadsSettings } from "./StringPads";
import { SubBassControl, type SubBassSettings } from "./SubBass";

export const MIN_SCALE = 70;
export const MAX_SCALE = 160;
const SCALE_STEP = 10;

export const MIN_COLUMN_COUNT = 1;
export const MAX_COLUMN_COUNT = 4;
export const DEFAULT_COLUMN_COUNT = 2;

export const MIN_COLUMN_WIDTH_VW = 15;
export const MAX_COLUMN_WIDTH_VW = 50;
const COLUMN_WIDTH_VW_STEP = 5;
export const DEFAULT_COLUMN_WIDTH_VW = 30;

/** Width of the open sidebar; the collapsed rail is just wide enough to hold its toggle. */
const OPEN_WIDTH = "w-[19rem]";
const RAIL_WIDTH = "w-14";

/** Full-width row button — the shape every plain action in the sidebar takes. */
const ROW_BTN =
  "h-9 w-full flex items-center gap-2 px-2.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200 transition-colors duration-150";

/** One labelled block of the sidebar — the unit the whole column scrolls through. */
function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className='border-b border-gray-200 dark:border-neutral-800 px-3 py-3'>
      <h2 className='mb-2 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-neutral-500 select-none'>
        {title}
      </h2>
      <div className='flex flex-col gap-2'>{children}</div>
    </section>
  );
}

function ColumnCountControl({ count, onChange }: { count: number; onChange: (next: number) => void }) {
  return (
    <div className='flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 dark:border-neutral-700 px-1.5 py-1 print:hidden'>
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
    <div className='flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 dark:border-neutral-700 px-1.5 py-1 print:hidden'>
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
    <div className='flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 dark:border-neutral-700 px-1.5 py-1 print:hidden'>
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
    <div className='flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 dark:border-neutral-700 px-1.5 py-1 print:hidden'>
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
  const playBtnClass = `h-10 flex-1 flex items-center justify-center gap-1.5 px-3 text-sm font-medium transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed ${
    videoLink ? "rounded-l-lg" : "rounded-lg"
  } ${
    open
      ? "bg-yellow-400 text-black hover:bg-yellow-300"
      : "bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200"
  }`;

  return (
    <div className='flex w-full items-center print:hidden'>
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
      className={`h-9 w-full flex items-center gap-2 px-2.5 rounded-lg text-sm font-medium transition-colors duration-150 print:hidden ${
        active
          ? "bg-yellow-400 text-black hover:bg-yellow-300"
          : "bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200"
      }`}
    >
      <PencilLine className='w-4 h-4' />
      {active ? "Editing" : "Edit Lines"}
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
      className={`${ROW_BTN} justify-between disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-100 dark:disabled:hover:bg-neutral-800 print:hidden`}
    >
      {isLast ? "End of Set" : `Next Song (${pos + 2} of ${setIds.length})`}
      {!isLast && <ArrowRight className='w-4 h-4' />}
    </button>
  );
}

export interface PreviewSidebarProps {
  /** Collapsed, the sidebar keeps a rail with just the toggle on it. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  offline: boolean;

  // Song
  onAllSheets: () => void;
  onOpenEditor: () => void;
  onArrange: () => void;
  fullscreen: boolean;
  onFullscreenChange: (next: boolean) => void;

  // Playback
  hasTiming: boolean;
  videoLink: YouTubeLink | null;
  withVideo: boolean;
  onWithVideoToggle: () => void;
  playbackOpen: boolean;
  onOpenPlayback: () => void;
  onClosePlayback: () => void;
  /** The setlist this song is being read from, when it came from one. */
  setIds: string[] | null;
  setPos: number;
  onNextSong: (nextId: string, nextPos: number) => void;

  // Display
  fontScale: number;
  onFontScaleChange: (next: number) => void;
  columnCount: number;
  onColumnCountChange: (next: number) => void;
  columnWidthVw: number;
  onColumnWidthVwChange: (next: number) => void;
  transposeSteps: number;
  onTransposeStepsChange: (next: number) => void;

  // Audio
  bpm: number;
  onBpmChange: (next: number) => void;
  beatsPerBar: number;
  onBeatsPerBarChange: (next: number) => void;
  metronomeOn: boolean;
  onMetronomeToggle: () => void;
  drumRunning: boolean;
  onDrumToggle: () => void;
  /** The kit as it sounds right now — cue tags may be driving it. */
  drumSettings: DrumSettings;
  /** What the shimmer control edits: the song's own setting, not the cued one. */
  shimmerVariation: string;
  onDrumSettingsChange: (patch: Partial<DrumSettings>) => void;
  clapsRunning: boolean;
  onClapsToggle: () => void;
  shimmerRunning: boolean;
  onShimmerToggle: () => void;
  stringsRunning: boolean;
  onStringsToggle: () => void;
  stringSettings: StringPadsSettings;
  onStringSettingsChange: (patch: Partial<StringPadsSettings>) => void;
  songKey: string | null;
  progression: Chord[];
  subRunning: boolean;
  onSubToggle: () => void;
  subBassSettings: SubBassSettings;
  onSubBassSettingsChange: (patch: Partial<SubBassSettings>) => void;

  // Edit
  editMode: boolean;
  onEditModeToggle: () => void;

  // Share
  copied: boolean;
  onCopy: () => void;
  shared: boolean;
  onShare: () => void;
  onPrint: () => void;
}

/**
 * Every preview tool, in one scrollable column down the left of the sheet.
 * Sections stack in the order a song gets used: get out, play it, read it,
 * hear it, fix it, hand it on. On a phone the open sidebar covers the sheet
 * like a drawer; from `sm` up it takes its own column beside it.
 */
export default function PreviewSidebar(props: PreviewSidebarProps) {
  const { open, onOpenChange } = props;
  return (
    <>
      {open && (
        <div
          className='absolute inset-0 z-30 bg-black/40 sm:hidden print:hidden'
          onClick={() => onOpenChange(false)}
          aria-hidden='true'
        />
      )}
      <aside
        aria-label='Preview tools'
        className={`flex flex-col shrink-0 border-r border-gray-200 dark:border-neutral-800 bg-white dark:bg-black print:hidden ${
          open ? `absolute inset-y-0 left-0 z-40 ${OPEN_WIDTH} sm:static sm:z-auto` : RAIL_WIDTH
        }`}
      >
        {/* Which song this is, and the switch that gets the tools out of the way.
            The app's own menu button floats over the top-left corner on a phone,
            so the toggle starts below the band it occupies. */}
        <div className='flex items-center gap-2 border-b border-gray-200 dark:border-neutral-800 px-2.5 py-2 pt-[46px] sm:pt-2'>
          <button
            type='button'
            onClick={() => onOpenChange(!open)}
            aria-expanded={open}
            title={open ? "Hide tools" : "Show tools"}
            aria-label={open ? "Hide tools" : "Show tools"}
            className='h-9 w-9 shrink-0 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-500 dark:text-neutral-400 transition-colors duration-150'
          >
            {open ? <PanelLeftClose className='w-4 h-4' /> : <PanelLeftOpen className='w-4 h-4' />}
          </button>
          {open && (
            <div className='flex min-w-0 items-center gap-2'>
              {props.offline && <OfflineBadge />}
              <span className='truncate text-sm font-semibold text-gray-800 dark:text-neutral-100'>{props.title}</span>
            </div>
          )}
        </div>

        {open && (
          <div className='flex-1 overflow-y-auto overscroll-contain'>
            <SidebarSection title='Song'>
              <button type='button' onClick={props.onAllSheets} className={ROW_BTN}>
                <ArrowLeft className='w-4 h-4' /> All Sheets
              </button>
              <button
                type='button'
                onClick={() => props.onFullscreenChange(!props.fullscreen)}
                className={ROW_BTN}
              >
                {props.fullscreen ? (
                  <>
                    <Minimize2 className='w-4 h-4' /> Exit Fullscreen
                  </>
                ) : (
                  <>
                    <Maximize2 className='w-4 h-4' /> Fullscreen
                  </>
                )}
              </button>
            </SidebarSection>

            <SidebarSection title='Playback'>
              <PlayControl
                hasTiming={props.hasTiming}
                videoLink={props.videoLink}
                withVideo={props.withVideo}
                onWithVideoToggle={props.onWithVideoToggle}
                open={props.playbackOpen}
                onOpen={props.onOpenPlayback}
                onClose={props.onClosePlayback}
              />
              {props.setIds && (
                <NextSongControl setIds={props.setIds} pos={props.setPos} onNext={props.onNextSong} />
              )}
            </SidebarSection>

            <SidebarSection title='Display'>
              <FontScaleControl scale={props.fontScale} onChange={props.onFontScaleChange} />
              <ColumnCountControl count={props.columnCount} onChange={props.onColumnCountChange} />
              <ColumnWidthControl width={props.columnWidthVw} onChange={props.onColumnWidthVwChange} />
              <TransposeControl steps={props.transposeSteps} onChange={props.onTransposeStepsChange} />
            </SidebarSection>

            <SidebarSection title='Audio'>
              <MetronomeControl
                bpm={props.bpm}
                onBpmChange={props.onBpmChange}
                beatsPerBar={props.beatsPerBar}
                onBeatsPerBarChange={props.onBeatsPerBarChange}
                running={props.metronomeOn}
                onToggle={props.onMetronomeToggle}
              />
              <DrumMachineControl
                bpm={props.bpm}
                running={props.drumRunning}
                onToggle={props.onDrumToggle}
                settings={props.drumSettings}
                onSettingsChange={props.onDrumSettingsChange}
                clapsEnabled={props.clapsRunning}
                shimmerEnabled={props.shimmerRunning}
              />
              <button
                type='button'
                onClick={props.onClapsToggle}
                title='Hand claps on beats 2 & 4'
                className={`h-9 w-full px-2.5 text-sm font-medium rounded-lg border text-left transition-colors duration-100 ${
                  props.clapsRunning
                    ? "bg-amber-400 text-white border-amber-400"
                    : "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 border-gray-200 dark:border-neutral-700 hover:bg-gray-200 dark:hover:bg-neutral-700"
                }`}
              >
                Claps
              </button>
              <ShimmerControl
                running={props.shimmerRunning}
                onToggle={props.onShimmerToggle}
                variation={props.shimmerVariation}
                onVariationChange={(shimmer) => props.onDrumSettingsChange({ shimmer })}
                bpm={props.bpm}
              />
              <StringPadsControl
                songKey={props.songKey}
                progression={props.progression}
                bpm={props.bpm}
                beatsPerBar={props.beatsPerBar}
                running={props.stringsRunning}
                onToggle={props.onStringsToggle}
                settings={props.stringSettings}
                onSettingsChange={props.onStringSettingsChange}
              />
              <SubBassControl
                bpm={props.bpm}
                beatsPerBar={props.beatsPerBar}
                transposeSteps={props.transposeSteps}
                running={props.subRunning}
                onToggle={props.onSubToggle}
                settings={props.subBassSettings}
                onSettingsChange={props.onSubBassSettingsChange}
              />
              <button
                type='button'
                onClick={props.onArrange}
                title='Lay the song out on tracks and record takes onto them'
                className={ROW_BTN}
              >
                <Mic className='w-4 h-4' /> Arrange
              </button>
            </SidebarSection>

            <SidebarSection title='Edit'>
              <LineEditControl active={props.editMode} onToggle={props.onEditModeToggle} />
              <button
                type='button'
                onClick={props.onOpenEditor}
                className='h-9 w-full flex items-center gap-2 px-2.5 rounded-lg text-sm font-medium bg-black hover:bg-black/80 text-yellow-400 transition-colors duration-150'
              >
                <Pencil className='w-4 h-4' /> Open Editor
              </button>
            </SidebarSection>

            <SidebarSection title='Share'>
              <button
                type='button'
                onClick={props.onCopy}
                className={`h-9 w-full flex items-center gap-2 px-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                  props.copied
                    ? "bg-blue-100 hover:bg-blue-200 text-blue-700"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200"
                }`}
              >
                {props.copied ? <Check className='w-4 h-4' /> : <Copy className='w-4 h-4' />}
                {props.copied ? "Copied!" : "Copy Text"}
              </button>
              <button
                type='button'
                onClick={props.onShare}
                className={`h-9 w-full flex items-center gap-2 px-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                  props.shared
                    ? "bg-blue-100 hover:bg-blue-200 text-blue-700"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200"
                }`}
              >
                {props.shared ? <Check className='w-4 h-4' /> : <Link2 className='w-4 h-4' />}
                {props.shared ? "Link Copied!" : "Share"}
              </button>
              <button type='button' onClick={props.onPrint} className={ROW_BTN}>
                <Printer className='w-4 h-4' /> Print
              </button>
            </SidebarSection>
          </div>
        )}
      </aside>
    </>
  );
}
