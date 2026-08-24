"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Rocket, Star, Trophy, ChevronRight, Sparkles, Check, X, Volume2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProblemType =
  | "addition"
  | "subtraction"
  | "place-value"
  | "mental-ten"
  | "add-100"
  | "comparison"
  | "three-addend"
  | "fact-family"
  | "count-120"
  // K
  | "count-by-1"
  | "count-by-10"
  | "make-10"
  | "teen-decompose"
  // G1
  | "sub-mult-10"
  | "equal-sign"
  | "unknown-addend"
  // G2
  | "add-100-regroup"
  | "sub-100-regroup"
  | "place-value-3"
  | "skip-count"
  | "compare-3digit"
  | "mental-hundred"
  | "odd-even"
  | "array"
  // G3
  | "multiply"
  | "divide"
  | "multiply-tens"
  | "round"
  | "fraction-line"
  | "equiv-fractions"
  | "compare-fractions"
  | "area"
  | "perimeter";

interface Problem {
  id: string;
  type: ProblemType;
  question: string;
  answer: number | string;
  options: (number | string)[];
  signature: string;
}

interface TopicRecord {
  correct: number;
  attempts: number;
  streak: number; // consecutive correct answers
  interval: number; // questions to wait before this topic comes back
  dueIn: number; // countdown to next review
  learned: boolean; // has reached LEARNED_INTERVAL at least once
}

