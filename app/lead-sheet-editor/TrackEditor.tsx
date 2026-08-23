"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Music3,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  applyArrangement,
  buildArrangement,
  defaultLineSeconds,
  formatArrangementTime,
  type LyricClip,
  type SoundClip,
} from "./arrangement";
import { CUE_LAYERS, layerLabel } from "./cues";
import { formatTime } from "./timing";
import { usePlayback } from "./PlaybackBar";
import { findYouTubeLinkInText } from "./youtube";
import { useYouTubePlayback } from "./YouTubePlayer";
import {
  DEFAULT_DRUM_SETTINGS,
  hasDrumSettingsLine,
  parseDrumSettingsLine,
  patternIndex,
  useDrumScheduler,
  type DrumSettings,
} from "./DrumMachine";
import { asSectionHeader } from "./songText";

// ─── Track editor ─────────────────────────────────────────────────────────────
//
// The song as a stack of tracks: every lyric line is a clip you can slide and
// stretch, and each sound layer gets a lane of its own where a clip is the span
// between a [drum] and its [/drum]. Nothing here invents a new file format —
// the clips are read out of the sheet's own text and written straight back into
// it, so an afternoon of dragging lands as an ordinary edit.

/** Shortest a clip can be dragged — below this it stops reading as a span. */
const MIN_CLIP = 0.5;

const MIN_ZOOM = 6;
const MAX_ZOOM = 200;
const DEFAULT_ZOOM = 28;

/** Empty bars kept past the last clip so there's somewhere to drag things to. */
const TAIL_PAD = 12;

const LANE_HEIGHT = 26;
const LANE_GAP = 3;
const TRACK_PAD = 6;
const GUTTER = 132;

const SNAP_CHOICES = [
  { label: "1s", value: 1 },
  { label: "½s", value: 0.5 },
  { label: "⅒s", value: 0.1 },
  { label: "off", value: 0 },
];

/** How long a fade takes — the same four seconds the preview's cues use. */
const FADE_SECONDS = 4;

const LAYER_STYLES: Record<string, { bar: string; edge: string; dot: string }> = {
  drum: { bar: "bg-emerald-500/25 text-emerald-100", edge: "bg-emerald-400", dot: "bg-emerald-400" },
  claps: { bar: "bg-sky-500/25 text-sky-100", edge: "bg-sky-400", dot: "bg-sky-400" },
  shimmer: { bar: "bg-violet-500/25 text-violet-100", edge: "bg-violet-400", dot: "bg-violet-400" },
};

const layerStyle = (layer: string) =>
  LAYER_STYLES[layer] ?? { bar: "bg-white/15 text-white", edge: "bg-white/60", dot: "bg-white/60" };

type Selection = { kind: "lyric" | "sound"; id: string } | null;

type DragMode = "move" | "left" | "right";

interface DragState {
  kind: "lyric" | "sound";
  id: string;
  mode: DragMode;
  startX: number;
  origStart: number;
  origEnd: number;
}

// ─── Song settings ────────────────────────────────────────────────────────────

interface SongSettings {
  bpm: number;
  drums: DrumSettings;
}

/** Tempo and kit, read off the header block the same way the editor writes it. */
function readSongSettings(rawText: string): SongSettings {
  let bpm = 120;
  let drums = DEFAULT_DRUM_SETTINGS;
  for (const line of rawText.split("\n")) {
    if (asSectionHeader(line) !== null) break;
    const tempo = line.match(/\bTempo:\s*(\d+)\b/i);
    if (tempo) bpm = Math.min(300, Math.max(30, parseInt(tempo[1], 10)));
    if (hasDrumSettingsLine(line)) drums = parseDrumSettingsLine(line) ?? drums;
  }
  return { bpm, drums };
}

// ─── Lane packing ─────────────────────────────────────────────────────────────

/**
 * Which row each clip sits on. Lines that share a stamp cover the same stretch
 * of the song, so they stack instead of hiding one another — pull one sideways
 * and it drops back down to the first free row.
 */
