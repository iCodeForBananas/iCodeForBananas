"use client";

import { useState, useEffect, useRef, type KeyboardEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Rocket, Star, Trophy, ChevronRight, Sparkles, Check, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import styles from "./space-math.module.css";
import { findSkill } from "../lib/spaceMathSkills";
import {
  type TopicDef,
  type TopicRecord,
  DEFAULT_RECORD,
  advanceRecord,
  nextMomentum,
  normalizeRecords,
  selectTopic,
  tickTopics,
} from "../lib/spaceMathSchedule";
import { type FractionVisual, type Problem, buildProblem } from "../lib/spaceMathGenerator";

// The scheduler (spaced-repetition records, topic ladder and in-round
// momentum) lives in app/lib/spaceMathSchedule.ts, the skill list in
// app/lib/spaceMathSkills.ts and the question generator in
// app/lib/spaceMathGenerator.ts. This file owns the game screen.

// buildProblem lives in app/lib/spaceMathGenerator.ts.

function generateForTopic(topic: TopicDef, recentSignatures: string[] = []): Problem {
  let problem = buildProblem(topic.type, topic.min, topic.max);
  let attempts = 0;
  while (recentSignatures.includes(problem.signature) && attempts < 20) {
    problem = buildProblem(topic.type, topic.min, topic.max);
    attempts++;
  }
  return problem;
}

async function postQuestionProgress(
  topicKey: string,
  wasCorrect: boolean,
  records: Record<string, TopicRecord>,
  sessionId: string,
) {
  const skill = findSkill(topicKey);
  if (!skill) return;
  // The generator's own `learned` flag: sticky, never cleared by a later
  // miss, so a review question that goes wrong can't knock a skill back out
  // of "mastered" the way the old cross-topic stage computation could.
  const mastered = records[topicKey]?.learned ?? false;
  try {
    await fetch("/api/space-math/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_name: "cai", session_id: sessionId, skill_id: topicKey, correct: wasCorrect ? 1 : 0, total: 1, mastered }),
    });
  } catch (e) {
    console.error("Failed to save progress", e);
  }
}

// ─── Audio ────────────────────────────────────────────────────────────────────

const playSound = (type: "correct" | "incorrect" | "badge") => {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    if (type === "correct") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.1);
      osc.frequency.setValueAtTime(783.99, now + 0.2);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === "incorrect") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else {
      osc.type = "square";
      osc.frequency.setValueAtTime(392, now);
      osc.frequency.setValueAtTime(523.25, now + 0.15);
      osc.frequency.setValueAtTime(659.25, now + 0.3);
      osc.frequency.setValueAtTime(783.99, now + 0.45);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
      gain.gain.setValueAtTime(0.1, now + 0.45);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 1);
      osc.start(now);
      osc.stop(now + 1);
    }
  } catch (e) {
    console.error("Audio error", e);
  }
};

// ─── FractionShape ────────────────────────────────────────────────────────────