interface TopicDef {
  key: string;
  type: ProblemType;
  min: number;
  max: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Review intervals, counted in questions asked. A correct answer moves a topic one
// rung up the ladder, a miss knocks it back down. High rungs are the point: a solid
// skill stays in the mix but only resurfaces every 30–60 questions.
const INTERVAL_STEPS = [1, 2, 4, 8, 16, 32, 60];

// A topic counts as learned once it reaches this interval. Learned topics are never
// retired — they just come back rarely, as reinforcement.
const LEARNED_INTERVAL = 8;

// How many not-yet-learned topics may be in rotation at once. New material is only
// handed out when the learner is under this many, which is what keeps the
// progression linear instead of dumping the whole syllabus in at once.
const LEARNING_CAP = 3;

// One linear ladder of skills, easiest first. The content is Common Core K–3, but
// the learner is never placed in a grade: they sit at whatever point on the ladder
// they've reached, and every topic behind them stays in the review mix.
const TOPIC_PROGRESSION: TopicDef[] = [
  { key: "add-1-5",          type: "addition",        min: 1,   max: 5   },
  { key: "sub-1-5",          type: "subtraction",     min: 1,   max: 5   },
  { key: "k-count-by-1",     type: "count-by-1",      min: 1,   max: 100 },
  { key: "add-1-10",         type: "addition",        min: 1,   max: 10  },
  { key: "sub-1-10",         type: "subtraction",     min: 1,   max: 10  },
  { key: "k-compare-10",     type: "comparison",      min: 1,   max: 10  },
  { key: "k-make-10",        type: "make-10",         min: 1,   max: 9   },
  { key: "k-count-by-10",    type: "count-by-10",     min: 10,  max: 100 },
  { key: "k-teen",           type: "teen-decompose",  min: 11,  max: 19  },
  { key: "add-1-20",         type: "addition",        min: 1,   max: 20  },
  { key: "sub-1-20",         type: "subtraction",     min: 1,   max: 20  },
  { key: "g1-equal-sign",    type: "equal-sign",      min: 1,   max: 10  },
  { key: "g1-unknown",       type: "unknown-addend",  min: 1,   max: 20  },
  { key: "compare-20",       type: "comparison",      min: 1,   max: 20  },
  { key: "three-addend",     type: "three-addend",    min: 1,   max: 6   },
  { key: "fact-family",      type: "fact-family",     min: 1,   max: 10  },
  { key: "place-value",      type: "place-value",     min: 1,   max: 9   },
  { key: "count-120",        type: "count-120",       min: 1,   max: 120 },
  { key: "mental-ten",       type: "mental-ten",      min: 10,  max: 90  },
  { key: "add-100",          type: "add-100",         min: 10,  max: 90  },
  { key: "g1-sub-mult-10",   type: "sub-mult-10",     min: 10,  max: 90  },
  { key: "g2-odd-even",      type: "odd-even",        min: 1,   max: 20  },
  { key: "g2-skip-count",    type: "skip-count",      min: 5,   max: 100 },
  { key: "g2-place-3",       type: "place-value-3",   min: 1,   max: 9   },
  { key: "g2-compare-999",   type: "compare-3digit",  min: 100, max: 999 },
  { key: "g2-add-regroup",   type: "add-100-regroup", min: 10,  max: 99  },
  { key: "g2-sub-regroup",   type: "sub-100-regroup", min: 10,  max: 99  },
  { key: "g2-mental-100",    type: "mental-hundred",  min: 100, max: 800 },
  { key: "g2-array",         type: "array",           min: 2,   max: 5   },
  { key: "g3-mult",          type: "multiply",        min: 0,   max: 10  },
  { key: "g3-divide",        type: "divide",          min: 1,   max: 10  },
  { key: "g3-mult-tens",     type: "multiply-tens",   min: 10,  max: 90  },
  { key: "g3-round",         type: "round",           min: 10,  max: 999 },
  { key: "g3-fraction-line", type: "fraction-line",   min: 2,   max: 8   },
  { key: "g3-equiv-frac",    type: "equiv-fractions", min: 2,   max: 8   },
  { key: "g3-compare-frac",  type: "compare-fractions", min: 2, max: 8   },
  { key: "g3-area",          type: "area",            min: 2,   max: 9   },
  { key: "g3-perimeter",     type: "perimeter",       min: 2,   max: 12  },
];

// Maps each topic key to its API stage. One stage = one Common Core skill.
const TOPIC_STAGE: Record<string, { id: number; label: string }> = {
  // K
  "add-1-5":         { id: 1,  label: "Add within 5" },
  "sub-1-5":         { id: 2,  label: "Subtract within 5" },
  "add-1-10":        { id: 3,  label: "Add within 10" },
  "sub-1-10":        { id: 4,  label: "Subtract within 10" },
  "k-count-by-1":    { id: 11, label: "Count by 1s to 100" },
  "k-count-by-10":   { id: 17, label: "Count by 10s to 100" },
  "k-make-10":       { id: 12, label: "Make 10" },
  "k-compare-10":    { id: 13, label: "Compare 1–10" },
  "k-teen":          { id: 15, label: "Teen Numbers (10 + ones)" },
  // G1
  "add-1-20":        { id: 5,  label: "Add within 20" },
  "sub-1-20":        { id: 60, label: "Subtract within 20" },
  "three-addend":    { id: 61, label: "Three-addend addition" },
  "fact-family":     { id: 62, label: "Fact families" },
  "g1-equal-sign":   { id: 16, label: "Equal sign true/false" },
  "g1-unknown":      { id: 63, label: "Unknown addend" },
  "compare-20":      { id: 6,  label: "Compare 2-digit numbers" },
  "place-value":     { id: 7,  label: "Tens & ones place value" },
  "mental-ten":      { id: 64, label: "Mental ±10" },
  "g1-sub-mult-10":  { id: 65, label: "Subtract multiples of 10" },
  "add-100":         { id: 8,  label: "Add within 100" },
  "count-120":       { id: 68, label: "Count to 120" },
  // G2
  "g2-add-regroup":  { id: 20, label: "Add within 100" },
  "g2-sub-regroup":  { id: 21, label: "Subtract within 100" },
  "g2-place-3":      { id: 22, label: "3-Digit Place Value" },
  "g2-skip-count":   { id: 23, label: "Skip Count" },
  "g2-compare-999":  { id: 24, label: "Compare 3-Digit" },
  "g2-mental-100":   { id: 25, label: "Mental ±100" },
  "g2-odd-even":     { id: 26, label: "Odd or Even" },
  "g2-array":        { id: 27, label: "Arrays" },
  // G3
  "g3-mult":         { id: 40, label: "Multiplication" },
  "g3-mult-tens":    { id: 41, label: "×Multiples of 10" },
  "g3-divide":       { id: 42, label: "Division" },
  "g3-round":        { id: 43, label: "Rounding" },
  "g3-fraction-line": { id: 44, label: "Fractions on Number Line" },
  "g3-equiv-frac":   { id: 45, label: "Equivalent Fractions" },
  "g3-compare-frac": { id: 46, label: "Compare Fractions" },
  "g3-area":         { id: 47, label: "Area" },
  "g3-perimeter":    { id: 48, label: "Perimeter" },
};

const DEFAULT_RECORD: TopicRecord = { correct: 0, attempts: 0, streak: 0, interval: 1, dueIn: 0, learned: false };

// Fill in fields older saves didn't have, and drop keys no longer on the ladder
function normalizeRecords(raw: unknown): Record<string, TopicRecord> {
  const out: Record<string, TopicRecord> = {};
  if (!raw || typeof raw !== "object") return out;
  const saved = raw as Record<string, Partial<TopicRecord>>;
  for (const t of TOPIC_PROGRESSION) {
    const r = saved[t.key];
    if (!r) continue;
    const interval = typeof r.interval === "number" ? r.interval : 1;
    out[t.key] = {
      correct: r.correct ?? 0,
      attempts: r.attempts ?? 0,
      streak: r.streak ?? 0,
      interval,
      dueIn: r.dueIn ?? 0,
      learned: r.learned ?? interval >= LEARNED_INTERVAL,
    };
  }
  return out;
}

function stepUp(interval: number): number {
  return INTERVAL_STEPS.find((s) => s > interval) ?? INTERVAL_STEPS[INTERVAL_STEPS.length - 1];
}

// A miss drops the topic two rungs rather than all the way back, so one slip on a
// solid skill turns into a check-in, not a drill
function stepDown(interval: number): number {
  const idx = INTERVAL_STEPS.findIndex((s) => s >= interval);
  const from = idx === -1 ? INTERVAL_STEPS.length - 1 : idx;
  return INTERVAL_STEPS[Math.max(0, from - 2)];
}

// Everything the learner has reached so far: all learned topics plus the next few
// still being learned. Nothing ever leaves this set.
function unlockedTopics(records: Record<string, TopicRecord>): TopicDef[] {
  const out: TopicDef[] = [];
  let learning = 0;
  for (const t of TOPIC_PROGRESSION) {
    out.push(t);
    if (!records[t.key]?.learned) learning++;
    if (learning >= LEARNING_CAP) break;
  }
  return out;
}

function learnedCount(records: Record<string, TopicRecord>): number {
  return TOPIC_PROGRESSION.filter((t) => records[t.key]?.learned).length;
}

// Pick the next topic. Every unlocked topic stays eligible forever — the schedule,
// not a difficulty filter, decides what shows up, so a session naturally mixes the
// new material with reviews of things already learned.
function selectTopic(records: Record<string, TopicRecord>, lastKey: string | null): TopicDef {
  const pool = unlockedTopics(records);
  const due = pool.filter((t) => (records[t.key]?.dueIn ?? 0) <= 0);
  const candidates = due.length > 0 ? due : pool;

  const weights = candidates.map((t) => {
    const r = records[t.key] ?? DEFAULT_RECORD;
    const interval = Math.max(r.interval, 1);
    const ripeness = (interval - r.dueIn) / interval; // 1 exactly at due, >1 overdue
    const accuracy = r.attempts > 0 ? r.correct / r.attempts : 0.5;
    const need = 1.5 - accuracy; // shaky topics get a bigger share of the questions
    const fresh = r.attempts === 0 ? 2 : 1; // ease brand-new topics in promptly
    const repeat = t.key === lastKey ? 0.15 : 1; // avoid back-to-back repeats
    return Math.max(ripeness, 0.02) ** 2 * need * fresh * repeat;
  });

  const total = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

// Spaced repetition: correct moves the topic up the interval ladder, a miss moves it down
function advanceRecord(record: TopicRecord, correct: boolean): TopicRecord {
  const interval = correct ? stepUp(record.interval) : stepDown(record.interval);
  return {
    correct: record.correct + (correct ? 1 : 0),
    attempts: record.attempts + 1,
    streak: correct ? record.streak + 1 : 0,
    interval,
    dueIn: interval,
    learned: record.learned || (correct && interval >= LEARNED_INTERVAL),
  };
}

// Tick down dueIn for every topic except the one just answered
function tickTopics(records: Record<string, TopicRecord>, exceptKey: string): Record<string, TopicRecord> {
  const out: Record<string, TopicRecord> = {};
  for (const [k, v] of Object.entries(records)) {
    out[k] = k === exceptKey ? v : { ...v, dueIn: Math.max(0, v.dueIn - 1) };
  }
  return out;
}


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

  if (type === "addition") {
    const left = Math.floor(Math.random() * (max - min)) + min; // min to max-1, leaving room for right
    const right = Math.floor(Math.random() * (max - left)) + 1; // 1 to (max - left), so left+right <= max
    const answer = left + right;
    return {
      id,
      type,
      question: `${left} + ${right} = ?`,
      answer,
      options: numOpts(answer),
      signature: `add:${Math.min(left, right)},${Math.max(left, right)}`,
    };
  }

  if (type === "subtraction") {
    const answer = Math.floor(Math.random() * (max - min + 1)) + min;
    const right = Math.floor(Math.random() * (max - min + 1)) + 1;
    const left = answer + right;
    return {
      id,
      type,
      question: `${left} - ${right} = ?`,
      answer,
      options: numOpts(answer),
      signature: `sub:${left},${right}`,
    };
  }

  if (type === "place-value") {
    const tens = Math.floor(Math.random() * Math.min(max, 9) + 1);
    const ones = Math.floor(Math.random() * 10);
    const answer = tens * 10 + ones;
    return {
      id,
      type,
      question: `${tens} tens and ${ones} ones = ?`,
      answer,
      options: numOpts(answer),
      signature: `place:${tens},${ones}`,
    };
  }

  if (type === "mental-ten") {
    const base = Math.floor(Math.random() * (max - min - 10)) + min + 10;
    const isAdd = base <= 109;
    const answer = isAdd ? base + 10 : base - 10;
    return {
      id,
      type,
      question: isAdd ? `${base} + 10 = ?` : `${base} - 10 = ?`,
      answer,
      options: numOpts(answer),
      signature: `mental${isAdd ? "+" : "-"}:${base}`,
    };
  }

  if (type === "add-100") {
    // Two easy patterns: round tens + single digit (20+7) or round tens + round tens (20+30)
    const useTens = Math.random() > 0.5;
    let left: number, right: number;
    if (useTens) {
      // e.g. 20 + 30 = 50
      const t1 = Math.floor(Math.random() * 4) + 1; // 10–40
      const t2 = Math.floor(Math.random() * (5 - t1)) + 1;
      left = t1 * 10;
      right = t2 * 10;
    } else {
      // e.g. 30 + 6 = 36
      const tens = Math.floor(Math.random() * 4) + 1; // 1–4 tens
      const ones = Math.floor(Math.random() * 8) + 1; // 1–8
      left = tens * 10;
      right = ones;
    }
    const answer = left + right;
    return {
      id,
      type,
      question: `${left} + ${right} = ?`,
      answer,
      options: numOpts(answer),
      signature: `add100:${left},${right}`,
    };
  }

  if (type === "comparison") {
    const a = Math.floor(Math.random() * (max - min + 1)) + min;
    const b = Math.floor(Math.random() * (max - min + 1)) + min;
    const answer = a < b ? "<" : a > b ? ">" : "=";
    return {
      id,
      type,
      question: `${a}   ?   ${b}`,
      answer,
      options: ["<", "=", ">"],
      signature: `cmp:${a},${b}`,
    };
  }

  if (type === "three-addend") {
    const a = Math.floor(Math.random() * max) + min;
    const b = Math.floor(Math.random() * max) + min;
    const c = Math.floor(Math.random() * max) + min;
    const answer = a + b + c;
    return {
      id,
      type,
      question: `${a} + ${b} + ${c} = ?`,
      answer,
      options: numOpts(answer),
      signature: `3add:${[a, b, c].sort().join(",")}`,
    };
  }

  if (type === "fact-family") {
    const a = Math.floor(Math.random() * (max - 1)) + min;
    const b = Math.floor(Math.random() * (max - a)) + 1;
    const sum = a + b;
    const askB = Math.random() > 0.5;
    const knownSubtract = askB ? a : b;
    const answer = askB ? b : a;
    return {
      id,
      type,
      question: `${a} + ${b} = ${sum}. So ${sum} − ${knownSubtract} = ?`,
      answer,
      options: numOpts(answer),
      signature: `ff:${Math.min(a, b)},${Math.max(a, b)}`,
    };
  }

  if (type === "count-120") {
    const useHigh = Math.random() > 0.4;
    const start = useHigh
      ? Math.floor(Math.random() * 18) + 102
      : Math.floor(Math.random() * (max - 2)) + 2;
    const isNext = Math.random() > 0.5;
    const answer = isNext ? start + 1 : start - 1;
    const question = isNext
      ? `${start - 2}, ${start - 1}, ${start}, ___`
      : `___, ${start}, ${start + 1}, ${start + 2}`;
    return {
      id,
      type,
      question,
      answer,
      options: numOpts(answer),
      signature: `count:${isNext ? "next" : "prev"}-${start}`,
    };
  }

  // ─── Kindergarten ──────────────────────────────────────────────────────────

  if (type === "count-by-1") {
    const start = Math.floor(Math.random() * 98) + 2;
    const isNext = Math.random() > 0.5;
    const answer = isNext ? start + 1 : start - 1;
    const question = isNext
      ? `${start - 2}, ${start - 1}, ${start}, ___`
      : `___, ${start}, ${start + 1}, ${start + 2}`;
    return {
      id,
      type,
      question,
      answer,
      options: numOpts(answer),
      signature: `c1:${isNext ? "n" : "p"}-${start}`,
    };
  }

  if (type === "count-by-10") {
    const step = (Math.floor(Math.random() * 9) + 1) * 10; // 10..90
    const answer = step + 10;
    return {
      id,
      type,
      question: `Count by 10s: ${step - 10 > 0 ? step - 10 + ", " : ""}${step}, ?`,
      answer,
      options: numOpts(answer),
      signature: `c10:${step}`,
    };
  }

  if (type === "make-10") {
    const a = Math.floor(Math.random() * 9) + 1; // 1..9
    const answer = 10 - a;
    return {
      id,
      type,
      question: `${a} + ? = 10`,
      answer,
      options: numOpts(answer),
      signature: `mk10:${a}`,
    };
  }

  if (type === "teen-decompose") {
    const ones = Math.floor(Math.random() * 9) + 1; // 1..9
    const teen = 10 + ones;
    const answer = ones;
    return {
      id,
      type,
      question: `${teen} = 10 + ?`,
      answer,
      options: numOpts(answer),
      signature: `teen:${teen}`,
    };
  }

  // ─── Tens & equality ───────────────────────────────────────────────────────

  if (type === "sub-mult-10") {
    const a = (Math.floor(Math.random() * 8) + 2) * 10; // 20..90
    const b = (Math.floor(Math.random() * (a / 10)) + 1) * 10; // 10..a
    const answer = a - b;
    return {
      id,
      type,
      question: `${a} − ${b} = ?`,
      answer,
      options: numOpts(answer),
      signature: `subm10:${a},${b}`,
    };
  }

  if (type === "equal-sign") {
    const variants = [
      // true: a + b = b + a
      () => {
        const a = Math.floor(Math.random() * 9) + 1;
        const b = Math.floor(Math.random() * 9) + 1;
        return { left: `${a} + ${b}`, right: `${b} + ${a}`, isTrue: true };
      },
      // true: a + b = c (where c = a + b)
      () => {
        const a = Math.floor(Math.random() * 9) + 1;
        const b = Math.floor(Math.random() * 9) + 1;
        return { left: `${a} + ${b}`, right: `${a + b}`, isTrue: true };
      },
      // false: a + b = c (c off by 1 or 2)
      () => {
        const a = Math.floor(Math.random() * 9) + 1;
        const b = Math.floor(Math.random() * 9) + 1;
        const off = Math.random() > 0.5 ? 1 : 2;
        return { left: `${a} + ${b}`, right: `${a + b + off}`, isTrue: false };
      },
      // false: a = b - 1
      () => {
        const a = Math.floor(Math.random() * 8) + 2;
        return { left: `${a}`, right: `${a - 1}`, isTrue: false };
      },
    ];
    const v = variants[Math.floor(Math.random() * variants.length)]();
    const answer = v.isTrue ? "True" : "False";
    return {
      id,
      type,
      question: `${v.left} = ${v.right}`,
      answer,
      options: ["True", "False"],
      signature: `eq:${v.left}=${v.right}`,
    };
  }

  if (type === "unknown-addend") {
    const sum = Math.floor(Math.random() * (max - 2)) + 3; // 3..max
    const known = Math.floor(Math.random() * (sum - 1)) + 1; // 1..sum-1
    const answer = sum - known;
    return {
      id,
      type,
      question: `${known} + ? = ${sum}`,
      answer,
      options: numOpts(answer),
      signature: `unk:${known},${sum}`,
    };
  }

  // ─── Regrouping & 3-digit numbers ──────────────────────────────────────────

  if (type === "add-100-regroup") {
    // Two-digit + two-digit, often requiring regrouping
    const a = Math.floor(Math.random() * 80) + 11; // 11..90
    const b = Math.floor(Math.random() * (99 - a)) + 11; // 11..99-a
    const answer = a + b;
    return {
      id,
      type,
      question: `${a} + ${b} = ?`,
      answer,
      options: numOpts(answer),
      signature: `addr:${a},${b}`,
    };
  }

  if (type === "sub-100-regroup") {
    const a = Math.floor(Math.random() * 60) + 30; // 30..89
    const b = Math.floor(Math.random() * (a - 5)) + 5; // 5..a-1
    const answer = a - b;
    return {
      id,
      type,
      question: `${a} − ${b} = ?`,
      answer,
      options: numOpts(answer),
      signature: `subr:${a},${b}`,
    };
  }

  if (type === "place-value-3") {
    const h = Math.floor(Math.random() * 9) + 1; // 1..9
    const t = Math.floor(Math.random() * 10);
    const o = Math.floor(Math.random() * 10);
    const answer = h * 100 + t * 10 + o;
    return {
      id,
      type,
      question: `${h} hundreds + ${t} tens + ${o} ones = ?`,
      answer,
      options: numOpts(answer),
      signature: `pv3:${h},${t},${o}`,
    };
  }

  if (type === "skip-count") {
    const steps: Array<{ n: number; max: number }> = [
      { n: 5, max: 100 },
      { n: 10, max: 100 },
      { n: 100, max: 1000 },
    ];
    const s = steps[Math.floor(Math.random() * steps.length)];
    const start = (Math.floor(Math.random() * (s.max / s.n - 3)) + 1) * s.n;
    const answer = start + s.n;
    return {
      id,
      type,
      question: `Skip count by ${s.n}s: ${start - s.n}, ${start}, ?`,
      answer,
      options: numOpts(answer),
      signature: `skip:${s.n}-${start}`,
    };
  }

  if (type === "compare-3digit") {
    const a = Math.floor(Math.random() * 900) + 100;
    const b = Math.floor(Math.random() * 900) + 100;
    const answer = a < b ? "<" : a > b ? ">" : "=";
    return {
      id,
      type,
      question: `${a}   ?   ${b}`,
      answer,
      options: ["<", "=", ">"],
      signature: `cmp3:${a},${b}`,
    };
  }

  if (type === "mental-hundred") {
    const base = (Math.floor(Math.random() * 8) + 1) * 100; // 100..800
    const isAdd = base <= 800;
    const answer = isAdd ? base + 100 : base - 100;
    return {
      id,
      type,
      question: isAdd ? `${base} + 100 = ?` : `${base} − 100 = ?`,
      answer,
      options: numOpts(answer),
      signature: `m100:${isAdd ? "+" : "-"}-${base}`,
    };
  }

  if (type === "odd-even") {
    const n = Math.floor(Math.random() * max) + min;
    const answer = n % 2 === 0 ? "Even" : "Odd";
    return {
      id,
      type,
      question: `Is ${n} odd or even?`,
      answer,
      options: ["Odd", "Even"],
      signature: `oe:${n}`,
    };
  }

  if (type === "array") {
    const rows = Math.floor(Math.random() * (max - min + 1)) + min;
    const cols = Math.floor(Math.random() * (max - min + 1)) + min;
    const answer = rows * cols;
    return {
      id,
      type,
      question: `${rows} rows of ${cols} = ?`,
      answer,
      options: numOpts(answer),
      signature: `arr:${rows}x${cols}`,
    };
  }

  // ─── Multiplication, fractions & measurement ───────────────────────────────

  if (type === "multiply") {
    const a = Math.floor(Math.random() * (max - min + 1)) + min;
    const b = Math.floor(Math.random() * (max - min + 1)) + min;
    const answer = a * b;
    return {
      id,
      type,
      question: `${a} × ${b} = ?`,
      answer,
      options: numOpts(answer),
      signature: `mul:${Math.min(a, b)},${Math.max(a, b)}`,
    };
  }

  if (type === "multiply-tens") {
    const single = Math.floor(Math.random() * 9) + 1; // 1..9
    const tens = (Math.floor(Math.random() * 9) + 1) * 10; // 10..90
    const answer = single * tens;
    return {
      id,
      type,
      question: `${single} × ${tens} = ?`,
      answer,
      options: numOpts(answer),
      signature: `mt:${single},${tens}`,
    };
  }

  if (type === "divide") {
    const divisor = Math.floor(Math.random() * (max - min + 1)) + min; // min..max
    const quotient = Math.floor(Math.random() * 10) + 1; // 1..10
    const dividend = divisor * quotient;
    return {
      id,
      type,
      question: `${dividend} ÷ ${divisor} = ?`,
      answer: quotient,
      options: numOpts(quotient),
      signature: `div:${dividend},${divisor}`,
    };
  }

  if (type === "round") {
    const useHundred = Math.random() > 0.5;
    const n = Math.floor(Math.random() * 990) + 10;
    const place = useHundred ? 100 : 10;
    const answer = Math.round(n / place) * place;
    return {
      id,
      type,
      question: `Round ${n} to the nearest ${place}.`,
      answer,
      options: numOpts(answer),
      signature: `rnd:${n},${place}`,
    };
  }

  if (type === "fraction-line") {
    // Locate a fraction on a 0..1 number line. Denom from {2,3,4,6,8}
    const denoms = [2, 3, 4, 6, 8];
    const b = denoms[Math.floor(Math.random() * denoms.length)];
    const a = Math.floor(Math.random() * (b - 1)) + 1; // 1..b-1
    const answer = `${a}/${b}`;
    const optSet = new Set<string>([answer]);
    while (optSet.size < 4) {
      const wb = denoms[Math.floor(Math.random() * denoms.length)];
      const wa = Math.floor(Math.random() * (wb - 1)) + 1;
      optSet.add(`${wa}/${wb}`);
    }
    return {
      id,
      type,
      question: `Which fraction is at the marked spot on the number line?`,
      answer,
      options: Array.from(optSet).sort(() => Math.random() - 0.5),
      signature: `fline:${a}/${b}`,
    };
  }

  if (type === "equiv-fractions") {
    // Recognize equivalent fractions: 1/2 = ?/4, 1/3 = ?/6, 2/3 = ?/6 etc.
    const pairs: Array<{ a: number; b: number; mult: number }> = [
      { a: 1, b: 2, mult: 2 }, // 1/2 = 2/4
      { a: 1, b: 2, mult: 3 }, // 1/2 = 3/6
      { a: 1, b: 2, mult: 4 }, // 1/2 = 4/8
      { a: 1, b: 3, mult: 2 }, // 1/3 = 2/6
      { a: 2, b: 3, mult: 2 }, // 2/3 = 4/6
      { a: 1, b: 4, mult: 2 }, // 1/4 = 2/8
      { a: 3, b: 4, mult: 2 }, // 3/4 = 6/8
    ];
    const p = pairs[Math.floor(Math.random() * pairs.length)];
    const newDenom = p.b * p.mult;
    const newNum = p.a * p.mult;
    const answer = `${newNum}/${newDenom}`;
    const optSet = new Set<string>([answer]);
    while (optSet.size < 4) {
      const wn = Math.floor(Math.random() * (newDenom - 1)) + 1;
      optSet.add(`${wn}/${newDenom}`);
    }
    return {
      id,
      type,
      question: `${p.a}/${p.b} = ?/${newDenom}`,
      answer,
      options: Array.from(optSet).sort(() => Math.random() - 0.5),
      signature: `eqf:${p.a}/${p.b}=${newNum}/${newDenom}`,
    };
  }

  if (type === "compare-fractions") {
    // Same numerator OR same denominator only (per 3.NF.A.3.d)
    const denoms = [2, 3, 4, 6, 8];
    const sameDenom = Math.random() > 0.5;
    let a1: number, b1: number, a2: number, b2: number;
    if (sameDenom) {
      const d = denoms[Math.floor(Math.random() * denoms.length)];
      a1 = Math.floor(Math.random() * (d - 1)) + 1;
      do { a2 = Math.floor(Math.random() * (d - 1)) + 1; } while (a2 === a1);
      b1 = d; b2 = d;
    } else {
      const num = Math.floor(Math.random() * 3) + 1;
      const dens = [...denoms].sort(() => Math.random() - 0.5);
      b1 = dens[0]; b2 = dens[1];
      a1 = Math.min(num, b1 - 1); a2 = Math.min(num, b2 - 1);
      if (a1 === 0) a1 = 1;
      if (a2 === 0) a2 = 1;
    }
    const v1 = a1 / b1, v2 = a2 / b2;
    const answer = v1 < v2 ? "<" : v1 > v2 ? ">" : "=";
    return {
      id,
      type,
      question: `${a1}/${b1}   ?   ${a2}/${b2}`,
      answer,
      options: ["<", "=", ">"],
      signature: `cmpf:${a1}/${b1}vs${a2}/${b2}`,
    };
  }

  if (type === "area") {
    const w = Math.floor(Math.random() * (max - min + 1)) + min;
    const h = Math.floor(Math.random() * (max - min + 1)) + min;
    const answer = w * h;
    return {
      id,
      type,
      question: `Area of ${w} × ${h} rectangle = ? sq units`,
      answer,
      options: numOpts(answer),
      signature: `area:${Math.min(w, h)},${Math.max(w, h)}`,
    };
  }

  if (type === "perimeter") {
    const w = Math.floor(Math.random() * (max - min + 1)) + min;
    const h = Math.floor(Math.random() * (max - min + 1)) + min;
    const answer = 2 * (w + h);
    return {
      id,
      type,
      question: `Perimeter of ${w} × ${h} rectangle = ?`,
      answer,
      options: numOpts(answer),
      signature: `peri:${Math.min(w, h)},${Math.max(w, h)}`,
    };
  }

  return buildProblem("addition", min, max);
}

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
  const stage = TOPIC_STAGE[topicKey];
  if (!stage) return;
  const topicsInStage = Object.entries(TOPIC_STAGE).filter(([, s]) => s.id === stage.id).map(([k]) => k);
  const mastered = topicsInStage.every((k) => (records[k]?.interval ?? 1) >= LEARNED_INTERVAL);
  try {
    await fetch("/api/space-math/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_name: "cai", session_id: sessionId, stage_id: stage.id, stage_label: stage.label, correct: wasCorrect ? 1 : 0, total: 1, mastered }),
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

// ─── StarBank ─────────────────────────────────────────────────────────────────

const StarBank = ({ score, onClear }: { score: number; onClear: () => void }) => (
  <div className='w-full bg-slate-900/80 border-b border-white/10 p-3 pl-14 flex items-start sm:items-center gap-4 z-50 relative min-h-[60px]'>
    <button
      onClick={onClear}
      className='text-[10px] font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-400/20 uppercase bg-rose-400/10 px-2 py-1 rounded transition-colors shrink-0'
    >
      Clear
    </button>
    <div className='flex flex-wrap gap-1.5 flex-1 content-start'>
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
            <Star className='w-5 h-5 text-yellow-400 fill-yellow-400 drop-shadow-[0_0_4px_rgba(250,204,21,0.8)]' />
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
      <div className='flex justify-between items-center mb-1.5 px-1'>
        <div className='flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider'>
          <Star className='w-3 h-3 text-yellow-400 fill-yellow-400' />
          Session
        </div>
        <span className={`text-xs font-bold ${isDone ? "text-yellow-400" : "text-slate-400"}`}>
          {correct} / {SESSION_GOAL} correct
        </span>
      </div>
      <div className='w-full h-2.5 bg-slate-800/80 rounded-full overflow-hidden border border-white/5'>
        <motion.div
          className={`h-full rounded-full ${isDone ? "bg-gradient-to-r from-yellow-400 to-amber-500" : "bg-gradient-to-r from-blue-500 via-violet-500 to-emerald-500"}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 80, damping: 15 }}
        />
      </div>
    </div>
  );
};

// ─── Static decorations (module-level so Math.random never runs during render) ─

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
  const [attemptsUsed, setAttemptsUsed] = useState(0);
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

  const handleAnswer = (answer: number | string) => {
    if (selectedAnswer !== null || !problem || !currentTopic) return;
    setSelectedAnswer(answer);
    const correct = answer === problem.answer;
    setIsCorrect(correct);

    // Capture closure values for the timeout
    const capturedSigs = recentSignatures;
    const capturedTopic = currentTopic;
    const capturedRecords = topicRecords;
    const capturedTopicStats = sessionTopicStats;
    const capturedSessionId = sessionId;

    if (correct) {
      playSound("correct");
      setScore((s) => s + 10);
      const nextSessionCorrect = sessionCorrect + 1;
      setSessionCorrect(nextSessionCorrect);

      const updated = advanceRecord(capturedRecords[capturedTopic.key] ?? DEFAULT_RECORD, true);
      const ticked = tickTopics({ ...capturedRecords, [capturedTopic.key]: updated }, capturedTopic.key);
      setTopicRecords(ticked);
      setLastTopicKey(capturedTopic.key);

      setSessionTopicStats({
        ...capturedTopicStats,
        [capturedTopic.key]: {
          correct: (capturedTopicStats[capturedTopic.key]?.correct ?? 0) + 1,
          total: (capturedTopicStats[capturedTopic.key]?.total ?? 0) + 1,
        },
      });

      postQuestionProgress(capturedTopic.key, true, ticked, capturedSessionId);

      setTimeout(() => {
        if (nextSessionCorrect >= SESSION_GOAL) {
          playSound("badge");
          setGameState("finale");
        } else {
          const next = selectTopic(ticked, capturedTopic.key);
          setCurrentTopic(next);
          const p = generateForTopic(next, capturedSigs);
          setProblem(p);
          setRecentSignatures((prev) => [...prev.slice(-9), p.signature]);
        }
        setSelectedAnswer(null);
        setIsCorrect(null);
        setAttemptsUsed(0);
      }, 2000);
    } else {
      playSound("incorrect");
      const isLastAttempt = attemptsUsed >= 1;

      if (isLastAttempt) {
        // Final wrong attempt: update records immediately so the POST has accurate mastery state
        const updated = advanceRecord(capturedRecords[capturedTopic.key] ?? DEFAULT_RECORD, false);
        const ticked = tickTopics({ ...capturedRecords, [capturedTopic.key]: updated }, capturedTopic.key);
        setTopicRecords(ticked);
        setLastTopicKey(capturedTopic.key);
        setSessionTopicStats({
          ...capturedTopicStats,
          [capturedTopic.key]: {
            correct: capturedTopicStats[capturedTopic.key]?.correct ?? 0,
            total: (capturedTopicStats[capturedTopic.key]?.total ?? 0) + 1,
          },
        });
        postQuestionProgress(capturedTopic.key, false, ticked, capturedSessionId);

        setTimeout(() => {
          const next = selectTopic(ticked, capturedTopic.key);
          setCurrentTopic(next);
          const p = generateForTopic(next, capturedSigs);
          setProblem(p);
          setRecentSignatures((prev) => [...prev.slice(-9), p.signature]);
          setAttemptsUsed(0);
          setSelectedAnswer(null);
          setIsCorrect(null);
        }, 2000);
      } else {
        setTimeout(() => {
          setAttemptsUsed(1);
          setSelectedAnswer(null);
          setIsCorrect(null);
        }, 2000);
      }
    }
  };

  const startGame = () => {
    const topic = selectTopic(topicRecords, lastTopicKey);
    setCurrentTopic(topic);
    const p = generateForTopic(topic, []);
    setProblem(p);
    setRecentSignatures([p.signature]);
    setAttemptsUsed(0);
    setGameState("playing");
  };

  const resetGame = () => {
    setTopicRecords({});
    setCurrentTopic(null);
    setLastTopicKey(null);
    setSessionCorrect(0);
    setAttemptsUsed(0);
    setProblem(null);
    setSessionTopicStats({});
    setSessionId(crypto.randomUUID());
    setGameState("start");
  };

  const clearStars = () => {
    setScore(0);
  };

  const READ_ALOUD: Set<ProblemType> = new Set([
    "fact-family", "count-120", "count-by-1", "count-by-10", "make-10", "teen-decompose",
    "equal-sign", "unknown-addend",
    "skip-count", "odd-even", "array",
    "round", "fraction-line", "equiv-fractions", "compare-fractions",
    "area", "perimeter",
  ]);
  const isReadAloud = !!problem && READ_ALOUD.has(problem.type);
  const isLongQuestion = problem && problem.question.length > 40;
  const isThreeOptions = problem && problem.options.length === 3;
  const topicLabel = currentTopic ? TOPIC_STAGE[currentTopic.key]?.label : null;
  const skillsLearned = learnedCount(topicRecords);

  return (
    <div className='flex-1 bg-black text-white selection:bg-blue-500/30 relative flex flex-col overflow-hidden max-h-screen'>
      <SpaceBackground />
      <StarBank score={score} onClear={clearStars} />
      <main className='relative z-10 w-full pt-4 sm:pt-6 px-4 sm:px-6 pb-20 sm:pb-24 flex flex-col items-center flex-1 min-h-0 overflow-hidden'>
        <div className='w-full flex justify-between items-center mb-3 sm:mb-4 shrink-0'>
          <div className='flex items-center gap-3'>
            <div className='p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-600/20'>
              <Rocket className='w-5 h-5 sm:w-6 sm:h-6 text-white' />
            </div>
            <div>
              <h1 className='text-lg sm:text-xl font-bold tracking-tight'>Space Math</h1>
            </div>
          </div>
          <button
            onClick={resetGame}
            className='text-[10px] font-bold text-slate-400 hover:text-white hover:bg-white/10 uppercase bg-white/5 px-2.5 py-1 rounded-lg transition-colors border border-white/10'
          >
            Reset
          </button>
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
                  <Rocket className='w-24 h-24 sm:w-28 sm:h-28 md:w-36 md:h-36 text-blue-500 drop-shadow-[0_0_30px_rgba(59,130,246,0.5)]' />
                </motion.div>
                <motion.div
                  className='absolute -bottom-4 -right-4'
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                >
                  <Sparkles className='w-10 h-10 sm:w-12 sm:h-12 text-yellow-400' />
                </motion.div>
              </div>
              <div>
                <h2 className='text-3xl sm:text-4xl md:text-5xl font-black mb-3 sm:mb-4 bg-gradient-to-b from-white to-blue-300 bg-clip-text text-transparent'>
                  Ready for Launch?
                </h2>
                <p className='text-sm sm:text-base text-blue-200/80 font-semibold'>
                  {skillsLearned} of {TOPIC_PROGRESSION.length} skills learned
                </p>
              </div>
              <button
                onClick={startGame}
                className='group relative px-10 sm:px-12 py-5 sm:py-6 bg-blue-600 rounded-3xl text-xl sm:text-2xl font-bold shadow-[0_10px_0_rgb(37,99,235)] active:shadow-none active:translate-y-[10px] transition-all hover:bg-blue-500'
              >
                <span className='flex items-center gap-3'>
                  START MISSION <ChevronRight className='w-7 h-7 sm:w-8 sm:h-8' />
                </span>
              </button>
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
                          stroke='rgba(255,255,255,0.55)'
                          strokeWidth='14'
                        />
                        <motion.circle
                          cx='112'
                          cy='112'
                          r='104'
                          fill='none'
                          stroke={isCorrect ? "#ffffff" : "#fde68a"}
                          strokeWidth='14'
                          strokeLinecap='round'
                          strokeDasharray={2 * Math.PI * 104}
                          initial={{ strokeDashoffset: 0 }}
                          animate={{ strokeDashoffset: 2 * Math.PI * 104 }}
                          transition={{ duration: 2, ease: "linear" }}
                        />
                      </svg>
                      <div className={`p-12 rounded-full shadow-2xl ${isCorrect ? "bg-green-500" : "bg-red-500"}`}>
                        {isCorrect ? (
                          <Check className='w-32 h-32 text-white' />
                        ) : (
                          <X className='w-32 h-32 text-white' />
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className='w-full flex-1 min-h-0 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-[32px] sm:rounded-[40px] p-4 sm:p-6 shadow-2xl relative overflow-hidden flex flex-col'>
                <div className='absolute top-3 right-4 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200'>
                  {topicLabel}
                </div>
                <div className='text-center mb-2 sm:mb-3 shrink-0'>
                  <h2
                    className={`font-black mb-1 tracking-tight leading-snug ${isReadAloud ? "text-3xl sm:text-4xl md:text-5xl" : isLongQuestion ? "text-2xl sm:text-3xl md:text-4xl" : "text-5xl sm:text-6xl md:text-7xl"}`}
                  >
                    {problem.question}
                  </h2>
                  {isReadAloud && (
                    <button
                      onClick={() => {
                        window.speechSynthesis.cancel();
                        const u = new SpeechSynthesisUtterance(problem.question);
                        u.rate = 0.85;
                        window.speechSynthesis.speak(u);
                      }}
                      className='mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-700 hover:bg-slate-600 text-blue-300 hover:text-blue-200 transition-colors text-sm font-semibold'
                    >
                      <Volume2 className='w-5 h-5' /> Read aloud
                    </button>
                  )}
                </div>
                <div className={`grid gap-2 sm:gap-3 flex-1 min-h-0 ${isThreeOptions ? "grid-cols-3" : "grid-cols-2"}`}>
                  {problem.options.map((opt, i) => (
                    <button
                      key={i}
                      disabled={selectedAnswer !== null}
                      onClick={() => handleAnswer(opt)}
                      className={`flex items-center justify-center rounded-3xl text-4xl sm:text-6xl md:text-8xl font-black transition-all border-b-[6px] sm:border-b-8 ${selectedAnswer === opt ? (isCorrect ? "bg-emerald-500 border-emerald-700 text-white" : "bg-rose-500 border-rose-700 text-white") : "bg-slate-800 border-slate-950 hover:bg-slate-700 text-white active:border-b-0 active:translate-y-[6px] sm:active:translate-y-[8px]"} ${selectedAnswer !== null && opt === problem.answer && selectedAnswer !== opt ? "bg-emerald-500/50 border-emerald-700/50" : ""}`}
                    >
                      {opt}
                    </button>
                  ))}
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
                  <Trophy className='w-36 h-36 sm:w-44 sm:h-44 md:w-56 md:h-56 text-yellow-400 drop-shadow-[0_0_40px_rgba(250,204,21,0.6)]' />
                </motion.div>
                {CONFETTI.map((p, i) => (
                  <motion.div
                    key={i}
                    className='absolute top-1/2 left-1/2 w-2 h-2 bg-yellow-400 rounded-full'
                    initial={{ x: 0, y: 0 }}
                    animate={{ x: p.x, y: p.y, opacity: 0, scale: 0 }}
                    transition={{ duration: 2, repeat: Infinity, delay: p.delay }}
                  />
                ))}
              </div>
              <div>
                <h2 className='text-4xl sm:text-5xl md:text-6xl font-black mb-3 sm:mb-4 bg-gradient-to-r from-yellow-400 via-white to-yellow-400 bg-clip-text text-transparent animate-pulse'>
                  SESSION COMPLETE!
                </h2>
                <p className='text-2xl sm:text-3xl text-blue-200'>
                  You answered <span className='text-white font-bold'>25</span> questions correctly!
                </p>
              </div>
              <div className='flex flex-col gap-4 items-center'>
                <button
                  onClick={() => {
                    setSessionCorrect(0);
                    setSessionTopicStats({});
                    setSessionId(crypto.randomUUID());
                    const next = selectTopic(topicRecords, lastTopicKey);
                    setCurrentTopic(next);
                    const p = generateForTopic(next, []);
                    setProblem(p);
                    setRecentSignatures([p.signature]);
                    setGameState("playing");
                  }}
                  className='px-10 sm:px-12 py-5 sm:py-6 bg-emerald-600 rounded-3xl text-xl sm:text-2xl font-bold shadow-[0_10px_0_rgb(5,150,105)] active:shadow-none active:translate-y-[10px] transition-all hover:bg-emerald-500'
                >
                  KEEP GOING
                </button>
                <button
                  onClick={resetGame}
                  className='px-8 py-4 bg-slate-800 rounded-2xl text-lg sm:text-xl font-bold border border-white/10 hover:bg-slate-700 transition-colors'
                >
                  START OVER
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <div className='absolute -bottom-20 -left-20 w-64 h-64 bg-purple-900/20 rounded-full blur-3xl pointer-events-none' />
      <div className='absolute -top-20 -right-20 w-80 h-80 bg-blue-900/20 rounded-full blur-3xl pointer-events-none' />
    </div>
  );
}
