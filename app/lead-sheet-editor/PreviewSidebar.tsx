"use client";

import { useRef } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Link2,
  Maximize2,
  Mic,
  Minimize2,
  Minus,
  Play,
  Plus,
  Printer,
  Sliders,
  Square,
  Youtube,
} from "lucide-react";
import { Flex, IconButton, Text } from "@radix-ui/themes";
import type { YouTubeLink } from "./youtube";
import { MIN_BPM, MAX_BPM, clampBpm } from "./Tempo";
import { applyPreset, PRESET_GROUPS, type KitSettings } from "./kit";
import { useKitStep } from "./KitPlayer";
import { ControlRow, RowButton } from "./SidebarRows";
import styles from "./lead-sheet-editor.module.css";

export const MIN_SCALE = 70;
export const MAX_SCALE = 160;

export const MIN_COLUMN_COUNT = 1;
export const MAX_COLUMN_COUNT = 4;
export const DEFAULT_COLUMN_COUNT = 2;

export const MIN_COLUMN_WIDTH_VW = 15;
export const MAX_COLUMN_WIDTH_VW = 50;
const COLUMN_WIDTH_VW_STEP = 5;
export const DEFAULT_COLUMN_WIDTH_VW = 30;

/** A square −/+ step button beside a value — the app's own extra controls, not reference ones. */
function StepButton(props: React.ComponentProps<typeof IconButton>) {
  return <IconButton type='button' size='3' variant='soft' color='gray' {...props} />;
}

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

/** One of the app's own extra blocks — not in the reference, so built from
 *  the app's existing Radix-themed sidebar vocabulary rather than the
 *  reference's raw `.group`/`.panel-h` (used below for the parts that are
 *  the reference, verbatim). */
