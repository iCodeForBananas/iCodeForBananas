"use client";

import {
  ArrowDown,
  ArrowLeft,
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
  Sliders,
  Square,
  Youtube,
} from "lucide-react";
import { Button, Flex, IconButton, Text } from "@radix-ui/themes";
import { OfflineBadge } from "./shared";
import type { YouTubeLink } from "./youtube";
import { TempoControl } from "./Tempo";
import { KIT_LAYERS, LAYER_LABELS, hasLayer, matchesPreset, type KitSettings } from "./kit";
import { ControlRow, RowButton } from "./SidebarRows";

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

/** A square −/+ step button beside a value. */
function StepButton(props: React.ComponentProps<typeof IconButton>) {
  return <IconButton type='button' size='3' variant='soft' color='gray' {...props} />;
}

/** A value with a step button on each side: text size, columns, transpose. */
function Stepper({
  label,
  value,
  decrease,
  increase,
}: {
  label: string;
  value: React.ReactNode;
  decrease: React.ComponentProps<typeof IconButton>;
  increase: React.ComponentProps<typeof IconButton>;
}) {
  return (
    <ControlRow label={label}>
      <StepButton {...decrease} />
      <Text size='2' weight='medium' align='center' className='select-none whitespace-nowrap tabular-nums'>
        {value}
      </Text>
      <StepButton {...increase} />
    </ControlRow>
  );
}

/** One labelled block of the sidebar — the unit the whole column scrolls through. */
function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <Text as='div' size='1' weight='bold' color='gray' className='px-3 pt-4 pb-1.5 uppercase tracking-widest select-none'>
        {title}
      </Text>
      <div className='divide-y divide-line-subtle border-y border-line-subtle'>{children}</div>
    </section>
  );
}

function ColumnCountControl({ count, onChange }: { count: number; onChange: (next: number) => void }) {
  return (
    <Stepper
      label='Columns'
      value={count}
      decrease={{
        onClick: () => onChange(count - 1),
        disabled: count <= MIN_COLUMN_COUNT,
        "aria-label": "Decrease column count",
        children: <Minus className='w-4 h-4' />,
      }}
      increase={{
        onClick: () => onChange(count + 1),
        disabled: count >= MAX_COLUMN_COUNT,
        "aria-label": "Increase column count",
        children: <Plus className='w-4 h-4' />,
      }}
    />
  );
}

function ColumnWidthControl({ width, onChange }: { width: number; onChange: (next: number) => void }) {
  return (
    <Stepper
      label='Width'
      value={`${width}vw`}
      decrease={{
        onClick: () => onChange(width - COLUMN_WIDTH_VW_STEP),
        disabled: width <= MIN_COLUMN_WIDTH_VW,
        "aria-label": "Decrease column width",
        children: <Minus className='w-4 h-4' />,
      }}
      increase={{
        onClick: () => onChange(width + COLUMN_WIDTH_VW_STEP),
        disabled: width >= MAX_COLUMN_WIDTH_VW,
        "aria-label": "Increase column width",
        children: <Plus className='w-4 h-4' />,
      }}
    />
  );
}

function FontScaleControl({ scale, onChange }: { scale: number; onChange: (next: number) => void }) {
  return (
    <Stepper
      label='Size'
      value={`${scale}%`}
      decrease={{
        onClick: () => onChange(scale - SCALE_STEP),
        disabled: scale <= MIN_SCALE,
        "aria-label": "Decrease text size",
        children: <Minus className='w-4 h-4' />,
      }}
      increase={{
        onClick: () => onChange(scale + SCALE_STEP),
        disabled: scale >= MAX_SCALE,
        "aria-label": "Increase text size",
        children: <Plus className='w-4 h-4' />,
      }}
    />
  );
}

function TransposeControl({ steps, onChange }: { steps: number; onChange: (next: number) => void }) {
  const offsetLabel = steps > 0 ? `+${steps}` : steps < 0 ? `${steps}` : "±0";
  return (
    <Stepper
      label='Transpose'
      value={offsetLabel}
      decrease={{
        onClick: () => onChange(steps - 1),
        title: "Transpose down one semitone",
        "aria-label": "Transpose down one semitone",
        children: <ArrowDown className='w-4 h-4' />,
      }}
      increase={{
        onClick: () => onChange(steps + 1),
        title: "Transpose up one semitone",
        "aria-label": "Transpose up one semitone",
        children: <ArrowUp className='w-4 h-4' />,
      }}
    />
  );
}

