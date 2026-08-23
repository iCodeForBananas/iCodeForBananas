"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Cloud,
  Download,
  ListMusic,
  Mic,
  Music3,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  type LocalTrack,
  deleteTrackEverywhere,
  fetchFromSupabase,
  getTracksForSheet,
  saveTrack,
  syncToSupabase,
  updateTrackMeta,
} from "./ArrangementStore";
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
const LIBRARY_WIDTH = 244;

/**
 * What a drag lands on, counted in beats. A song is built out of bars, so the
 * grid a clip snaps to is the song's own tempo rather than the wall clock.
 */
const SNAP_CHOICES = [
  { label: "Bar", beats: 4 },
  { label: "½ bar", beats: 2 },
  { label: "Beat", beats: 1 },
  { label: "½ beat", beats: 0.5 },
  { label: "off", beats: 0 },
];

const BEATS_PER_BAR = 4;

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

/** What is being carried out of the library, until it lands on the timeline. */
type LibraryItem =
  | { kind: "lyric"; id: string; label: string }
  | { kind: "sound"; layer: string; label: string };

/** True while the pointer is over the library, where a clip goes to be shelved. */
const overLibrary = (clientX: number, clientY: number) =>
  !!document.elementFromPoint(clientX, clientY)?.closest("[data-library]");

