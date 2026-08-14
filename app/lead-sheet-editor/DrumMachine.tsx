"use client";

import { useEffect, useRef, useState } from "react";

// ── Patterns ────────────────────────────────────────────────────────────────
// 16 steps of 16th notes. 1 = hit, 0 = rest.

interface Pattern {
  name: string;
  kick: number[];
  snare: number[];
  hihat: number[];
}

export const DRUM_PATTERNS: Pattern[] = [
  // ── Core indie / folk ──────────────────────────────────────────────────────
  {
    name: "Folk Stomp",
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  },
  {
    name: "Indie Kick",
    kick:  [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "Half-time",
    kick:  [1,0,0,0, 0,0,0,0, 0,1,0,0, 0,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    hihat: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
  },
  {
    name: "Stomp & Brush",
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,1, 0,0,0,0],
    snare: [0,0,1,0, 1,0,0,1, 0,0,1,0, 1,0,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "Shuffle",
    kick:  [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,1,0,0],
    snare: [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,1],
    hihat: [1,0,1,0, 0,1,0,0, 1,0,1,0, 0,1,0,0],
  },
  // ── Grooves ───────────────────────────────────────────────────────────────
  {
    name: "4 on the Floor",
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [0,1,0,1, 0,1,0,1, 0,1,0,1, 0,1,0,1],
  },
  {
    name: "Boom-Chick",
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,1,0, 0,0,0,0, 1,0,1,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "Reggae One Drop",
    kick:  [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  },
  {
    name: "Bossa Nova",
    kick:  [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,0],
    snare: [0,0,1,0, 0,1,0,0, 0,0,1,0, 0,1,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "Slow Groove",
    kick:  [1,0,0,0, 0,0,0,1, 0,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,1,0],
    hihat: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
  },
  {
    name: "March",
    kick:  [1,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    snare: [0,0,1,0, 0,0,1,0, 1,0,1,0, 0,0,1,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  },
  {
    name: "Waltz Feel",
    // 3 beats mapped to 12 of 16 steps (last 4 silent, loop still 16)
    kick:  [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,1,0,0, 0,0,0,0],
    hihat: [1,0,0,0, 1,0,0,0, 1,0,0,0, 0,0,0,0],
  },
  // ── Sparse / simple ───────────────────────────────────────────────────────
  {
    name: "Kick Only",
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "1 & 4",
    // Kick on beat 1, snare on beats 2, 3, 4
    kick:  [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: "Pulse",
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
];

// ── Synthesis ────────────────────────────────────────────────────────────────

/** Roland TR-808 kick for pop/indie: punchy sine with fast pitch drop, ~650ms decay */
function playKick808(ctx: AudioContext, dst: AudioNode, when: number) {
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.type = "sine";

  // Fast pitch sweep — gives the Roland "thump" punch character
  // 100 Hz -> 55 Hz in 30ms (the attack punch), then settles at 30 Hz
  osc.frequency.setValueAtTime(100, when);
  osc.frequency.exponentialRampToValueAtTime(55, when + 0.03);
  osc.frequency.exponentialRampToValueAtTime(30, when + 0.35);

  // Instant attack, ~650ms decay — pop kick, not a sustained bass note
  g.gain.setValueAtTime(1.0, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.65);

  // Light waveshaper for body warmth without harshness
  const ws = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i * 2) / 256 - 1;
    curve[i] = Math.tanh(2 * x) / Math.tanh(2);
  }
  ws.curve = curve;
  ws.oversample = "2x";

  osc.connect(g);
  g.connect(ws);
  ws.connect(dst);
  osc.start(when);
  osc.stop(when + 0.7);
}

function playKick(ctx: AudioContext, dst: AudioNode, when: number) {
  // Warm sine body with pitch drop — indie folk thump
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(160, when);
  osc.frequency.exponentialRampToValueAtTime(42, when + 0.075);
  g.gain.setValueAtTime(0.9, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.45);
  osc.connect(g);
  g.connect(dst);
  osc.start(when);
  osc.stop(when + 0.46);

  // Short noise transient click for attack definition
  const len = Math.ceil(ctx.sampleRate * 0.015);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * ((len - i) / len) ** 2;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.45, when);
  src.connect(cg);
  cg.connect(dst);
  src.start(when);
}

function playSnare(ctx: AudioContext, dst: AudioNode, when: number) {
  // Bandpass noise for brush/snare body
  const len = Math.ceil(ctx.sampleRate * 0.22);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1800;
  bp.Q.value = 0.7;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.55, when);
  ng.gain.exponentialRampToValueAtTime(0.001, when + 0.18);
  noiseSrc.connect(bp);
  bp.connect(ng);
  ng.connect(dst);
  noiseSrc.start(when);
  noiseSrc.stop(when + 0.22);

  // Tone body for snare crack
  const osc = ctx.createOscillator();
  const og = ctx.createGain();
  osc.frequency.setValueAtTime(200, when);
  osc.frequency.exponentialRampToValueAtTime(70, when + 0.06);
  og.gain.setValueAtTime(0.28, when);
  og.gain.exponentialRampToValueAtTime(0.001, when + 0.08);
  osc.connect(og);
  og.connect(dst);
  osc.start(when);
  osc.stop(when + 0.09);
}

function playHihat(ctx: AudioContext, dst: AudioNode, when: number) {
  const len = Math.ceil(ctx.sampleRate * 0.07);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 8000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.22, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
  src.connect(hp);
  hp.connect(g);
  g.connect(dst);
  src.start(when);
  src.stop(when + 0.07);
}

// ── Scheduler hook ────────────────────────────────────────────────────────────

const LOOKAHEAD = 0.12;  // seconds ahead to schedule
const TICK_MS   = 22;    // scheduler polling interval

function useDrumScheduler(
  bpm: number,
  patternIdx: number,
  running: boolean,
  volume: number,
  kickStyle: "folk" | "808",
): number {
  const ctxRef        = useRef<AudioContext | null>(null);
  const masterRef     = useRef<GainNode | null>(null);
  const nextTimeRef   = useRef(0);
  const stepRef       = useRef(0);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const patternIdxRef = useRef(patternIdx);
  const bpmRef        = useRef(bpm);
  const volumeRef     = useRef(volume);
  const kickStyleRef  = useRef(kickStyle);
  const [activeStep, setActiveStep] = useState(-1);

  // Keep refs in sync so the scheduler loop picks up changes without restart
  useEffect(() => { patternIdxRef.current = patternIdx; }, [patternIdx]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { kickStyleRef.current = kickStyle; }, [kickStyle]);
  useEffect(() => {
    volumeRef.current = volume;
    if (masterRef.current) masterRef.current.gain.value = volume;
  }, [volume]);

  useEffect(() => {
    if (!running) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      stepRef.current = 0;
      setActiveStep(-1);
      return;
    }

    // Create AudioContext lazily on first play
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
      masterRef.current = ctxRef.current.createGain();
      masterRef.current.gain.value = volumeRef.current;
      masterRef.current.connect(ctxRef.current.destination);
    } else if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume();
    }

    const ctx = ctxRef.current;
    const dst = masterRef.current!;

    // Start slightly in the future so first note isn't clipped
    nextTimeRef.current = ctx.currentTime + 0.05;
    stepRef.current = 0;

    const tick = () => {
      const stepDur = 15 / bpmRef.current; // 60 / (bpm * 4) seconds per 16th note
      const pat     = DRUM_PATTERNS[patternIdxRef.current];

      while (nextTimeRef.current < ctx.currentTime + LOOKAHEAD) {
        const step = stepRef.current;
        const when = nextTimeRef.current;

        if (pat.kick[step]) {
          if (kickStyleRef.current === "808") playKick808(ctx, dst, when);
          else playKick(ctx, dst, when);
        }
        if (pat.snare[step]) playSnare(ctx, dst, when);
        if (pat.hihat[step]) playHihat(ctx, dst, when);

        // Update visual indicator at the right moment
        const delayMs = Math.max(0, (when - ctx.currentTime) * 1000);
        setTimeout(() => setActiveStep(step), delayMs);

        stepRef.current = (step + 1) % 16;
        nextTimeRef.current += stepDur;
      }
    };

    tick();
    timerRef.current = setInterval(tick, TICK_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [running]);

  // Clean up AudioContext on component unmount
  useEffect(() => {
    return () => {
      ctxRef.current?.close();
    };
  }, []);

  return activeStep;
}

// ── DrumMachineControl component ──────────────────────────────────────────────

export function DrumMachineControl({
  bpm,
  running,
  onToggle,
  patternIdx,
  onPatternChange,
  volume,
  onVolumeChange,
}: {
  bpm: number;
  running: boolean;
  onToggle: () => void;
  patternIdx: number;
  onPatternChange: (idx: number) => void;
  volume: number;
  onVolumeChange: (v: number) => void;
}) {
  const [kickStyle, setKickStyle] = useState<"folk" | "808">("folk");
  const activeStep = useDrumScheduler(bpm, patternIdx, running, volume, kickStyle);
  const pat = DRUM_PATTERNS[patternIdx];

  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-neutral-700 px-2 py-1 print:hidden">
      {/* Toggle button */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={running ? "Stop drums" : "Start drums"}
        title={running ? "Stop drums" : "Start drums"}
        className={`h-8 w-8 flex items-center justify-center rounded-md transition-colors duration-150 flex-shrink-0 ${
          running
            ? "bg-indigo-500 text-white hover:bg-indigo-600"
            : "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 hover:bg-gray-200 dark:hover:bg-neutral-700"
        }`}
      >
        {/* Drum icon */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <ellipse cx="12" cy="8" rx="10" ry="4" />
          <path d="M2 8v8c0 2.2 4.5 4 10 4s10-1.8 10-4V8" />
          <line x1="2" y1="12" x2="22" y2="12" />
        </svg>
      </button>

      {/* Pattern selector */}
      <select
        value={patternIdx}
        onChange={(e) => onPatternChange(Number(e.target.value))}
        aria-label="Drum pattern"
        className="h-8 text-xs rounded-md border border-gray-200 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 px-1 focus:outline-none"
      >
        {DRUM_PATTERNS.map((p, i) => (
          <option key={p.name} value={i}>
            {p.name}
          </option>
        ))}
      </select>

      {/* Kick style toggle: Folk / 808 */}
      <div className="flex rounded-md overflow-hidden border border-gray-200 dark:border-neutral-700 flex-shrink-0">
        {(["folk", "808"] as const).map((style) => (
          <button
            key={style}
            type="button"
            onClick={() => setKickStyle(style)}
            className={`px-2 h-7 text-xs font-medium transition-colors duration-100 ${
              kickStyle === style
                ? style === "808"
                  ? "bg-orange-500 text-white"
                  : "bg-indigo-500 text-white"
                : "bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-neutral-400 hover:bg-gray-200 dark:hover:bg-neutral-700"
            }`}
            aria-label={`${style === "808" ? "TR-808" : "Folk"} kick`}
            title={style === "808" ? "TR-808 sub-bass kick" : "Folk acoustic kick"}
          >
            {style === "808" ? "808" : "Folk"}
          </button>
        ))}
      </div>

      {/* 16-step indicator — only visible while running */}
      {running && (
        <div className="flex gap-px" aria-hidden="true">
          {Array.from({ length: 16 }, (_, i) => {
            const hasHit = pat.kick[i] || pat.snare[i] || pat.hihat[i];
            return (
              <div
                key={i}
                className={`w-1 h-3 rounded-sm transition-colors duration-75 ${
                  i === activeStep
                    ? "bg-indigo-500"
                    : hasHit
                    ? "bg-gray-400 dark:bg-neutral-500"
                    : "bg-gray-200 dark:bg-neutral-700"
                }`}
              />
            );
          })}
        </div>
      )}

      {/* Volume slider */}
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => onVolumeChange(Number(e.target.value))}
        aria-label={`Drum volume ${Math.round(volume * 100)}%`}
        title={`Volume: ${Math.round(volume * 100)}%`}
        className="w-14 h-1 accent-indigo-500 flex-shrink-0"
      />
    </div>
  );
}