function ExtraSection({ title, children }: { title: string; children: React.ReactNode }) {
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
  videoLink: YouTubeLink | null;
  withVideo: boolean;
  onWithVideoToggle: () => void;
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
        {open ? "Playing" : "Play Song"}
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

export interface PreviewSidebarProps {
  /** Open/close is driven by the topbar's Drums toggle now — this panel renders nothing while closed. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offline: boolean;

  // Song
  onArrange: () => void;
  fullscreen: boolean;
  onFullscreenChange: (next: boolean) => void;

  // Playback (the song's own timed/synced playback — distinct from the
  // kit's loop below, which the reference's single Start/Stop button
  // became; the reference has no second transport, so this keeps the
  // app's own section).
  hasTiming: boolean;
  videoLink: YouTubeLink | null;
  withVideo: boolean;
  onWithVideoToggle: () => void;
  playbackOpen: boolean;
  onOpenPlayback: () => void;
  onClosePlayback: () => void;

  // Display
  columnCount: number;
  onColumnCountChange: (next: number) => void;
  columnWidthVw: number;
  onColumnWidthVwChange: (next: number) => void;
  transposeSteps: number;
  onTransposeStepsChange: (next: number) => void;

  // Audio — the reference's actual "Drum loop" panel content
  bpm: number;
  onBpmChange: (next: number) => void;
  kit: KitSettings;
  onKitChange: (next: KitSettings) => void;
  kitPlaying: boolean;
  onKitPlayingChange: (playing: boolean) => void;
  onOpenKit: () => void;

  // Share
  copied: boolean;
  onCopy: () => void;
  shared: boolean;
  onShare: () => void;
  onPrint: () => void;
}

/**
 * The reference's `.drums` aside, matched structurally this time rather
 * than summarized: the heading, the Start/Stop loop button, the beat dots,
 * the Feel pattern grid, the Tempo stepper with tap-tempo, and the Volume
 * slider are all inlined here exactly as the reference lays them out,
 * instead of a summary row that opens the full Kit Designer as a dialog.
 * The Kit Designer is still reachable — "Full kit editor" at the bottom of
 * Feel — for the per-layer/drone/bass controls the reference's one panel
 * has no room to show.
 *
 * Below that, the app's own extra groups (Playback, Display, Share) use
 * the existing Radix-themed sidebar vocabulary rather than the reference's
 * raw classes, since they're additions the reference has no version of at
 * all, not a reference behavior being reinterpreted.
 */
export default function PreviewSidebar(props: PreviewSidebarProps) {
  const { open, onOpenChange, kit, onKitChange, kitPlaying, onKitPlayingChange, bpm, onBpmChange } = props;
  const tapsRef = useRef<number[]>([]);
  // Live from the kit's own loop, so the dots follow the beat rather than
  // showing a fixed picture of one.
  const step = useKitStep();

  if (!open) return null;

  const pattern = kit.preset;

  // Tap tempo — the reference's own tap(): average the gaps between taps
  // inside a 2.5s window. The app has no tap-tempo of its own to defer to,
  // so this is the reference's algorithm, ported as-is.
  function handleTap() {
    const now = performance.now();
    tapsRef.current = tapsRef.current.filter((t) => now - t < 2500);
    tapsRef.current.push(now);
    if (tapsRef.current.length >= 2) {
      const iv: number[] = [];
      for (let i = 1; i < tapsRef.current.length; i++) iv.push(tapsRef.current[i] - tapsRef.current[i - 1]);
      onBpmChange(clampBpm(60000 / (iv.reduce((a, b) => a + b, 0) / iv.length)));
    }
  }

  return (
    <>
      <div
        className={`${styles.backdrop} absolute inset-0 z-30 bg-surface-sunken/40 print:hidden`}
        onClick={() => onOpenChange(false)}
        aria-hidden='true'
      />
      <aside aria-label='Drum loops' className={`${styles.sidePanel} ${styles.drums} print:hidden`}>
        <h2 className={styles.panelH}>Drum loop</h2>

        {kitPlaying ? (
          <button type='button' className={`${styles.drumPlay} ${styles.drumPlayStop}`} onClick={() => onKitPlayingChange(false)}>
            <Square className='w-[22px] h-[22px]' fill='currentColor' />
            Stop
          </button>
        ) : (
          <button
            type='button'
            className={styles.drumPlay}
            onClick={() => onKitPlayingChange(true)}
            disabled={kit.layers.length === 0}
            title={kit.layers.length === 0 ? "Pick a feel below first" : undefined}
          >
            <Play className='w-[22px] h-[22px]' fill='currentColor' />
            Start loop
          </button>
        )}

        <div className={styles.dots} aria-hidden='true'>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`${styles.dot} ${i === 0 ? styles.dotFirst : ""} ${kitPlaying && Math.floor(step / 4) === i ? styles.dotOn : ""}`}
            />
          ))}
        </div>

        <div className={styles.group}>
          <h3 className={styles.panelH}>Feel</h3>
          <div className={styles.pgrid}>
            {PRESET_GROUPS.flatMap((g) => g.items).map((preset) => (
              <button
                key={preset.name}
                type='button'
                className={`${styles.pbtn} ${pattern === preset.name ? styles.pbtnOn : ""}`}
                aria-pressed={pattern === preset.name}
                onClick={() => {
                  onKitChange(applyPreset(preset, kit));
                  onBpmChange(preset.bpm);
                }}
                title={preset.blurb}
              >
                {preset.name}
                <span className={styles.pbtnDesc}>{preset.group}</span>
              </button>
            ))}
          </div>
          <button type='button' className={styles.drumEditorBtn} onClick={props.onOpenKit}>
            <Sliders className='h-5 w-5' />
            Drum editor
          </button>
        </div>

        <div className={styles.group}>
          <h3 className={styles.panelH}>Tempo</h3>
          <div className={styles.tempoRow}>
            <button type='button' className={styles.ibtn} onClick={() => onBpmChange(bpm - 2)} aria-label='Slower' disabled={bpm <= MIN_BPM}>
              <Minus className='w-[18px] h-[18px]' />
            </button>
            <div className={styles.bpm}>
              {bpm}
              <span className={styles.bpmUnit}>BPM</span>
            </div>
            <button type='button' className={styles.ibtn} onClick={() => onBpmChange(bpm + 2)} aria-label='Faster' disabled={bpm >= MAX_BPM}>
              <Plus className='w-[18px] h-[18px]' />
            </button>
          </div>
          <button type='button' className={styles.ibtn} style={{ height: 52, fontSize: 16, width: "100%" }} onClick={handleTap}>
            Tap tempo
          </button>
        </div>

        <div className={styles.group}>
          <label className={styles.field}>
            Volume
            <input
              className={styles.vol}
              type='range'
              min={0}
              max={100}
              value={Math.round(kit.drums.volume * 100)}
              onChange={(e) => onKitChange({ ...kit, drums: { ...kit.drums, volume: Number(e.target.value) / 100 } })}
            />
          </label>
        </div>

        {/* ── Everything below here is the app's own, with no reference
            equivalent at all — kept reachable in the same panel rather than
            hunting for a slot the reference's layout doesn't have. The whole
            aside scrolls as one unit (see `.drums` in the CSS module), same
            as the reference — no separate scroll region nested inside it. ── */}
        <div>
          <ExtraSection title='Song'>
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
            <RowButton onClick={props.onArrange} title='Lay the song out on tracks and record takes onto them'>
              <Mic className='w-4 h-4' /> Arrange
            </RowButton>
          </ExtraSection>

          <ExtraSection title='Playback'>
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
          </ExtraSection>

          <ExtraSection title='Display'>
            <ColumnCountControl count={props.columnCount} onChange={props.onColumnCountChange} />
            <ColumnWidthControl width={props.columnWidthVw} onChange={props.onColumnWidthVwChange} />
            <TransposeControl steps={props.transposeSteps} onChange={props.onTransposeStepsChange} />
          </ExtraSection>

          <ExtraSection title='Share'>
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
          </ExtraSection>
        </div>
      </aside>
    </>
  );
}
