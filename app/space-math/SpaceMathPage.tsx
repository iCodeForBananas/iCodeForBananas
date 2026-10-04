"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Rocket, Star, Trophy, ChevronRight, Sparkles, Check, X } from "lucide-react";
import { Button } from "@radix-ui/themes";
import styles from "./space-math.module.css";

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
  | "count-next"
  | "count-by-10"
  | "make-10"
  | "teen-decompose"
  // G1
  | "sub-mult-10"
  | "equal-sign"
  | "unknown-addend"
  | "add-regroup-mental"
  | "add-whole-tens"
  | "word-problem-add"
  | "add-sub-chain"
  | "word-problem-sub"
  // G2
  | "add-100-regroup"
  | "sub-100-regroup"
  | "place-value-3"
  | "order-numbers"
  | "add-no-regroup"
  | "add-whole-hundreds"
  | "add-harder-mixed"
  | "word-problem-mixed"
  | "sub-single-digit"
  | "sub-no-regroup"
  | "sub-borrow-hard"
  | "sub-whole-tens"
  | "sub-whole-hundreds"
  | "skip-small"
  | "skip-10-flex"
  | "skip-big"
  | "skip-backward"
  | "compare-3digit"
  | "mental-hundred"
  | "odd-even"
  | "array"
  | "mult-tables-single"
  | "mult-tables-mixed"
  | "mult-missing-factor"
  | "fraction-equal-parts"
  | "fraction-pic-to-frac"
  | "fraction-notation"
  | "fraction-frac-to-pic"
  | "fraction-words"
  | "fraction-of-set"
  | "compare-fractions-simple"
  | "fraction-compare-visual"
  | "fraction-word-problem"
  // G3
  | "multiply"
  | "divide"
  | "multiply-tens"
  | "mult-by-2-extended"
  | "word-problem-mult"
  | "round"
  | "round-ten-small"
  | "round-ten-large"
  | "round-hundred"
  | "fraction-line"
  | "equiv-fractions"
  | "compare-fractions"
  | "area"
  | "perimeter";

interface FractionVisual {
  shape: "circle" | "square" | "bar" | "set";
  total: number;
  shaded: number;
}