function packLanes<T extends { start: number; end: number }>(clips: T[]): Map<T, number> {
  const lanes: number[] = [];
  const placement = new Map<T, number>();
  for (const clip of [...clips].sort((a, b) => a.start - b.start)) {
    let lane = lanes.findIndex((end) => end <= clip.start + 0.001);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(0);
    }
    lanes[lane] = clip.end;
    placement.set(clip, lane);
  }
  return placement;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TrackEditor({
  rawText,
  onApply,
  onClose,
}: {
  rawText: string;
  onApply: (nextText: string) => void;
  onClose: () => void;
}) {
  const settings = useMemo(() => readSongSettings(rawText), [rawText]);
  const lineSeconds = defaultLineSeconds(settings.bpm);
  const initial = useMemo(
    () => buildArrangement(rawText, { lineSeconds }),
    [rawText, lineSeconds]
  );
  const [lyrics, setLyrics] = useState<LyricClip[]>(initial.lyrics);
  const [sounds, setSounds] = useState<SoundClip[]>(initial.sounds);
  const [extraLayers, setExtraLayers] = useState<string[]>([]);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [snap, setSnap] = useState(0.5);
  const [selected, setSelected] = useState<Selection>(null);
  const [dirty, setDirty] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const serialRef = useRef(0);

  const contentEnd = Math.max(
    0,
    ...lyrics.map((c) => c.end),
    ...sounds.map((c) => c.end)
  );

  // ── Transport ──────────────────────────────────────────────────────────────
  // A YouTube link in the song promotes the recording to the clock, so clips
  // can be dragged against the actual take rather than a stopwatch.
  const videoLink = useMemo(() => findYouTubeLinkInText(rawText), [rawText]);
  const stopwatch = usePlayback(contentEnd + TAIL_PAD);
  const {
    playback: videoPlayback,
    status: videoStatus,
    mount: videoMount,
  } = useYouTubePlayback(videoLink, contentEnd + TAIL_PAD);
  const usingVideo = !!videoLink && videoStatus !== "error";
  const playback = usingVideo ? videoPlayback : stopwatch;
  const { time, playing, toggle, seek } = playback;

  const duration = Math.max(contentEnd, playback.duration) + TAIL_PAD;
  const width = duration * zoom;

  const tracks = useMemo(() => {
    const withClips = CUE_LAYERS.filter((layer) => sounds.some((c) => c.layer === layer));
    return [...new Set([...withClips, ...extraLayers])];
  }, [sounds, extraLayers]);

  // ── Live sound ─────────────────────────────────────────────────────────────
  const activeLayers = useMemo(() => {
    const active = new Set<string>();
    for (const clip of sounds) {
      if (time >= clip.start && time < clip.end) active.add(clip.layer);
    }
    return active;
  }, [sounds, time]);

  // Fades ride the master volume, so a clip set to fade out really does.
  const fadeGain = useMemo(() => {
    let gain = 1;
    for (const clip of sounds) {
      if (time < clip.start || time >= clip.end) continue;
      if (clip.fadeIn && time < clip.start + FADE_SECONDS) {
        gain = Math.min(gain, (time - clip.start) / FADE_SECONDS);
      }
      if (clip.fadeOut && time > clip.end - FADE_SECONDS) {
        gain = Math.min(gain, (clip.end - time) / FADE_SECONDS);
      }
    }
    return Math.max(0, Math.min(1, gain));
  }, [sounds, time]);

  useDrumScheduler(
    settings.bpm,
    patternIndex(settings.drums.pattern),
    playing && activeLayers.size > 0,
    settings.drums.volume * fadeGain,
    settings.drums.kick,
    settings.drums.snare,
    activeLayers.has("claps"),
    activeLayers.has("shimmer"),
    activeLayers.has("drum")
  );

  // ── Clip edits ─────────────────────────────────────────────────────────────

  const snapTime = useCallback(
    (seconds: number) => {
      const safe = Math.max(0, seconds);
      if (!snap) return Math.round(safe * 100) / 100;
      return Math.round(safe / snap) * snap;
    },
    [snap]
  );

  const patchLyric = useCallback((id: string, patch: Partial<LyricClip>) => {
    setLyrics((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch, placed: true } : c)));
    setDirty(true);
  }, []);

  const patchSound = useCallback((id: string, patch: Partial<SoundClip>) => {
    setSounds((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setDirty(true);
  }, []);

  const beginDrag = (
    event: React.PointerEvent,
    clip: { id: string; start: number; end: number },
    kind: "lyric" | "sound",
    mode: DragMode
  ) => {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    dragRef.current = {
      kind,
      id: clip.id,
      mode,
      startX: event.clientX,
      origStart: clip.start,
      origEnd: clip.end,
    };
    setSelected({ kind, id: clip.id });
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = (event.clientX - drag.startX) / zoom;
      const span = drag.origEnd - drag.origStart;

      let start = drag.origStart;
      let end = drag.origEnd;
      if (drag.mode === "move") {
        start = snapTime(drag.origStart + delta);
        end = start + span;
      } else if (drag.mode === "left") {
        start = Math.min(snapTime(drag.origStart + delta), drag.origEnd - MIN_CLIP);
      } else {
        end = Math.max(snapTime(drag.origEnd + delta), drag.origStart + MIN_CLIP);
      }

      if (drag.kind === "lyric") patchLyric(drag.id, { start, end });
      else patchSound(drag.id, { start, end });
    };

    const onUp = () => {
      dragRef.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [zoom, snapTime, patchLyric, patchSound]);

  /** Drawing on empty track space: press, drag out the length, let go. */
  const drawClip = (event: React.PointerEvent<HTMLDivElement>, layer: string) => {
    if (event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const start = snapTime((event.clientX - bounds.left) / zoom);
    const clip: SoundClip = {
      id: `new:${serialRef.current++}`,
      layer,
      start,
      end: start + Math.max(MIN_CLIP, snap || 1),
      fadeIn: false,
      fadeOut: false,
    };
    setSounds((prev) => [...prev, clip]);
    setSelected({ kind: "sound", id: clip.id });
    setDirty(true);
    dragRef.current = {
      kind: "sound",
      id: clip.id,
      mode: "right",
      startX: event.clientX,
      origStart: clip.start,
      origEnd: clip.end,
    };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const addClipAtPlayhead = (layer: string) => {
    const start = snapTime(time);
    const clip: SoundClip = {
      id: `new:${serialRef.current++}`,
      layer,
      start,
      end: start + 8,
      fadeIn: false,
      fadeOut: false,
    };
    setSounds((prev) => [...prev, clip]);
    setSelected({ kind: "sound", id: clip.id });
    setDirty(true);
  };

  const removeSelected = useCallback(() => {
    if (!selected) return;
    if (selected.kind === "sound") {
      setSounds((prev) => prev.filter((c) => c.id !== selected.id));
    } else {
      // A lyric clip is a line of the song — deleting it here only takes away
      // the time it was given, handing it back to the line above.
      setLyrics((prev) =>
        prev.map((c) => (c.id === selected.id ? { ...c, placed: false } : c))
      );
    }
    setSelected(null);
    setDirty(true);
  }, [selected]);

  const removeTrack = (layer: string) => {
    const count = sounds.filter((c) => c.layer === layer).length;
    if (count > 0 && !confirm(`Remove the ${layerLabel(layer)} track and its ${count} clip${count === 1 ? "" : "s"}?`)) {
      return;
    }
    setSounds((prev) => prev.filter((c) => c.layer !== layer));
    setExtraLayers((prev) => prev.filter((l) => l !== layer));
    if (count > 0) setDirty(true);
  };

  const resetAll = () => {
    if (dirty && !confirm("Put every clip back where the song has it?")) return;
    const fresh = buildArrangement(rawText, { lineSeconds });
    setLyrics(fresh.lyrics);
    setSounds(fresh.sounds);
    setExtraLayers([]);
    setSelected(null);
    setDirty(false);
  };

  const apply = () => {
    onApply(applyArrangement(rawText, { lyrics, sounds, duration: contentEnd }));
    onClose();
  };

  const close = () => {
    if (dirty && !confirm("Close the arranger and lose these clip changes?")) return;
    onClose();
  };

  // ── Keys ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.code === "Space") {
        event.preventDefault();
        toggle();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        if (!selected) return;
        event.preventDefault();
        removeSelected();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        seek(Math.max(0, time - 5));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        seek(time + 5);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // Keep the playhead on screen while the song runs.
  useEffect(() => {
    if (!playing) return;
    const box = scrollRef.current;
    if (!box) return;
    const x = GUTTER + time * zoom;
    if (x < box.scrollLeft + GUTTER + 40 || x > box.scrollLeft + box.clientWidth - 140) {
      box.scrollLeft = Math.max(0, x - box.clientWidth / 3);
    }
  }, [time, playing, zoom]);

  const lyricLanes = useMemo(() => packLanes(lyrics), [lyrics]);
  const laneCount = Math.max(1, ...[...lyricLanes.values()].map((lane) => lane + 1));
  const lyricHeight = laneCount * (LANE_HEIGHT + LANE_GAP) - LANE_GAP + TRACK_PAD * 2;

  const selectedSound =
    selected?.kind === "sound" ? sounds.find((c) => c.id === selected.id) ?? null : null;
  const selectedLyric =
    selected?.kind === "lyric" ? lyrics.find((c) => c.id === selected.id) ?? null : null;

  const unplaced = lyrics.filter((c) => !c.placed).length;
  const addable = CUE_LAYERS.filter((layer) => !tracks.includes(layer));

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <Music3 className="h-4 w-4 text-yellow-400" />
          <div>
            <h2 className="text-sm font-medium text-white">Arrange</h2>
            <p className="text-xs text-white/40">
              Drag a clip to move it, pull its edges to change how long it holds.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {videoLink && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">
                {videoStatus === "error" ? "Video unavailable" : "Timing against the video"}
              </span>
              {/* Never unmounted while the arranger is open — a destroyed iframe
                  stops playing, and the audio is the whole point. */}
              <div ref={videoMount} className="h-14 w-24 overflow-hidden rounded bg-black" />
            </div>
          )}
          <button
            onClick={close}
            aria-label="Close arranger"
            className="text-white/50 transition-colors hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2">
        <button
          onClick={toggle}
          disabled={!playback.ready}
          className="flex h-9 items-center gap-2 rounded bg-yellow-400 px-3 text-sm font-medium text-black transition-colors hover:bg-yellow-300 disabled:opacity-30"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? "Pause" : "Play"}
        </button>
        <span className="w-16 font-mono text-sm tabular-nums text-yellow-400">{formatTime(time)}</span>

        <div className="mx-1 w-px self-stretch bg-white/15" />

        <button
          onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / 1.4))}
          aria-label="Zoom out"
          className="flex h-9 w-9 items-center justify-center rounded text-white/60 ring-1 ring-white/20 transition-colors hover:text-white hover:ring-white/50"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 1.4))}
          aria-label="Zoom in"
          className="flex h-9 w-9 items-center justify-center rounded text-white/60 ring-1 ring-white/20 transition-colors hover:text-white hover:ring-white/50"
        >
          <ZoomIn className="h-4 w-4" />
        </button>

        <label className="ml-1 flex items-center gap-1.5 text-xs text-white/40">
          Snap
          <select
            value={snap}
            onChange={(e) => setSnap(parseFloat(e.target.value))}
            className="rounded border border-white/20 bg-black px-2 py-1.5 text-xs text-white outline-none focus:border-white/60"
          >
            {SNAP_CHOICES.map((choice) => (
              <option key={choice.label} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>

        {addable.length > 0 && (
          <div className="relative flex h-9 items-center gap-1.5 rounded px-3 text-sm font-medium text-white/60 ring-1 ring-white/20 transition-colors hover:text-white hover:ring-white/50">
            <Plus className="h-4 w-4" />
            Add track
            <select
              value=""
              aria-label="Add a sound track"
              onChange={(e) => {
                if (e.target.value) setExtraLayers((prev) => [...prev, e.target.value]);
                e.target.value = "";
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            >
              <option value="" disabled>
                Add a track
              </option>
              {addable.map((layer) => (
                <option key={layer} value={layer}>
                  {layerLabel(layer)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Selected clip */}
        {selectedSound && (
          <div className="ml-1 flex items-center gap-2 rounded border border-white/15 px-2 py-1">
            <span className="text-xs font-medium uppercase tracking-wide text-white/60">
              {layerLabel(selectedSound.layer)}
            </span>
            <span className="font-mono text-xs tabular-nums text-white/40">
              {formatArrangementTime(selectedSound.start)}–{formatArrangementTime(selectedSound.end)}
            </span>
            <button
              onClick={() => patchSound(selectedSound.id, { fadeIn: !selectedSound.fadeIn })}
              className={`rounded px-1.5 py-0.5 text-xs transition-colors ${
                selectedSound.fadeIn ? "bg-yellow-400 text-black" : "text-white/50 hover:text-white"
              }`}
            >
              Fade in
            </button>
            <button
              onClick={() => patchSound(selectedSound.id, { fadeOut: !selectedSound.fadeOut })}
              className={`rounded px-1.5 py-0.5 text-xs transition-colors ${
                selectedSound.fadeOut ? "bg-yellow-400 text-black" : "text-white/50 hover:text-white"
              }`}
            >
              Fade out
            </button>
            <button
              onClick={removeSelected}
              aria-label="Delete clip"
              className="text-white/40 transition-colors hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {selectedLyric && (
          <div className="ml-1 flex items-center gap-2 rounded border border-white/15 px-2 py-1">
            <span className="max-w-[16rem] truncate font-mono text-xs text-white/70">
              {selectedLyric.text || "(blank line)"}
            </span>
            <span className="font-mono text-xs tabular-nums text-white/40">
              {formatArrangementTime(selectedLyric.start)}–{formatArrangementTime(selectedLyric.end)}
            </span>
            <button
              onClick={removeSelected}
              title="Give this line's time back to the line above"
              className="text-xs text-white/40 transition-colors hover:text-white"
            >
              Untime
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={resetAll}
            title="Put every clip back where the song has it"
            className="flex h-9 items-center gap-1.5 rounded px-3 text-sm font-medium text-white/50 transition-colors hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
          <button
            onClick={apply}
            disabled={!dirty}
            className="flex h-9 items-center gap-2 rounded bg-yellow-400 px-4 text-sm font-medium text-black transition-colors hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Check className="h-4 w-4" />
            Apply to song
          </button>
        </div>
      </div>

      {/* Tracks — names and lanes share one scroller so a tall lyric track
          can never slide out of line with the labels beside it. */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div className="relative" style={{ width: GUTTER + width }}>
          {/* Ruler */}
          <div className="sticky top-0 z-30 flex h-8 bg-black">
            <div
              className="sticky left-0 z-40 shrink-0 border-r border-b border-white/10 bg-black"
              style={{ width: GUTTER }}
            />
            <Ruler duration={duration} zoom={zoom} width={width} onSeek={seek} />
          </div>

          {/* Lyric track */}
          <div className="flex border-b border-white/10" style={{ height: lyricHeight }}>
            <TrackName>
              <span className="text-yellow-400">Lyrics</span>
            </TrackName>
            <div
              className="relative"
              style={{ width, touchAction: "none" }}
              onPointerDown={() => setSelected(null)}
            >
              <Grid duration={duration} zoom={zoom} />
              {lyrics.map((clip) => (
                <ClipBox
                  key={clip.id}
                  left={clip.start * zoom}
                  width={Math.max(2, (clip.end - clip.start) * zoom)}
                  top={TRACK_PAD + (lyricLanes.get(clip) ?? 0) * (LANE_HEIGHT + LANE_GAP)}
                  selected={selected?.kind === "lyric" && selected.id === clip.id}
                  className={
                    clip.placed
                      ? "bg-yellow-400/20 text-yellow-50"
                      : "border border-dashed border-white/25 bg-white/5 text-white/50"
                  }
                  edgeClass="bg-yellow-400"
                  title={`${clip.section} — ${formatArrangementTime(clip.start)}${
                    clip.placed ? "" : " (inherited)"
                  }`}
                  onPointerDown={(e, mode) => beginDrag(e, clip, "lyric", mode)}
                >
                  {clip.text || "·"}
                </ClipBox>
              ))}
            </div>
          </div>

          {/* Sound tracks */}
          {tracks.map((layer) => (
            <div
              key={layer}
              className="flex border-b border-white/10"
              style={{ height: LANE_HEIGHT + TRACK_PAD * 2 }}
            >
              <TrackName>
                <span className={`h-2 w-2 shrink-0 rounded-full ${layerStyle(layer).dot}`} />
                <span className="flex-1 truncate text-white/70">{layerLabel(layer)}</span>
                <button
                  onClick={() => addClipAtPlayhead(layer)}
                  title={`Add a ${layerLabel(layer)} clip at the playhead`}
                  aria-label={`Add a ${layerLabel(layer)} clip`}
                  className="text-white/30 transition-colors hover:text-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => removeTrack(layer)}
                  title={`Remove the ${layerLabel(layer)} track`}
                  aria-label={`Remove the ${layerLabel(layer)} track`}
                  className="text-white/30 transition-colors hover:text-red-400"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </TrackName>
              <div
                className="relative"
                style={{ width, touchAction: "none" }}
                onPointerDown={(e) => drawClip(e, layer)}
              >
                <Grid duration={duration} zoom={zoom} />
                {sounds
                  .filter((clip) => clip.layer === layer)
                  .map((clip) => (
                    <ClipBox
                      key={clip.id}
                      left={clip.start * zoom}
                      width={Math.max(2, (clip.end - clip.start) * zoom)}
                      top={TRACK_PAD}
                      selected={selected?.kind === "sound" && selected.id === clip.id}
                      className={layerStyle(layer).bar}
                      edgeClass={layerStyle(layer).edge}
                      title={`${layerLabel(layer)} ${formatArrangementTime(clip.start)}–${formatArrangementTime(clip.end)}`}
                      onPointerDown={(e, mode) => beginDrag(e, clip, "sound", mode)}
                    >
                      {clip.fadeIn && <span className="mr-1 opacity-70">◺</span>}
                      {layerLabel(layer)}
                      {clip.fadeOut && <span className="ml-1 opacity-70">◿</span>}
                    </ClipBox>
                  ))}
              </div>
            </div>
          ))}

          {/* Playhead — behind the sticky names, so it slides under them. */}
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-red-500"
            style={{ left: GUTTER + time * zoom }}
          >
            <div className="absolute -left-1 top-0 h-2 w-2 rounded-full bg-red-500" />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 px-4 py-2 text-xs text-white/35">
        <span>Space plays · ← → jump 5s · Delete removes a clip</span>
        <span>Drag empty space on a sound track to draw a clip.</span>
        {unplaced > 0 && (
          <span>
            {unplaced} line{unplaced === 1 ? " still follows" : "s still follow"} the line above —
            drag one to give it a time of its own.
          </span>
        )}
        {!dirty && <span className="ml-auto">No changes yet.</span>}
      </div>
    </div>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

/** The label column, pinned to the left edge however far the song scrolls. */
function TrackName({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="sticky left-0 z-20 flex shrink-0 items-start gap-2 border-r border-white/10 bg-black px-3 pt-2 text-xs font-medium uppercase tracking-wide"
      style={{ width: GUTTER }}
    >
      {children}
    </div>
  );
}

/** Seconds along the top, clickable end to end for scrubbing. */
function Ruler({
  duration,
  zoom,
  width,
  onSeek,
}: {
  duration: number;
  zoom: number;
  width: number;
  onSeek: (seconds: number) => void;
}) {
  // Roughly one label per 70px, rounded to something a musician would count in.
  const step = [1, 2, 5, 10, 15, 30, 60].find((s) => s * zoom >= 70) ?? 120;
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += step) ticks.push(t);

  return (
    <div
      className="relative h-8 shrink-0 cursor-pointer border-b border-white/10 bg-black"
      style={{ width, touchAction: "none" }}
      onPointerDown={(e) => {
        const bounds = e.currentTarget.getBoundingClientRect();
        onSeek(Math.max(0, (e.clientX - bounds.left) / zoom));
      }}
    >
      {ticks.map((t) => (
        <div key={t} className="absolute top-0 h-full" style={{ left: t * zoom }}>
          <div className="h-2 w-px bg-white/25" />
          <span className="absolute left-1 top-1.5 font-mono text-[0.65rem] tabular-nums text-white/40">
            {formatTime(t)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Faint bars behind the clips so a drag has something to read against. */
function Grid({ duration, zoom }: { duration: number; zoom: number }) {
  const step = [1, 2, 5, 10, 15, 30, 60].find((s) => s * zoom >= 70) ?? 120;
  const lines: number[] = [];
  for (let t = step; t <= duration; t += step) lines.push(t);
  return (
    <>
      {lines.map((t) => (
        <div
          key={t}
          className="pointer-events-none absolute top-0 bottom-0 w-px bg-white/5"
          style={{ left: t * zoom }}
        />
      ))}
    </>
  );
}

function ClipBox({
  left,
  width,
  top,
  selected,
  className,
  edgeClass,
  title,
  children,
  onPointerDown,
}: {
  left: number;
  width: number;
  top: number;
  selected: boolean;
  className: string;
  edgeClass: string;
  title: string;
  children: React.ReactNode;
  onPointerDown: (event: React.PointerEvent, mode: DragMode) => void;
}) {
  return (
    <div
      title={title}
      onPointerDown={(e) => onPointerDown(e, "move")}
      className={`absolute flex cursor-grab items-center overflow-hidden rounded px-2 text-xs whitespace-nowrap select-none active:cursor-grabbing ${className} ${
        selected ? "ring-2 ring-yellow-300" : ""
      }`}
      style={{ left, width, top, height: LANE_HEIGHT, touchAction: "none" }}
    >
      <span className="pointer-events-none truncate">{children}</span>
      <span
        onPointerDown={(e) => onPointerDown(e, "left")}
        className={`absolute inset-y-0 left-0 w-1.5 cursor-ew-resize opacity-0 hover:opacity-100 ${edgeClass}`}
      />
      <span
        onPointerDown={(e) => onPointerDown(e, "right")}
        className={`absolute inset-y-0 right-0 w-1.5 cursor-ew-resize opacity-0 hover:opacity-100 ${edgeClass}`}
      />
    </div>
  );
}