function PlayControl({
  hasTiming,
  videoLink,
  withVideo,
  onWithVideoToggle,
  offline,
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
  /** YouTube itself needs a live connection, whatever the sheet's own source. */
  offline: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <Flex className='w-full items-stretch print:hidden'>
      <RowButton
        active={open}
        onClick={open ? onClose : onOpen}
        disabled={!hasTiming}
        title={
          !hasTiming
            ? "Add @0:12 style timings to lines in the editor to enable playback"
            : "Follow along in time with the song"
        }
        className='flex-1'
      >
        <Play className='w-4 h-4' />
        {open ? "Playing" : "Play"}
      </RowButton>
      {videoLink && (
        <IconButton
          type='button'
          size='3'
          variant={withVideo && !offline ? "soft" : "ghost"}
          color={withVideo && !offline ? "red" : "gray"}
          onClick={onWithVideoToggle}
          disabled={offline}
          aria-pressed={withVideo && !offline}
          aria-label={
            offline
              ? "Video needs a connection"
              : withVideo
                ? "Play without the YouTube video"
                : "Play with the linked YouTube video"
          }
          title={
            offline
              ? "Video needs a connection — this song still plays without it"
              : withVideo
                ? "YouTube video enabled — click to play without it"
                : "Click to play with the linked YouTube video"
          }
          className='m-0 h-11 w-12 rounded-none border-l border-line-subtle'
        >
          <Youtube className='w-4 h-4' />
        </IconButton>
      )}
    </Flex>
  );
}

/**
 * The switch between reading the song and fixing it. Edit mode stays on the
 * preview — same page, same layout, lines just become tap targets.
 */
function LineEditControl({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <RowButton
      active={active}
      onClick={onToggle}
      aria-pressed={active}
      title={active ? "Stop editing lines" : "Tap a line to edit just that line"}
    >
      <PencilLine className='w-4 h-4' />
      {active ? "Editing" : "Edit Lines"}
    </RowButton>
  );
}

/**
 * The kit, as one row.
 *
 * This replaced a column of separate controls, each with its own popover
 * fighting for the same 19rem of width. Everything they did lives in the Kit
 * Designer now, and what is left here is the two things worth having in the
 * sidebar — whether it is playing, and a way in.
 */
