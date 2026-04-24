'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Rocket, Star, Trophy, ChevronRight, Sparkles, CheckCircle2, XCircle, Volume2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ProblemType =
  | 'addition' | 'subtraction' | 'place-value'
  | 'mental-ten' | 'add-100' | 'word-problem'
  | 'comparison' | 'time' | 'shapes' | 'fractions';

type HintOp =
  | '+' | '-' | 'tens-ones'
  | 'mental-add' | 'mental-sub'
  | 'add-100' | 'word-add' | 'word-sub'
  | 'comparison' | 'time' | 'shape' | 'fraction';

interface Problem {
  id: string;
  type: ProblemType;
  question: string;
  answer: number | string;
  options: (number | string)[];
  visualHint: { left: number; right: number; operator: HintOp; extra?: string };
  signature: string;
}

type Difficulty = 'easy' | 'medium' | 'hard';

interface Stage {
  id: number;
  label: string;
  types: ProblemType[];
  min: number;
  max: number;
  icon: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DIFFICULTY_LEVELS: { id: Difficulty; label: string; description: string; color: string }[] = [
  { id: 'easy', label: 'Cadet', description: 'Numbers up to 10', color: 'bg-blue-600' },
];

const MASTERY_THRESHOLD = 5;

const STAGES: Stage[] = [
  { id: 1, label: 'Add to 5',       types: ['addition'],                        min: 1,  max: 5,  icon: '➕' },
  { id: 2, label: 'Subtract to 5',  types: ['subtraction'],                     min: 1,  max: 5,  icon: '➖' },
  { id: 3, label: 'Add to 10',      types: ['addition', 'subtraction'],         min: 6,  max: 10, icon: '🔢' },
  { id: 4, label: 'Subtract to 10', types: ['addition', 'subtraction'],         min: 6,  max: 10, icon: '🔢' },
  { id: 5, label: 'Place Value',     types: ['place-value', 'mental-ten'],       min: 1,  max: 9,  icon: '🧮' },
  { id: 6, label: 'Add to 100',      types: ['add-100', 'word-problem'],         min: 10, max: 90, icon: '💯' },
  { id: 7, label: 'Compare Numbers', types: ['comparison', 'mental-ten'],        min: 10, max: 99, icon: '⚖️' },
  { id: 8, label: 'Time & Shapes',   types: ['time', 'shapes'],                  min: 1,  max: 12, icon: '🕐' },
  { id: 9, label: 'Fractions',       types: ['fractions', 'shapes'],             min: 1,  max: 4,  icon: '½' },
];

const COLORS_HEX: Record<Difficulty, string> = { easy: '#10B981', medium: '#3B82F6', hard: '#F43F5E' };

const WP_SUBJECTS = ['rockets', 'aliens', 'stars', 'moons', 'comets', 'astronauts'];
const WP_ADD_VERBS = ['land at', 'join', 'appear at', 'launch from'];
const WP_SUB_VERBS = ['fly away from', 'leave', 'blast off from', 'depart from'];

const SHAPE_QS: { q: string; a: number; hint: string }[] = [
  { q: 'How many sides does a triangle have?',      a: 3, hint: '△' },
  { q: 'How many corners does a triangle have?',    a: 3, hint: '△' },
  { q: 'How many sides does a square have?',        a: 4, hint: '□' },
  { q: 'How many corners does a square have?',      a: 4, hint: '□' },
  { q: 'How many sides does a rectangle have?',     a: 4, hint: '▭' },
  { q: 'How many sides does a pentagon have?',      a: 5, hint: '⬠' },
  { q: 'How many sides does a hexagon have?',       a: 6, hint: '⬡' },
  { q: 'How many vertices does a hexagon have?',    a: 6, hint: '⬡' },
  { q: 'A circle has how many sides?',              a: 0, hint: '○' },
  { q: 'How many faces does a cube have?',          a: 6, hint: '🧊' },
  { q: 'How many flat faces does a cone have?',     a: 1, hint: '🔺' },
  { q: 'How many flat faces does a cylinder have?', a: 2, hint: '🥫' },
  { q: 'How many sides does a trapezoid have?',     a: 4, hint: '⏢' },
];

const FRACTION_QS: { q: string; a: string; opts: string[]; hint: string }[] = [
  { q: 'A pizza cut into 2 equal pieces — one piece is:', a: '1/2', opts: ['1/2','1/3','1/4','2/3'], hint: '1/2' },
  { q: 'A pizza cut into 4 equal pieces — one piece is:', a: '1/4', opts: ['1/2','1/4','1/3','1/8'], hint: '1/4' },
  { q: 'A shape split into 2 equal parts — each part is:', a: '1/2', opts: ['1/2','1/3','1/4','1/5'], hint: '1/2' },
  { q: 'A rectangle divided into 4 equal parts — one part is:', a: '1/4', opts: ['1/2','1/3','1/4','2/4'], hint: '1/4' },
  { q: 'How many halves make a whole?',  a: '2', opts: ['2','3','4','8'], hint: '1/2' },
  { q: 'How many quarters make a whole?', a: '4', opts: ['2','3','4','6'], hint: '1/4' },
  { q: 'How many fourths make one whole?', a: '4', opts: ['2','3','4','8'], hint: '1/4' },
  { q: 'A circle is cut into 4 equal parts. One shaded part equals:', a: '1/4', opts: ['1/4','1/2','3/4','1/3'], hint: '1/4' },
  { q: '1/2 of a shape is shaded. What fraction is NOT shaded?', a: '1/2', opts: ['1/2','1/3','1/4','2/3'], hint: '1/2' },
];

// ─── Problem Generator ────────────────────────────────────────────────────────

function numOpts(answer: number): number[] {
  const s = new Set<number>([answer]);
  let attempts = 0;
  while (s.size < 4 && attempts < 100) {
    attempts++;
    const off = Math.floor(Math.random() * 5) + 1;
    s.add(Math.random() > 0.5 ? answer + off : Math.max(0, answer - off));
  }
  return Array.from(s).sort((a, b) => a - b);
}

function buildProblem(type: ProblemType, min: number, max: number): Problem {
  const id = Math.random().toString(36).substr(2, 9);

  if (type === 'addition') {
    const left = Math.floor(Math.random() * (max - min)) + min; // min to max-1, leaving room for right
    const right = Math.floor(Math.random() * (max - left)) + 1; // 1 to (max - left), so left+right <= max
    const answer = left + right;
    return { id, type, question: `${left} + ${right} = ?`, answer, options: numOpts(answer), visualHint: { left, right, operator: '+' }, signature: `add:${Math.min(left,right)},${Math.max(left,right)}` };
  }

  if (type === 'subtraction') {
    const answer = Math.floor(Math.random() * (max - min + 1)) + min;
    const right = Math.floor(Math.random() * (max - min + 1)) + 1;
    const left = answer + right;
    return { id, type, question: `${left} - ${right} = ?`, answer, options: numOpts(answer), visualHint: { left, right, operator: '-' }, signature: `sub:${left},${right}` };
  }

  if (type === 'place-value') {
    const tens = Math.floor(Math.random() * Math.min(max, 9) + 1);
    const ones = Math.floor(Math.random() * 10);
    const answer = tens * 10 + ones;
    return { id, type, question: `${tens} tens and ${ones} ones = ?`, answer, options: numOpts(answer), visualHint: { left: tens, right: ones, operator: 'tens-ones' }, signature: `place:${tens},${ones}` };
  }

  if (type === 'mental-ten') {
    const base = Math.floor(Math.random() * (max - min - 10)) + min + 10;
    const isAdd = base <= 109;
    const answer = isAdd ? base + 10 : base - 10;
    return {
      id, type,
      question: isAdd ? `${base} + 10 = ?` : `${base} - 10 = ?`,
      answer, options: numOpts(answer),
      visualHint: { left: base, right: 10, operator: isAdd ? 'mental-add' : 'mental-sub' },
      signature: `mental${isAdd?'+':'-'}:${base}`,
    };
  }

  if (type === 'add-100') {
    // 1st grade patterns: round tens + single digit (20+7) OR round tens + round tens (20+30)
    const useTens = Math.random() > 0.5;
    let left: number, right: number;
    if (useTens) {
      // e.g. 20 + 30 = 50
      const t1 = Math.floor(Math.random() * 4) + 1; // 10–40
      const t2 = Math.floor(Math.random() * (5 - t1)) + 1;
      left = t1 * 10; right = t2 * 10;
    } else {
      // e.g. 30 + 6 = 36
      const tens = Math.floor(Math.random() * 4) + 1; // 1–4 tens
      const ones = Math.floor(Math.random() * 8) + 1; // 1–8
      left = tens * 10; right = ones;
    }
    const answer = left + right;
    return { id, type, question: `${left} + ${right} = ?`, answer, options: numOpts(answer), visualHint: { left, right, operator: 'add-100' }, signature: `add100:${left},${right}` };
  }

  if (type === 'word-problem') {
    const subj = WP_SUBJECTS[Math.floor(Math.random() * WP_SUBJECTS.length)];
    const isAdd = Math.random() > 0.4;
    // Word problems stay within 20 per 1st grade curriculum
    const a = Math.floor(Math.random() * 10) + 1;  // 1–10
    const b = Math.floor(Math.random() * 10) + 1;  // 1–10
    let question: string, answer: number;
    if (isAdd) {
      const verb = WP_ADD_VERBS[Math.floor(Math.random() * WP_ADD_VERBS.length)];
      question = `There are ${a} ${subj}. ${b} more ${verb} the station. How many total?`;
      answer = a + b;
    } else {
      const verb = WP_SUB_VERBS[Math.floor(Math.random() * WP_SUB_VERBS.length)];
      question = `There are ${a + b} ${subj}. ${b} ${verb} the station. How many are left?`;
      answer = a;
    }
    return { id, type, question, answer, options: numOpts(answer), visualHint: { left: a, right: b, operator: isAdd ? 'word-add' : 'word-sub' }, signature: `wp-${isAdd?'add':'sub'}:${a},${b}` };
  }

  if (type === 'comparison') {
    const a = Math.floor(Math.random() * (max - min + 1)) + min;
    const b = Math.floor(Math.random() * (max - min + 1)) + min;
    const answer = a < b ? '<' : a > b ? '>' : '=';
    return { id, type, question: `${a}   ○   ${b}`, answer, options: ['<', '=', '>'], visualHint: { left: a, right: b, operator: 'comparison' }, signature: `cmp:${a},${b}` };
  }

  if (type === 'time') {
    const hour = Math.floor(Math.random() * 12) + 1;
    const isHalf = Math.random() > 0.5;
    const minutes = isHalf ? 30 : 0;
    const timeStr = `${hour}:${minutes === 0 ? '00' : '30'}`;
    const wrongHour1 = ((hour % 12) + 1) + 1 > 12 ? 1 : ((hour % 12) + 1) + 1;
    const wrongHour2 = hour - 1 < 1 ? 12 : hour - 1;
    const opts = [
      timeStr,
      `${wrongHour1}:${minutes === 0 ? '00' : '30'}`,
      `${wrongHour2}:${minutes === 0 ? '00' : '30'}`,
      `${hour}:${minutes === 0 ? '30' : '00'}`,
    ];
    opts.sort(() => Math.random() - 0.5);
    const q = isHalf
      ? `The clock shows half past ${hour}. What time is it?`
      : `The clock shows ${hour} o'clock. What time is it?`;
    return { id, type, question: q, answer: timeStr, options: opts, visualHint: { left: hour, right: minutes, operator: 'time' }, signature: `time:${timeStr}` };
  }

  if (type === 'shapes') {
    const sq = SHAPE_QS[Math.floor(Math.random() * SHAPE_QS.length)];
    return { id, type, question: sq.q, answer: sq.a, options: numOpts(sq.a), visualHint: { left: sq.a, right: 0, operator: 'shape', extra: sq.hint }, signature: `shape:${sq.q.slice(0,25)}` };
  }

  if (type === 'fractions') {
    const fq = FRACTION_QS[Math.floor(Math.random() * FRACTION_QS.length)];
    return { id, type, question: fq.q, answer: fq.a, options: fq.opts, visualHint: { left: 0, right: 0, operator: 'fraction', extra: fq.hint }, signature: `frac:${fq.q.slice(0,25)}` };
  }

  return buildProblem('addition', min, max);
}

const generateProblem = (stageIndex: number, difficulty: Difficulty, recentSignatures: string[] = []): Problem => {
  const stage = STAGES[stageIndex];
  let { min, max } = stage;
  if (stageIndex < 7) {
    if (difficulty === 'medium') { max = Math.floor(max * 1.8); min = Math.max(min, 2); }
    else if (difficulty === 'hard') { max = Math.floor(max * 3); min = Math.max(min, 5); }
  }
  const type = stage.types[Math.floor(Math.random() * stage.types.length)];
  let problem = buildProblem(type, min, max);
  let attempts = 0;
  while (recentSignatures.includes(problem.signature) && attempts < 20) {
    problem = buildProblem(type, min, max);
    attempts++;
  }
  return problem;
};

// ─── Visual Scaffolding ───────────────────────────────────────────────────────

function ClockFace({ hours, minutes }: { hours: number; minutes: number }) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const cx = 50, cy = 50;
  const hourDeg = ((hours % 12) + minutes / 60) * 30 - 90;
  const minDeg = minutes * 6 - 90;
  return (
    <svg width="200" height="200" viewBox="0 0 100 100">
      <circle cx={cx} cy={cy} r={45} fill="#1e293b" stroke="#94a3b8" strokeWidth="2" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = i * 30 - 90;
        return <line key={i} x1={cx + 36 * Math.cos(toRad(a))} y1={cy + 36 * Math.sin(toRad(a))} x2={cx + 43 * Math.cos(toRad(a))} y2={cy + 43 * Math.sin(toRad(a))} stroke="#94a3b8" strokeWidth={i % 3 === 0 ? 2 : 1} />;
      })}
      {[12,3,6,9].map((n, i) => {
        const a = i * 90 - 90;
        return <text key={n} x={cx + 28 * Math.cos(toRad(a))} y={cy + 28 * Math.sin(toRad(a))} textAnchor="middle" dominantBaseline="middle" fill="#e2e8f0" fontSize="10">{n}</text>;
      })}
      <line x1={cx} y1={cy} x2={cx + 24 * Math.cos(toRad(hourDeg))} y2={cy + 24 * Math.sin(toRad(hourDeg))} stroke="#facc15" strokeWidth="4" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={cx + 36 * Math.cos(toRad(minDeg))} y2={cy + 36 * Math.sin(toRad(minDeg))} stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={3} fill="#fff" />
    </svg>
  );
}