interface DragState {
  kind: "lyric" | "sound" | "audio";
  id: string;
  mode: DragMode;
  startX: number;
  origStart: number;
  origEnd: number;
  /** Where the drag last put the clip — what gets saved when the pointer lifts,
   *  rather than re-reading state that a fast drag may not have re-rendered. */
  lastStart?: number;
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

// ─── Recorded audio ───────────────────────────────────────────────────────────
//
// A take is a lane like any other: it starts where it was recorded and it can
// be dragged, which is the only way to fix the few milliseconds every input
// chain adds between hearing the click and the mic hearing you.

/** Browser DSP is tuned for voice calls and wrecks a guitar — all of it off. */
const RECORD_CONSTRAINTS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

function bestMime(): string {
  for (const type of [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function encodeWAV(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const ab = new ArrayBuffer(44 + len * numCh * 2);
  const view = new DataView(ab);

  writeStr(view, 0, "RIFF");
  view.setUint32(4, ab.byteLength - 8, true);
  writeStr(view, 8, "WAVE");
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  writeStr(view, 36, "data");
  view.setUint32(40, len * numCh * 2, true);

  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

/** Where a take sits on the timeline, in seconds. */
const trackStart = (track: LocalTrack) => Math.max(0, track.offsetMs / 1000);
const trackEnd = (track: LocalTrack) => trackStart(track) + track.durationSec;

function LevelMeter({ level }: { level: number }) {
  const bars = 10;
  return (
    <div className="flex h-5 items-end gap-0.5">
      {Array.from({ length: bars }, (_, i) => {
        const active = level >= (i + 1) / bars;
        const color = i < 7 ? "bg-green-500" : i < 9 ? "bg-yellow-400" : "bg-red-500";
        return (
          <div
            key={i}
            className={`w-1.5 rounded-sm transition-all duration-75 ${active ? color : "bg-white/15"}`}
            style={{ height: `${40 + i * 7}%` }}
          />
        );
      })}
    </div>
  );
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
  sheetId = null,
  userId = null,
  songTitle = "arrangement",
}: {
  rawText: string;
  onApply: (nextText: string) => void;
  onClose: () => void;
  /** Which song's recorded takes to load. Without one, the arranger is text-only. */
  sheetId?: string | null;
  /** Signed in, so takes can reach the cloud as well as this browser. */
  userId?: string | null;
  songTitle?: string;
}) {
  const settings = useMemo(() => readSongSettings(rawText), [rawText]);
  const lineSeconds = defaultLineSeconds(settings.bpm);
  const initial = useMemo(
    () => buildArrangement(rawText, { lineSeconds, bpm: settings.bpm }),
    [rawText, lineSeconds, settings.bpm]
  );
  const [lyrics, setLyrics] = useState<LyricClip[]>(initial.lyrics);
  const [sounds, setSounds] = useState<SoundClip[]>(initial.sounds);
  const [extraLayers, setExtraLayers] = useState<string[]>([]);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [snapBeats, setSnapBeats] = useState(1);
  const [selected, setSelected] = useState<Selection>(null);
  const [dirty, setDirty] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const serialRef = useRef(0);
  /** The library item under the pointer, carried until it is dropped. */
  const carryRef = useRef<LibraryItem | null>(null);
  const [ghost, setGhost] = useState<{ label: string; x: number; y: number } | null>(null);

  // ── Recorded takes ─────────────────────────────────────────────────────────
  const [audio, setAudio] = useState<LocalTrack[]>([]);
  const [arming, setArming] = useState(false);
  const [recording, setRecording] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [takeName, setTakeName] = useState("Guitar");
  const [takeType, setTakeType] = useState<LocalTrack["type"]>("guitar");
  const [level, setLevel] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const meterCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterRafRef = useRef<number | null>(null);
  /** Where on the timeline this take began, so it lands where it was played. */
  const recordAtRef = useRef(0);

  /** Decoded takes, kept so scrubbing doesn't decode the same blob every time. */
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  /** Bumped whenever the audio has to be re-scheduled — a seek, a mute, a take. */
  const [audioEpoch, setAudioEpoch] = useState(0);

  // Only what has been put on the timeline counts as the song: a line still
  // waiting in the library has a start left over from where it was read out of
  // the text, and nothing there should be stretching the ruler.
  const placedLyrics = useMemo(() => lyrics.filter((c) => c.placed), [lyrics]);

  const contentEnd = Math.max(
    0,
    ...placedLyrics.map((c) => c.end),
    ...sounds.map((c) => c.end),
    ...audio.map(trackEnd)
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

  /** One beat, in seconds — the unit the ruler, the grid and every snap use. */
  const beatSeconds = 60 / Math.max(1, settings.bpm);
  const snap = snapBeats * beatSeconds;

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
    kind: "lyric" | "sound" | "audio",
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
    // A take isn't selectable: Delete belongs to the clips the song is made of,
    // and a recording is deleted from its own track head, with a confirmation.
    setSelected(kind === "audio" ? null : { kind, id: clip.id });
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
      else if (drag.kind === "sound") patchSound(drag.id, { start, end });
      // A take can only slide — its length is however long it was played for.
      else {
        drag.lastStart = Math.max(0, start);
        patchAudio(drag.id, { offsetMs: Math.round(drag.lastStart * 1000) });
      }
    };

    const onUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) return;
      if (drag.kind === "audio") {
        // Where a take sits is worth keeping.
        if (drag.lastStart !== undefined) {
          updateTrackMeta(drag.id, { offsetMs: Math.round(drag.lastStart * 1000) }).catch(() => {});
        }
        return;
      }
      // Dragged back over the library, a clip goes on the shelf: a lyric hands
      // its time back to the line above, a sound clip simply stops existing.
      if (!overLibrary(event.clientX, event.clientY)) return;
      if (drag.kind === "lyric") {
        setLyrics((prev) => prev.map((c) => (c.id === drag.id ? { ...c, placed: false } : c)));
      } else {
        setSounds((prev) => prev.filter((c) => c.id !== drag.id));
      }
      setSelected(null);
      setDirty(true);
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

  // ── Recorded takes: load, play, record ─────────────────────────────────────

  /** The takes as the scheduler sees them, so a volume nudge can't restart it. */
  const audioRef = useRef<LocalTrack[]>([]);
  const gainsRef = useRef<Map<string, GainNode>>(new Map());
  useEffect(() => {
    audioRef.current = audio;
  }, [audio]);

  useEffect(() => {
    if (!sheetId) return;
    let live = true;
    getTracksForSheet(sheetId)
      .then((tracks) => live && setAudio(tracks))
      .catch(() => {});
    if (userId && navigator.onLine) {
      fetchFromSupabase(sheetId)
        .then(() => getTracksForSheet(sheetId))
        .then((tracks) => live && setAudio(tracks))
        .catch(() => {});
      syncToSupabase().catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [sheetId, userId]);

  /** Where playback should pick the takes up from, set by whatever moved it. */
  const positionRef = useRef(0);
  const bumpAudio = useCallback((position: number) => {
    positionRef.current = position;
    setAudioEpoch((epoch) => epoch + 1);
  }, []);

  const seekTo = useCallback(
    (seconds: number) => {
      seek(seconds);
      bumpAudio(Math.max(0, seconds));
    },
    [seek, bumpAudio]
  );

  const togglePlay = useCallback(() => {
    bumpAudio(time);
    toggle();
  }, [bumpAudio, time, toggle]);

  // Every take is scheduled against one moment, decided after all of them have
  // decoded — reading the clock between decodes is what makes tracks drift.
  useEffect(() => {
    for (const source of sourcesRef.current) {
      try {
        source.stop();
      } catch {}
    }
    sourcesRef.current = [];
    gainsRef.current.clear();

    const takes = audioRef.current;
    if (!playing || takes.length === 0) return;

    let cancelled = false;
    const ctx = audioCtxRef.current ?? new AudioContext();
    audioCtxRef.current = ctx;
    ctx.resume().catch(() => {});

    (async () => {
      const decoded: { track: LocalTrack; buffer: AudioBuffer }[] = [];
      for (const track of takes) {
        let buffer = buffersRef.current.get(track.id);
        if (!buffer) {
          try {
            buffer = await ctx.decodeAudioData(await track.blob.arrayBuffer());
            buffersRef.current.set(track.id, buffer);
          } catch {
            continue;
          }
        }
        decoded.push({ track, buffer });
      }
      if (cancelled) return;

      const from = positionRef.current;
      // A short lead so the last take is scheduled before the first one sounds.
      const zero = ctx.currentTime + 0.08 - from;

      for (const { track, buffer } of decoded) {
        const start = trackStart(track);
        if (trackEnd(track) <= from) continue;

        const gain = ctx.createGain();
        gain.gain.value = track.muted ? 0 : track.volume;
        gain.connect(ctx.destination);
        gainsRef.current.set(track.id, gain);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(gain);
        // Mid-take: start now, that far into the recording.
        if (start >= from) source.start(zero + start);
        else source.start(ctx.currentTime + 0.08, from - start);
        sourcesRef.current.push(source);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [playing, audioEpoch]);

  // Volume and mute ride the gain nodes, so moving a fader can't restart a take.
  useEffect(() => {
    for (const track of audio) {
      const gain = gainsRef.current.get(track.id);
      if (gain) gain.gain.value = track.muted ? 0 : track.volume;
    }
  }, [audio]);

  useEffect(
    () => () => {
      for (const source of sourcesRef.current) {
        try {
          source.stop();
        } catch {}
      }
      audioCtxRef.current?.close().catch(() => {});
      meterCtxRef.current?.close().catch(() => {});
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (meterRafRef.current !== null) cancelAnimationFrame(meterRafRef.current);
    },
    []
  );

  const patchAudio = (id: string, patch: Partial<LocalTrack>) =>
    setAudio((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const setTakeVolume = (id: string, volume: number) => {
    patchAudio(id, { volume });
    updateTrackMeta(id, { volume }).catch(() => {});
  };

  const toggleTakeMute = (id: string) => {
    const muted = !audio.find((t) => t.id === id)?.muted;
    patchAudio(id, { muted });
    updateTrackMeta(id, { muted }).catch(() => {});
  };

  const deleteTake = async (track: LocalTrack) => {
    if (!confirm(`Delete "${track.name}"? This cannot be undone.`)) return;
    await deleteTrackEverywhere(track);
    buffersRef.current.delete(track.id);
    setAudio((prev) => prev.filter((t) => t.id !== track.id));
    bumpAudio(time);
  };

  // ── Recording ──────────────────────────────────────────────────────────────

  const openRecorder = async () => {
    setArming(true);
    setAudioError(null);
    try {
      // Asking once up front is what makes the browser hand over device names.
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((t) => t.stop());
      const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === "audioinput"
      );
      setDevices(inputs);
      if (inputs.length && !deviceId) setDeviceId(inputs[0].deviceId);
    } catch {
      setAudioError("Microphone access denied — check the browser's permissions.");
    }
  };

  const startMeter = (stream: MediaStream) => {
    const ctx = new AudioContext();
    meterCtxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    ctx.createMediaStreamSource(stream).connect(analyser);
    analyserRef.current = analyser;

    const tick = () => {
      const node = analyserRef.current;
      if (!node) return;
      const data = new Uint8Array(node.frequencyBinCount);
      node.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs((v - 128) / 128));
      setLevel(peak);
      meterRafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const stopMeter = () => {
    if (meterRafRef.current !== null) cancelAnimationFrame(meterRafRef.current);
    meterRafRef.current = null;
    analyserRef.current = null;
    meterCtxRef.current?.close().catch(() => {});
    meterCtxRef.current = null;
    setLevel(0);
  };

  const startRecording = async () => {
    if (!sheetId) {
      setAudioError("Save the song before recording, so takes have somewhere to live.");
      return;
    }
    setAudioError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId }, ...RECORD_CONSTRAINTS } : RECORD_CONSTRAINTS,
      });
      streamRef.current = stream;
      chunksRef.current = [];

      const mime = bestMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      const takeAt = time;
      const startedAt = Date.now();
      recorder.onstop = async () => {
        const track: LocalTrack = {
          id: crypto.randomUUID(),
          sheetId,
          name: takeName.trim() || "Take",
          type: takeType,
          mimeType: recorder.mimeType || "audio/webm",
          blob: new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }),
          durationSec: (Date.now() - startedAt) / 1000,
          volume: 0.8,
          muted: false,
          // A take belongs where it was played, not at the top of the song.
          offsetMs: Math.round(takeAt * 1000),
          createdAt: startedAt,
          syncedAt: null,
          storagePath: null,
        };
        await saveTrack(track);
        setAudio((prev) => [...prev, track]);
        setArming(false);
        setRecording(false);
        if (userId && navigator.onLine) syncToSupabase().catch(() => {});
      };

      recordAtRef.current = takeAt;
      setRecording(true);
      recorder.start(250);
      startMeter(stream);
      // Roll the song underneath, so a take is played against what's there.
      if (!playing) togglePlay();
    } catch (e) {
      setAudioError(`Recording failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const stopRecording = () => {
    stopMeter();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current?.stop();
    if (playing) toggle();
  };

  // ── Export ─────────────────────────────────────────────────────────────────

  const exportWAV = async () => {
    const live = audio.filter((t) => !t.muted);
    if (!live.length) {
      setAudioError("No un-muted takes to export.");
      return;
    }
    setExporting(true);
    setAudioError(null);
    try {
      const end = Math.max(...live.map(trackEnd));
      const rate = 48000;
      const offline = new OfflineAudioContext(2, Math.ceil(end * rate), rate);
      for (const track of live) {
        const buffer = await offline.decodeAudioData(await track.blob.arrayBuffer());
        const gain = offline.createGain();
        gain.gain.value = track.volume;
        gain.connect(offline.destination);
        const source = offline.createBufferSource();
        source.buffer = buffer;
        source.connect(gain);
        source.start(trackStart(track));
      }
      const wav = encodeWAV(await offline.startRendering());
      const url = URL.createObjectURL(wav);
      const link = Object.assign(document.createElement("a"), {
        href: url,
        download: `${songTitle.replace(/[^\w\s-]/g, "").trim() || "arrangement"}.wav`,
      });
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setAudioError(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  };

  // ── Library → timeline ─────────────────────────────────────────────────────
  //
  // The song's own pieces wait in the library, in the order they are written,
  // and only join the timeline once they are dropped on it. Where a piece lands
  // horizontally is the whole question — which lane it belongs to is already
  // decided by what it is — so a drop anywhere over the tracks counts.

  /** The moment under the pointer, or null when it isn't over the timeline. */
  const timeAtPointer = useCallback(
    (clientX: number, clientY: number): number | null => {
      const el = document.elementFromPoint(clientX, clientY);
      const timeline = el?.closest<HTMLElement>("[data-timeline]");
      if (!timeline) return null;
      const bounds = timeline.getBoundingClientRect();
      return snapTime((clientX - bounds.left - GUTTER) / zoom);
    },
    [snapTime, zoom]
  );

  const dropFromLibrary = useCallback(
    (item: LibraryItem, clientX: number, clientY: number) => {
      const start = timeAtPointer(clientX, clientY);
      if (start === null) return;

      if (item.kind === "lyric") {
        // `patchLyric` marks it placed, which is what takes it out of the library.
        patchLyric(item.id, { start, end: start + lineSeconds });
        setSelected({ kind: "lyric", id: item.id });
        return;
      }

      const clip: SoundClip = {
        id: `new:${serialRef.current++}`,
        layer: item.layer,
        start,
        end: start + 8,
        fadeIn: false,
        fadeOut: false,
      };
      // A layer dropped before it has a lane of its own brings one with it.
      setExtraLayers((prev) => (prev.includes(item.layer) ? prev : [...prev, item.layer]));
      setSounds((prev) => [...prev, clip]);
      setSelected({ kind: "sound", id: clip.id });
      setDirty(true);
    },
    [timeAtPointer, patchLyric, lineSeconds]
  );

  const grabFromLibrary = (event: React.PointerEvent, item: LibraryItem) => {
    event.preventDefault();
    carryRef.current = item;
    setGhost({ label: item.label, x: event.clientX, y: event.clientY });
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!carryRef.current) return;
      setGhost((g) => (g ? { ...g, x: event.clientX, y: event.clientY } : g));
    };
    const onUp = (event: PointerEvent) => {
      const item = carryRef.current;
      carryRef.current = null;
      setGhost(null);
      if (item) dropFromLibrary(item, event.clientX, event.clientY);
    };
    const onCancel = () => {
      carryRef.current = null;
      setGhost(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [dropFromLibrary]);

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
    const fresh = buildArrangement(rawText, { lineSeconds, bpm: settings.bpm });
    setLyrics(fresh.lyrics);
    setSounds(fresh.sounds);
    setExtraLayers([]);
    setSelected(null);
    setDirty(false);
  };

  const apply = () => {
    onApply(
      applyArrangement(
        rawText,
        { lyrics, sounds, duration: contentEnd },
        { inBeats: !usingVideo, bpm: settings.bpm }
      )
    );
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
        togglePlay();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        if (!selected) return;
        event.preventDefault();
        removeSelected();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        seekTo(Math.max(0, time - 5));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        seekTo(time + 5);
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

  const lyricLanes = useMemo(() => packLanes(placedLyrics), [placedLyrics]);
  const laneCount = Math.max(1, ...[...lyricLanes.values()].map((lane) => lane + 1));
  const lyricHeight = laneCount * (LANE_HEIGHT + LANE_GAP) - LANE_GAP + TRACK_PAD * 2;

  /**
   * The shelf: every line the song hasn't been given a place for yet, kept in
   * the order it is written and under the section it belongs to.
   */
  const libraryGroups = useMemo(() => {
    const groups: { section: string; items: LyricClip[] }[] = [];
    for (const clip of [...lyrics].sort((a, b) => a.lineIndex - b.lineIndex)) {
      if (clip.placed) continue;
      const last = groups[groups.length - 1];
      if (last && last.section === clip.section) last.items.push(clip);
      else groups.push({ section: clip.section, items: [clip] });
    }
    return groups;
  }, [lyrics]);

  const selectedSound =
    selected?.kind === "sound" ? sounds.find((c) => c.id === selected.id) ?? null : null;
  const selectedLyric =
    selected?.kind === "lyric" ? lyrics.find((c) => c.id === selected.id) ?? null : null;

  const unplaced = lyrics.length - placedLyrics.length;

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
          onClick={togglePlay}
          disabled={!playback.ready}
          className="flex h-9 items-center gap-2 rounded bg-yellow-400 px-3 text-sm font-medium text-black transition-colors hover:bg-yellow-300 disabled:opacity-30"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? "Pause" : "Play"}
        </button>
        <span className="w-16 font-mono text-sm tabular-nums text-yellow-400">{formatTime(time)}</span>

        {recording ? (
          <button
            onClick={stopRecording}
            className="flex h-9 items-center gap-2 rounded bg-red-500 px-3 text-sm font-medium text-white transition-colors hover:bg-red-400"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            Stop
          </button>
        ) : (
          <button
            onClick={arming ? () => setArming(false) : openRecorder}
            title="Record a take onto its own track, from the playhead"
            className={`flex h-9 items-center gap-2 rounded px-3 text-sm font-medium transition-colors ${
              arming
                ? "bg-rose-500 text-white hover:bg-rose-400"
                : "text-white/60 ring-1 ring-white/20 hover:text-white hover:ring-white/50"
            }`}
          >
            <Mic className="h-4 w-4" />
            Record
          </button>
        )}
        {recording && <LevelMeter level={level} />}

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
            value={snapBeats}
            onChange={(e) => setSnapBeats(parseFloat(e.target.value))}
            className="rounded border border-white/20 bg-black px-2 py-1.5 text-xs text-white outline-none focus:border-white/60"
          >
            {SNAP_CHOICES.map((choice) => (
              <option key={choice.label} value={choice.beats}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>

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
          {audio.length > 0 && (
            <button
              onClick={exportWAV}
              disabled={exporting || recording}
              title="Mix every un-muted take down to one WAV"
              className="flex h-9 items-center gap-1.5 rounded px-3 text-sm font-medium text-white/50 transition-colors hover:text-white disabled:opacity-30"
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? "Mixing…" : "Export"}
            </button>
          )}
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

      {/* Arming a take: what it's called, what it is, and which input it comes
          from. Recording rolls the song underneath, so a take is played against
          the drums and the takes already down rather than against silence. */}
      {(arming || recording) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-rose-500/10 px-4 py-2">
          <input
            value={takeName}
            onChange={(e) => setTakeName(e.target.value)}
            disabled={recording}
            placeholder="Take name"
            className="h-8 w-40 rounded border border-white/20 bg-black px-2 text-sm text-white outline-none focus:border-white/60 disabled:opacity-50"
          />
          <select
            value={takeType}
            onChange={(e) => setTakeType(e.target.value as LocalTrack["type"])}
            disabled={recording}
            className="h-8 rounded border border-white/20 bg-black px-2 text-sm text-white outline-none focus:border-white/60 disabled:opacity-50"
          >
            <option value="guitar">Guitar</option>
            <option value="vocals">Vocals</option>
            <option value="other">Other</option>
          </select>
          {devices.length > 0 && (
            <select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              disabled={recording}
              className="h-8 max-w-56 flex-1 rounded border border-white/20 bg-black px-2 text-sm text-white outline-none focus:border-white/60 disabled:opacity-50"
            >
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
          )}
          {!recording && (
            <button
              onClick={startRecording}
              className="flex h-8 items-center gap-1.5 rounded bg-rose-500 px-3 text-xs font-semibold text-white transition-colors hover:bg-rose-400"
            >
              <Mic className="h-3.5 w-3.5" />
              Record from {formatTime(time)}
            </button>
          )}
          <span className="text-xs text-white/40">
            {recording
              ? "Recording — the song is rolling underneath."
              : "The take lands at the playhead. Move it there first."}
          </span>
        </div>
      )}

      {audioError && (
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-red-500/10 px-4 py-2 text-xs text-red-300">
          <span className="flex-1">{audioError}</span>
          <button onClick={() => setAudioError(null)} className="text-red-300/60 hover:text-red-200">
            ✕
          </button>
        </div>
      )}

      {/* Tracks — names and lanes share one scroller so a tall lyric track
          can never slide out of line with the labels beside it. */}
      <div className="flex min-h-0 flex-1">
      <Library
        groups={libraryGroups}
        layers={CUE_LAYERS as readonly string[]}
        onGrab={grabFromLibrary}
      />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div data-timeline className="relative" style={{ width: GUTTER + width }}>
          {/* Ruler */}
          <div className="sticky top-0 z-30 flex h-8 bg-black">
            <div
              className="sticky left-0 z-40 shrink-0 border-r border-b border-white/10 bg-black"
              style={{ width: GUTTER }}
            />
            <Ruler duration={duration} zoom={zoom} width={width} beat={beatSeconds} onSeek={seekTo} />
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
              <Grid duration={duration} zoom={zoom} beat={beatSeconds} />
              {placedLyrics.map((clip) => (
                <ClipBox
                  key={clip.id}
                  left={clip.start * zoom}
                  width={Math.max(2, (clip.end - clip.start) * zoom)}
                  top={TRACK_PAD + (lyricLanes.get(clip) ?? 0) * (LANE_HEIGHT + LANE_GAP)}
                  selected={selected?.kind === "lyric" && selected.id === clip.id}
                  className="bg-yellow-400/20 text-yellow-50"
                  edgeClass="bg-yellow-400"
                  title={`${clip.section} — ${formatArrangementTime(clip.start)}`}
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
                <Grid duration={duration} zoom={zoom} beat={beatSeconds} />
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

          {/* Recorded takes — one lane each, sliding to line up with the song. */}
          {audio.map((track) => (
            <div
              key={track.id}
              className="flex border-b border-white/10"
              style={{ height: LANE_HEIGHT + TRACK_PAD * 2 }}
            >
              <TrackName>
                <span className={track.muted ? "text-white/25" : "text-rose-400"}>
                  {track.type === "vocals" ? (
                    <Mic className="h-3 w-3" />
                  ) : (
                    <Music3 className="h-3 w-3" />
                  )}
                </span>
                <span
                  className={`flex-1 truncate normal-case ${track.muted ? "text-white/25" : "text-white/70"}`}
                  title={`${track.name} — ${formatTime(track.durationSec)}`}
                >
                  {track.name}
                </span>
                {!track.syncedAt && userId && (
                  <span title="Waiting to reach the cloud">
                    <Cloud className="h-3 w-3 text-amber-400" />
                  </span>
                )}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={track.volume}
                  onChange={(e) => setTakeVolume(track.id, Number(e.target.value))}
                  aria-label={`${track.name} volume`}
                  className="h-1 w-10 accent-rose-500"
                />
                <button
                  onClick={() => toggleTakeMute(track.id)}
                  title={track.muted ? "Unmute" : "Mute"}
                  className="text-white/30 transition-colors hover:text-white"
                >
                  {track.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => deleteTake(track)}
                  title={`Delete ${track.name}`}
                  aria-label={`Delete ${track.name}`}
                  className="text-white/30 transition-colors hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </TrackName>
              <div className="relative" style={{ width, touchAction: "none" }}>
                <Grid duration={duration} zoom={zoom} beat={beatSeconds} />
                <ClipBox
                  left={trackStart(track) * zoom}
                  width={Math.max(2, track.durationSec * zoom)}
                  top={TRACK_PAD}
                  selected={false}
                  className={
                    track.muted
                      ? "bg-white/5 text-white/30"
                      : "bg-rose-500/25 text-rose-50"
                  }
                  edgeClass="bg-rose-400"
                  title={`${track.name} — starts at ${formatArrangementTime(trackStart(track))}, drag to line it up`}
                  onPointerDown={(e) =>
                    beginDrag(
                      e,
                      { id: track.id, start: trackStart(track), end: trackEnd(track) },
                      "audio",
                      "move"
                    )
                  }
                >
                  {track.name}
                </ClipBox>
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
      </div>

      {/* Footer */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 px-4 py-2 text-xs text-white/35">
        <span>Space plays · ← → jump 5s · Delete removes a clip</span>
        <span>Drag from the library onto the tracks · drag a clip back to shelve it.</span>
        {unplaced > 0 && (
          <span>
            {unplaced} line{unplaced === 1 ? "" : "s"} still in the library, following the line
            above until placed.
          </span>
        )}
        {!dirty && <span className="ml-auto">No changes yet.</span>}
      </div>

      {/* What the pointer is carrying — never under it, or the drop can't see
          what it landed on. */}
      {ghost && (
        <div
          className="pointer-events-none fixed z-[90] max-w-64 truncate rounded bg-yellow-400 px-2 py-1 text-xs font-medium text-black shadow-lg"
          style={{ left: ghost.x + 14, top: ghost.y + 14 }}
        >
          {ghost.label}
        </div>
      )}
    </div>
  );
}

// ─── Library ──────────────────────────────────────────────────────────────────

/**
 * The song's pieces, waiting to be placed. Everything the arrangement hasn't
 * been given a moment for sits here in the order it is written, so building a
 * song is bringing lines over one at a time rather than pulling them apart from
 * a timeline that already has all of them stacked on top of each other.
 */
function Library({
  groups,
  layers,
  onGrab,
}: {
  groups: { section: string; items: LyricClip[] }[];
  layers: readonly string[];
  onGrab: (event: React.PointerEvent, item: LibraryItem) => void;
}) {
  const count = groups.reduce((total, group) => total + group.items.length, 0);

  return (
    <div
      data-library
      className="flex shrink-0 flex-col border-r border-white/10 bg-black"
      style={{ width: LIBRARY_WIDTH }}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
        <ListMusic className="h-3.5 w-3.5 text-yellow-400" />
        <span className="text-xs font-medium uppercase tracking-wide text-white/60">Library</span>
        <span className="ml-auto font-mono text-xs tabular-nums text-white/30">{count}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div className="mb-1 px-1 text-[0.65rem] font-medium uppercase tracking-wide text-white/30">
          Sounds
        </div>
        <div className="mb-3 flex flex-wrap gap-1">
          {layers.map((layer) => (
            <button
              key={layer}
              onPointerDown={(e) =>
                onGrab(e, { kind: "sound", layer, label: layerLabel(layer) })
              }
              title={`Drag ${layerLabel(layer)} onto the timeline`}
              className={`flex cursor-grab items-center gap-1.5 rounded px-2 py-1 text-xs text-white/70 ring-1 ring-white/15 transition-colors select-none hover:ring-white/40 active:cursor-grabbing`}
              style={{ touchAction: "none" }}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${layerStyle(layer).dot}`} />
              {layerLabel(layer)}
            </button>
          ))}
        </div>

        {count === 0 ? (
          <p className="px-1 py-3 text-xs text-white/30">
            Every line is on the timeline. Drag one back here to shelve it.
          </p>
        ) : (
          groups.map((group, i) => (
            <div key={`${group.section}:${i}`} className="mb-3">
              <div className="mb-1 px-1 text-[0.65rem] font-medium uppercase tracking-wide text-white/30">
                {group.section || "Song"}
              </div>
              <div className="flex flex-col gap-0.5">
                {group.items.map((clip) => (
                  <div
                    key={clip.id}
                    onPointerDown={(e) =>
                      onGrab(e, {
                        kind: "lyric",
                        id: clip.id,
                        label: clip.text || "(blank line)",
                      })
                    }
                    title={clip.text || "(blank line)"}
                    className="cursor-grab truncate rounded bg-white/5 px-2 py-1 text-xs text-white/60 transition-colors select-none hover:bg-white/10 hover:text-white active:cursor-grabbing"
                    style={{ touchAction: "none" }}
                  >
                    {clip.text || "·"}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
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

/**
 * Bar numbers a drag can count against — every 1, 2, 4, 8 … bars, whichever
 * leaves the labels far enough apart to read at this zoom. The clock still runs
 * underneath, so each label carries the moment it lands on too.
 */
function barStep(beat: number, zoom: number): number {
  const bar = beat * BEATS_PER_BAR * zoom;
  return [1, 2, 4, 8, 16, 32].find((bars) => bars * bar >= 70) ?? 64;
}

/** Bars along the top, clickable end to end for scrubbing. */
function Ruler({
  duration,
  zoom,
  width,
  beat,
  onSeek,
}: {
  duration: number;
  zoom: number;
  width: number;
  beat: number;
  onSeek: (seconds: number) => void;
}) {
  const step = barStep(beat, zoom);
  const barSeconds = beat * BEATS_PER_BAR;
  const ticks: { bar: number; seconds: number }[] = [];
  for (let bar = 0; bar * barSeconds <= duration; bar += step) {
    ticks.push({ bar, seconds: bar * barSeconds });
  }

  return (
    <div
      className="relative h-8 shrink-0 cursor-pointer border-b border-white/10 bg-black"
      style={{ width, touchAction: "none" }}
      onPointerDown={(e) => {
        const bounds = e.currentTarget.getBoundingClientRect();
        onSeek(Math.max(0, (e.clientX - bounds.left) / zoom));
      }}
    >
      {ticks.map(({ bar, seconds }) => (
        <div key={bar} className="absolute top-0 h-full" style={{ left: seconds * zoom }}>
          <div className="h-2 w-px bg-white/25" />
          <span className="absolute left-1 top-1.5 font-mono text-[0.65rem] tabular-nums text-white/40">
            {bar + 1}
            <span className="ml-1 text-white/20">{formatTime(seconds)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Faint bar lines behind the clips so a drag has something to read against. */
function Grid({ duration, zoom, beat }: { duration: number; zoom: number; beat: number }) {
  const step = barStep(beat, zoom);
  const barSeconds = beat * BEATS_PER_BAR;
  const lines: number[] = [];
  for (let bar = step; bar * barSeconds <= duration; bar += step) lines.push(bar * barSeconds);
  return (
    <>
      {lines.map((seconds) => (
        <div
          key={seconds}
          className="pointer-events-none absolute top-0 bottom-0 w-px bg-white/5"
          style={{ left: seconds * zoom }}
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