function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// Renders one fraction visual: a pie, a row of bar segments, or a grid of
// squares/dots, with `shaded` of `total` pieces filled in.
const FractionShape = ({ visual, size = 120 }: { visual: FractionVisual; size?: number }) => {
  const { shape, total, shaded } = visual;
  const fill = "var(--ds-color-primary-solid)";
  const empty = "color-mix(in oklab, var(--ds-color-text-primary) 15%, transparent)";
  const stroke = "var(--ds-color-text-muted)";

  if (shape === "circle") {
    const r = size / 2 - 4;
    const cx = size / 2;
    const cy = size / 2;
    const step = 360 / total;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {Array.from({ length: total }, (_, i) => {
          const start = polarPoint(cx, cy, r, i * step);
          const end = polarPoint(cx, cy, r, (i + 1) * step);
          const largeArc = step > 180 ? 1 : 0;
          const d = `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
          return <path key={i} d={d} fill={i < shaded ? fill : empty} stroke={stroke} strokeWidth={2} />;
        })}
      </svg>
    );
  }

  if (shape === "bar") {
    const w = size * 1.6;
    const h = size * 0.55;
    const segW = w / total;
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {Array.from({ length: total }, (_, i) => (
          <rect key={i} x={i * segW} y={0} width={segW} height={h} fill={i < shaded ? fill : empty} stroke={stroke} strokeWidth={2} />
        ))}
      </svg>
    );
  }

  // "square" (grid partition of a whole) and "set" (discrete dots) share a grid layout
  const cols = Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / cols);
  const cell = size / Math.max(cols, rows);
  return (
    <svg width={cols * cell} height={rows * cell} viewBox={`0 0 ${cols * cell} ${rows * cell}`}>
      {Array.from({ length: total }, (_, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const filled = i < shaded;
        if (shape === "set") {
          return (
            <circle
              key={i}
              cx={col * cell + cell / 2}
              cy={row * cell + cell / 2}
              r={cell * 0.35}
              fill={filled ? fill : empty}
              stroke={stroke}
              strokeWidth={2}
            />
          );
        }
        return (
          <rect
            key={i}
            x={col * cell + 2}
            y={row * cell + 2}
            width={cell - 4}
            height={cell - 4}
            fill={filled ? fill : empty}
            stroke={stroke}
            strokeWidth={2}
          />
        );
      })}
    </svg>
  );
};

// ─── ShadeGrid ────────────────────────────────────────────────────────────────
// The real click-to-shade primitive: pie wedges / bar segments / grid cells /
// a set of dots, each one an independently tappable (and keyboard-operable)
// piece. Grading is immediate and permanent per tap, matching how every
// other question type in the game answers — tap, see the result — rather
// than a separate "toggle, then submit" flow: shading one cell too many
// (going past the target count) resolves the question wrong right then,
// the same as tapping a wrong multiple-choice button would.
function wedgePath(cx: number, cy: number, r: number, index: number, total: number): string {
  const step = 360 / total;
  const start = polarPoint(cx, cy, r, index * step);
  const end = polarPoint(cx, cy, r, (index + 1) * step);
  const largeArc = step > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

const SHADE_FILL = "var(--ds-color-primary-solid)";
const SHADE_EMPTY = "color-mix(in oklab, var(--ds-color-text-primary) 15%, transparent)";
const SHADE_STROKE = "var(--ds-color-text-muted)";

// Takes a `key` prop at the call site (not shown in this signature) set to
// something that changes per question — React remounts the whole
// component on a key change, which is what resets the shaded set between
// questions, rather than a useEffect reacting to a prop change.
//
// Grading: every question in the game gets exactly one answer, handled in
// handleAnswer, not here. Shading itself is freely correctable (tap a cell
// to shade it, tap again to unshade); only tapping Check submits the
// current count, via the same onComplete -> handleAnswer path every other
// question type answers through.
const ShadeGrid = ({
  shape,
  total,
  disabled,
  onComplete,
}: {
  shape: FractionVisual["shape"];
  total: number;
  disabled: boolean;
  onComplete: (shadedCount: number) => void;
}) => {
  const [shaded, setShaded] = useState<Set<number>>(new Set());

  const tap = (i: number) => {
    if (disabled) return;
    const next = new Set(shaded);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setShaded(next);
  };

  const cellA11y = (i: number) => ({
    role: "button" as const,
    tabIndex: disabled ? -1 : 0,
    "aria-label": `part ${i + 1} of ${total}${shaded.has(i) ? ", shaded" : ", not shaded"}`,
    "aria-pressed": shaded.has(i),
    onClick: () => tap(i),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        tap(i);
      }
    },
    style: { cursor: disabled ? "default" : "pointer", outline: "none" } as const,
  });

  const footer = (
    <div className="flex flex-col items-center gap-3 mt-3">
      <div className="text-center text-sm font-semibold text-ink-muted">
        {shaded.size} / {total} shaded
      </div>
      <Button variant="primary" size="xl" disabled={disabled} onClick={() => onComplete(shaded.size)}>
        Check
      </Button>
    </div>
  );

  if (shape === "circle") {
    const size = 280;
    const r = size / 2 - 6;
    const cx = size / 2;
    const cy = size / 2;
    return (
      <div>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {Array.from({ length: total }, (_, i) => (
            <path
              key={i}
              {...cellA11y(i)}
              d={wedgePath(cx, cy, r, i, total)}
              fill={shaded.has(i) ? SHADE_FILL : SHADE_EMPTY}
              stroke={SHADE_STROKE}
              strokeWidth={2}
            />
          ))}
        </svg>
        {footer}
      </div>
    );
  }

  if (shape === "bar") {
    const w = 320;
    const h = 110;
    const segW = w / total;
    return (
      <div>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          {Array.from({ length: total }, (_, i) => (
            <rect
              key={i}
              {...cellA11y(i)}
              x={i * segW}
              y={0}
              width={segW}
              height={h}
              fill={shaded.has(i) ? SHADE_FILL : SHADE_EMPTY}
              stroke={SHADE_STROKE}
              strokeWidth={2}
            />
          ))}
        </svg>
        {footer}
      </div>
    );
  }

  // "square" (grid partition) and "set" (group of objects) share a grid layout
  const size = 260;
  const cols = Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / cols);
  const cell = size / Math.max(cols, rows);
  const w = cols * cell;
  const h = rows * cell;
  return (
    <div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {Array.from({ length: total }, (_, i) => {
          const row = Math.floor(i / cols);
          const col = i % cols;
          const filled = shaded.has(i);
          if (shape === "set") {
            return (
              <circle
                key={i}
                {...cellA11y(i)}
                cx={col * cell + cell / 2}
                cy={row * cell + cell / 2}
                r={cell * 0.38}
                fill={filled ? SHADE_FILL : SHADE_EMPTY}
                stroke={SHADE_STROKE}
                strokeWidth={2}
              />
            );
          }
          return (
            <rect
              key={i}
              {...cellA11y(i)}
              x={col * cell + 3}
              y={row * cell + 3}
              width={cell - 6}
              height={cell - 6}
              fill={filled ? SHADE_FILL : SHADE_EMPTY}
              stroke={SHADE_STROKE}
              strokeWidth={2}
            />
          );
        })}
      </svg>
      {footer}
    </div>
  );
};

// ─── StarBank ─────────────────────────────────────────────────────────────────

const StarBank = ({ score, onClear }: { score: number; onClear: () => void }) => (
  <div className='w-full p-3 pl-14 flex items-start sm:items-center gap-4 z-50 relative min-h-[60px]'>
    <Button size='sm' variant='danger' onClick={onClear} className='shrink-0 uppercase'>
      Clear
    </Button>
    <div className='flex flex-wrap gap-2 flex-1 content-start'>
      <AnimatePresence>
        {Array.from({ length: Math.floor(score / 10) }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ scale: 0, rotate: -180, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className='w-5 h-5'
          >
            <Star className='w-5 h-5 text-primary-text fill-primary-text drop-shadow-sm' />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  </div>
);

// ─── SessionProgressBar ───────────────────────────────────────────────────────

const SESSION_GOAL = 25;

const SessionProgressBar = ({ correct }: { correct: number }) => {
  const pct = Math.min((correct / SESSION_GOAL) * 100, 100);
  const isDone = correct >= SESSION_GOAL;
  return (
    <div className='w-full mb-2 shrink-0'>
      <div className='flex justify-between items-center mb-2 px-1'>
        <div className='flex items-center gap-2 text-xs font-bold text-ink-muted uppercase tracking-wider'>
          <Star className='w-3 h-3 text-primary-text fill-primary-text' />
          Session
        </div>
        <span className={`text-xs font-bold ${isDone ? "text-primary-text" : "text-ink-muted"}`}>
          {correct} / {SESSION_GOAL} correct
        </span>
      </div>
      <div className='w-full h-2.5 bg-surface-raised/80 rounded-full overflow-hidden border border-line-strong'>
        <motion.div
          className={`h-full rounded-full ${isDone ? "bg-primary-solid" : "bg-accent-solid"}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 80, damping: 15 }}
        />
      </div>
    </div>
  );
};

// ─── Static decorations (module-level so Math.random never runs during render) ─

/**
 * The starfield, nebulae and comets, painted on a canvas.
 *
 * Like the rest of this page, these colors are literal, not design-system
 * tokens — Space Math is meant to look like a fun kids' game, not match the
 * rest of the site, so it deliberately opts out of the shared palette
 * (see space-math.module.css for why that stays safe to do here).
 */
function SpaceBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    if (!ctx) return;

    type Star = { x: number; y: number; r: number; phase: number; speed: number };
    type Comet = { x: number; y: number; vx: number; vy: number; len: number; life: number; maxLife: number };

    const stars: Star[] = Array.from({ length: 180 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.6 + 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.025 + 0.004,
    }));

    const comets: Comet[] = [];
    let nextCometIn = 30 + Math.random() * 60;

    function spawnComet() {
      const w = canvas.width;
      const h = canvas.height;
      const angle = (6 + Math.random() * 24) * (Math.PI / 180);
      const speed = 10 + Math.random() * 9;
      comets.push({
        x: -280,
        y: Math.random() * h * 0.8,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        len: 90 + Math.random() * 170,
        life: 0,
        maxLife: Math.ceil((w + 560) / speed),
      });
    }

    function resize() {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const NEBULAE = [
      { cx: 0.12, cy: 0.42, rr: 0.48, rgb: "59,130,246",  a: 0.08 },
      { cx: 0.88, cy: 0.16, rr: 0.40, rgb: "139,92,246",  a: 0.07 },
      { cx: 0.52, cy: 0.88, rr: 0.34, rgb: "16,185,129",  a: 0.05 },
    ];

    let frame = 0;
    let animId: number;

    function draw() {
      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) { animId = requestAnimationFrame(draw); return; }

      ctx.clearRect(0, 0, w, h);

      for (const n of NEBULAE) {
        const gx = n.cx * w, gy = n.cy * h, gr = n.rr * Math.max(w, h);
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
        g.addColorStop(0, `rgba(${n.rgb},${n.a})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      for (const s of stars) {
        const alpha = 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(frame * s.speed + s.phase));
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.fill();
      }

      if (--nextCometIn <= 0) {
        spawnComet();
        nextCometIn = 90 + Math.random() * 180;
      }

      for (let i = comets.length - 1; i >= 0; i--) {
        const c = comets[i];
        const p = c.life / c.maxLife;
        const alpha = p < 0.08 ? p / 0.08 : p > 0.85 ? (1 - p) / 0.15 : 1;
        const mag = Math.hypot(c.vx, c.vy);
        const tx = c.x - (c.vx / mag) * c.len;
        const ty = c.y - (c.vy / mag) * c.len;

        const streak = ctx.createLinearGradient(tx, ty, c.x, c.y);
        streak.addColorStop(0, "rgba(255,255,255,0)");
        streak.addColorStop(0.5, `rgba(180,210,255,${(alpha * 0.4).toFixed(3)})`);
        streak.addColorStop(1, `rgba(255,255,255,${alpha.toFixed(3)})`);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(c.x, c.y);
        ctx.strokeStyle = streak;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const headGlow = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 6);
        headGlow.addColorStop(0, `rgba(255,255,255,${alpha.toFixed(3)})`);
        headGlow.addColorStop(1, "rgba(255,255,255,0)");
        ctx.beginPath();
        ctx.arc(c.x, c.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = headGlow;
        ctx.fill();

        c.x += c.vx;
        c.y += c.vy;
        c.life++;
        if (c.life >= c.maxLife) comets.splice(i, 1);
      }

      frame++;
      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => { cancelAnimationFrame(animId); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

const CONFETTI = Array.from({ length: 20 }, () => ({
  x: (Math.random() - 0.5) * 400,
  y: (Math.random() - 0.5) * 400,
  delay: Math.random() * 2,
}));

function readSave() {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem("space-math-save") ?? "null"); } catch { return null; }
}

// Candy-bright, black-outlined answer tiles — deliberately not the shared
// design-system tokens (see space-math.module.css). Cycled by option index
// so the four tiles always read as distinct, playful choices rather than a
// wall of identical grey buttons.
const OPTION_COLORS = [
  "bg-track-2",
  "bg-track-1",
  "bg-track-5",
  "bg-track-6",
];

const CONFETTI_COLORS = ["bg-track-1", "bg-track-2", "bg-track-3", "bg-track-4", "bg-track-5", "bg-track-6"];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SpaceMathPage() {
  const [topicRecords, setTopicRecords] = useState<Record<string, TopicRecord>>(() => normalizeRecords(readSave()?.topicRecords));
  const [currentTopic, setCurrentTopic] = useState<TopicDef | null>(null);
  const [lastTopicKey, setLastTopicKey] = useState<string | null>(null);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [recentSignatures, setRecentSignatures] = useState<string[]>([]);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState<number>(() => readSave()?.score ?? 0);
  // Questions in a row answered right this round; sets how hard the next one may be
  const [momentum, setMomentum] = useState(0);
  const [gameState, setGameState] = useState<"start" | "playing" | "finale">("start");
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const [sessionTopicStats, setSessionTopicStats] = useState<Record<string, { correct: number; total: number }>>({});

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-open");
    const sidebarOpen = stored === null ? true : stored === "true";
    if (!sidebarOpen) document.documentElement.style.overflow = "hidden";

    const onToggle = (e: Event) => {
      const open = (e as CustomEvent<{ isOpen: boolean }>).detail.isOpen;
      document.documentElement.style.overflow = open ? "" : "hidden";
    };
    window.addEventListener("sidebar-toggle", onToggle);
    return () => {
      document.documentElement.style.overflow = "";
      window.removeEventListener("sidebar-toggle", onToggle);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("space-math-save", JSON.stringify({ score, topicRecords }));
  }, [score, topicRecords]);

  // One answer per question: right or wrong, the next question follows.
  const handleAnswer = (answer: number | string) => {
    if (selectedAnswer !== null || !problem || !currentTopic) return;
    setSelectedAnswer(answer);
    const correct = answer === problem.answer;
    setIsCorrect(correct);
    playSound(correct ? "correct" : "incorrect");

    const capturedSigs = recentSignatures;
    const capturedTopic = currentTopic;
    const capturedTopicStats = sessionTopicStats;

    // Update records immediately so the POST carries accurate mastery state
    const updated = advanceRecord(topicRecords[capturedTopic.key] ?? DEFAULT_RECORD, correct);
    const ticked = tickTopics({ ...topicRecords, [capturedTopic.key]: updated }, capturedTopic.key);
    setTopicRecords(ticked);
    setLastTopicKey(capturedTopic.key);
    setSessionTopicStats({
      ...capturedTopicStats,
      [capturedTopic.key]: {
        correct: (capturedTopicStats[capturedTopic.key]?.correct ?? 0) + (correct ? 1 : 0),
        total: (capturedTopicStats[capturedTopic.key]?.total ?? 0) + 1,
      },
    });
    postQuestionProgress(capturedTopic.key, correct, ticked, sessionId);

    const nextMomentumValue = nextMomentum(momentum, correct);
    setMomentum(nextMomentumValue);

    const nextSessionCorrect = sessionCorrect + (correct ? 1 : 0);
    if (correct) {
      setScore((s) => s + 10);
      setSessionCorrect(nextSessionCorrect);
    }

    setTimeout(() => {
      if (nextSessionCorrect >= SESSION_GOAL) {
        playSound("badge");
        setGameState("finale");
      } else {
        const next = selectTopic(ticked, capturedTopic.key, nextMomentumValue);
        setCurrentTopic(next);
        const p = generateForTopic(next, capturedSigs);
        setProblem(p);
        setRecentSignatures((prev) => [...prev.slice(-9), p.signature]);
      }
      setSelectedAnswer(null);
      setIsCorrect(null);
    }, 2000);
  };

  // Number keys 1..N pick the matching answer tile, left to right, top to
  // bottom. No dependency array: handleAnswer closes over the current state,
  // so the listener is rebound each render to always call the fresh one.
  useEffect(() => {
    if (gameState !== "playing" || !problem || problem.shadeTarget) return;
    const options = problem.options;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (!/^[1-9]$/.test(e.key)) return;
      const index = Number(e.key) - 1;
      if (index >= options.length) return;
      e.preventDefault();
      handleAnswer(options[index]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const startGame = () => {
    // Every round starts from zero momentum, so it opens on review and climbs
    const topic = selectTopic(topicRecords, lastTopicKey, 0);
    setCurrentTopic(topic);
    const p = generateForTopic(topic, []);
    setProblem(p);
    setRecentSignatures([p.signature]);
    setMomentum(0);
    setGameState("playing");
  };

  const resetGame = () => {
    setTopicRecords({});
    setCurrentTopic(null);
    setLastTopicKey(null);
    setSessionCorrect(0);
    setMomentum(0);
    setProblem(null);
    setSessionTopicStats({});
    setSessionId(crypto.randomUUID());
    setGameState("start");
  };

  const clearStars = () => {
    setScore(0);
  };

  const isThreeOptions = problem && problem.options.length === 3;

  return (
    <div className='flex-1 bg-surface-sunken text-ink-primary selection:bg-primary-solid/30 relative flex flex-col overflow-hidden max-h-screen'>
      <SpaceBackground />
      <StarBank score={score} onClear={clearStars} />
      <main className='relative z-10 w-full pt-4 sm:pt-6 px-4 sm:px-6 pb-20 sm:pb-24 flex flex-col items-center flex-1 min-h-0 overflow-hidden'>
        <div className='w-full flex justify-between items-center mb-3 sm:mb-4 shrink-0'>
          <div className='flex items-center gap-3'>
            <div className='p-2 bg-primary-solid rounded-md'>
              <Rocket className='w-5 h-5 sm:w-6 sm:h-6 text-ink-on-primary' />
            </div>
            <div>
              <h1 className='text-lg sm:text-xl font-bold tracking-tight'>Space Math</h1>
            </div>
          </div>
          <Button size='sm' variant='secondary' onClick={resetGame} className='uppercase'>
            Reset
          </Button>
        </div>

        <AnimatePresence mode='wait'>
          {gameState === "start" && (
            <motion.div
              key='start'
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className='flex-1 min-h-0 flex flex-col items-center justify-center text-center gap-6 sm:gap-8'
            >
              <div className='relative'>
                <motion.div
                  animate={{ y: [0, -20, 0], rotate: [0, 5, 0] }}
                  transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                >
                  <Rocket className='w-24 h-24 sm:w-28 sm:h-28 md:w-36 md:h-36 text-primary-text drop-shadow-lg' />
                </motion.div>
                <motion.div
                  className='absolute -bottom-4 -right-4'
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                >
                  <Sparkles className='w-10 h-10 sm:w-12 sm:h-12 text-primary-text' />
                </motion.div>
              </div>
              <div>
                <h2 className='text-3xl sm:text-4xl md:text-5xl font-black mb-3 sm:mb-4 text-primary-text'>
                  Ready for Launch?
                </h2>
              </div>
              <Button variant='primary' size='xl' onClick={startGame}>
                START MISSION <ChevronRight className='w-5 h-5' />
              </Button>
            </motion.div>
          )}

          {gameState === "playing" && problem && (
            <motion.div
              key='playing'
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className='w-full flex-1 min-h-0 flex flex-col items-center gap-3 sm:gap-4'
            >
              <SessionProgressBar correct={sessionCorrect} />
              <AnimatePresence>
                {selectedAnswer !== null && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    className='fixed inset-0 flex items-center justify-center pointer-events-none z-50'
                  >
                    <div className='relative flex items-center justify-center'>
                      {/* radial countdown ring */}
                      <svg
                        className='absolute'
                        width='224'
                        height='224'
                        viewBox='0 0 224 224'
                        style={{ transform: "rotate(-90deg)" }}
                      >
                        <circle
                          cx='112'
                          cy='112'
                          r='104'
                          fill='none'
                          stroke='var(--ds-color-border-strong)'
                          strokeWidth='14'
                        />
                        <motion.circle
                          cx='112'
                          cy='112'
                          r='104'
                          fill='none'
                          stroke={isCorrect ? "var(--ds-color-success)" : "var(--ds-color-danger)"}
                          strokeWidth='14'
                          strokeLinecap='round'
                          strokeDasharray={2 * Math.PI * 104}
                          initial={{ strokeDashoffset: 0 }}
                          animate={{ strokeDashoffset: 2 * Math.PI * 104 }}
                          transition={{ duration: 2, ease: "linear" }}
                        />
                      </svg>
                      <div
                        className={`p-12 rounded-full shadow-overlay ${isCorrect ? "bg-success" : `bg-danger ${styles.shake}`}`}
                      >
                        {isCorrect ? (
                          <Check className='w-32 h-32 text-ink-on-primary' />
                        ) : (
                          <X className='w-32 h-32 text-ink-on-primary' />
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className='w-full flex-1 min-h-0'>
                <div className='w-full h-full bg-surface-raised border border-line-subtle rounded-lg p-4 sm:p-6 relative overflow-hidden flex flex-col'>
                  <div className='text-center mb-2 sm:mb-3 shrink-0'>
                    <h2 className='font-black mb-1 tracking-tight leading-snug text-3xl sm:text-4xl md:text-5xl break-words text-ink-primary'>
                      {problem.question}
                    </h2>
                    {problem.visual && (
                      <div className='flex items-center justify-center gap-6 mt-2'>
                        {problem.visual.map((v, i) => (
                          <FractionShape key={i} visual={v} />
                        ))}
                      </div>
                    )}
                  </div>
                  {problem.shadeTarget ? (
                    <div className='flex-1 min-h-0 flex flex-col items-center justify-center'>
                      <ShadeGrid
                        key={problem.id}
                        shape={problem.shadeTarget.shape}
                        total={problem.shadeTarget.total}
                        disabled={selectedAnswer !== null}
                        onComplete={(count) => handleAnswer(count)}
                      />
                    </div>
                  ) : (
                  <div className={`grid gap-2 sm:gap-3 flex-1 min-h-0 ${isThreeOptions ? "grid-cols-3" : "grid-cols-2"}`}>
                    {problem.options.map((opt, i) => {
                      const isSelected = selectedAnswer === opt;
                      const isRevealCorrect = selectedAnswer !== null && !isSelected && opt === problem.answer;
                      const colorClasses = isSelected
                        ? isCorrect
                          ? "bg-success"
                          : `bg-danger ${styles.shake}`
                        : isRevealCorrect
                          ? "bg-success"
                          : `${OPTION_COLORS[i % OPTION_COLORS.length]} hover:brightness-110`;
                      const optMatch = problem.optionsArePictures && problem.optionShape ? /^(\d+)\/(\d+)$/.exec(String(opt)) : null;
                      return (
                        <button
                          key={i}
                          disabled={selectedAnswer !== null}
                          onClick={() => handleAnswer(opt)}
                          aria-keyshortcuts={String(i + 1)}
                          className={`relative flex items-center justify-center rounded-md text-4xl sm:text-6xl md:text-8xl font-black text-ink-on-primary transition-all ${colorClasses}`}
                        >
                          <span
                            aria-hidden='true'
                            className='absolute top-1.5 left-2 sm:top-2 sm:left-3 text-sm sm:text-base font-bold opacity-70 leading-none'
                          >
                            {i + 1}
                          </span>
                          {optMatch ? (
                            <FractionShape
                              visual={{ shape: problem.optionShape!, total: Number(optMatch[2]), shaded: Number(optMatch[1]) }}
                              size={72}
                            />
                          ) : (
                            opt
                          )}
                        </button>
                      );
                    })}
                  </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {gameState === "finale" && (
            <motion.div
              key='finale'
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className='flex-1 min-h-0 flex flex-col items-center justify-center text-center gap-6 sm:gap-8'
            >
              <div className='relative'>
                <motion.div
                  animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Trophy className='w-36 h-36 sm:w-44 sm:h-44 md:w-56 md:h-56 text-primary-text drop-shadow-lg' />
                </motion.div>
                {CONFETTI.map((p, i) => (
                  <motion.div
                    key={i}
                    className={`absolute top-1/2 left-1/2 w-2 h-2 rounded-full ${CONFETTI_COLORS[i % CONFETTI_COLORS.length]}`}
                    initial={{ x: 0, y: 0 }}
                    animate={{ x: p.x, y: p.y, opacity: 0, scale: 0 }}
                    transition={{ duration: 2, repeat: Infinity, delay: p.delay }}
                  />
                ))}
              </div>
              <div>
                <h2 className='text-4xl sm:text-5xl md:text-6xl font-black mb-3 sm:mb-4 text-primary-text animate-pulse'>
                  SESSION COMPLETE!
                </h2>
                <p className='text-2xl sm:text-3xl text-ink-muted'>
                  You answered <span className='text-ink-primary font-bold'>25</span> questions correctly!
                </p>
              </div>
              <div className='flex flex-col gap-4 items-center'>
                <Button variant='primary' size='xl' onClick={() => {
                    setSessionCorrect(0);
                    setSessionTopicStats({});
                    setSessionId(crypto.randomUUID());
                    setMomentum(0);
                    const next = selectTopic(topicRecords, lastTopicKey, 0);
                    setCurrentTopic(next);
                    const p = generateForTopic(next, []);
                    setProblem(p);
                    setRecentSignatures([p.signature]);
                    setGameState("playing");
                  }}>
                  KEEP GOING
                </Button>
                <Button variant='secondary' size='xl' onClick={resetGame}>
                  START OVER
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <div className='absolute -bottom-20 -left-20 w-64 h-64 bg-track-2/20 rounded-full blur-3xl pointer-events-none' />
      <div className='absolute -top-20 -right-20 w-80 h-80 bg-track-4/20 rounded-full blur-3xl pointer-events-none' />
    </div>
  );
}