function FractionBar({ hint }: { hint: string }) {
  const parts = hint === '1/4' ? 4 : 2;
  const w = 140, h = 40, gap = 3;
  const pw = (w - gap * (parts - 1)) / parts;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {Array.from({ length: parts }, (_, i) => (
        <rect key={i} x={i * (pw + gap)} y={0} width={pw} height={h} fill={i === 0 ? '#a855f7' : '#334155'} rx={4} />
      ))}
    </svg>
  );
}

const VisualScaffolding = ({ hint }: { hint: Problem['visualHint'] }) => {
  if (hint.operator === 'tens-ones') {
    return (
      <div className="flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20">
        <div className="flex gap-3">
          {Array.from({ length: hint.left }).map((_, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <span className="text-[8px] text-blue-300 text-center">Ten</span>
              <div className="grid grid-cols-1 gap-0.5 bg-blue-500/30 p-0.5 rounded border border-blue-400">
                {Array.from({ length: 10 }).map((_, j) => <div key={j} className="w-2.5 h-2.5 bg-blue-400 rounded-sm" />)}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-0.5 max-w-[80px] items-center">
            {Array.from({ length: hint.right }).map((_, i) => <div key={i} className="w-2.5 h-2.5 bg-emerald-400 rounded-sm" />)}
          </div>
        </div>
        <p className="text-[10px] text-blue-200">Blue stacks = 10, green blocks = 1</p>
      </div>
    );
  }

  if (hint.operator === 'mental-add' || hint.operator === 'mental-sub') {
    const isAdd = hint.operator === 'mental-add';
    const result = isAdd ? hint.left + 10 : hint.left - 10;
    return (
      <div className="flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20">
        <div className="flex items-center gap-3 text-2xl font-black">
          <span className="text-white">{hint.left}</span>
          <span className={isAdd ? 'text-emerald-400' : 'text-rose-400'}>{isAdd ? '+10' : '−10'}</span>
          <span className="text-white/40">=</span>
          <span className="text-yellow-400">{result}</span>
        </div>
        <p className="text-[10px] text-blue-200">{isAdd ? 'The tens digit goes up by 1!' : 'The tens digit goes down by 1!'}</p>
      </div>
    );
  }

  if (hint.operator === 'add-100') {
    return (
      <div className="flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20">
        <div className="flex items-center gap-3 text-2xl font-black">
          <span className="text-blue-300">{hint.left}</span>
          <span className="text-white">+</span>
          <span className="text-emerald-300">{hint.right}</span>
        </div>
        <p className="text-[10px] text-blue-200">Think about the tens and ones separately!</p>
      </div>
    );
  }

  if (hint.operator === 'word-add' || hint.operator === 'word-sub') {
    const isAdd = hint.operator === 'word-add';
    return (
      <div className="flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20">
        <div className="flex items-center gap-3 flex-wrap justify-center">
          <div className="flex flex-wrap gap-1 max-w-[100px] justify-center">
            {Array.from({ length: hint.left }).map((_, i) => <div key={i} className="w-3 h-3 bg-orange-400 rounded-full" />)}
          </div>
          <span className="text-xl font-bold text-white">{isAdd ? '+' : '−'}</span>
          <div className="flex flex-wrap gap-1 max-w-[100px] justify-center">
            {Array.from({ length: hint.right }).map((_, i) => <div key={i} className="w-3 h-3 bg-purple-400 rounded-full" />)}
          </div>
        </div>
        <p className="text-[10px] text-blue-200">{isAdd ? 'Count all the dots together!' : 'Start with the first group and take away!'}</p>
      </div>
    );
  }

  if (hint.operator === 'comparison') {
    return (
      <div className="flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20">
        <div className="flex items-center gap-4 text-3xl font-black">
          <span className="text-blue-300">{hint.left}</span>
          <div className="flex flex-col items-center text-sm text-slate-400 gap-0.5">
            <span>{'>'} = greater than</span>
            <span>{'<'} = less than</span>
            <span>= means equal</span>
          </div>
          <span className="text-emerald-300">{hint.right}</span>
        </div>
      </div>
    );
  }

  if (hint.operator === 'time') {
    return (
      <div className="flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20">
        <ClockFace hours={hint.left} minutes={hint.right} />
        <p className="text-[10px] text-blue-200">Yellow hand = hour · Blue hand = minutes</p>
      </div>
    );
  }

  if (hint.operator === 'shape') {
    return (
      <div className="flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20">
        <span className="text-5xl">{hint.extra}</span>
        <p className="text-[10px] text-blue-200">Count the sides or corners carefully!</p>
      </div>
    );
  }

  if (hint.operator === 'fraction') {
    return (
      <div className="flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20">
        <FractionBar hint={hint.extra ?? '1/2'} />
        <p className="text-[10px] text-blue-200">Purple = one equal part of the whole</p>
      </div>
    );
  }

  // Default: addition / subtraction dots
  return (
    <div className="flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20">
      <div className="flex items-center gap-3 flex-wrap justify-center">
        <div className="flex flex-wrap gap-1 max-w-[100px] justify-center">
          {Array.from({ length: hint.left }).map((_, i) => <div key={i} className="w-3 h-3 bg-orange-400 rounded-full shadow-lg shadow-orange-500/20" />)}
        </div>
        <span className="text-xl font-bold text-white">{hint.operator === '+' ? '+' : '−'}</span>
        <div className="flex flex-wrap gap-1 max-w-[100px] justify-center">
          {Array.from({ length: hint.right }).map((_, i) => <div key={i} className="w-3 h-3 bg-purple-400 rounded-full shadow-lg shadow-purple-500/20" />)}
        </div>
      </div>
      <p className="text-[10px] text-blue-200">{hint.operator === '+' ? 'Count all the dots together!' : 'Start with the first group and take away!'}</p>
    </div>
  );
};

// ─── Audio ────────────────────────────────────────────────────────────────────

const playSound = (type: 'correct' | 'incorrect' | 'badge') => {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination); const now = ctx.currentTime;
    if (type === 'correct') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(523.25, now); osc.frequency.setValueAtTime(659.25, now + 0.1); osc.frequency.setValueAtTime(783.99, now + 0.2);
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.2, now + 0.05); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.start(now); osc.stop(now + 0.4);
    } else if (type === 'incorrect') {
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, now); osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.2, now + 0.05); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now); osc.stop(now + 0.3);
    } else {
      osc.type = 'square'; osc.frequency.setValueAtTime(392, now); osc.frequency.setValueAtTime(523.25, now + 0.15); osc.frequency.setValueAtTime(659.25, now + 0.3); osc.frequency.setValueAtTime(783.99, now + 0.45);
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.1, now + 0.05); gain.gain.setValueAtTime(0.1, now + 0.45); gain.gain.exponentialRampToValueAtTime(0.01, now + 1);
      osc.start(now); osc.stop(now + 1);
    }
  } catch (e) { console.error('Audio error', e); }
};