function KitControl({
  kit,
  playing,
  onPlayingChange,
  onOpen,
}: {
  kit: KitSettings;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  onOpen: () => void;
}) {
  const on = KIT_LAYERS.filter((layer) => hasLayer(kit, layer));
  const summary =
    on.length === 0
      ? "Nothing switched on"
      : on.map((layer) => LAYER_LABELS[layer]).join(" · ");
  const name = kit.preset
    ? matchesPreset(kit)
      ? kit.preset
      : `${kit.preset} · edited`
    : "Custom kit";

  return (
    <ControlRow label='Kit'>
      <IconButton
        type='button'
        size='3'
        variant={playing ? "solid" : "soft"}
        color={playing ? undefined : "gray"}
        onClick={() => onPlayingChange(!playing)}
        disabled={on.length === 0}
        aria-label={playing ? "Stop the kit" : "Play the kit"}
        title={on.length === 0 ? "Open the kit and switch something on" : playing ? "Stop the kit" : "Play the kit"}
      >
        {playing ? <Square className='w-4 h-4' /> : <Play className='w-4 h-4' />}
      </IconButton>
      <Button
        type='button'
        variant='ghost'
        color='gray'
        highContrast
        onClick={onOpen}
        title='Design the beat, the bass and the voices'
        className='col-span-2 m-0 h-auto min-w-0 justify-between gap-2 px-2 py-1 text-left'
      >
        <span className='flex min-w-0 flex-col'>
          <Text size='2' weight='medium' truncate>
            {name}
          </Text>
          <Text size='1' color='gray' truncate>
            {summary}
          </Text>
        </span>
        <Sliders className='w-4 h-4 shrink-0 text-ink-muted' aria-hidden='true' />
      </Button>
    </ControlRow>
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
  /** The whole backing track, for the summary line under the Kit row. */
  kit: KitSettings;
  kitPlaying: boolean;
  onKitPlayingChange: (playing: boolean) => void;
  onOpenKit: () => void;

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
          className='absolute inset-0 z-30 bg-surface-sunken/40 sm:hidden print:hidden'
          onClick={() => onOpenChange(false)}
          aria-hidden='true'
        />
      )}
      <aside
        aria-label='Preview tools'
        className={`flex flex-col shrink-0 border-r border-line-subtle bg-surface-base print:hidden ${
          open ? `absolute inset-y-0 left-0 z-40 ${OPEN_WIDTH} sm:static sm:z-auto` : RAIL_WIDTH
        }`}
      >
        {/* Which song this is, and the switch that gets the tools out of the way.
            The app's own menu button floats over the top-left corner on a phone,
            so the toggle starts below the band it occupies. */}
        <div className='flex items-center gap-2 border-b border-line-subtle px-2.5 py-2 pt-[46px] sm:pt-2'>
          <IconButton
            type='button'
            variant='soft'
            color='gray'
            onClick={() => onOpenChange(!open)}
            aria-expanded={open}
            title={open ? "Hide tools" : "Show tools"}
            aria-label={open ? "Hide tools" : "Show tools"}
            className='shrink-0'
          >
            {open ? <PanelLeftClose className='w-4 h-4' /> : <PanelLeftOpen className='w-4 h-4' />}
          </IconButton>
          {open && (
            <Flex align='center' gap='2' minWidth='0'>
              {props.offline && <OfflineBadge />}
              <Text size='2' weight='bold' truncate>
                {props.title}
              </Text>
            </Flex>
          )}
        </div>

        {open && (
          <div className='flex-1 overflow-y-auto overscroll-contain'>
            <SidebarSection title='Song'>
              <RowButton onClick={props.onAllSheets}>
                <ArrowLeft className='w-4 h-4' /> All Sheets
              </RowButton>
              <RowButton onClick={() => props.onFullscreenChange(!props.fullscreen)}>
                {props.fullscreen ? (
                  <>
                    <Minimize2 className='w-4 h-4' /> Exit Fullscreen
                  </>
                ) : (
                  <>
                    <Maximize2 className='w-4 h-4' /> Fullscreen
                  </>
                )}
              </RowButton>
            </SidebarSection>

            <SidebarSection title='Playback'>
              <PlayControl
                hasTiming={props.hasTiming}
                videoLink={props.videoLink}
                withVideo={props.withVideo}
                onWithVideoToggle={props.onWithVideoToggle}
                offline={props.offline}
                open={props.playbackOpen}
                onOpen={props.onOpenPlayback}
                onClose={props.onClosePlayback}
              />
            </SidebarSection>

            <SidebarSection title='Display'>
              <FontScaleControl scale={props.fontScale} onChange={props.onFontScaleChange} />
              <ColumnCountControl count={props.columnCount} onChange={props.onColumnCountChange} />
              <ColumnWidthControl width={props.columnWidthVw} onChange={props.onColumnWidthVwChange} />
              <TransposeControl steps={props.transposeSteps} onChange={props.onTransposeStepsChange} />
            </SidebarSection>

            <SidebarSection title='Audio'>
              <TempoControl bpm={props.bpm} onBpmChange={props.onBpmChange} />
              <KitControl
                kit={props.kit}
                playing={props.kitPlaying}
                onPlayingChange={props.onKitPlayingChange}
                onOpen={props.onOpenKit}
              />
              <RowButton onClick={props.onArrange} title='Lay the song out on tracks and record takes onto them'>
                <Mic className='w-4 h-4' /> Arrange
              </RowButton>
            </SidebarSection>

            <SidebarSection title='Edit'>
              <LineEditControl active={props.editMode} onToggle={props.onEditModeToggle} />
              <RowButton onClick={props.onOpenEditor}>
                <Pencil className='w-4 h-4' /> Open Editor
              </RowButton>
            </SidebarSection>

            <SidebarSection title='Share'>
              <RowButton
                onClick={props.onCopy}
                variant={props.copied ? "soft" : "ghost"}
                color={props.copied ? "teal" : "gray"}
                highContrast={!props.copied}
              >
                {props.copied ? <Check className='w-4 h-4' /> : <Copy className='w-4 h-4' />}
                {props.copied ? "Copied!" : "Copy Text"}
              </RowButton>
              <RowButton
                onClick={props.onShare}
                variant={props.shared ? "soft" : "ghost"}
                color={props.shared ? "teal" : "gray"}
                highContrast={!props.shared}
              >
                {props.shared ? <Check className='w-4 h-4' /> : <Link2 className='w-4 h-4' />}
                {props.shared ? "Link Copied!" : "Share"}
              </RowButton>
              <RowButton onClick={props.onPrint}>
                <Printer className='w-4 h-4' /> Print
              </RowButton>
            </SidebarSection>
          </div>
        )}
      </aside>
    </>
  );
}