interface Problem {
  id: string;
  type: ProblemType;
  question: string;
  answer: number | string;
  options: (number | string)[];
  signature: string;
  // One or two shapes rendered above the question (one shape, or two for a
  // side-by-side visual comparison).
  visual?: FractionVisual[];
  // When true, each entry in `options` is a "n/d" string rendered as a small
  // shape (using `optionShape`) instead of as text.
  optionsArePictures?: boolean;
  optionShape?: FractionVisual["shape"];
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
  { key: "k-count-next",     type: "count-next",      min: 1,   max: 97  },
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
  { key: "g1-add-regroup",   type: "add-regroup-mental", min: 1, max: 9   },
  { key: "g1-add-sub-chain", type: "add-sub-chain",   min: 1,   max: 9   },
  { key: "place-value",      type: "place-value",     min: 1,   max: 9   },
  { key: "count-120",        type: "count-120",       min: 1,   max: 120 },
  { key: "mental-ten",       type: "mental-ten",      min: 10,  max: 90  },
  { key: "g1-add-whole-tens", type: "add-whole-tens", min: 10,  max: 150 },
  { key: "add-100",          type: "add-100",         min: 10,  max: 90  },
  { key: "g1-word-problems", type: "word-problem-add", min: 1,  max: 400 },
  { key: "g1-word-problems-sub", type: "word-problem-sub", min: 1, max: 400 },
  { key: "g1-sub-mult-10",   type: "sub-mult-10",     min: 10,  max: 90  },
  { key: "g2-odd-even",      type: "odd-even",        min: 1,   max: 20  },
  { key: "g2-skip-small",    type: "skip-small",      min: 2,   max: 9   },
  { key: "g2-skip-10-flex",  type: "skip-10-flex",    min: 1,   max: 80  },
  { key: "g2-skip-big",      type: "skip-big",        min: 20,  max: 100 },
  { key: "g2-skip-backward", type: "skip-backward",   min: 2,   max: 10  },
  { key: "g2-place-3",       type: "place-value-3",   min: 1,   max: 9   },
  { key: "g2-compare-999",   type: "compare-3digit",  min: 100, max: 999 },
  { key: "g2-order",         type: "order-numbers",   min: 1,   max: 99  },
  { key: "g2-add-no-regroup", type: "add-no-regroup", min: 10,  max: 89  },
  { key: "g2-add-regroup",   type: "add-100-regroup", min: 10,  max: 99  },
  { key: "g2-sub-no-regroup", type: "sub-no-regroup", min: 10,  max: 899 },
  { key: "g2-sub-regroup",   type: "sub-100-regroup", min: 10,  max: 99  },
  { key: "g2-sub-single",    type: "sub-single-digit", min: 1,  max: 999 },
  { key: "g2-sub-whole-tens", type: "sub-whole-tens", min: 10,  max: 1000 },
  { key: "g2-mental-100",    type: "mental-hundred",  min: 100, max: 800 },
  { key: "g2-add-whole-hundreds", type: "add-whole-hundreds", min: 100, max: 900 },
  { key: "g2-sub-whole-hundreds", type: "sub-whole-hundreds", min: 100, max: 900 },
  { key: "g2-sub-borrow-hard", type: "sub-borrow-hard", min: 10, max: 999 },
  { key: "g2-add-harder",    type: "add-harder-mixed", min: 10, max: 899 },
  { key: "g2-word-problems", type: "word-problem-mixed", min: 1, max: 90 },
  { key: "g2-array",         type: "array",           min: 2,   max: 5   },
  { key: "g2-mult-tables-single", type: "mult-tables-single", min: 1, max: 10 },
  { key: "g2-mult-tables-mixed", type: "mult-tables-mixed", min: 1, max: 10 },
  { key: "g2-mult-missing-factor", type: "mult-missing-factor", min: 1, max: 10 },
  { key: "g2-frac-equal-parts", type: "fraction-equal-parts", min: 2, max: 10 },
  { key: "g2-frac-pic-to-frac", type: "fraction-pic-to-frac", min: 2, max: 10 },
  { key: "g2-frac-notation", type: "fraction-notation", min: 2, max: 10 },
  { key: "g2-frac-frac-to-pic", type: "fraction-frac-to-pic", min: 2, max: 10 },
  { key: "g2-frac-words",    type: "fraction-words",   min: 1,   max: 1   },
  { key: "g2-frac-of-set",   type: "fraction-of-set",  min: 6,   max: 12  },
  { key: "g2-compare-frac-simple", type: "compare-fractions-simple", min: 2, max: 10 },
  { key: "g2-frac-compare-visual", type: "fraction-compare-visual", min: 2, max: 10 },
  { key: "g2-frac-word-problems", type: "fraction-word-problem", min: 1, max: 12 },
  { key: "g3-mult",          type: "multiply",        min: 0,   max: 10  },
  { key: "g3-divide",        type: "divide",          min: 1,   max: 10  },
  { key: "g3-mult-tens",     type: "multiply-tens",   min: 10,  max: 90  },
  { key: "g3-mult-by-2",     type: "mult-by-2-extended", min: 2, max: 95 },
  { key: "g3-word-problems-mult", type: "word-problem-mult", min: 2, max: 25 },
  { key: "g3-round-ten-small", type: "round-ten-small", min: 1, max: 99  },
  { key: "g3-round-ten-large", type: "round-ten-large", min: 10, max: 999 },
  { key: "g3-round-hundred", type: "round-hundred",   min: 10,  max: 990 },
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
  "k-count-next":    { id: 18, label: "Count the next number" },
  "k-count-by-10":   { id: 17, label: "Count by 10s to 100" },
  "k-make-10":       { id: 12, label: "Make 10" },
  "k-compare-10":    { id: 13, label: "Compare 1–10" },
  "k-teen":          { id: 15, label: "Teen Numbers (10 + ones)" },
  // G1
  "add-1-20":        { id: 5,  label: "Add within 20" },
  "sub-1-20":        { id: 60, label: "Subtract within 20" },
  "three-addend":    { id: 61, label: "Three-addend addition" },
  "fact-family":     { id: 62, label: "Fact families" },
  "g1-add-regroup":  { id: 5,  label: "Add within 20" },
  "g1-add-sub-chain": { id: 61, label: "Three-addend addition" },
  "g1-equal-sign":   { id: 16, label: "Equal sign true/false" },
  "g1-unknown":      { id: 63, label: "Unknown addend" },
  "compare-20":      { id: 6,  label: "Compare 2-digit numbers" },
  "place-value":     { id: 7,  label: "Tens & ones place value" },
  "mental-ten":      { id: 64, label: "Mental ±10" },
  "g1-add-whole-tens": { id: 64, label: "Mental ±10" },
  "g1-sub-mult-10":  { id: 65, label: "Subtract multiples of 10" },
  "add-100":         { id: 8,  label: "Add within 100" },
  "g1-word-problems": { id: 67, label: "Word problems within 20" },
  "g1-word-problems-sub": { id: 67, label: "Word problems within 20" },
  "count-120":       { id: 68, label: "Count to 120" },
  // G2
  "g2-add-no-regroup": { id: 20, label: "Add within 100" },
  "g2-add-regroup":  { id: 20, label: "Add within 100" },
  "g2-sub-no-regroup": { id: 21, label: "Subtract within 100" },
  "g2-sub-regroup":  { id: 21, label: "Subtract within 100" },
  "g2-sub-single":   { id: 21, label: "Subtract within 100" },
  "g2-sub-borrow-hard": { id: 21, label: "Subtract within 100" },
  "g2-sub-whole-tens": { id: 65, label: "Subtract multiples of 10" },
  "g2-place-3":      { id: 22, label: "3-Digit Place Value" },
  "g2-order":        { id: 24, label: "Compare 3-Digit" },
  "g2-skip-small":   { id: 23, label: "Skip Count" },
  "g2-skip-10-flex": { id: 23, label: "Skip Count" },
  "g2-skip-big":     { id: 23, label: "Skip Count" },
  "g2-skip-backward": { id: 23, label: "Skip Count" },
  "g2-compare-999":  { id: 24, label: "Compare 3-Digit" },
  "g2-mental-100":   { id: 25, label: "Mental ±100" },
  "g2-add-whole-hundreds": { id: 25, label: "Mental ±100" },
  "g2-sub-whole-hundreds": { id: 25, label: "Mental ±100" },
  "g2-add-harder":   { id: 20, label: "Add within 100" },
  "g2-word-problems": { id: 20, label: "Add within 100" },
  "g2-odd-even":     { id: 26, label: "Odd or Even" },
  "g2-array":        { id: 27, label: "Arrays" },
  "g2-mult-tables-single": { id: 27, label: "Arrays" },
  "g2-mult-tables-mixed": { id: 27, label: "Arrays" },
  "g2-mult-missing-factor": { id: 27, label: "Arrays" },
  "g2-frac-equal-parts": { id: 30, label: "Thirds (partition shapes)" },
  "g2-frac-pic-to-frac": { id: 44, label: "Fractions on Number Line" },
  "g2-frac-notation":  { id: 44, label: "Fractions on Number Line" },
  "g2-frac-frac-to-pic": { id: 44, label: "Fractions on Number Line" },
  "g2-frac-words":     { id: 44, label: "Fractions on Number Line" },
  "g2-frac-of-set":    { id: 44, label: "Fractions on Number Line" },
  "g2-compare-frac-simple": { id: 46, label: "Compare Fractions" },
  "g2-frac-compare-visual": { id: 46, label: "Compare Fractions" },
  "g2-frac-word-problems": { id: 44, label: "Fractions on Number Line" },
  // G3
  "g3-mult":         { id: 40, label: "Multiplication" },
  "g3-mult-tens":    { id: 41, label: "×Multiples of 10" },
  "g3-mult-by-2":    { id: 41, label: "×Multiples of 10" },
  "g3-word-problems-mult": { id: 40, label: "Multiplication" },
  "g3-divide":       { id: 42, label: "Division" },
  "g3-round-ten-small": { id: 43, label: "Rounding" },
  "g3-round-ten-large": { id: 43, label: "Rounding" },
  "g3-round-hundred": { id: 43, label: "Rounding" },
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

// Renders a chain of addends, either asking for the total or, with a
// blankIndex, hiding one addend and showing the total instead.
function chainAdd(terms: number[], blankIndex: number | null): { question: string; answer: number } {
  const sum = terms.reduce((s, n) => s + n, 0);
  const parts = terms.map((t, i) => (i === blankIndex ? "__" : String(t)));
  if (blankIndex === null) return { question: `${parts.join(" + ")} = ?`, answer: sum };
  return { question: `${parts.join(" + ")} = ${sum}`, answer: terms[blankIndex] };
}

const WP_NAMES = ["Mia", "Leo", "Zoe", "Sam", "Ava", "Max", "Ivy", "Eli"];
const WP_ITEMS = ["apples", "stickers", "marbles", "cookies", "toy cars", "crayons", "shells", "coins"];
const pickOne = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// Builds a 4-option set from an explicit candidate pool (for answers that
// aren't numbers, so numOpts' +/-offset approach doesn't apply).
function strOpts(answer: string, candidates: string[]): string[] {
  const s = new Set<string>([answer]);
  for (const c of [...candidates].sort(() => Math.random() - 0.5)) {
    if (s.size >= 4) break;
    if (c !== answer) s.add(c);
  }
  return Array.from(s).sort(() => Math.random() - 0.5);
}

const FRACTION_DENOMS = [2, 3, 4, 5, 6, 8, 10];
const FRACTION_PART_NAMES: Record<number, string> = {
  2: "halves", 3: "thirds", 4: "quarters", 5: "fifths", 6: "sixths", 8: "eighths", 10: "tenths",
};
const FRACTION_WORDS: Record<string, string> = {
  "1/2": "one-half", "1/3": "one-third", "2/3": "two-thirds",
  "1/4": "one-fourth", "3/4": "three-fourths",
  "1/5": "one-fifth", "1/6": "one-sixth", "1/8": "one-eighth", "1/10": "one-tenth",
};
const FRACTION_SHAPES: FractionVisual["shape"][] = ["circle", "square", "bar", "set"];

// Renders a - b, either asking for the difference or, with blank, hiding
// the minuend or the subtrahend and showing the difference instead.
function chainSub(a: number, b: number, blank: "minuend" | "subtrahend" | null): { question: string; answer: number } {
  const diff = a - b;
  if (blank === null) return { question: `${a} - ${b} = ?`, answer: diff };
  if (blank === "minuend") return { question: `__ - ${b} = ${diff}`, answer: a };
  return { question: `${a} - __ = ${diff}`, answer: b };
}

function buildProblem(type: ProblemType, min: number, max: number): Problem {
  const id = Math.random().toString(36).substr(2, 9);

  if (type === "addition") {
    const left = Math.floor(Math.random() * (max - min)) + min; // min to max-1, leaving room for right
    const right = Math.floor(Math.random() * (max - left)) + 1; // 1 to (max - left), so left+right <= max
    const sum = left + right;
    // Occasionally ask for a missing addend instead of the sum, so this
    // rung also covers "4 + __ = 9"-style problems at the same number range.
    const hideLeft = Math.random() < 0.3 ? Math.random() < 0.5 : null;
    if (hideLeft === null) {
      return {
        id,
        type,
        question: `${left} + ${right} = ?`,
        answer: sum,
        options: numOpts(sum),
        signature: `add:${Math.min(left, right)},${Math.max(left, right)}`,
      };
    }
    const answer = hideLeft ? left : right;
    return {
      id,
      type,
      question: hideLeft ? `? + ${right} = ${sum}` : `${left} + ? = ${sum}`,
      answer,
      options: numOpts(answer),
      signature: `add-missing:${left},${right}-${hideLeft}`,
    };
  }

  if (type === "subtraction") {
    const diff = Math.floor(Math.random() * (max - min + 1)) + min;
    const right = Math.floor(Math.random() * (max - min + 1)) + 1;
    const left = diff + right;
    // Occasionally ask for the missing minuend or subtrahend instead of the
    // difference, so this rung also covers "__ - 5 = 2"-style problems.
    const blank = Math.random() < 0.3 ? (Math.random() < 0.5 ? "minuend" : "subtrahend") : null;
    const { question, answer } = chainSub(left, right, blank);
    return {
      id,
      type,
      question,
      answer,
      options: numOpts(answer),
      signature: `sub${blank ?? ""}:${left},${right}`,
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

  if (type === "add-whole-tens") {
    const variant = Math.floor(Math.random() * 8);
    const tens = (n: number) => (Math.floor(Math.random() * n) + 1) * 10;
    if (variant <= 1) {
      // 2 addends, sum or missing addend: 30 + 80 = ? / ___ + 80 = 110
      const terms = [tens(9), tens(9)];
      const { question, answer } = chainAdd(terms, variant === 1 ? 0 : null);
      return { id, type, question, answer, options: numOpts(answer), signature: `awt2:${terms.join(",")}-${variant}` };
    }
    if (variant <= 3) {
      // 3 addends, sum or missing middle addend
      const terms = [tens(9), tens(9), tens(9)];
      const { question, answer } = chainAdd(terms, variant === 3 ? 1 : null);
      return { id, type, question, answer, options: numOpts(answer), signature: `awt3:${terms.join(",")}-${variant}` };
    }
    if (variant <= 5) {
      // 4 addends, sum or missing second addend
      const terms = [tens(9), tens(9), tens(9), tens(9)];
      const { question, answer } = chainAdd(terms, variant === 5 ? 1 : null);
      return { id, type, question, answer, options: numOpts(answer), signature: `awt4:${terms.join(",")}-${variant}` };
    }
    if (variant === 6) {
      // Complete the next ten: ___ + 8 = 70
      const target = tens(9); // 10..90, leaves room to go up to 100
      const ones = Math.floor(Math.random() * 9) + 1;
      const start = target + 10 - ones; // so start + ones = target + 10
      const { question, answer } = chainAdd([start, ones], 0);
      return { id, type, question, answer, options: numOpts(answer), signature: `awt-next:${start},${ones}` };
    }
    // Decompose into "complete the ten" + remainder: 62 + 9 = 62 + 8 + ?
    const ones = Math.floor(Math.random() * 9) + 1; // 1..9, the base's ones digit
    const base = tens(8) + ones; // e.g. 62
    const toNextTen = 10 - ones;
    const remainder = Math.floor(Math.random() * 9) + 1; // 1..9
    const addend = toNextTen + remainder;
    const answer = remainder;
    return {
      id,
      type,
      question: `${base} + ${addend} = ${base} + ${toNextTen} + ?`,
      answer,
      options: numOpts(answer),
      signature: `awt-decomp:${base},${addend}`,
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

  if (type === "word-problem-add") {
    const big = Math.random() < 0.4; // occasionally stretch to 3-digit numbers
    const a = big ? Math.floor(Math.random() * 400) + 100 : Math.floor(Math.random() * 50) + 1;
    const b = big ? Math.floor(Math.random() * 90) + 1 : Math.floor(Math.random() * 20) + 1;
    const name = pickOne(WP_NAMES);
    const item = pickOne(WP_ITEMS);
    const answer = a + b;
    return {
      id,
      type,
      question: `${name} has ${a} ${item}. ${name} gets ${b} more. How many ${item} does ${name} have now?`,
      answer,
      options: numOpts(answer),
      signature: `wpa:${a},${b}`,
    };
  }

  if (type === "word-problem-sub") {
    const big = Math.random() < 0.4;
    const a = big ? Math.floor(Math.random() * 400) + 100 : Math.floor(Math.random() * 50) + 5;
    const b = big ? Math.floor(Math.random() * 90) + 1 : Math.floor(Math.random() * Math.min(a - 1, 20)) + 1;
    const name = pickOne(WP_NAMES);
    const item = pickOne(WP_ITEMS);
    const answer = a - b;
    return {
      id,
      type,
      question: `${name} has ${a} ${item}. ${name} gives away ${b}. How many ${item} does ${name} have left?`,
      answer,
      options: numOpts(answer),
      signature: `wps:${a},${b}`,
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

  if (type === "add-regroup-mental") {
    const count = [2, 3, 4][Math.floor(Math.random() * 3)];
    let terms: number[];
    if (count === 2) {
      // Two 1-digit addends: force a sum >= 10 so regrouping is always in play.
      let a = 0;
      let b = 0;
      do {
        a = Math.floor(Math.random() * 9) + 1;
        b = Math.floor(Math.random() * 9) + 1;
      } while (a + b < 10);
      terms = [a, b];
    } else {
      terms = Array.from({ length: count }, () => Math.floor(Math.random() * 9) + 1);
    }
    const sum = terms.reduce((s, n) => s + n, 0);
    const blankIndex = Math.random() < 0.5 ? Math.floor(Math.random() * terms.length) : null;
    const parts = terms.map((t, i) => (i === blankIndex ? "__" : String(t)));
    const answer = blankIndex === null ? sum : terms[blankIndex];
    return {
      id,
      type,
      question: blankIndex === null ? `${parts.join(" + ")} = ?` : `${parts.join(" + ")} = ${sum}`,
      answer,
      options: numOpts(answer),
      signature: `addrm:${terms.join(",")}-${blankIndex}`,
    };
  }

  if (type === "add-sub-chain") {
    const count = Math.random() < 0.5 ? 3 : 4;
    let total = Math.floor(Math.random() * 9) + 1; // 1..9
    let question = String(total);
    const sig: number[] = [total];
    for (let i = 1; i < count; i++) {
      const isAdd = Math.random() < 0.5;
      let term = Math.floor(Math.random() * 9) + 1;
      if (!isAdd) term = Math.min(term, total); // never go negative
      total = isAdd ? total + term : total - term;
      question += isAdd ? ` + ${term}` : ` - ${term}`;
      sig.push(isAdd ? term : -term);
    }
    const answer = total;
    return {
      id,
      type,
      question: `${question} = ?`,
      answer,
      options: numOpts(answer),
      signature: `asc:${sig.join(",")}`,
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

  if (type === "count-next") {
    // Simplest counting drill: three numbers in a row, what comes next?
    const start = Math.floor(Math.random() * (max - min + 1)) + min;
    const answer = start + 3;
    return {
      id,
      type,
      question: `${start}, ${start + 1}, ${start + 2}, ?`,
      answer,
      options: numOpts(answer),
      signature: `cnext:${start}`,
    };
  }

  if (type === "count-by-10") {
    // No instructional prefix — just the pattern, so the step is something
    // to notice, not something the question hands you.
    const step = (Math.floor(Math.random() * 8) + 2) * 10; // 20..90, leaves room for one number before it
    const answer = step + 10;
    return {
      id,
      type,
      question: `${step - 10}, ${step}, ?`,
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

  if (type === "sub-whole-tens") {
    const tensMul = (loK: number, hiK: number) => (Math.floor(Math.random() * (hiK - loK + 1)) + loK) * 10;
    const variant = Math.floor(Math.random() * 5);
    if (variant <= 1) {
      // Tens from tens, within 0-1,000: 900 - 50 = ? / __ - 70 = 230
      const a = tensMul(2, 90);
      const b = tensMul(1, a / 10 - 1);
      const blank = variant === 1 ? (Math.random() < 0.5 ? "minuend" : "subtrahend") : null;
      const { question, answer } = chainSub(a, b, blank);
      return { id, type, question, answer, options: numOpts(answer), signature: `swt0:${a},${b}` };
    }
    if (variant === 2) {
      // Whole tens from a 2-digit number: 36 - 30 = ?
      const tensDigit = Math.floor(Math.random() * 9) + 1;
      const onesDigit = Math.floor(Math.random() * 10);
      const bTensUnits = Math.floor(Math.random() * tensDigit) + 1;
      const { question, answer } = chainSub(tensDigit * 10 + onesDigit, bTensUnits * 10, null);
      return { id, type, question, answer, options: numOpts(answer), signature: `swt2:${tensDigit},${onesDigit},${bTensUnits}` };
    }
    if (variant === 3) {
      // Whole tens from a 3-digit number, no regrouping: 271 - 50 = ?
      const hundreds = Math.floor(Math.random() * 9) + 1;
      const tensDigit = Math.floor(Math.random() * 9) + 1;
      const onesDigit = Math.floor(Math.random() * 10);
      const bTensUnits = Math.floor(Math.random() * tensDigit) + 1;
      const { question, answer } = chainSub(hundreds * 100 + tensDigit * 10 + onesDigit, bTensUnits * 10, null);
      return { id, type, question, answer, options: numOpts(answer), signature: `swt3:${hundreds},${tensDigit},${onesDigit},${bTensUnits}` };
    }
    // Whole tens from a 3-digit number, with regrouping: 159 - 60 = ?
    const hundreds = Math.floor(Math.random() * 9) + 1;
    const tensDigit = Math.floor(Math.random() * 9); // 0..8, leaves room for a bigger subtrahend
    const onesDigit = Math.floor(Math.random() * 10);
    const bTensUnits = Math.floor(Math.random() * (9 - tensDigit)) + tensDigit + 1; // forces a borrow
    const { question, answer } = chainSub(hundreds * 100 + tensDigit * 10 + onesDigit, bTensUnits * 10, null);
    return { id, type, question, answer, options: numOpts(answer), signature: `swt4:${hundreds},${tensDigit},${onesDigit},${bTensUnits}` };
  }

  if (type === "sub-whole-hundreds") {
    const variant = Math.floor(Math.random() * 2);
    if (variant === 0) {
      // Whole hundreds from a 3-digit number: 729 - 200 = ?
      const a = Math.floor(Math.random() * 900) + 100;
      const bHundreds = Math.floor(Math.random() * Math.floor(a / 100)) + 1;
      const { question, answer } = chainSub(a, bHundreds * 100, null);
      return { id, type, question, answer, options: numOpts(answer), signature: `swh0:${a},${bHundreds}` };
    }
    // A 2-digit number from a whole hundred: 700 - 77 = ?
    const a = (Math.floor(Math.random() * 9) + 1) * 100; // 100..900
    const b = Math.floor(Math.random() * 90) + 10; // 10..99
    const { question, answer } = chainSub(a, b, null);
    return { id, type, question, answer, options: numOpts(answer), signature: `swh1:${a},${b}` };
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

  if (type === "add-no-regroup") {
    const variant = Math.floor(Math.random() * 3);
    if (variant === 0) {
      // 2-digit + 1-digit, no carrying: 34 + 4 = ?
      const tens = Math.floor(Math.random() * 8) + 1; // 1..8
      const onesA = Math.floor(Math.random() * 9); // 0..8, leaves room for a 1-digit addend
      const onesB = Math.floor(Math.random() * (9 - onesA)) + 1; // 1..(9-onesA)
      const left = tens * 10 + onesA;
      const { question, answer } = chainAdd([left, onesB], null);
      return { id, type, question, answer, options: numOpts(answer), signature: `addnr1:${left},${onesB}` };
    }
    if (variant === 1) {
      // Same shape, missing addend: 34 + __ = 38
      const tens = Math.floor(Math.random() * 8) + 1;
      const onesA = Math.floor(Math.random() * 9);
      const onesB = Math.floor(Math.random() * (9 - onesA)) + 1;
      const left = tens * 10 + onesA;
      const { question, answer } = chainAdd([left, onesB], 1);
      return { id, type, question, answer, options: numOpts(answer), signature: `addnr1m:${left},${onesB}` };
    }
    // Two 2-digit numbers, no carrying in either place: 34 + 21 = ?
    const tensA = Math.floor(Math.random() * 8) + 1; // 1..8
    const tensB = Math.floor(Math.random() * (9 - tensA)) + 1; // keeps tens sum <= 9
    const onesA = Math.floor(Math.random() * 9); // 0..8
    const onesB = Math.floor(Math.random() * (9 - onesA)); // keeps ones sum <= 8
    const left = tensA * 10 + onesA;
    const right = tensB * 10 + onesB;
    const { question, answer } = chainAdd([left, right], null);
    return { id, type, question, answer, options: numOpts(answer), signature: `addnr2:${left},${right}` };
  }

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

  if (type === "sub-single-digit") {
    const variant = Math.floor(Math.random() * 7);
    if (variant === 0) {
      // 2-digit - 1-digit, no regrouping: 35 - 4 = ?
      const tens = Math.floor(Math.random() * 8) + 1;
      const onesA = Math.floor(Math.random() * 9) + 1;
      const b = Math.floor(Math.random() * onesA) + 1;
      const { question, answer } = chainSub(tens * 10 + onesA, b, null);
      return { id, type, question, answer, options: numOpts(answer), signature: `ssd0:${tens},${onesA},${b}` };
    }
    if (variant === 1) {
      // Whole ten - 1-digit, always regroups: 20 - 2 = ?
      const a = (Math.floor(Math.random() * 9) + 1) * 10; // 10..90
      const b = Math.floor(Math.random() * 9) + 1;
      const { question, answer } = chainSub(a, b, null);
      return { id, type, question, answer, options: numOpts(answer), signature: `ssd1:${a},${b}` };
    }
    if (variant === 2) {
      // 2-digit - 1-digit, forced regrouping: 33 - 9 = ?
      const tens = Math.floor(Math.random() * 9) + 1;
      const onesA = Math.floor(Math.random() * 9);
      const b = Math.floor(Math.random() * (9 - onesA)) + onesA + 1;
      const { question, answer } = chainSub(tens * 10 + onesA, b, null);
      return { id, type, question, answer, options: numOpts(answer), signature: `ssd2:${tens},${onesA},${b}` };
    }
    if (variant === 3) {
      // 3-digit - 1-digit: 217 - 9 = ?
      const a = Math.floor(Math.random() * 900) + 100;
      const b = Math.floor(Math.random() * 9) + 1;
      const { question, answer } = chainSub(a, b, null);
      return { id, type, question, answer, options: numOpts(answer), signature: `ssd3:${a},${b}` };
    }
    const blank = Math.random() < 0.5 ? "minuend" : "subtrahend";
    if (variant === 4) {
      // Same shape as variant 0, missing minuend or subtrahend: 66 - __ = 61
      const tens = Math.floor(Math.random() * 8) + 1;
      const onesA = Math.floor(Math.random() * 9) + 1;
      const b = Math.floor(Math.random() * onesA) + 1;
      const { question, answer } = chainSub(tens * 10 + onesA, b, blank);
      return { id, type, question, answer, options: numOpts(answer), signature: `ssd4:${tens},${onesA},${b}` };
    }
    if (variant === 5) {
      // Same shape as variant 2, missing minuend or subtrahend: 66 - __ = 58
      const tens = Math.floor(Math.random() * 9) + 1;
      const onesA = Math.floor(Math.random() * 9);
      const b = Math.floor(Math.random() * (9 - onesA)) + onesA + 1;
      const { question, answer } = chainSub(tens * 10 + onesA, b, blank);
      return { id, type, question, answer, options: numOpts(answer), signature: `ssd5:${tens},${onesA},${b}` };
    }
    // Same shape as variant 3, missing minuend or subtrahend: 103 - __ = 96
    const a = Math.floor(Math.random() * 900) + 100;
    const b = Math.floor(Math.random() * 9) + 1;
    const { question, answer } = chainSub(a, b, blank);
    return { id, type, question, answer, options: numOpts(answer), signature: `ssd6:${a},${b}` };
  }

  if (type === "sub-no-regroup") {
    const variant = Math.floor(Math.random() * 4);
    if (variant <= 1) {
      // Two 2-digit numbers, no borrowing: 96 - 54 = ? / 26 - __ = 15
      const tensA = Math.floor(Math.random() * 9) + 1;
      const onesA = Math.floor(Math.random() * 10);
      const tensB = Math.floor(Math.random() * tensA) + 1;
      const onesB = Math.floor(Math.random() * (onesA + 1));
      const blank = variant === 1 ? (Math.random() < 0.5 ? "minuend" : "subtrahend") : null;
      const { question, answer } = chainSub(tensA * 10 + onesA, tensB * 10 + onesB, blank);
      return { id, type, question, answer, options: numOpts(answer), signature: `snr2:${tensA},${onesA},${tensB},${onesB}` };
    }
    // Two 3-digit numbers, no borrowing: 798 - 123 = ? / 543 - __ = 210
    const hA = Math.floor(Math.random() * 9) + 1;
    const tA = Math.floor(Math.random() * 10);
    const oA = Math.floor(Math.random() * 10);
    const hB = Math.floor(Math.random() * hA) + 1;
    const tB = Math.floor(Math.random() * (tA + 1));
    const oB = Math.floor(Math.random() * (oA + 1));
    const blank = variant === 3 ? (Math.random() < 0.5 ? "minuend" : "subtrahend") : null;
    const { question, answer } = chainSub(hA * 100 + tA * 10 + oA, hB * 100 + tB * 10 + oB, blank);
    return { id, type, question, answer, options: numOpts(answer), signature: `snr3:${hA},${tA},${oA},${hB},${tB},${oB}` };
  }

  if (type === "sub-borrow-hard") {
    const variant = Math.floor(Math.random() * 3);
    if (variant === 0) {
      // Two 2-digit numbers, forced borrowing: 96 - 87 = ?
      const tensA = Math.floor(Math.random() * 8) + 2; // 2..9
      const tensB = Math.floor(Math.random() * (tensA - 1)) + 1; // 1..tensA-1
      const onesA = Math.floor(Math.random() * 9); // 0..8
      const onesB = Math.floor(Math.random() * (9 - onesA)) + onesA + 1; // onesA+1..9
      const { question, answer } = chainSub(tensA * 10 + onesA, tensB * 10 + onesB, null);
      return { id, type, question, answer, options: numOpts(answer), signature: `sbh2:${tensA},${onesA},${tensB},${onesB}` };
    }
    if (variant === 1) {
      // Two 3-digit numbers, forced borrowing: 421 - 388 = ?
      const hA = Math.floor(Math.random() * 8) + 2; // 2..9
      const hB = Math.floor(Math.random() * (hA - 1)) + 1; // 1..hA-1, guarantees a > b
      const tA = Math.floor(Math.random() * 10);
      const tB = Math.floor(Math.random() * 10);
      const onesA = Math.floor(Math.random() * 9); // 0..8
      const onesB = Math.floor(Math.random() * (9 - onesA)) + onesA + 1; // forces a ones borrow
      const { question, answer } = chainSub(hA * 100 + tA * 10 + onesA, hB * 100 + tB * 10 + onesB, null);
      return { id, type, question, answer, options: numOpts(answer), signature: `sbh3:${hA},${tA},${onesA},${hB},${tB},${onesB}` };
    }
    // Borrow over zeros: 200 - 199 = ?
    const hundred = (Math.floor(Math.random() * 9) + 1) * 100; // 100..900
    const diff = Math.floor(Math.random() * 9) + 1; // 1..9
    const { question, answer } = chainSub(hundred, hundred - diff, null);
    return { id, type, question, answer, options: numOpts(answer), signature: `sbhz:${hundred},${diff}` };
  }

  if (type === "place-value-3") {
    const variants = [
      // H hundreds + T tens + O ones = ?
      () => {
        const h = Math.floor(Math.random() * 9) + 1;
        const t = Math.floor(Math.random() * 10);
        const o = Math.floor(Math.random() * 10);
        return { question: `${h} hundreds + ${t} tens + ${o} ones = ?`, answer: h * 100 + t * 10 + o, sig: `pv3-word:${h},${t},${o}` };
      },
      // Build a 3-digit number: 200 + 70 + 3 = ?
      () => {
        const h = Math.floor(Math.random() * 9) + 1;
        const t = Math.floor(Math.random() * 9) + 1;
        const o = Math.floor(Math.random() * 9) + 1;
        return { question: `${h * 100} + ${t * 10} + ${o} = ?`, answer: h * 100 + t * 10 + o, sig: `pv3-build:${h},${t},${o}` };
      },
      // Missing place value, in scrambled order: 5 + 400 + ___ = 485
      () => {
        const h = Math.floor(Math.random() * 9) + 1;
        const t = Math.floor(Math.random() * 10);
        const o = Math.floor(Math.random() * 10);
        const terms = [h * 100, t * 10, o];
        for (let i = terms.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [terms[i], terms[j]] = [terms[j], terms[i]];
        }
        const blankIndex = Math.floor(Math.random() * 3);
        const { question, answer } = chainAdd(terms, blankIndex);
        return { question, answer, sig: `pv3-missing:${terms.join(",")}-${blankIndex}` };
      },
      // Expanded form with a coefficient blank: 273 = __ x 100 + 7 x 10 + 3 x 1
      () => {
        const h = Math.floor(Math.random() * 9) + 1;
        const t = Math.floor(Math.random() * 10);
        const o = Math.floor(Math.random() * 10);
        const num = h * 100 + t * 10 + o;
        const blank = Math.floor(Math.random() * 3); // 0=hundreds, 1=tens, 2=ones
        const digits = [h, t, o];
        const coeffs = digits.map((c, i) => (i === blank ? "__" : String(c)));
        return { question: `${num} = ${coeffs[0]} x 100 + ${coeffs[1]} x 10 + ${coeffs[2]} x 1`, answer: digits[blank], sig: `pv3-expand:${num}-${blank}` };
      },
      // Standard form: 2 x 100 + 7 x 10 + 3 x 1 = ?
      () => {
        const h = Math.floor(Math.random() * 9) + 1;
        const t = Math.floor(Math.random() * 10);
        const o = Math.floor(Math.random() * 10);
        return { question: `${h} x 100 + ${t} x 10 + ${o} x 1 = ?`, answer: h * 100 + t * 10 + o, sig: `pv3-standard:${h},${t},${o}` };
      },
      // Identify a digit's place: 463 → ? hundreds
      () => {
        const num = Math.floor(Math.random() * 900) + 100;
        const places = [
          { label: "hundreds", digit: Math.floor(num / 100) % 10 },
          { label: "tens", digit: Math.floor(num / 10) % 10 },
          { label: "ones", digit: num % 10 },
        ];
        const p = places[Math.floor(Math.random() * places.length)];
        return { question: `${num} → ? ${p.label}`, answer: p.digit, sig: `pv3-digit:${num}-${p.label}` };
      },
    ];
    const v = variants[Math.floor(Math.random() * variants.length)]();
    return {
      id,
      type,
      question: v.question,
      answer: v.answer,
      options: numOpts(v.answer),
      signature: v.sig,
    };
  }

  if (type === "skip-small") {
    const steps = [2, 3, 4, 5, 6, 7, 8, 9];
    const step = steps[Math.floor(Math.random() * steps.length)];
    // Step 2 splits into even-start and odd-start, which are separate skills
    // for a learner; steps 3-9 always start at a multiple of the step, as
    // in the requested examples (3, 6, 9 / 4, 8, 12 / ...).
    const start =
      step === 2 && Math.random() < 0.5
        ? (Math.floor(Math.random() * 9) + 1) * 2 + 1 // odd: 3..19
        : (Math.floor(Math.random() * 8) + 1) * step; // aligned: step..8*step
    const answer = start + 2 * step;
    return {
      id,
      type,
      question: `${start}, ${start + step}, ?`,
      answer,
      options: numOpts(answer),
      signature: `skip-small:${step}-${start}`,
    };
  }

  if (type === "skip-10-flex") {
    // Non-aligned start (not a multiple of 10) — "3, 13, 23" rather than
    // "10, 20, 30", which k-count-by-10 already covers.
    const raw = Math.floor(Math.random() * 79) + 1; // 1..79
    const start = raw % 10 === 0 ? raw + 1 : raw;
    const answer = start + 20;
    return {
      id,
      type,
      question: `${start}, ${start + 10}, ?`,
      answer,
      options: numOpts(answer),
      signature: `skip-10-flex:${start}`,
    };
  }

  if (type === "skip-big") {
    const steps: Array<{ n: number; maxK: number }> = [
      { n: 20, maxK: 10 },
      { n: 25, maxK: 8 },
      { n: 50, maxK: 6 },
      { n: 100, maxK: 8 },
    ];
    const s = steps[Math.floor(Math.random() * steps.length)];
    const start = (Math.floor(Math.random() * s.maxK) + 1) * s.n;
    const answer = start + 2 * s.n;
    return {
      id,
      type,
      question: `${start}, ${start + s.n}, ?`,
      answer,
      options: numOpts(answer),
      signature: `skip-big:${s.n}-${start}`,
    };
  }

  if (type === "skip-backward") {
    const steps: Array<{ n: number; maxK: number }> = [
      { n: 2, maxK: 20 },
      { n: 5, maxK: 19 },
      { n: 10, maxK: 10 },
    ];
    const s = steps[Math.floor(Math.random() * steps.length)];
    const start = (Math.floor(Math.random() * s.maxK) + 3) * s.n; // +3 leaves room for two steps down
    const answer = start - 2 * s.n;
    return {
      id,
      type,
      question: `${start}, ${start - s.n}, ?`,
      answer,
      options: numOpts(answer),
      signature: `skip-backward:${s.n}-${start}`,
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

  if (type === "order-numbers") {
    const count = 4;
    const nums = new Set<number>();
    while (nums.size < count) nums.add(Math.floor(Math.random() * (max - min + 1)) + min);
    const numbers = Array.from(nums);
    const ascending = Math.random() < 0.5;
    const sorted = [...numbers].sort((a, b) => (ascending ? a - b : b - a));
    const answer = sorted.join(", ");
    const shuffled = [...numbers].sort(() => Math.random() - 0.5).join(", ");
    const reversed = [...sorted].reverse().join(", ");
    const options = Array.from(new Set([answer, shuffled, reversed]));
    while (options.length < 3) {
      const extra = [...numbers].sort(() => Math.random() - 0.5).join(", ");
      if (!options.includes(extra)) options.push(extra);
    }
    return {
      id,
      type,
      question: `Order from ${ascending ? "least to greatest" : "greatest to least"}: ${numbers.join(", ")}`,
      answer,
      options,
      signature: `order:${numbers.join(",")}-${ascending}`,
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

  if (type === "add-whole-hundreds") {
    const hundreds = (n: number) => (Math.floor(Math.random() * n) + 1) * 100;
    const variant = Math.floor(Math.random() * 4);
    if (variant === 0) {
      const a = hundreds(8); // 100..800
      const b = hundreds(Math.max(1, 9 - a / 100)); // keeps the sum at or under 900
      const { question, answer } = chainAdd([a, b], null);
      return { id, type, question, answer, options: numOpts(answer), signature: `awh2:${a},${b}` };
    }
    if (variant === 1) {
      const a = hundreds(7);
      const remaining = 9 - a / 100;
      const b = hundreds(Math.max(1, Math.floor(remaining / 2)));
      const c = hundreds(Math.max(1, remaining - b / 100));
      const { question, answer } = chainAdd([a, b, c], null);
      return { id, type, question, answer, options: numOpts(answer), signature: `awh3:${a},${b},${c}` };
    }
    if (variant === 2) {
      const a = hundreds(8);
      const b = hundreds(Math.max(1, 9 - a / 100));
      const { question, answer } = chainAdd([a, b], 1);
      return { id, type, question, answer, options: numOpts(answer), signature: `awh2m:${a},${b}` };
    }
    // Complete a thousand: 700 + ___ = 1000
    const h = Math.floor(Math.random() * 9) + 1; // 1..9
    const a = h * 100;
    const b = (10 - h) * 100;
    const { question, answer } = chainAdd([a, b], 1);
    return { id, type, question, answer, options: numOpts(answer), signature: `awh1000:${a}` };
  }

  if (type === "add-harder-mixed") {
    const d1 = () => Math.floor(Math.random() * 9) + 1; // 1-digit, 1..9
    const d2 = (lo: number, hi: number) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
    const tensMul = (n: number) => (Math.floor(Math.random() * n) + 1) * 10;
    const variant = Math.floor(Math.random() * 13);
    const build = (terms: number[], blankIndex: number | null, sig: string) => {
      const { question, answer } = chainAdd(terms, blankIndex);
      return { id, type, question, answer, options: numOpts(answer), signature: sig };
    };
    if (variant === 0) {
      const base = d2(20, 89);
      return build([base, d1()], null, `ahm0:${base}`);
    }
    if (variant === 1) {
      const base = d2(20, 89);
      return build([base, d1()], 1, `ahm1:${base}`);
    }
    if (variant === 2) {
      const base = d2(20, 89);
      return build([base, d1(), d1()], null, `ahm2:${base}`);
    }
    if (variant === 3) {
      const base = d2(20, 89);
      return build([base, d1(), d1(), d1()], null, `ahm3:${base}`);
    }
    if (variant === 4) {
      const base = d2(20, 89);
      return build([base, d1(), d1(), d1()], 2, `ahm4:${base}`);
    }
    if (variant === 5) {
      return build([d2(10, 59), tensMul(4)], null, `ahm5`);
    }
    if (variant === 6) {
      return build([d2(100, 899), d1()], null, `ahm6`);
    }
    if (variant === 7) {
      return build([tensMul(8), tensMul(8), d1(), d1()], null, `ahm7`);
    }
    if (variant === 8) {
      return build([d2(100, 899), tensMul(8)], null, `ahm8`);
    }
    if (variant === 9) {
      return build([d2(100, 899), tensMul(8)], 1, `ahm9`);
    }
    if (variant === 10) {
      return build([d2(10, 89), d2(10, 89), d2(10, 89)], null, `ahm10`);
    }
    if (variant === 11) {
      return build([d2(10, 89), d2(10, 89), d2(10, 89), d2(10, 89)], null, `ahm11`);
    }
    // Two 2-digit addends, missing addend, carrying allowed: 39 + __ = 50
    const a = d2(10, 89);
    const b = d2(10, Math.max(10, 98 - a));
    return build([a, b], 1, `ahm12:${a},${b}`);
  }

  if (type === "word-problem-mixed") {
    const twoDigit = Math.random() < 0.5;
    const a = twoDigit ? Math.floor(Math.random() * 70) + 20 : Math.floor(Math.random() * 15) + 5;
    const isAdd = Math.random() < 0.5;
    const b = isAdd
      ? Math.floor(Math.random() * (twoDigit ? 90 - a : 20 - a)) + 1
      : Math.floor(Math.random() * a) + 1;
    const name = pickOne(WP_NAMES);
    const item = pickOne(WP_ITEMS);
    const answer = isAdd ? a + b : a - b;
    const question = isAdd
      ? `${name} has ${a} ${item} and finds ${b} more. How many ${item} does ${name} have now?`
      : `${name} has ${a} ${item} and gives away ${b}. How many ${item} does ${name} have left?`;
    return {
      id,
      type,
      question,
      answer,
      options: numOpts(answer),
      signature: `wpm:${isAdd ? "+" : "-"}-${a},${b}`,
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

  if (type === "mult-tables-single") {
    const pool = Math.random() < 0.5 ? [2, 3] : [5, 10];
    const table = pool[Math.floor(Math.random() * pool.length)];
    const multiplier = Math.floor(Math.random() * 10) + 1; // 1..10
    const answer = table * multiplier;
    return { id, type, question: `${table} x ${multiplier} = ?`, answer, options: numOpts(answer), signature: `mts:${table},${multiplier}` };
  }

  if (type === "mult-tables-mixed") {
    const pool = Math.random() < 0.5 ? [2, 3, 4, 5] : [2, 5, 10];
    const table = pool[Math.floor(Math.random() * pool.length)];
    const multiplier = Math.floor(Math.random() * 10) + 1;
    const answer = table * multiplier;
    return { id, type, question: `${table} x ${multiplier} = ?`, answer, options: numOpts(answer), signature: `mtm:${table},${multiplier}` };
  }

  if (type === "mult-missing-factor") {
    const pools = [[2], [5], [10], [2, 5, 10]];
    const pool = pools[Math.floor(Math.random() * pools.length)];
    const table = pool[Math.floor(Math.random() * pool.length)];
    const multiplier = Math.floor(Math.random() * 10) + 1;
    const product = table * multiplier;
    const blankFirst = Math.random() < 0.5;
    const answer = blankFirst ? table : multiplier;
    const question = blankFirst ? `__ x ${multiplier} = ${product}` : `${table} x __ = ${product}`;
    return { id, type, question, answer, options: numOpts(answer), signature: `mmf:${table},${multiplier}-${blankFirst}` };
  }

  // ─── Fractions (parts of a whole / parts of a set) ─────────────────────────

  if (type === "fraction-equal-parts") {
    const d = FRACTION_DENOMS[Math.floor(Math.random() * FRACTION_DENOMS.length)];
    if (Math.random() < 0.5) {
      const answer = `1/${d}`;
      const candidates = FRACTION_DENOMS.map((x) => `1/${x}`);
      return {
        id,
        type,
        question: `A whole is divided into ${d} equal parts. Each part is what fraction of the whole?`,
        answer,
        options: strOpts(answer, candidates),
        signature: `fep-a:${d}`,
      };
    }
    const answer = FRACTION_PART_NAMES[d];
    const candidates = Object.values(FRACTION_PART_NAMES);
    return {
      id,
      type,
      question: `A whole divided into ${d} equal parts — each part is called a ___.`,
      answer,
      options: strOpts(answer, candidates),
      signature: `fep-b:${d}`,
    };
  }

  if (type === "fraction-pic-to-frac") {
    const shape = FRACTION_SHAPES[Math.floor(Math.random() * FRACTION_SHAPES.length)];
    const total = FRACTION_DENOMS[Math.floor(Math.random() * FRACTION_DENOMS.length)];
    const shaded = Math.floor(Math.random() * (total - 1)) + 1;
    const answer = `${shaded}/${total}`;
    const candidates = [answer, `${total - shaded}/${total}`, `${Math.max(1, shaded - 1)}/${total}`, `${Math.min(total - 1, shaded + 1)}/${total}`];
    return {
      id,
      type,
      question: shape === "set" ? "What fraction of the set is shaded?" : "What fraction of the shape is shaded?",
      answer,
      options: strOpts(answer, candidates),
      visual: [{ shape, total, shaded }],
      signature: `fp2f:${shape}-${shaded}/${total}`,
    };
  }

  if (type === "fraction-notation") {
    const d = FRACTION_DENOMS[Math.floor(Math.random() * FRACTION_DENOMS.length)];
    const n = Math.floor(Math.random() * (d - 1)) + 1;
    const variant = Math.floor(Math.random() * 3);
    if (variant === 0) {
      return { id, type, question: `In the fraction ${n}/${d}, what is the numerator?`, answer: n, options: numOpts(n), signature: `fnot-num:${n}/${d}` };
    }
    if (variant === 1) {
      return { id, type, question: `In the fraction ${n}/${d}, what is the denominator?`, answer: d, options: numOpts(d), signature: `fnot-den:${n}/${d}` };
    }
    const answer = `${n}/${d}`;
    const candidates = [answer, `${d}/${n}`, `${n}/${d + 1}`, `${n + 1}/${d}`];
    return {
      id,
      type,
      question: `Numerator: ${n}. Denominator: ${d}. Write the fraction.`,
      answer,
      options: strOpts(answer, candidates),
      signature: `fnot-write:${n}/${d}`,
    };
  }

  if (type === "fraction-frac-to-pic") {
    const shape = FRACTION_SHAPES[Math.floor(Math.random() * FRACTION_SHAPES.length)];
    const total = FRACTION_DENOMS[Math.floor(Math.random() * FRACTION_DENOMS.length)];
    const shaded = Math.floor(Math.random() * (total - 1)) + 1;
    const answer = `${shaded}/${total}`;
    const wrongShaded = new Set<number>();
    while (wrongShaded.size < 3) {
      const w = Math.floor(Math.random() * (total - 1)) + 1;
      if (w !== shaded) wrongShaded.add(w);
    }
    const options = strOpts(answer, [answer, ...Array.from(wrongShaded).map((s) => `${s}/${total}`)]);
    const asColoring = Math.random() < 0.5;
    const question = asColoring
      ? `Color ${total} equal parts to show ${answer}. Which picture is correct?`
      : `Which picture shows ${answer}?`;
    return {
      id,
      type,
      question,
      answer,
      options,
      optionsArePictures: true,
      optionShape: shape,
      signature: `ff2p:${shape}-${answer}`,
    };
  }

  if (type === "fraction-words") {
    const entries = Object.entries(FRACTION_WORDS);
    const [frac, word] = entries[Math.floor(Math.random() * entries.length)];
    if (Math.random() < 0.5) {
      const candidates = entries.map(([, w]) => w);
      return {
        id,
        type,
        question: `Which word names the fraction ${frac}?`,
        answer: word,
        options: strOpts(word, candidates),
        signature: `fw-word:${frac}`,
      };
    }
    const candidates = entries.map(([f]) => f);
    return {
      id,
      type,
      question: `Which fraction is "${word}"?`,
      answer: frac,
      options: strOpts(frac, candidates),
      signature: `fw-frac:${frac}`,
    };
  }

  if (type === "fraction-of-set") {
    const total = Math.floor(Math.random() * (max - min + 1)) + min; // 6..12
    const part = Math.floor(Math.random() * (total - 1)) + 1;
    const item = pickOne(WP_ITEMS);
    const color = pickOne(["red", "blue", "green", "yellow"]);
    const answer = `${part}/${total}`;
    const candidates = [answer, `${total - part}/${total}`, `${Math.max(1, part - 1)}/${total}`, `${Math.min(total - 1, part + 1)}/${total}`];
    return {
      id,
      type,
      question: `There are ${total} ${item}. ${part} of them are ${color}. What fraction of the ${item} are ${color}?`,
      answer,
      options: strOpts(answer, candidates),
      signature: `fos:${part}/${total}`,
    };
  }

  if (type === "compare-fractions-simple") {
    return { ...buildProblem("compare-fractions", min, max), type };
  }

  if (type === "fraction-compare-visual") {
    const shape = Math.random() < 0.5 ? "bar" : "set";
    const total = FRACTION_DENOMS[Math.floor(Math.random() * FRACTION_DENOMS.length)];
    const shadedA = Math.floor(Math.random() * (total - 1)) + 1;
    let shadedB = Math.floor(Math.random() * (total - 1)) + 1;
    while (shadedB === shadedA) shadedB = Math.floor(Math.random() * (total - 1)) + 1;
    const answer = shadedA < shadedB ? "<" : shadedA > shadedB ? ">" : "=";
    return {
      id,
      type,
      question: "Compare the shaded parts:",
      answer,
      options: ["<", "=", ">"],
      visual: [
        { shape, total, shaded: shadedA },
        { shape, total, shaded: shadedB },
      ],
      signature: `fcv:${shape}-${shadedA}vs${shadedB}/${total}`,
    };
  }

  if (type === "fraction-word-problem") {
    const name = pickOne(WP_NAMES);
    if (Math.random() < 0.5) {
      const total = Math.floor(Math.random() * (max - min + 1)) + min; // 1..12 range, but see below
      const safeTotal = Math.max(total, 4);
      const part = Math.floor(Math.random() * (safeTotal - 1)) + 1;
      const item = pickOne(WP_ITEMS);
      const answer = `${part}/${safeTotal}`;
      const candidates = [answer, `${safeTotal - part}/${safeTotal}`, `${Math.max(1, part - 1)}/${safeTotal}`];
      return {
        id,
        type,
        question: `${name} has ${safeTotal} ${item} and gives away ${part} of them. What fraction of the ${item} did ${name} give away?`,
        answer,
        options: strOpts(answer, candidates),
        signature: `fwp-basic:${part}/${safeTotal}`,
      };
    }
    const total = Math.max(Math.floor(Math.random() * (max - min + 1)) + min, 6);
    const partA = Math.floor(Math.random() * (total - 2)) + 1;
    let partB = Math.floor(Math.random() * (total - 2)) + 1;
    while (partB === partA) partB = Math.floor(Math.random() * (total - 2)) + 1;
    const item = pickOne(WP_ITEMS);
    const otherName = pickOne(WP_NAMES.filter((n) => n !== name));
    const answer = partA > partB ? name : otherName;
    return {
      id,
      type,
      question: `${name} ate ${partA}/${total} of a pack of ${item}, and ${otherName} ate ${partB}/${total} of an identical pack. Who ate more?`,
      answer,
      options: [name, otherName],
      signature: `fwp-compare:${partA},${partB},${total}`,
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

  if (type === "mult-by-2-extended") {
    const variant = Math.floor(Math.random() * 4);
    if (variant === 0) {
      // Two times a small number: 2 x 14 = ?
      const n = Math.floor(Math.random() * 10) + 11; // 11..20
      const answer = 2 * n;
      return { id, type, question: `2 x ${n} = ?`, answer, options: numOpts(answer), signature: `m2a:${n}` };
    }
    if (variant === 1) {
      // Two times a multiple of 5: 2 x 55 = ?
      const n = (Math.floor(Math.random() * 19) + 1) * 5; // 5..95
      const answer = 2 * n;
      return { id, type, question: `2 x ${n} = ?`, answer, options: numOpts(answer), signature: `m2b:${n}` };
    }
    if (variant === 2) {
      // Two times a whole ten: 2 x 70 = ?
      const n = (Math.floor(Math.random() * 9) + 1) * 10; // 10..90
      const answer = 2 * n;
      return { id, type, question: `2 x ${n} = ?`, answer, options: numOpts(answer), signature: `m2c:${n}` };
    }
    // Two times a whole ten, missing factor: __ x 90 = 180
    const n = (Math.floor(Math.random() * 9) + 1) * 10;
    const answer = 2;
    return { id, type, question: `__ x ${n} = ${2 * n}`, answer, options: numOpts(answer), signature: `m2d:${n}` };
  }

  if (type === "word-problem-mult") {
    const a = Math.floor(Math.random() * 4) + 2; // 2..5
    const bMax = Math.floor(25 / a);
    const b = Math.floor(Math.random() * bMax) + 1;
    const name = pickOne(WP_NAMES);
    const item = pickOne(WP_ITEMS);
    const answer = a * b;
    return {
      id,
      type,
      question: `${name} has ${a} bags with ${b} ${item} in each. How many ${item} in total?`,
      answer,
      options: numOpts(answer),
      signature: `wpmul:${a},${b}`,
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

  if (type === "round-ten-small") {
    const n = Math.floor(Math.random() * 99) + 1; // 1..99
    const answer = Math.round(n / 10) * 10;
    return {
      id,
      type,
      question: `Round ${n} to the nearest ten.`,
      answer,
      options: numOpts(answer),
      signature: `rnd10s:${n}`,
    };
  }

  if (type === "round-ten-large") {
    const n = Math.floor(Math.random() * 990) + 10; // 10..999
    const answer = Math.round(n / 10) * 10;
    return {
      id,
      type,
      question: `Round ${n} to the nearest ten.`,
      answer,
      options: numOpts(answer),
      signature: `rnd10l:${n}`,
    };
  }

  if (type === "round-hundred") {
    const n = Math.floor(Math.random() * 990) + 10; // 10..999
    const answer = Math.round(n / 100) * 100;
    return {
      id,
      type,
      question: `Round ${n} to the nearest hundred.`,
      answer,
      options: numOpts(answer),
      signature: `rndh:${n}`,
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

// ─── FractionShape ────────────────────────────────────────────────────────────

function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// Renders one fraction visual: a pie, a row of bar segments, or a grid of
// squares/dots, with `shaded` of `total` pieces filled in.
const FractionShape = ({ visual, size = 120 }: { visual: FractionVisual; size?: number }) => {
  const { shape, total, shaded } = visual;
  const fill = "#fbbf24";
  const empty = "rgba(255,255,255,0.15)";
  const stroke = "rgba(255,255,255,0.65)";

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

// ─── StarBank ─────────────────────────────────────────────────────────────────

const StarBank = ({ score, onClear }: { score: number; onClear: () => void }) => (
  <div className='w-full p-3 pl-14 flex items-start sm:items-center gap-4 z-50 relative min-h-[60px]'>
    <Button size='1' variant='soft' color='red' onClick={onClear} className='shrink-0 uppercase'>
      Clear
    </Button>
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
            <Star className='w-5 h-5 text-yellow-400 fill-yellow-400 drop-shadow-sm' />
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
        <div className='flex items-center gap-1.5 text-xs font-bold text-ink-muted uppercase tracking-wider'>
          <Star className='w-3 h-3 text-yellow-400 fill-yellow-400' />
          Session
        </div>
        <span className={`text-xs font-bold ${isDone ? "text-primary-text" : "text-ink-muted"}`}>
          {correct} / {SESSION_GOAL} correct
        </span>
      </div>
      <div className='w-full h-2.5 bg-surface-raised/80 rounded-full overflow-hidden border border-line-strong'>
        <motion.div
          className={`h-full rounded-full ${isDone ? "bg-gradient-to-r from-yellow-400 to-amber-500" : "bg-gradient-to-r from-fuchsia-500 via-purple-500 to-cyan-500"}`}
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
  "from-pink-400 to-fuchsia-600",
  "from-sky-400 to-blue-600",
  "from-lime-400 to-green-600",
  "from-amber-300 to-orange-500",
];

const CONFETTI_COLORS = ["bg-pink-400", "bg-cyan-400", "bg-lime-400", "bg-amber-300", "bg-fuchsia-500"];

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

  const isThreeOptions = problem && problem.options.length === 3;

  return (
    <div className='flex-1 bg-black text-ink-primary selection:bg-primary-solid/30 relative flex flex-col overflow-hidden max-h-screen'>
      <SpaceBackground />
      <StarBank score={score} onClear={clearStars} />
      <main className='relative z-10 w-full pt-4 sm:pt-6 px-4 sm:px-6 pb-20 sm:pb-24 flex flex-col items-center flex-1 min-h-0 overflow-hidden'>
        <div className='w-full flex justify-between items-center mb-3 sm:mb-4 shrink-0'>
          <div className='flex items-center gap-3'>
            <div className='p-2 bg-gradient-to-br from-fuchsia-500 to-indigo-600 rounded-md border-2 border-black shadow-[0_3px_0_#000]'>
              <Rocket className='w-5 h-5 sm:w-6 sm:h-6 text-white' />
            </div>
            <div>
              <h1 className='text-lg sm:text-xl font-bold tracking-tight'>Space Math</h1>
            </div>
          </div>
          <Button size='1' variant='surface' color='gray' onClick={resetGame} className='uppercase'>
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
                <h2 className='text-3xl sm:text-4xl md:text-5xl font-black mb-3 sm:mb-4 bg-gradient-to-r from-pink-400 via-amber-300 to-cyan-400 bg-clip-text text-transparent'>
                  Ready for Launch?
                </h2>
              </div>
              <button
                onClick={startGame}
                className='group relative px-10 sm:px-12 py-5 sm:py-6 bg-gradient-to-b from-fuchsia-500 to-purple-600 text-white rounded-md text-xl sm:text-2xl font-bold border-4 border-black shadow-[0_10px_0_#000] active:shadow-none active:translate-y-[10px] transition-all hover:brightness-110'
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
                          stroke='rgba(255,255,255,0.35)'
                          strokeWidth='14'
                        />
                        <motion.circle
                          cx='112'
                          cy='112'
                          r='104'
                          fill='none'
                          stroke={isCorrect ? "#22c55e" : "#ef4444"}
                          strokeWidth='14'
                          strokeLinecap='round'
                          strokeDasharray={2 * Math.PI * 104}
                          initial={{ strokeDashoffset: 0 }}
                          animate={{ strokeDashoffset: 2 * Math.PI * 104 }}
                          transition={{ duration: 2, ease: "linear" }}
                        />
                      </svg>
                      <div
                        className={`p-12 rounded-full border-4 border-black shadow-2xl ${isCorrect ? "bg-green-500" : `bg-red-500 ${styles.shake}`}`}
                      >
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
              <div className='w-full flex-1 min-h-0 p-1 rounded-lg bg-gradient-to-br from-fuchsia-500 via-purple-500 to-cyan-500 shadow-2xl'>
                <div className='w-full h-full bg-gradient-to-b from-slate-900 to-indigo-950 rounded-md p-4 sm:p-6 relative overflow-hidden flex flex-col'>
                  <div className='text-center mb-2 sm:mb-3 shrink-0'>
                    <h2 className='font-black mb-1 tracking-tight leading-snug text-3xl sm:text-4xl md:text-5xl break-words text-white'>
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
                  <div className={`grid gap-2 sm:gap-3 flex-1 min-h-0 ${isThreeOptions ? "grid-cols-3" : "grid-cols-2"}`}>
                    {problem.options.map((opt, i) => {
                      const isSelected = selectedAnswer === opt;
                      const isRevealCorrect = selectedAnswer !== null && !isSelected && opt === problem.answer;
                      const colorClasses = isSelected
                        ? isCorrect
                          ? "bg-gradient-to-b from-green-400 to-green-600"
                          : `bg-gradient-to-b from-red-400 to-red-600 ${styles.shake}`
                        : isRevealCorrect
                          ? "bg-gradient-to-b from-green-400 to-green-600"
                          : `bg-gradient-to-b ${OPTION_COLORS[i % OPTION_COLORS.length]} hover:brightness-110`;
                      const optMatch = problem.optionsArePictures && problem.optionShape ? /^(\d+)\/(\d+)$/.exec(String(opt)) : null;
                      return (
                        <button
                          key={i}
                          disabled={selectedAnswer !== null}
                          onClick={() => handleAnswer(opt)}
                          className={`flex items-center justify-center rounded-md text-4xl sm:text-6xl md:text-8xl font-black text-white transition-all border-4 border-black shadow-[0_6px_0_#000] sm:shadow-[0_8px_0_#000] active:shadow-none active:translate-y-[6px] sm:active:translate-y-[8px] ${colorClasses}`}
                        >
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
                <h2 className='text-4xl sm:text-5xl md:text-6xl font-black mb-3 sm:mb-4 bg-gradient-to-r from-yellow-300 via-pink-400 to-purple-400 bg-clip-text text-transparent animate-pulse'>
                  SESSION COMPLETE!
                </h2>
                <p className='text-2xl sm:text-3xl text-ink-muted'>
                  You answered <span className='text-ink-primary font-bold'>25</span> questions correctly!
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
                  className='px-10 sm:px-12 py-5 sm:py-6 bg-gradient-to-b from-green-400 to-emerald-600 text-white rounded-md text-xl sm:text-2xl font-bold border-4 border-black shadow-[0_10px_0_#000] active:shadow-none active:translate-y-[10px] transition-all hover:brightness-110'
                >
                  KEEP GOING
                </button>
                <button
                  onClick={resetGame}
                  className='px-8 py-4 bg-surface-raised rounded-md text-lg sm:text-xl font-bold border-2 border-black hover:bg-surface-raised transition-colors'
                >
                  START OVER
                </button>
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
