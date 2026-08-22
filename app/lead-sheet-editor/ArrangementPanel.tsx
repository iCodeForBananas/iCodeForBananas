"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Cloud,
  CloudOff,
  Download,
  Mic,
  Music,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  Volume2,
  VolumeX,
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

// ── WAV encoder ────────────────────────────────────────────────────────────────

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function encodeWAV(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sr    = buffer.sampleRate;
  const len   = buffer.length;
  const ab    = new ArrayBuffer(44 + len * numCh * 2);
  const view  = new DataView(ab);

  writeStr(view, 0,  "RIFF");
  view.setUint32(4,  ab.byteLength - 8, true);
  writeStr(view, 8,  "WAVE");
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1,     true);  // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr,    true);
  view.setUint32(28, sr * numCh * 2, true);
  view.setUint16(32, numCh * 2,      true);
  view.setUint16(34, 16, true);
  writeStr(view, 36, "data");
  view.setUint32(40, len * numCh * 2, true);

  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function bestMime(): string {
  for (const t of [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

// ── Level meter ────────────────────────────────────────────────────────────────

function LevelMeter({ level }: { level: number }) {
  const bars = 10;
  return (
    <div className="flex items-end gap-0.5 h-5">
      {Array.from({ length: bars }, (_, i) => {
        const active = level >= (i + 1) / bars;
        const color  = i < 7 ? "bg-green-500" : i < 9 ? "bg-yellow-400" : "bg-red-500";
        return (
          <div
            key={i}
            className={`w-1.5 rounded-sm transition-all duration-75 ${
              active ? color : "bg-gray-200 dark:bg-neutral-700"
            }`}
            style={{ height: `${40 + i * 7}%` }}
          />
        );
      })}
    </div>
  );
}

// ── Track type icon ────────────────────────────────────────────────────────────

function TrackIcon({ type }: { type: LocalTrack["type"] }) {
  if (type === "vocals") return <Mic   className="w-3.5 h-3.5" />;
  return                         <Music className="w-3.5 h-3.5" />;
}

// ── ArrangementPanel ───────────────────────────────────────────────────────────

export interface ArrangementPanelProps {
  sheetId:   string;
  userId:    string | null;
  songTitle: string;
}

export function ArrangementPanel({ sheetId, userId, songTitle }: ArrangementPanelProps) {
  const [tracks,    setTracks   ] = useState<LocalTrack[]>([]);
  const [adding,    setAdding   ] = useState(false);
  const [recording, setRecording] = useState(false);
  const [playing,   setPlaying  ] = useState(false);
  const [syncing,   setSyncing  ] = useState(false);
  const [devices,   setDevices  ] = useState<MediaDeviceInfo[]>([]);
  const [deviceId,  setDeviceId ] = useState("");
  const [newName,   setNewName  ] = useState("Guitar");
  const [newType,   setNewType  ] = useState<LocalTrack["type"]>("guitar");
  const [level,     setLevel    ] = useState(0);
  const [recSecs,   setRecSecs  ] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [error,     setError    ] = useState<string | null>(null);

  const mrRef      = useRef<MediaRecorder | null>(null);
  const chunksRef  = useRef<Blob[]>([]);
  const streamRef  = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animRef    = useRef<number | null>(null);
  const recStartRef = useRef(0);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const playSrcsRef = useRef<AudioBufferSourceNode[]>([]);

  // ── Load ──────────────────────────────────────────────────────────────────────

  const reload = useCallback(async () => {
    setTracks(await getTracksForSheet(sheetId));
  }, [sheetId]);

  useEffect(() => {
    reload();
    if (userId && navigator.onLine) {
      fetchFromSupabase(sheetId).then(reload).catch(() => {});
      syncToSupabase().catch(() => {});
    }
  }, [sheetId, userId, reload]);

  // ── Device enumeration ────────────────────────────────────────────────────────

  const loadDevices = useCallback(async () => {
    try {
      // Request permission so labels are returned
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach(t => t.stop());
      const all = await navigator.mediaDevices.enumerateDevices();
      const ins = all.filter(d => d.kind === "audioinput");
      setDevices(ins);
      if (ins.length && !deviceId) setDeviceId(ins[0].deviceId);
    } catch {
      setError("Microphone access denied. Check browser permissions.");
    }
  }, [deviceId]);

  const handleAddTrack = () => {
    setAdding(true);
    loadDevices();
  };

  // ── Level meter ────────────────────────────────────────────────────────────────

  const startMeter = (stream: MediaStream) => {
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const an  = ctx.createAnalyser();
    an.fftSize = 256;
    src.connect(an);
    analyserRef.current = an;

    const tick = () => {
      if (!analyserRef.current) return;
      const d = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteTimeDomainData(d);
      let max = 0;
      for (const v of d) max = Math.max(max, Math.abs((v - 128) / 128));
      setLevel(max);
      animRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const stopMeter = () => {
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
    analyserRef.current = null;
    setLevel(0);
  };

  // ── Recording ─────────────────────────────────────────────────────────────────

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      streamRef.current = stream;
      chunksRef.current = [];

      const mime = bestMime();
      const mr   = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mrRef.current = mr;

      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      mr.onstop = async () => {
        const blob     = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        const duration = (Date.now() - recStartRef.current) / 1000;

        const track: LocalTrack = {
          id:          crypto.randomUUID(),
          sheetId,
          name:        newName.trim() || "Track",
          type:        newType,
          mimeType:    mr.mimeType || "audio/webm",
          blob,
          durationSec: duration,
          volume:      0.8,
          muted:       false,
          offsetMs:    0,
          createdAt:   recStartRef.current,
          syncedAt:    null,
          storagePath: null,
        };

        await saveTrack(track);
        setTracks(prev => [...prev, track]);
        setAdding(false);
        setRecording(false);
        if (userId && navigator.onLine) syncToSupabase().catch(() => {});
      };

      recStartRef.current = Date.now();
      setRecSecs(0);
      setRecording(true);
      mr.start(250);
      startMeter(stream);
      recTimerRef.current = setInterval(() => {
        setRecSecs(Math.floor((Date.now() - recStartRef.current) / 1000));
      }, 500);
    } catch (e) {
      setError(`Recording failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const stopRecording = () => {
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    stopMeter();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    mrRef.current?.stop();
    // onstop fires async; recording state cleared there
  };

  // ── Playback ──────────────────────────────────────────────────────────────────

  const stopPlayback = useCallback(() => {
    playSrcsRef.current.forEach(s => { try { s.stop(); } catch {} });
    playSrcsRef.current = [];
    playCtxRef.current?.close();
    playCtxRef.current = null;
    setPlaying(false);
  }, []);

  const startPlayback = async () => {
    stopPlayback();
    const active = tracks.filter(t => !t.muted && t.blob);
    if (!active.length) return;

    const ctx = new AudioContext();
    playCtxRef.current = ctx;
    const srcs: AudioBufferSourceNode[] = [];

    let done = 0;
    const onEnded = () => { if (++done >= active.length) { playCtxRef.current = null; setPlaying(false); } };

    for (const track of active) {
      try {
        const buf = await ctx.decodeAudioData(await track.blob.arrayBuffer());
        const g   = ctx.createGain();
        g.gain.value = track.volume;
        g.connect(ctx.destination);
        const src = ctx.createBufferSource();
        src.buffer  = buf;
        src.onended = onEnded;
        src.connect(g);
        src.start(ctx.currentTime + Math.max(0, track.offsetMs / 1000));
        srcs.push(src);
      } catch (e) {
        console.warn("[arrangement] decode failed:", track.name, e);
        onEnded();
      }
    }

    playSrcsRef.current = srcs;
    setPlaying(true);
  };

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  // ── Per-track controls ────────────────────────────────────────────────────────

  const setTrackVolume = async (id: string, volume: number) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, volume } : t));
    await updateTrackMeta(id, { volume });
  };

  const toggleMute = async (id: string) => {
    setTracks(prev => prev.map(t => {
      if (t.id !== id) return t;
      const muted = !t.muted;
      updateTrackMeta(id, { muted });
      return { ...t, muted };
    }));
  };

  const deleteTrack = async (track: LocalTrack) => {
    if (!confirm(`Delete "${track.name}"? This cannot be undone.`)) return;
    await deleteTrackEverywhere(track);
    setTracks(prev => prev.filter(t => t.id !== track.id));
  };

  // ── Sync ──────────────────────────────────────────────────────────────────────

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncToSupabase();
      await fetchFromSupabase(sheetId);
      await reload();
    } finally {
      setSyncing(false);
    }
  };

  // ── Export WAV ────────────────────────────────────────────────────────────────

  const exportWAV = async () => {
    const active = tracks.filter(t => !t.muted && t.blob);
    if (!active.length) { setError("No un-muted tracks to export."); return; }

    setExporting(true);
    setError(null);
    try {
      const maxDur = Math.max(...active.map(t => t.durationSec + t.offsetMs / 1000));
      const sr     = 48000;
      const off    = new OfflineAudioContext(2, Math.ceil(maxDur * sr), sr);

      for (const track of active) {
        const buf = await off.decodeAudioData(await track.blob.arrayBuffer());
        const g   = off.createGain();
        g.gain.value = track.volume;
        g.connect(off.destination);
        const src = off.createBufferSource();
        src.buffer = buf;
        src.connect(g);
        src.start(Math.max(0, track.offsetMs / 1000));
      }

      const rendered = await off.startRendering();
      const wav      = encodeWAV(rendered);
      const url      = URL.createObjectURL(wav);
      const a        = Object.assign(document.createElement("a"), {
        href:     url,
        download: `${songTitle.replace(/[^\w\s-]/g, "").trim() || "arrangement"}.wav`,
      });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────────

  const pendingSync = tracks.some(t => !t.syncedAt);

  return (
    <div className="border-t border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-950 print:hidden">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-gray-200 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-rose-500 shrink-0" />
          <span className="text-sm font-semibold text-gray-800 dark:text-neutral-100">Arrangement</span>
          {tracks.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-neutral-700 text-gray-600 dark:text-neutral-300 font-medium">
              {tracks.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {userId ? (
            <button
              onClick={handleSync}
              disabled={syncing}
              title={pendingSync ? "Sync pending tracks to cloud" : "Refresh from cloud"}
              className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors ${
                pendingSync
                  ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                  : "text-gray-400 dark:text-neutral-500 hover:bg-gray-200 dark:hover:bg-neutral-700"
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            </button>
          ) : (
            <span title="Sign in to enable cloud sync" className="text-gray-300 dark:text-neutral-600">
              <CloudOff className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
      </div>

      {/* Error bar */}
      {error && (
        <div className="mx-4 mt-2 flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 shrink-0">✕</button>
        </div>
      )}

      {/* New-track form */}
      {adding && (
        <div className="px-4 py-3 border-b border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <div className="flex flex-wrap gap-2 mb-2.5">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Track name"
              className="h-8 text-sm rounded-md border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 px-2.5 text-gray-800 dark:text-neutral-100 flex-1 min-w-24 outline-none focus:ring-1 focus:ring-rose-400"
            />
            <select
              value={newType}
              onChange={e => setNewType(e.target.value as LocalTrack["type"])}
              className="h-8 text-sm rounded-md border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 px-2 text-gray-800 dark:text-neutral-100 cursor-pointer"
            >
              <option value="guitar">Guitar</option>
              <option value="vocals">Vocals</option>
              <option value="other">Other</option>
            </select>
            {devices.length > 0 && (
              <select
                value={deviceId}
                onChange={e => setDeviceId(e.target.value)}
                className="h-8 text-sm rounded-md border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 px-2 text-gray-700 dark:text-neutral-200 cursor-pointer flex-1 min-w-36 max-w-56"
              >
                {devices.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            )}
          </div>

          {recording ? (
            <div className="flex items-center gap-3">
              <button
                onClick={stopRecording}
                className="h-8 flex items-center gap-1.5 px-3 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-colors"
              >
                <Square className="w-3 h-3 fill-current" /> Stop
              </button>
              <LevelMeter level={level} />
              <span className="text-xs font-mono text-red-500 font-semibold tabular-nums animate-pulse">
                ● {fmtTime(recSecs)}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={startRecording}
                className="h-8 flex items-center gap-1.5 px-3 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold transition-colors"
              >
                <Mic className="w-3.5 h-3.5" /> Record
              </button>
              <button
                onClick={() => setAdding(false)}
                className="h-8 px-3 rounded-lg bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-600 dark:text-neutral-300 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Track list */}
      {tracks.length === 0 && !adding ? (
        <div className="px-4 py-8 text-center">
          <Mic className="w-8 h-8 mx-auto mb-2 text-gray-200 dark:text-neutral-700" />
          <p className="text-sm text-gray-400 dark:text-neutral-500">
            No tracks yet. Hit <strong className="text-gray-600 dark:text-neutral-300">+ Add Track</strong> to start recording.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-neutral-800/60">
          {tracks.map(track => (
            <div key={track.id} className="flex items-center gap-2 px-4 py-2">
              {/* Icon + name + duration */}
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className={`shrink-0 ${track.muted ? "text-gray-300 dark:text-neutral-600" : "text-gray-400 dark:text-neutral-500"}`}>
                  <TrackIcon type={track.type} />
                </span>
                <span className={`text-sm font-medium truncate ${track.muted ? "text-gray-400 dark:text-neutral-600" : "text-gray-800 dark:text-neutral-100"}`}>
                  {track.name}
                </span>
                <span className="text-xs text-gray-400 dark:text-neutral-500 font-mono shrink-0">
                  {fmtTime(track.durationSec)}
                </span>
                {!track.syncedAt && userId && (
                  <span title="Pending cloud sync"><Cloud className="w-3 h-3 text-amber-400 shrink-0" /></span>
                )}
              </div>

              {/* Volume */}
              <input
                type="range"
                min={0} max={1} step={0.05}
                value={track.volume}
                onChange={e => setTrackVolume(track.id, Number(e.target.value))}
                aria-label={`${track.name} volume`}
                className="w-16 h-1 accent-rose-500 shrink-0"
              />

              {/* Mute */}
              <button
                onClick={() => toggleMute(track.id)}
                title={track.muted ? "Unmute" : "Mute"}
                className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors shrink-0 ${
                  track.muted
                    ? "bg-gray-200 dark:bg-neutral-700 text-gray-400 dark:text-neutral-500"
                    : "text-gray-500 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800"
                }`}
              >
                {track.muted
                  ? <VolumeX className="w-3.5 h-3.5" />
                  : <Volume2 className="w-3.5 h-3.5" />}
              </button>

              {/* Delete */}
              <button
                onClick={() => deleteTrack(track)}
                title="Delete track"
                className="h-7 w-7 flex items-center justify-center rounded-md text-gray-300 dark:text-neutral-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Bottom controls */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-200 dark:border-neutral-800 flex-wrap">
        {!adding && (
          <button
            onClick={handleAddTrack}
            className="h-8 flex items-center gap-1.5 px-2.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Track
          </button>
        )}

        {tracks.length > 0 && (
          <>
            <button
              onClick={playing ? stopPlayback : startPlayback}
              disabled={exporting || recording}
              className={`h-8 flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${
                playing
                  ? "bg-gray-700 dark:bg-neutral-600 text-white hover:bg-gray-800 dark:hover:bg-neutral-500"
                  : "bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 hover:bg-gray-200 dark:hover:bg-neutral-700"
              }`}
            >
              {playing
                ? <><Square className="w-3.5 h-3.5 fill-current" /> Stop</>
                : <><Play  className="w-3.5 h-3.5 fill-current" /> Play All</>}
            </button>

            <button
              onClick={exportWAV}
              disabled={exporting || recording}
              className="h-8 flex items-center gap-1.5 px-2.5 rounded-lg bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200 text-xs font-medium transition-colors disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              {exporting ? "Exporting…" : "Export WAV"}
            </button>
          </>
        )}
      </div>

      {tracks.length > 0 && (
        <p className="px-4 pb-3 text-xs text-gray-400 dark:text-neutral-600">
          Start the drum machine / strings first, then hit Record — they play alongside your recording.
          The WAV export contains only recorded audio tracks.
        </p>
      )}
    </div>
  );
}