// ─── StarBank ─────────────────────────────────────────────────────────────────

const StarBank = ({ score, onClear }: { score: number; onClear: () => void }) => (
  <div className="w-full bg-slate-900/80 border-b border-white/10 p-3 pl-14 flex items-start sm:items-center gap-4 z-50 relative min-h-[60px]">
    <button onClick={onClear} className="text-[10px] font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-400/20 uppercase bg-rose-400/10 px-2 py-1 rounded transition-colors shrink-0">Clear</button>
    <div className="flex flex-wrap gap-1.5 flex-1 content-start">
      <AnimatePresence>
        {Array.from({ length: Math.floor(score / 10) }).map((_, i) => (
          <motion.div key={i} initial={{ scale: 0, rotate: -180, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }} className="w-5 h-5">
            <Star className="w-5 h-5 text-yellow-400 fill-yellow-400 drop-shadow-[0_0_4px_rgba(250,204,21,0.8)]" />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  </div>
);

// ─── MasteryPath ──────────────────────────────────────────────────────────────

const MasteryPath = ({ currentStage, completedStages, masteryCount, isWrong, difficulty }: { currentStage: number; completedStages: number[]; masteryCount: number; isWrong: boolean; difficulty: Difficulty }) => {
  const colorHex = COLORS_HEX[difficulty];
  const level = DIFFICULTY_LEVELS.find(d => d.id === difficulty);
  return (
    <div className="w-full overflow-x-auto mb-4">
      <div className="flex justify-between items-center px-3 py-4 bg-slate-900/40 rounded-3xl border border-white/5 relative" style={{ minWidth: 560 }}>
        <div className="absolute left-8 right-8 h-0.5 bg-slate-800 top-1/2 -translate-y-1/2 z-0" />
        {STAGES.map((stage, idx) => {
          const isCurrent = idx === currentStage;
          const isCompleted = completedStages.includes(idx);
          const progress = isCurrent ? (masteryCount / MASTERY_THRESHOLD) * 100 : isCompleted ? 100 : 0;
          const dotSize = 'w-9 h-9';
          const svgSize = 'w-[44px] h-[44px]';
          return (
            <div key={stage.id} className="relative z-10 flex flex-col items-center gap-1">
              <motion.div
                animate={isCurrent && isWrong ? { x: [-4,4,-4,4,0] } : {}}
                transition={{ duration: 0.4 }}
                className={`relative ${dotSize} rounded-full flex items-center justify-center text-base border-2 transition-all ${isCompleted ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.4)]' : isCurrent ? `${level?.color || 'bg-blue-600'} border-white shadow-[0_0_12px_rgba(255,255,255,0.2)]` : 'bg-slate-800 border-slate-700 text-slate-500'}`}
              >
                {isCompleted ? <Trophy className="w-4 h-4 text-white" /> : stage.icon}
                {isCurrent && (
                  <svg className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 ${svgSize} pointer-events-none`} viewBox="0 0 44 44">
                    <circle cx="22" cy="22" r="20" fill="transparent" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                    <motion.circle cx="22" cy="22" r="20" fill="transparent" stroke={colorHex} strokeWidth="3" strokeDasharray="125.66" initial={{ strokeDashoffset: 125.66 }} animate={{ strokeDashoffset: 125.66 - (125.66 * progress) / 100 }} transition={{ type: 'spring', stiffness: 50 }} />
                  </svg>
                )}
              </motion.div>
              <span className={`text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${isCurrent ? 'text-blue-400' : 'text-slate-500'}`}>{stage.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SpaceMathPage() {
  const difficulty: Difficulty = 'easy';
  const [stageIndex, setStageIndex] = useState(0);
  const [completedStages, setCompletedStages] = useState<number[]>([]);
  const [masteryCount, setMasteryCount] = useState(0);
  const [recentSignatures, setRecentSignatures] = useState<string[]>([]);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [gameState, setGameState] = useState<'start' | 'playing' | 'level-up' | 'finale'>('start');
  const [stars, setStars] = useState<{ w: number; h: number; t: number; l: number; o: number; d: number }[]>([]);
  useEffect(() => {
    setStars(Array.from({ length: 50 }, () => ({ w: Math.random() * 3, h: Math.random() * 3, t: Math.random() * 100, l: Math.random() * 100, o: Math.random() * 0.7 + 0.3, d: Math.random() * 5 })));
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('space-math-save');
      if (saved) { const d = JSON.parse(saved); setScore(d.score || 0); setStageIndex(d.stageIndex || 0); setCompletedStages(d.completedStages || []); }
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem('space-math-save', JSON.stringify({ score, stageIndex, completedStages }));
  }, [score, stageIndex, completedStages]);

  useEffect(() => {
    if (gameState === 'playing' && !problem) {
      const p = generateProblem(stageIndex, difficulty, recentSignatures);
      setProblem(p); setRecentSignatures(prev => [...prev.slice(-9), p.signature]);
    }
  }, [gameState, problem, stageIndex, difficulty, recentSignatures]);

  const handleAnswer = (answer: number | string) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(answer);
    const correct = answer === problem?.answer;
    setIsCorrect(correct);

    // Capture closure values now so the timeout uses the right state
    const capturedStage = stageIndex;
    const capturedSigs = recentSignatures;

    if (correct) {
      playSound('correct');
      setScore(s => s + 10);
      const newMastery = masteryCount + 1;
      setMasteryCount(newMastery);
      setTimeout(() => {
        if (newMastery >= MASTERY_THRESHOLD) {
          playSound('badge');
          const nextIdx = capturedStage + 1;
          setCompletedStages(prev => Array.from(new Set([...prev, capturedStage])));
          if (nextIdx < STAGES.length) { setStageIndex(nextIdx); setGameState('level-up'); }
          else { setGameState('finale'); }
          setMasteryCount(0); setRecentSignatures([]);
        } else {
          const p = generateProblem(capturedStage, difficulty, capturedSigs);
          setProblem(p); setRecentSignatures(prev => [...prev.slice(-9), p.signature]);
        }
        setSelectedAnswer(null); setIsCorrect(null); setAttemptsUsed(0);
      }, 2000);
    } else {
      playSound('incorrect');
      const isLastAttempt = attemptsUsed >= 1;
      setTimeout(() => {
        if (isLastAttempt) {
          const p = generateProblem(capturedStage, difficulty, capturedSigs);
          setProblem(p); setRecentSignatures(prev => [...prev.slice(-9), p.signature]);
          setAttemptsUsed(0);
        } else {
          setAttemptsUsed(1);
        }
        setSelectedAnswer(null); setIsCorrect(null);
      }, 2000);
    }
  };

  const startLevel = () => {
    setGameState('playing'); setRecentSignatures([]); setAttemptsUsed(0);
    const p = generateProblem(stageIndex, difficulty, []);
    setProblem(p); setRecentSignatures([p.signature]);
  };

  const resetGame = () => {
    localStorage.setItem('space-math-save', JSON.stringify({ score, stageIndex: 0, completedStages: [] }));
    setStageIndex(0); setCompletedStages([]); setMasteryCount(0); setAttemptsUsed(0); setGameState('start');
  };

  const clearStars = () => {
    setScore(0);
    localStorage.setItem('space-math-save', JSON.stringify({ score: 0, stageIndex, completedStages }));
  };

  const isWordProblem = problem?.type === 'word-problem';
  const isReadAloud = problem?.type === 'word-problem' || problem?.type === 'time' || problem?.type === 'shapes' || problem?.type === 'fractions';
  const isFraction = problem?.type === 'fractions';
  const isLongQuestion = problem && !isWordProblem && !isFraction && problem.question.length > 40;
  const isThreeOptions = problem && problem.options.length === 3;

  return (
    <div className="flex-1 bg-black text-white selection:bg-blue-500/30 relative flex flex-col overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        {stars.map((s, i) => (
          <div key={i} className="absolute bg-white rounded-full animate-pulse" style={{ width: s.w + 'px', height: s.h + 'px', top: s.t + '%', left: s.l + '%', opacity: s.o, animationDelay: s.d + 's' }} />
        ))}
      </div>
      <StarBank score={score} onClear={clearStars} />
      <main className="relative z-10 w-full p-4 sm:p-6 flex flex-col items-center flex-1 min-h-0 overflow-hidden">
        <div className="w-full flex justify-between items-center mb-3 sm:mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-600/20"><Rocket className="w-5 h-5 sm:w-6 sm:h-6 text-white" /></div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight">Space Math</h1>
              <p className="text-xs text-blue-400 uppercase tracking-widest font-bold">Mission: {STAGES[stageIndex].label}</p>
            </div>
          </div>
          <button onClick={resetGame} className="text-[10px] font-bold text-slate-400 hover:text-white hover:bg-white/10 uppercase bg-white/5 px-2.5 py-1 rounded-lg transition-colors border border-white/10">Reset</button>
        </div>

        <AnimatePresence mode="wait">
          {gameState === 'start' && (
            <motion.div key="start" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }} className="flex-1 min-h-0 flex flex-col items-center justify-center text-center gap-6 sm:gap-8">
              <div className="relative">
                <motion.div animate={{ y: [0, -20, 0], rotate: [0, 5, 0] }} transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}>
                  <Rocket className="w-24 h-24 sm:w-28 sm:h-28 md:w-36 md:h-36 text-blue-500 drop-shadow-[0_0_30px_rgba(59,130,246,0.5)]" />
                </motion.div>
                <motion.div className="absolute -bottom-4 -right-4" animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                  <Sparkles className="w-10 h-10 sm:w-12 sm:h-12 text-yellow-400" />
                </motion.div>
              </div>
              <div>
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-3 sm:mb-4 bg-gradient-to-b from-white to-blue-300 bg-clip-text text-transparent">Ready for Launch?</h2>
                <p className="text-blue-200 text-base sm:text-lg max-w-sm">Choose your rank and help the rocket reach new planets!</p>
              </div>
              <button onClick={startLevel} className="group relative px-10 sm:px-12 py-5 sm:py-6 bg-blue-600 rounded-3xl text-xl sm:text-2xl font-bold shadow-[0_10px_0_rgb(37,99,235)] active:shadow-none active:translate-y-[10px] transition-all hover:bg-blue-500">
                <span className="flex items-center gap-3">START MISSION <ChevronRight className="w-7 h-7 sm:w-8 sm:h-8" /></span>
              </button>
            </motion.div>
          )}

          {gameState === 'playing' && problem && (
            <motion.div key="playing" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full flex-1 min-h-0 flex flex-col items-center gap-3 sm:gap-4">
              <div className="w-full shrink-0">
                <MasteryPath currentStage={stageIndex} completedStages={completedStages} masteryCount={masteryCount} isWrong={isCorrect === false} difficulty={difficulty} />
              </div>
              <AnimatePresence>
                {selectedAnswer !== null && (
                  <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}
                    className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
                    <div className="relative flex items-center justify-center">
                      {/* radial countdown ring */}
                      <svg className="absolute" width="224" height="224" viewBox="0 0 224 224" style={{ transform: 'rotate(-90deg)' }}>
                        <circle cx="112" cy="112" r="104" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="14" />
                        <motion.circle
                          cx="112" cy="112" r="104"
                          fill="none"
                          stroke={isCorrect ? '#ffffff' : '#fde68a'}
                          strokeWidth="14"
                          strokeLinecap="round"
                          strokeDasharray={2 * Math.PI * 104}
                          initial={{ strokeDashoffset: 0 }}
                          animate={{ strokeDashoffset: 2 * Math.PI * 104 }}
                          transition={{ duration: 2, ease: 'linear' }}
                        />
                      </svg>
                      <div className={`p-12 rounded-full shadow-2xl ${isCorrect ? 'bg-green-500' : 'bg-red-500'}`}>
                        {isCorrect ? <CheckCircle2 className="w-32 h-32 text-white" /> : <XCircle className="w-32 h-32 text-white" />}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="w-full flex-1 min-h-0 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-[32px] sm:rounded-[40px] p-4 sm:p-6 shadow-2xl relative overflow-hidden flex flex-col">
                <div className="text-center mb-2 sm:mb-3 shrink-0">
                  <h2 className={`font-black mb-1 tracking-tight leading-snug ${isReadAloud ? 'text-4xl sm:text-5xl md:text-6xl' : isLongQuestion ? 'text-2xl sm:text-3xl md:text-4xl' : 'text-5xl sm:text-6xl md:text-7xl'}`}>{problem.question}</h2>
                  {isReadAloud && (
                    <button
                      onClick={() => { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(problem.question); u.rate = 0.85; window.speechSynthesis.speak(u); }}
                      className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-700 hover:bg-slate-600 text-blue-300 hover:text-blue-200 transition-colors text-sm font-semibold"
                    >
                      <Volume2 className="w-5 h-5" /> Read aloud
                    </button>
                  )}
                </div>
                <div className={`grid gap-2 sm:gap-3 flex-1 min-h-0 ${isThreeOptions ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {problem.options.map((opt, i) => (
                    <button key={i} disabled={selectedAnswer !== null} onClick={() => handleAnswer(opt)}
                      className={`flex items-center justify-center rounded-3xl text-4xl sm:text-6xl md:text-8xl font-black transition-all border-b-[6px] sm:border-b-8 ${selectedAnswer === opt ? (isCorrect ? 'bg-emerald-500 border-emerald-700 text-white' : 'bg-rose-500 border-rose-700 text-white') : 'bg-slate-800 border-slate-950 hover:bg-slate-700 text-white active:border-b-0 active:translate-y-[6px] sm:active:translate-y-[8px]'} ${selectedAnswer !== null && opt === problem.answer && selectedAnswer !== opt ? 'bg-emerald-500/50 border-emerald-700/50' : ''}`}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {gameState === 'level-up' && (
            <motion.div key="level-up" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.2 }} className="flex-1 min-h-0 flex flex-col items-center justify-center text-center gap-6 sm:gap-8">
              <div className="relative">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }} className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full" />
                <Trophy className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.5)]" />
              </div>
              <div>
                <h2 className="text-4xl sm:text-5xl md:text-6xl font-black mb-3 sm:mb-4">LEVEL UP!</h2>
                <p className="text-xl sm:text-2xl md:text-3xl text-blue-200">You&apos;ve reached the <span className="text-white font-bold">{STAGES[stageIndex].label}</span>!</p>
              </div>
              <button onClick={startLevel} className="px-10 sm:px-12 py-5 sm:py-6 bg-emerald-600 rounded-3xl text-xl sm:text-2xl font-bold shadow-[0_10px_0_rgb(5,150,105)] active:shadow-none active:translate-y-[10px] transition-all hover:bg-emerald-500">CONTINUE MISSION</button>
            </motion.div>
          )}

          {gameState === 'finale' && (
            <motion.div key="finale" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex-1 min-h-0 flex flex-col items-center justify-center text-center gap-6 sm:gap-8">
              <div className="relative">
                <motion.div animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }} transition={{ duration: 2, repeat: Infinity }}>
                  <Trophy className="w-36 h-36 sm:w-44 sm:h-44 md:w-56 md:h-56 text-yellow-400 drop-shadow-[0_0_40px_rgba(250,204,21,0.6)]" />
                </motion.div>
                {Array.from({ length: 20 }).map((_, i) => (
                  <motion.div key={i} className="absolute top-1/2 left-1/2 w-2 h-2 bg-yellow-400 rounded-full" initial={{ x: 0, y: 0 }} animate={{ x: (Math.random() - 0.5) * 400, y: (Math.random() - 0.5) * 400, opacity: 0, scale: 0 }} transition={{ duration: 2, repeat: Infinity, delay: Math.random() * 2 }} />
                ))}
              </div>
              <div>
                <h2 className="text-4xl sm:text-5xl md:text-6xl font-black mb-3 sm:mb-4 bg-gradient-to-r from-yellow-400 via-white to-yellow-400 bg-clip-text text-transparent animate-pulse">MISSION COMPLETE!</h2>
                <p className="text-2xl sm:text-3xl text-blue-200">You are a <span className="text-white font-bold">Math Master</span>!</p>
                <p className="text-lg sm:text-xl text-blue-400 mt-2">All 9 missions complete!</p>
              </div>
              <button onClick={resetGame} className="px-8 py-4 bg-slate-800 rounded-2xl text-lg sm:text-xl font-bold border border-white/10 hover:bg-slate-700 transition-colors">PLAY AGAIN</button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-purple-900/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -top-20 -right-20 w-80 h-80 bg-blue-900/20 rounded-full blur-3xl pointer-events-none" />
    </div>
  );
}
