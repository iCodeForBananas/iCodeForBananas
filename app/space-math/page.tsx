"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Rocket, Star, Trophy, ChevronRight, Sparkles, Check, X, Volume2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProblemType =
  | "addition"
  | "subtraction"
  | "place-value"
  | "mental-ten"
  | "add-100"
  | "word-problem"
  | "comparison"
  | "time"
  | "shapes"
  | "fractions"
  | "three-addend"
  | "fact-family"
  | "length"
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
  | "time-5min"
  | "money"
  // G3
  | "multiply"
  | "divide"
  | "multiply-tens"
  | "round"
  | "fraction-line"
  | "equiv-fractions"
  | "compare-fractions"
  | "area"
  | "perimeter"
  | "time-minute"
  | "elapsed-time";

type HintOp =
  | "+"
  | "-"
  | "tens-ones"
  | "mental-add"
  | "mental-sub"
  | "add-100"
  | "word-add"
  | "word-sub"
  | "comparison"
  | "time"
  | "shape"
  | "fraction"
  | "three-add"
  | "fact-family"
  | "length"
  | "count-next"
  | "count-prev"
  | "make-10"
  | "teen-decompose"
  | "sub-mult-10"
  | "equal-sign"
  | "unknown-addend"
  | "add-regroup"
  | "sub-regroup"
  | "tens-ones-3"
  | "skip-count"
  | "mental-add-100"
  | "mental-sub-100"
  | "odd-even"
  | "array"
  | "money"
  | "multiply"
  | "divide"
  | "multiply-tens"
  | "round"
  | "fraction-line"
  | "equiv-fractions"
  | "compare-fractions"
  | "area"
  | "perimeter"
  | "elapsed";

interface Problem {
  id: string;
  type: ProblemType;
  question: string;
  answer: number | string;
  options: (number | string)[];
  visualHint: { left: number; right: number; operator: HintOp; extra?: string };
  signature: string;
}

interface TopicRecord {
  correct: number;
  attempts: number;
  interval: number; // target questions between reviews
  dueIn: number; // countdown to next review
}

type Grade = "K" | "G1" | "G2" | "G3";

interface TopicDef {
  key: string;
  type: ProblemType;
  min: number;
  max: number;
  grade: Grade;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Mastery threshold: spaced-repetition interval at or above this means the topic is "known"
const MASTERY_INTERVAL = 8;

const GRADE_ORDER: Grade[] = ["K", "G1", "G2", "G3"];

// Topics grouped by grade (Common Core State Standards)
const TOPIC_PROGRESSION: TopicDef[] = [
  // ── Kindergarten ──
  { key: "k-count-by-1",     type: "count-by-1",     min: 1,  max: 100, grade: "K" },
  { key: "k-count-by-10",    type: "count-by-10",    min: 10, max: 100, grade: "K" },
  { key: "add-1-5",          type: "addition",       min: 1,  max: 5,   grade: "K" },
  { key: "sub-1-5",          type: "subtraction",    min: 1,  max: 5,   grade: "K" },
  { key: "add-1-10",         type: "addition",       min: 1,  max: 10,  grade: "K" },
  { key: "sub-1-10",         type: "subtraction",    min: 1,  max: 10,  grade: "K" },
  { key: "k-make-10",        type: "make-10",        min: 1,  max: 9,   grade: "K" },
  { key: "k-compare-10",     type: "comparison",     min: 1,  max: 10,  grade: "K" },
  { key: "k-shapes",         type: "shapes",         min: 1,  max: 6,   grade: "K" },
  { key: "k-teen",           type: "teen-decompose", min: 11, max: 19,  grade: "K" },

  // ── Grade 1 ──
  { key: "add-1-20",         type: "addition",       min: 1,  max: 20,  grade: "G1" },
  { key: "sub-1-20",         type: "subtraction",    min: 1,  max: 20,  grade: "G1" },
  { key: "three-addend",     type: "three-addend",   min: 1,  max: 6,   grade: "G1" },
  { key: "fact-family",      type: "fact-family",    min: 1,  max: 10,  grade: "G1" },
  { key: "g1-equal-sign",    type: "equal-sign",     min: 1,  max: 10,  grade: "G1" },
  { key: "g1-unknown",       type: "unknown-addend", min: 1,  max: 20,  grade: "G1" },
  { key: "compare-20",       type: "comparison",     min: 1,  max: 20,  grade: "G1" },
  { key: "place-value",      type: "place-value",    min: 1,  max: 9,   grade: "G1" },
  { key: "mental-ten",       type: "mental-ten",     min: 10, max: 90,  grade: "G1" },
  { key: "g1-sub-mult-10",   type: "sub-mult-10",    min: 10, max: 90,  grade: "G1" },
  { key: "length",           type: "length",         min: 2,  max: 20,  grade: "G1" },
  { key: "time",             type: "time",           min: 1,  max: 12,  grade: "G1" },
  { key: "add-100",          type: "add-100",        min: 10, max: 90,  grade: "G1" },
  { key: "word-problem",     type: "word-problem",   min: 1,  max: 10,  grade: "G1" },
  { key: "count-120",        type: "count-120",      min: 1,  max: 120, grade: "G1" },
  { key: "fractions",        type: "fractions",      min: 1,  max: 4,   grade: "G1" },

  // ── Grade 2 ──
  { key: "g2-add-regroup",   type: "add-100-regroup", min: 10, max: 99, grade: "G2" },
  { key: "g2-sub-regroup",   type: "sub-100-regroup", min: 10, max: 99, grade: "G2" },
  { key: "g2-place-3",       type: "place-value-3",   min: 1,  max: 9,  grade: "G2" },
  { key: "g2-skip-count",    type: "skip-count",      min: 5,  max: 100, grade: "G2" },
  { key: "g2-compare-999",   type: "compare-3digit",  min: 100, max: 999, grade: "G2" },
  { key: "g2-mental-100",    type: "mental-hundred",  min: 100, max: 800, grade: "G2" },
  { key: "g2-odd-even",      type: "odd-even",        min: 1,  max: 20, grade: "G2" },
  { key: "g2-array",         type: "array",           min: 2,  max: 5,  grade: "G2" },
  { key: "g2-time-5",        type: "time-5min",       min: 1,  max: 12, grade: "G2" },
  { key: "g2-money",         type: "money",           min: 1,  max: 5,  grade: "G2" },
  { key: "g2-thirds",        type: "fractions",       min: 3,  max: 3,  grade: "G2" },
  { key: "g2-shapes",        type: "shapes",          min: 4,  max: 6,  grade: "G2" },

  // ── Grade 3 ──
  { key: "g3-mult",          type: "multiply",         min: 0,  max: 10, grade: "G3" },
  { key: "g3-mult-tens",     type: "multiply-tens",    min: 10, max: 90, grade: "G3" },
  { key: "g3-divide",        type: "divide",           min: 1,  max: 10, grade: "G3" },
  { key: "g3-round",         type: "round",            min: 10, max: 999, grade: "G3" },
  { key: "g3-fraction-line", type: "fraction-line",    min: 2,  max: 8,  grade: "G3" },
  { key: "g3-equiv-frac",    type: "equiv-fractions",  min: 2,  max: 8,  grade: "G3" },
  { key: "g3-compare-frac",  type: "compare-fractions", min: 2, max: 8,  grade: "G3" },
  { key: "g3-area",          type: "area",             min: 2,  max: 9,  grade: "G3" },
  { key: "g3-perimeter",     type: "perimeter",        min: 2,  max: 12, grade: "G3" },
  { key: "g3-time-minute",   type: "time-minute",      min: 1,  max: 12, grade: "G3" },
  { key: "g3-elapsed",       type: "elapsed-time",     min: 5,  max: 55, grade: "G3" },
];

// Maps each topic key to its API stage. One stage = one Common Core skill.
const TOPIC_STAGE: Record<string, { id: number; label: string }> = {
  // K
  "add-1-5":         { id: 1,  label: "K · Add within 5" },
  "sub-1-5":         { id: 2,  label: "K · Subtract within 5" },
  "add-1-10":        { id: 3,  label: "K · Add within 10" },
  "sub-1-10":        { id: 4,  label: "K · Subtract within 10" },
  "k-count-by-1":    { id: 11, label: "K · Count by 1s to 100" },
  "k-count-by-10":   { id: 17, label: "K · Count by 10s to 100" },
  "k-make-10":       { id: 12, label: "K · Make 10" },
  "k-compare-10":    { id: 13, label: "K · Compare 1–10" },
  "k-shapes":        { id: 14, label: "K · Shapes" },
  "k-teen":          { id: 15, label: "K · Teen Numbers (10 + ones)" },
  // G1
  "add-1-20":        { id: 5,  label: "G1 · Add within 20" },
  "sub-1-20":        { id: 60, label: "G1 · Subtract within 20" },
  "three-addend":    { id: 61, label: "G1 · Three-addend addition" },
  "fact-family":     { id: 62, label: "G1 · Fact families" },
  "g1-equal-sign":   { id: 16, label: "G1 · Equal sign true/false" },
  "g1-unknown":      { id: 63, label: "G1 · Unknown addend" },
  "compare-20":      { id: 6,  label: "G1 · Compare 2-digit numbers" },
  "place-value":     { id: 7,  label: "G1 · Tens & ones place value" },
  "mental-ten":      { id: 64, label: "G1 · Mental ±10" },
  "g1-sub-mult-10":  { id: 65, label: "G1 · Subtract multiples of 10" },
  "length":          { id: 9,  label: "G1 · Compare lengths" },
  "time":            { id: 66, label: "G1 · Time (hour & half-hour)" },
  "add-100":         { id: 8,  label: "G1 · Add within 100" },
  "word-problem":    { id: 67, label: "G1 · Word problems within 20" },
  "count-120":       { id: 68, label: "G1 · Count to 120" },
  "fractions":       { id: 10, label: "G1 · Halves & fourths" },
  // G2
  "g2-add-regroup":  { id: 20, label: "G2 · Add within 100" },
  "g2-sub-regroup":  { id: 21, label: "G2 · Subtract within 100" },
  "g2-place-3":      { id: 22, label: "G2 · 3-Digit Place Value" },
  "g2-skip-count":   { id: 23, label: "G2 · Skip Count" },
  "g2-compare-999":  { id: 24, label: "G2 · Compare 3-Digit" },
  "g2-mental-100":   { id: 25, label: "G2 · Mental ±100" },
  "g2-odd-even":     { id: 26, label: "G2 · Odd or Even" },
  "g2-array":        { id: 27, label: "G2 · Arrays" },
  "g2-time-5":       { id: 28, label: "G2 · Time to 5 min" },
  "g2-money":        { id: 29, label: "G2 · Money" },
  "g2-thirds":       { id: 30, label: "G2 · Thirds" },
  "g2-shapes":       { id: 31, label: "G2 · Polygons" },
  // G3
  "g3-mult":         { id: 40, label: "G3 · Multiplication" },
  "g3-mult-tens":    { id: 41, label: "G3 · ×Multiples of 10" },
  "g3-divide":       { id: 42, label: "G3 · Division" },
  "g3-round":        { id: 43, label: "G3 · Rounding" },
  "g3-fraction-line": { id: 44, label: "G3 · Fractions on Number Line" },
  "g3-equiv-frac":   { id: 45, label: "G3 · Equivalent Fractions" },
  "g3-compare-frac": { id: 46, label: "G3 · Compare Fractions" },
  "g3-area":         { id: 47, label: "G3 · Area" },
  "g3-perimeter":    { id: 48, label: "G3 · Perimeter" },
  "g3-time-minute":  { id: 49, label: "G3 · Time to the Minute" },
  "g3-elapsed":      { id: 50, label: "G3 · Elapsed Time" },
};

const DEFAULT_RECORD: TopicRecord = { correct: 0, attempts: 0, interval: 1, dueIn: 0 };

// A grade is mastered iff every topic in it has interval >= MASTERY_INTERVAL
function isGradeMastered(grade: Grade, records: Record<string, TopicRecord>): boolean {
  const topics = TOPIC_PROGRESSION.filter((t) => t.grade === grade);
  return topics.every((t) => (records[t.key]?.interval ?? 1) >= MASTERY_INTERVAL);
}

// The current working grade is the lowest grade that isn't fully mastered
function currentGrade(records: Record<string, TopicRecord>): Grade {
  for (const g of GRADE_ORDER) {
    if (!isGradeMastered(g, records)) return g;
  }
  return "G3";
}

// Pick the topic most in need of practice from all unlocked topics
function selectTopic(records: Record<string, TopicRecord>, lastKey: string | null): TopicDef {
  // A topic is unlocked iff all lower grades are mastered. Within current grade, all topics are available.
  const grade = currentGrade(records);
  const gradeIdx = GRADE_ORDER.indexOf(grade);
  const allowedGrades = new Set(GRADE_ORDER.slice(0, gradeIdx + 1));
  const unlocked = TOPIC_PROGRESSION.filter((t) => allowedGrades.has(t.grade));
  const due = unlocked.filter((t) => (records[t.key]?.dueIn ?? 0) <= 0);
  const pool = due.length > 0 ? due : unlocked;

  // Weight: low-accuracy and short-interval topics surface more; penalize last topic to avoid back-to-back
  const weights = pool.map((t) => {
    const r = records[t.key] ?? DEFAULT_RECORD;
    const accuracy = r.attempts > 0 ? r.correct / r.attempts : 0.5;
    const base = (1 - accuracy * 0.8) / Math.max(r.interval, 1);
    return t.key === lastKey ? base * 0.25 : base;
  });

  const total = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

// Spaced repetition: correct doubles the interval (cap 30), wrong resets to 1
function advanceRecord(record: TopicRecord, correct: boolean): TopicRecord {
  if (correct) {
    const newInterval = Math.min(record.interval * 2, 30);
    return { correct: record.correct + 1, attempts: record.attempts + 1, interval: newInterval, dueIn: newInterval };
  }
  return { ...record, attempts: record.attempts + 1, interval: 1, dueIn: 1 };
}

// Tick down dueIn for every topic except the one just answered
function tickTopics(records: Record<string, TopicRecord>, exceptKey: string): Record<string, TopicRecord> {
  const out: Record<string, TopicRecord> = {};
  for (const [k, v] of Object.entries(records)) {
    out[k] = k === exceptKey ? v : { ...v, dueIn: Math.max(0, v.dueIn - 1) };
  }
  return out;
}

const WP_SUBJECTS = ["rockets", "aliens", "stars", "moons", "comets", "astronauts"];
const WP_ADD_VERBS = ["land at", "join", "appear at", "launch from"];
const WP_SUB_VERBS = ["fly away from", "leave", "blast off from", "depart from"];

const LENGTH_PAIRS: [string, string][] = [
  ["pencil", "crayon"],
  ["book", "ruler"],
  ["bat", "straw"],
  ["worm", "snake"],
  ["brush", "pen"],
  ["ribbon", "rope"],
];

const SHAPE_QS: { q: string; a: number; hint: string }[] = [
  { q: "How many sides does a triangle have?", a: 3, hint: "△" },
  { q: "How many corners does a triangle have?", a: 3, hint: "△" },
  { q: "How many sides does a square have?", a: 4, hint: "□" },
  { q: "How many corners does a square have?", a: 4, hint: "□" },
  { q: "How many sides does a rectangle have?", a: 4, hint: "▭" },
  { q: "How many sides does a pentagon have?", a: 5, hint: "⬠" },
  { q: "How many sides does a hexagon have?", a: 6, hint: "⬡" },
  { q: "How many vertices does a hexagon have?", a: 6, hint: "⬡" },
  { q: "A circle has how many sides?", a: 0, hint: "○" },
  { q: "How many faces does a cube have?", a: 6, hint: "🧊" },
  { q: "How many flat faces does a cone have?", a: 1, hint: "🔺" },
  { q: "How many flat faces does a cylinder have?", a: 2, hint: "🥫" },
  { q: "How many sides does a trapezoid have?", a: 4, hint: "⏢" },
];

const FRACTION_QS: { q: string; a: string; opts: string[]; hint: string }[] = [
  { q: "A pizza cut into 2 equal pieces — one piece is:", a: "1/2", opts: ["1/2", "1/3", "1/4", "2/3"], hint: "1/2" },
  { q: "A pizza cut into 4 equal pieces — one piece is:", a: "1/4", opts: ["1/2", "1/4", "1/3", "1/8"], hint: "1/4" },
  { q: "A shape split into 2 equal parts — each part is:", a: "1/2", opts: ["1/2", "1/3", "1/4", "1/5"], hint: "1/2" },
  {
    q: "A rectangle divided into 4 equal parts — one part is:",
    a: "1/4",
    opts: ["1/2", "1/3", "1/4", "2/4"],
    hint: "1/4",
  },
  { q: "How many halves make a whole?", a: "2", opts: ["2", "3", "4", "8"], hint: "1/2" },
  { q: "How many quarters make a whole?", a: "4", opts: ["2", "3", "4", "6"], hint: "1/4" },
  { q: "How many fourths make one whole?", a: "4", opts: ["2", "3", "4", "8"], hint: "1/4" },
  {
    q: "A circle is cut into 4 equal parts. One shaded part equals:",
    a: "1/4",
    opts: ["1/4", "1/2", "3/4", "1/3"],
    hint: "1/4",
  },
  {
    q: "1/2 of a shape is shaded. What fraction is NOT shaded?",
    a: "1/2",
    opts: ["1/2", "1/3", "1/4", "2/3"],
    hint: "1/2",
  },
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
      visualHint: { left, right, operator: "+" },
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
      visualHint: { left, right, operator: "-" },
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
      visualHint: { left: tens, right: ones, operator: "tens-ones" },
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
      visualHint: { left: base, right: 10, operator: isAdd ? "mental-add" : "mental-sub" },
      signature: `mental${isAdd ? "+" : "-"}:${base}`,
    };
  }

  if (type === "add-100") {
    // 1st grade patterns: round tens + single digit (20+7) OR round tens + round tens (20+30)
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
      visualHint: { left, right, operator: "add-100" },
      signature: `add100:${left},${right}`,
    };
  }

  if (type === "word-problem") {
    const subj = WP_SUBJECTS[Math.floor(Math.random() * WP_SUBJECTS.length)];
    const isAdd = Math.random() > 0.4;
    // Word problems stay within 20 per 1st grade curriculum
    const a = Math.floor(Math.random() * 10) + 1; // 1–10
    const b = Math.floor(Math.random() * 10) + 1; // 1–10
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
    return {
      id,
      type,
      question,
      answer,
      options: numOpts(answer),
      visualHint: { left: a, right: b, operator: isAdd ? "word-add" : "word-sub" },
      signature: `wp-${isAdd ? "add" : "sub"}:${a},${b}`,
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
      visualHint: { left: a, right: b, operator: "comparison" },
      signature: `cmp:${a},${b}`,
    };
  }

  if (type === "time") {
    const hour = Math.floor(Math.random() * 12) + 1;
    const isHalf = Math.random() > 0.5;
    const minutes = isHalf ? 30 : 0;
    const timeStr = `${hour}:${minutes === 0 ? "00" : "30"}`;
    const wrongHour1 = (hour % 12) + 1 + 1 > 12 ? 1 : (hour % 12) + 1 + 1;
    const wrongHour2 = hour - 1 < 1 ? 12 : hour - 1;
    const opts = [
      timeStr,
      `${wrongHour1}:${minutes === 0 ? "00" : "30"}`,
      `${wrongHour2}:${minutes === 0 ? "00" : "30"}`,
      `${hour}:${minutes === 0 ? "30" : "00"}`,
    ];
    opts.sort(() => Math.random() - 0.5);
    const q = isHalf
      ? `The clock shows half past ${hour}. What time is it?`
      : `The clock shows ${hour} o'clock. What time is it?`;
    return {
      id,
      type,
      question: q,
      answer: timeStr,
      options: opts,
      visualHint: { left: hour, right: minutes, operator: "time" },
      signature: `time:${timeStr}`,
    };
  }

  if (type === "shapes") {
    const sq = SHAPE_QS[Math.floor(Math.random() * SHAPE_QS.length)];
    return {
      id,
      type,
      question: sq.q,
      answer: sq.a,
      options: numOpts(sq.a),
      visualHint: { left: sq.a, right: 0, operator: "shape", extra: sq.hint },
      signature: `shape:${sq.q.slice(0, 25)}`,
    };
  }

  if (type === "fractions") {
    const fq = FRACTION_QS[Math.floor(Math.random() * FRACTION_QS.length)];
    return {
      id,
      type,
      question: fq.q,
      answer: fq.a,
      options: fq.opts,
      visualHint: { left: 0, right: 0, operator: "fraction", extra: fq.hint },
      signature: `frac:${fq.q.slice(0, 25)}`,
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
      visualHint: { left: a, right: b, operator: "three-add", extra: String(c) },
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
      visualHint: { left: a, right: b, operator: "fact-family" },
      signature: `ff:${Math.min(a, b)},${Math.max(a, b)}`,
    };
  }

  if (type === "length") {
    const pair = LENGTH_PAIRS[Math.floor(Math.random() * LENGTH_PAIRS.length)];
    const len1 = Math.floor(Math.random() * (max - min)) + min;
    let len2 = Math.floor(Math.random() * (max - min)) + min;
    while (len2 === len1) len2 = Math.floor(Math.random() * (max - min)) + min;
    const isLongerQ = Math.random() > 0.5;
    const longer = len1 > len2 ? pair[0] : pair[1];
    const shorter = len1 > len2 ? pair[1] : pair[0];
    const answer = isLongerQ ? longer : shorter;
    return {
      id,
      type,
      question: `A ${pair[0]} is ${len1} cm long. A ${pair[1]} is ${len2} cm long. Which is ${isLongerQ ? "longer" : "shorter"}?`,
      answer,
      options: [pair[0], pair[1]],
      visualHint: { left: len1, right: len2, operator: "length", extra: `${pair[0]},${pair[1]}` },
      signature: `len:${pair[0]},${isLongerQ ? "longer" : "shorter"}`,
    };
  }

  if (type === "count-120") {
    const useHigh = Math.random() > 0.4;
    const start = useHigh
      ? Math.floor(Math.random() * 18) + 102
      : Math.floor(Math.random() * (max - 2)) + 2;
    const isNext = Math.random() > 0.5;
    const answer = isNext ? start + 1 : start - 1;
    return {
      id,
      type,
      question: isNext ? `What number comes after ${start}?` : `What number comes before ${start}?`,
      answer,
      options: numOpts(answer),
      visualHint: { left: start, right: 0, operator: isNext ? "count-next" : "count-prev" },
      signature: `count:${isNext ? "next" : "prev"}-${start}`,
    };
  }

  // ─── Kindergarten ──────────────────────────────────────────────────────────

  if (type === "count-by-1") {
    const start = Math.floor(Math.random() * 98) + 2;
    const isNext = Math.random() > 0.5;
    const answer = isNext ? start + 1 : start - 1;
    return {
      id,
      type,
      question: isNext ? `What comes after ${start}?` : `What comes before ${start}?`,
      answer,
      options: numOpts(answer),
      visualHint: { left: start, right: 0, operator: isNext ? "count-next" : "count-prev" },
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
      visualHint: { left: step, right: 10, operator: "skip-count", extra: "10" },
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
      visualHint: { left: a, right: answer, operator: "make-10" },
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
      visualHint: { left: 10, right: ones, operator: "teen-decompose" },
      signature: `teen:${teen}`,
    };
  }

  // ─── Grade 1 NEW ───────────────────────────────────────────────────────────

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
      visualHint: { left: a, right: b, operator: "sub-mult-10" },
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
      visualHint: { left: 0, right: 0, operator: "equal-sign", extra: `${v.left}|${v.right}` },
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
      visualHint: { left: known, right: answer, operator: "unknown-addend", extra: String(sum) },
      signature: `unk:${known},${sum}`,
    };
  }

  // ─── Grade 2 ───────────────────────────────────────────────────────────────

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
      visualHint: { left: a, right: b, operator: "add-regroup" },
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
      visualHint: { left: a, right: b, operator: "sub-regroup" },
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
      visualHint: { left: h, right: t, operator: "tens-ones-3", extra: String(o) },
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
      visualHint: { left: start, right: s.n, operator: "skip-count", extra: String(s.n) },
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
      visualHint: { left: a, right: b, operator: "comparison" },
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
      visualHint: { left: base, right: 100, operator: isAdd ? "mental-add-100" : "mental-sub-100" },
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
      visualHint: { left: n, right: 0, operator: "odd-even" },
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
      visualHint: { left: rows, right: cols, operator: "array" },
      signature: `arr:${rows}x${cols}`,
    };
  }

  if (type === "time-5min") {
    const hour = Math.floor(Math.random() * 12) + 1;
    const minutes = Math.floor(Math.random() * 12) * 5; // 0..55 in 5s
    const timeStr = `${hour}:${minutes.toString().padStart(2, "0")}`;
    const opts = new Set<string>([timeStr]);
    while (opts.size < 4) {
      const wh = Math.floor(Math.random() * 12) + 1;
      const wm = Math.floor(Math.random() * 12) * 5;
      opts.add(`${wh}:${wm.toString().padStart(2, "0")}`);
    }
    return {
      id,
      type,
      question: `What time is shown?`,
      answer: timeStr,
      options: Array.from(opts).sort(() => Math.random() - 0.5),
      visualHint: { left: hour, right: minutes, operator: "time" },
      signature: `t5:${timeStr}`,
    };
  }

  if (type === "money") {
    // Mix of coins: pennies (1), nickels (5), dimes (10), quarters (25)
    const coins = [
      { name: "penny", value: 1 },
      { name: "nickel", value: 5 },
      { name: "dime", value: 10 },
      { name: "quarter", value: 25 },
    ];
    const numKinds = Math.floor(Math.random() * 2) + 2; // 2 or 3 kinds
    const picked = coins.sort(() => Math.random() - 0.5).slice(0, numKinds);
    const parts = picked.map((c) => {
      const n = Math.floor(Math.random() * 4) + 1; // 1..4
      return { ...c, n };
    });
    const total = parts.reduce((s, p) => s + p.n * p.value, 0);
    const desc = parts.map((p) => `${p.n} ${p.name}${p.n > 1 ? "s" : ""}`).join(" and ");
    return {
      id,
      type,
      question: `${desc}. How many ¢?`,
      answer: total,
      options: numOpts(total),
      visualHint: { left: 0, right: 0, operator: "money", extra: parts.map((p) => `${p.n}${p.name[0]}`).join(",") },
      signature: `money:${desc}`,
    };
  }

  // ─── Grade 3 ───────────────────────────────────────────────────────────────

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
      visualHint: { left: a, right: b, operator: "multiply" },
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
      visualHint: { left: single, right: tens, operator: "multiply-tens" },
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
      visualHint: { left: dividend, right: divisor, operator: "divide" },
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
      visualHint: { left: n, right: place, operator: "round" },
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
      visualHint: { left: a, right: b, operator: "fraction-line" },
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
      visualHint: { left: p.a, right: p.b, operator: "equiv-fractions", extra: `${newNum}/${newDenom}` },
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
      visualHint: { left: a1, right: a2, operator: "compare-fractions", extra: `${b1},${b2}` },
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
      visualHint: { left: w, right: h, operator: "area" },
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
      visualHint: { left: w, right: h, operator: "perimeter" },
      signature: `peri:${Math.min(w, h)},${Math.max(w, h)}`,
    };
  }

  if (type === "time-minute") {
    const hour = Math.floor(Math.random() * 12) + 1;
    const minutes = Math.floor(Math.random() * 60); // 0..59
    const timeStr = `${hour}:${minutes.toString().padStart(2, "0")}`;
    const opts = new Set<string>([timeStr]);
    while (opts.size < 4) {
      const wh = Math.floor(Math.random() * 12) + 1;
      const wm = Math.floor(Math.random() * 60);
      opts.add(`${wh}:${wm.toString().padStart(2, "0")}`);
    }
    return {
      id,
      type,
      question: `What time is shown?`,
      answer: timeStr,
      options: Array.from(opts).sort(() => Math.random() - 0.5),
      visualHint: { left: hour, right: minutes, operator: "time" },
      signature: `tm:${timeStr}`,
    };
  }

  if (type === "elapsed-time") {
    const startH = Math.floor(Math.random() * 11) + 1; // 1..11
    const startM = Math.floor(Math.random() * 12) * 5; // 0..55 step 5
    const elapsed = Math.floor(Math.random() * 11) + 1; // 1..11 fives
    const elapsedMin = elapsed * 5;
    const totalM = startM + elapsedMin;
    const endH = startH + Math.floor(totalM / 60);
    const endM = totalM % 60;
    const startStr = `${startH}:${startM.toString().padStart(2, "0")}`;
    const endStr = `${endH > 12 ? endH - 12 : endH}:${endM.toString().padStart(2, "0")}`;
    return {
      id,
      type,
      question: `Start ${startStr}, end ${endStr}. How many minutes elapsed?`,
      answer: elapsedMin,
      options: numOpts(elapsedMin),
      visualHint: { left: startH, right: startM, operator: "elapsed", extra: endStr },
      signature: `elap:${startStr}-${endStr}`,
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
  const mastered = topicsInStage.every((k) => (records[k]?.interval ?? 1) >= 8);
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

// ─── Visual Scaffolding ───────────────────────────────────────────────────────

function DigitalClock({ hours, minutes }: { hours: number; minutes: number }) {
  const h = hours === 0 ? 12 : hours;
  const m = minutes.toString().padStart(2, "0");
  return (
    <div className='font-mono text-5xl sm:text-6xl font-black text-yellow-300 bg-slate-900 px-6 py-3 rounded-lg border-2 border-yellow-400/50 shadow-inner tracking-widest'>
      {h}:{m}
    </div>
  );
}

function FractionBar({ hint }: { hint: string }) {
  // Parse "a/b"; default to 1/2 if malformed
  const m = hint.match(/^(\d+)\/(\d+)$/);
  const num = m ? Math.min(parseInt(m[1], 10), parseInt(m[2], 10)) : 1;
  const parts = m ? Math.max(parseInt(m[2], 10), 1) : 2;
  const w = 200,
    h = 40,
    gap = 3;
  const pw = (w - gap * (parts - 1)) / parts;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {Array.from({ length: parts }, (_, i) => (
        <rect
          key={i}
          x={i * (pw + gap)}
          y={0}
          width={pw}
          height={h}
          fill={i < num ? "#a855f7" : "#334155"}
          rx={4}
        />
      ))}
    </svg>
  );
}

// ASCII number line marking the fraction a/b within 0..1
function FractionNumberLine({ a, b }: { a: number; b: number }) {
  const cells: string[] = [];
  for (let i = 0; i <= b; i++) {
    cells.push(i === a ? "▼" : " ");
  }
  const top = cells.join("   ");
  const bar = "0" + "─".repeat(b * 4 - 1) + "1";
  const ticks = "│" + " ".repeat(3) + "├───".repeat(b - 1) + "─┤";
  return (
    <pre className='font-mono text-yellow-300 text-base sm:text-lg leading-tight bg-slate-950 px-3 py-2 rounded-lg border border-yellow-400/30'>
      {top}
      {"\n"}
      {ticks.slice(0, bar.length)}
      {"\n"}
      {bar}
    </pre>
  );
}

const VisualScaffolding = ({ hint }: { hint: Problem["visualHint"] }) => {
  if (hint.operator === "tens-ones") {
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex gap-3'>
          {Array.from({ length: hint.left }).map((_, i) => (
            <div key={i} className='flex flex-col gap-0.5'>
              <span className='text-[8px] text-blue-300 text-center'>Ten</span>
              <div className='grid grid-cols-1 gap-0.5 bg-blue-500/30 p-0.5 rounded border border-blue-400'>
                {Array.from({ length: 10 }).map((_, j) => (
                  <div key={j} className='w-2.5 h-2.5 bg-blue-400 rounded-sm' />
                ))}
              </div>
            </div>
          ))}
          <div className='flex flex-wrap gap-0.5 max-w-[80px] items-center'>
            {Array.from({ length: hint.right }).map((_, i) => (
              <div key={i} className='w-2.5 h-2.5 bg-emerald-400 rounded-sm' />
            ))}
          </div>
        </div>
        <p className='text-[10px] text-blue-200'>Blue stacks = 10, green blocks = 1</p>
      </div>
    );
  }

  if (hint.operator === "mental-add" || hint.operator === "mental-sub") {
    const isAdd = hint.operator === "mental-add";
    const result = isAdd ? hint.left + 10 : hint.left - 10;
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex items-center gap-3 text-2xl font-black'>
          <span className='text-white'>{hint.left}</span>
          <span className={isAdd ? "text-emerald-400" : "text-rose-400"}>{isAdd ? "+10" : "−10"}</span>
          <span className='text-white/40'>=</span>
          <span className='text-yellow-400'>{result}</span>
        </div>
        <p className='text-[10px] text-blue-200'>
          {isAdd ? "The tens digit goes up by 1!" : "The tens digit goes down by 1!"}
        </p>
      </div>
    );
  }

  if (hint.operator === "add-100") {
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex items-center gap-3 text-2xl font-black'>
          <span className='text-blue-300'>{hint.left}</span>
          <span className='text-white'>+</span>
          <span className='text-emerald-300'>{hint.right}</span>
        </div>
        <p className='text-[10px] text-blue-200'>Think about the tens and ones separately!</p>
      </div>
    );
  }

  if (hint.operator === "word-add" || hint.operator === "word-sub") {
    const isAdd = hint.operator === "word-add";
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex items-center gap-3 flex-wrap justify-center'>
          <div className='flex flex-wrap gap-1 max-w-[100px] justify-center'>
            {Array.from({ length: hint.left }).map((_, i) => (
              <div key={i} className='w-3 h-3 bg-orange-400 rounded-full' />
            ))}
          </div>
          <span className='text-xl font-bold text-white'>{isAdd ? "+" : "−"}</span>
          <div className='flex flex-wrap gap-1 max-w-[100px] justify-center'>
            {Array.from({ length: hint.right }).map((_, i) => (
              <div key={i} className='w-3 h-3 bg-purple-400 rounded-full' />
            ))}
          </div>
        </div>
        <p className='text-[10px] text-blue-200'>
          {isAdd ? "Count all the dots together!" : "Start with the first group and take away!"}
        </p>
      </div>
    );
  }

  if (hint.operator === "comparison") {
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex items-center gap-4 text-3xl font-black'>
          <span className='text-blue-300'>{hint.left}</span>
          <div className='flex flex-col items-center text-sm text-slate-400 gap-0.5'>
            <span>{">"} = greater than</span>
            <span>{"<"} = less than</span>
            <span>= means equal</span>
          </div>
          <span className='text-emerald-300'>{hint.right}</span>
        </div>
      </div>
    );
  }

  if (hint.operator === "time") {
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <DigitalClock hours={hint.left} minutes={hint.right} />
        <p className='text-[10px] text-blue-200'>Hours : Minutes</p>
      </div>
    );
  }

  if (hint.operator === "shape") {
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <span className='text-5xl'>{hint.extra}</span>
        <p className='text-[10px] text-blue-200'>Count the sides or corners carefully!</p>
      </div>
    );
  }

  if (hint.operator === "fraction") {
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <FractionBar hint={hint.extra ?? "1/2"} />
        <p className='text-[10px] text-blue-200'>Purple = one equal part of the whole</p>
      </div>
    );
  }

  if (hint.operator === "three-add") {
    const c = parseInt(hint.extra ?? "0", 10);
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex items-center gap-2 flex-wrap justify-center'>
          <div className='flex flex-wrap gap-1 max-w-[60px] justify-center'>
            {Array.from({ length: hint.left }).map((_, i) => (
              <div key={i} className='w-3 h-3 bg-orange-400 rounded-full' />
            ))}
          </div>
          <span className='text-lg font-bold text-white'>+</span>
          <div className='flex flex-wrap gap-1 max-w-[60px] justify-center'>
            {Array.from({ length: hint.right }).map((_, i) => (
              <div key={i} className='w-3 h-3 bg-purple-400 rounded-full' />
            ))}
          </div>
          <span className='text-lg font-bold text-white'>+</span>
          <div className='flex flex-wrap gap-1 max-w-[60px] justify-center'>
            {Array.from({ length: c }).map((_, i) => (
              <div key={i} className='w-3 h-3 bg-emerald-400 rounded-full' />
            ))}
          </div>
        </div>
        <p className='text-[10px] text-blue-200'>Count all three groups together!</p>
      </div>
    );
  }

  if (hint.operator === "fact-family") {
    const sum = hint.left + hint.right;
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='text-xl font-bold text-center space-y-1'>
          <div>
            <span className='text-emerald-300'>{hint.left}</span>
            <span className='text-white'> + </span>
            <span className='text-purple-300'>{hint.right}</span>
            <span className='text-white'> = </span>
            <span className='text-yellow-300'>{sum}</span>
          </div>
          <div className='text-slate-400 text-sm'>↕ flip it!</div>
          <div>
            <span className='text-yellow-300'>{sum}</span>
            <span className='text-white'> − </span>
            <span className='text-purple-300'>{hint.right}</span>
            <span className='text-white'> = </span>
            <span className='text-emerald-300'>{hint.left}</span>
          </div>
        </div>
        <p className='text-[10px] text-blue-200'>Addition and subtraction are opposites!</p>
      </div>
    );
  }

  if (hint.operator === "length") {
    const [obj1, obj2] = (hint.extra ?? ",").split(",");
    const maxLen = Math.max(hint.left, hint.right);
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex flex-col gap-2 w-full max-w-[220px]'>
          <div className='flex items-center gap-2'>
            <span className='text-[10px] text-blue-300 w-14 text-right shrink-0'>{obj1}</span>
            <div className='h-4 bg-orange-400 rounded' style={{ width: `${(hint.left / maxLen) * 120}px` }} />
            <span className='text-[10px] text-slate-300'>{hint.left} cm</span>
          </div>
          <div className='flex items-center gap-2'>
            <span className='text-[10px] text-blue-300 w-14 text-right shrink-0'>{obj2}</span>
            <div className='h-4 bg-purple-400 rounded' style={{ width: `${(hint.right / maxLen) * 120}px` }} />
            <span className='text-[10px] text-slate-300'>{hint.right} cm</span>
          </div>
        </div>
        <p className='text-[10px] text-blue-200'>Longer bar = longer object!</p>
      </div>
    );
  }

  if (hint.operator === "count-next" || hint.operator === "count-prev") {
    const isNext = hint.operator === "count-next";
    const n = hint.left;
    const nums: (number | string)[] = isNext ? [n - 1, n, "?"] : ["?", n, n + 1];
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex items-center gap-2'>
          {nums.map((num, i) => (
            <div
              key={i}
              className={`w-14 h-12 rounded-lg flex items-center justify-center text-lg font-bold ${num === "?" ? "bg-yellow-500/30 border-2 border-yellow-400 text-yellow-400" : "bg-white/10 text-white"}`}
            >
              {num}
            </div>
          ))}
        </div>
        <p className='text-[10px] text-blue-200'>{isNext ? "Count up — what comes next?" : "Count back — what comes before?"}</p>
      </div>
    );
  }

  if (hint.operator === "make-10") {
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex items-center gap-1'>
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-sm ${i < hint.left ? "bg-orange-400" : "bg-slate-600 border border-slate-500"}`}
            />
          ))}
        </div>
        <p className='text-[10px] text-blue-200'>How many empty squares to fill 10?</p>
      </div>
    );
  }

  if (hint.operator === "teen-decompose") {
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex gap-3 items-center'>
          <div className='grid grid-cols-1 gap-0.5 bg-blue-500/30 p-1 rounded border border-blue-400'>
            {Array.from({ length: 10 }).map((_, j) => (
              <div key={j} className='w-3 h-3 bg-blue-400 rounded-sm' />
            ))}
          </div>
          <span className='text-2xl text-white'>+</span>
          <div className='flex flex-wrap gap-0.5 max-w-[80px]'>
            {Array.from({ length: hint.right }).map((_, i) => (
              <div key={i} className='w-3 h-3 bg-emerald-400 rounded-sm' />
            ))}
          </div>
        </div>
        <p className='text-[10px] text-blue-200'>One ten + some ones</p>
      </div>
    );
  }

  if (hint.operator === "sub-mult-10") {
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex items-center gap-3 text-2xl font-black'>
          <span className='text-white'>{hint.left}</span>
          <span className='text-rose-400'>− {hint.right}</span>
          <span className='text-white/40'>=</span>
          <span className='text-yellow-400'>{hint.left - hint.right}</span>
        </div>
        <p className='text-[10px] text-blue-200'>Subtract tens from tens.</p>
      </div>
    );
  }

  if (hint.operator === "equal-sign") {
    const [l, r] = (hint.extra ?? " | ").split("|");
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex items-center gap-3 text-2xl font-black text-white'>
          <span>{l}</span><span className='text-yellow-300'>=</span><span>{r}</span>
        </div>
        <p className='text-[10px] text-blue-200'>Both sides should equal the same.</p>
      </div>
    );
  }

  if (hint.operator === "unknown-addend") {
    const sum = parseInt(hint.extra ?? "0", 10);
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex items-center gap-3 text-2xl font-black text-white'>
          <span className='text-orange-300'>{hint.left}</span>
          <span>+</span>
          <span className='text-yellow-400'>?</span>
          <span>=</span>
          <span className='text-emerald-300'>{sum}</span>
        </div>
        <p className='text-[10px] text-blue-200'>Count up from {hint.left} to {sum}.</p>
      </div>
    );
  }

  if (hint.operator === "add-regroup" || hint.operator === "sub-regroup") {
    const isAdd = hint.operator === "add-regroup";
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='font-mono text-3xl text-white'>
          <div className='text-right'>{hint.left}</div>
          <div className='text-right border-b border-white/30'>{isAdd ? "+" : "−"} {hint.right}</div>
        </div>
        <p className='text-[10px] text-blue-200'>Stack the digits and add tens-to-tens, ones-to-ones.</p>
      </div>
    );
  }

  if (hint.operator === "tens-ones-3") {
    const ones = parseInt(hint.extra ?? "0", 10);
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex items-center gap-2 text-base font-black'>
          <span className='text-rose-300'>{hint.left}×100</span>
          <span className='text-white'>+</span>
          <span className='text-blue-300'>{hint.right}×10</span>
          <span className='text-white'>+</span>
          <span className='text-emerald-300'>{ones}</span>
        </div>
        <p className='text-[10px] text-blue-200'>Hundreds, tens, ones.</p>
      </div>
    );
  }

  if (hint.operator === "skip-count") {
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex items-center gap-2'>
          <div className='w-14 h-12 rounded-lg bg-white/10 text-white flex items-center justify-center text-lg font-bold'>{hint.left - hint.right}</div>
          <div className='w-14 h-12 rounded-lg bg-white/10 text-white flex items-center justify-center text-lg font-bold'>{hint.left}</div>
          <div className='w-14 h-12 rounded-lg bg-yellow-500/30 border-2 border-yellow-400 text-yellow-400 flex items-center justify-center text-lg font-bold'>?</div>
        </div>
        <p className='text-[10px] text-blue-200'>Add {hint.right} each step.</p>
      </div>
    );
  }

  if (hint.operator === "mental-add-100" || hint.operator === "mental-sub-100") {
    const isAdd = hint.operator === "mental-add-100";
    const result = isAdd ? hint.left + 100 : hint.left - 100;
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex items-center gap-3 text-2xl font-black'>
          <span className='text-white'>{hint.left}</span>
          <span className={isAdd ? "text-emerald-400" : "text-rose-400"}>{isAdd ? "+100" : "−100"}</span>
          <span className='text-white/40'>=</span>
          <span className='text-yellow-400'>{result}</span>
        </div>
        <p className='text-[10px] text-blue-200'>The hundreds digit changes by 1!</p>
      </div>
    );
  }

  if (hint.operator === "odd-even") {
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex flex-wrap gap-1 max-w-[180px] justify-center'>
          {Array.from({ length: hint.left }).map((_, i) => (
            <div key={i} className={`w-3 h-3 rounded-full ${i % 2 === 0 ? "bg-orange-400" : "bg-purple-400"}`} />
          ))}
        </div>
        <p className='text-[10px] text-blue-200'>Pair them up — does one have a partner?</p>
      </div>
    );
  }

  if (hint.operator === "array") {
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex flex-col gap-1'>
          {Array.from({ length: hint.left }).map((_, r) => (
            <div key={r} className='flex gap-1'>
              {Array.from({ length: hint.right }).map((__, c) => (
                <div key={c} className='w-4 h-4 bg-emerald-400 rounded-sm' />
              ))}
            </div>
          ))}
        </div>
        <p className='text-[10px] text-blue-200'>{hint.left} rows × {hint.right} per row</p>
      </div>
    );
  }

  if (hint.operator === "money") {
    const COIN: Record<string, { c: string; v: number }> = {
      p: { c: "🪙", v: 1 },
      n: { c: "🟢", v: 5 },
      d: { c: "🔵", v: 10 },
      q: { c: "🟡", v: 25 },
    };
    const parts = (hint.extra ?? "").split(",").filter(Boolean);
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex flex-wrap gap-2 justify-center max-w-[260px]'>
          {parts.map((p, i) => {
            const n = parseInt(p[0], 10);
            const kind = p[1];
            const coin = COIN[kind] ?? { c: "·", v: 0 };
            return (
              <div key={i} className='flex items-center gap-1 bg-white/5 px-2 py-1 rounded'>
                <span className='text-lg'>{coin.c}</span>
                <span className='text-xs text-white'>×{n}</span>
                <span className='text-[10px] text-emerald-300'>{coin.v}¢</span>
              </div>
            );
          })}
        </div>
        <p className='text-[10px] text-blue-200'>Add each coin&apos;s value.</p>
      </div>
    );
  }

  if (hint.operator === "multiply") {
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex flex-col gap-1'>
          {Array.from({ length: Math.min(hint.left, 10) }).map((_, r) => (
            <div key={r} className='flex gap-1'>
              {Array.from({ length: Math.min(hint.right, 10) }).map((__, c) => (
                <div key={c} className='w-3 h-3 bg-orange-400 rounded-sm' />
              ))}
            </div>
          ))}
        </div>
        <p className='text-[10px] text-blue-200'>{hint.left} groups of {hint.right}</p>
      </div>
    );
  }

  if (hint.operator === "multiply-tens") {
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex items-center gap-2 text-xl font-black'>
          <span className='text-white'>{hint.left} × {hint.right}</span>
          <span className='text-white/40'>=</span>
          <span className='text-yellow-300'>{hint.left} × {hint.right / 10}</span>
          <span className='text-white/40'>tens</span>
        </div>
        <p className='text-[10px] text-blue-200'>Multiply, then add a zero.</p>
      </div>
    );
  }

  if (hint.operator === "divide") {
    const groups = hint.left / hint.right;
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex flex-wrap gap-2 justify-center max-w-[260px]'>
          {Array.from({ length: groups }).map((_, g) => (
            <div key={g} className='flex gap-0.5 bg-white/5 p-1 rounded'>
              {Array.from({ length: hint.right }).map((__, i) => (
                <div key={i} className='w-2.5 h-2.5 bg-purple-400 rounded-sm' />
              ))}
            </div>
          ))}
        </div>
        <p className='text-[10px] text-blue-200'>{hint.left} split into groups of {hint.right}</p>
      </div>
    );
  }

  if (hint.operator === "round") {
    const n = hint.left, place = hint.right;
    const rounded = Math.round(n / place) * place;
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex items-center gap-3 text-xl font-black text-white'>
          <span>{n}</span>
          <span className='text-yellow-300'>→</span>
          <span className='text-emerald-300'>{rounded}</span>
        </div>
        <p className='text-[10px] text-blue-200'>Round to the nearest {place}.</p>
      </div>
    );
  }

  if (hint.operator === "fraction-line") {
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <FractionNumberLine a={hint.left} b={hint.right} />
        <p className='text-[10px] text-blue-200'>The ▼ marks the spot between 0 and 1.</p>
      </div>
    );
  }

  if (hint.operator === "equiv-fractions") {
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <FractionBar hint={`${hint.left}/${hint.right}`} />
        <span className='text-yellow-300 text-sm'>=</span>
        <FractionBar hint={hint.extra ?? ""} />
        <p className='text-[10px] text-blue-200'>Same amount, different pieces.</p>
      </div>
    );
  }

  if (hint.operator === "compare-fractions") {
    const [b1s, b2s] = (hint.extra ?? "0,0").split(",");
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <FractionBar hint={`${hint.left}/${b1s}`} />
        <FractionBar hint={`${hint.right}/${b2s}`} />
        <p className='text-[10px] text-blue-200'>Which purple bar is longer?</p>
      </div>
    );
  }

  if (hint.operator === "area") {
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex flex-col gap-0.5'>
          {Array.from({ length: hint.right }).map((_, r) => (
            <div key={r} className='flex gap-0.5'>
              {Array.from({ length: hint.left }).map((__, c) => (
                <div key={c} className='w-3 h-3 bg-emerald-400/70 border border-emerald-300' />
              ))}
            </div>
          ))}
        </div>
        <p className='text-[10px] text-blue-200'>Count the squares: {hint.left} × {hint.right}</p>
      </div>
    );
  }

  if (hint.operator === "perimeter") {
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div
          className='border-2 border-yellow-300 bg-slate-800/60 flex items-center justify-center text-xs text-yellow-200'
          style={{ width: `${hint.left * 12}px`, height: `${hint.right * 12}px`, minWidth: 40, minHeight: 30 }}
        >
          {hint.left}×{hint.right}
        </div>
        <p className='text-[10px] text-blue-200'>Add up all 4 sides: {hint.left} + {hint.right} + {hint.left} + {hint.right}</p>
      </div>
    );
  }

  if (hint.operator === "elapsed") {
    return (
      <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
        <div className='flex items-center gap-3'>
          <DigitalClock hours={hint.left} minutes={hint.right} />
          <span className='text-yellow-300 text-2xl'>→</span>
          <div className='font-mono text-3xl font-black text-emerald-300 bg-slate-900 px-4 py-2 rounded-lg border-2 border-emerald-400/50 tracking-widest'>
            {hint.extra}
          </div>
        </div>
        <p className='text-[10px] text-blue-200'>How many minutes from start to end?</p>
      </div>
    );
  }

  // Default: addition / subtraction dots
  return (
    <div className='flex flex-col items-center gap-2 p-3 bg-white/10 rounded-2xl border border-white/20'>
      <div className='flex items-center gap-3 flex-wrap justify-center'>
        <div className='flex flex-wrap gap-1 max-w-[100px] justify-center'>
          {Array.from({ length: hint.left }).map((_, i) => (
            <div key={i} className='w-3 h-3 bg-orange-400 rounded-full shadow-lg shadow-orange-500/20' />
          ))}
        </div>
        <span className='text-xl font-bold text-white'>{hint.operator === "+" ? "+" : "−"}</span>
        <div className='flex flex-wrap gap-1 max-w-[100px] justify-center'>
          {Array.from({ length: hint.right }).map((_, i) => (
            <div key={i} className='w-3 h-3 bg-purple-400 rounded-full shadow-lg shadow-purple-500/20' />
          ))}
        </div>
      </div>
      <p className='text-[10px] text-blue-200'>
        {hint.operator === "+" ? "Count all the dots together!" : "Start with the first group and take away!"}
      </p>
    </div>
  );
};

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

const STARS = Array.from({ length: 50 }, () => ({
  w: Math.random() * 3,
  h: Math.random() * 3,
  t: Math.random() * 100,
  l: Math.random() * 100,
  o: Math.random() * 0.7 + 0.3,
  d: Math.random() * 5,
}));

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
  const [topicRecords, setTopicRecords] = useState<Record<string, TopicRecord>>(() => readSave()?.topicRecords ?? {});
  const grade = currentGrade(topicRecords);
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

  const isWordProblem = problem?.type === "word-problem";
  const READ_ALOUD: Set<ProblemType> = new Set([
    "word-problem", "time", "shapes", "fractions", "fact-family", "length", "count-120",
    "count-by-1", "count-by-10", "make-10", "teen-decompose",
    "equal-sign", "unknown-addend",
    "skip-count", "odd-even", "array", "time-5min", "money",
    "round", "fraction-line", "equiv-fractions", "compare-fractions",
    "area", "perimeter", "time-minute", "elapsed-time",
  ]);
  const isReadAloud = !!problem && READ_ALOUD.has(problem.type);
  const isFraction = problem?.type === "fractions";
  const isLongQuestion = problem && !isWordProblem && !isFraction && problem.question.length > 40;
  const isThreeOptions = problem && problem.options.length === 3;
  const GRADE_LABEL: Record<Grade, string> = { K: "Kindergarten", G1: "Grade 1", G2: "Grade 2", G3: "Grade 3" };

  return (
    <div className='flex-1 bg-black text-white selection:bg-blue-500/30 relative flex flex-col overflow-hidden'>
      <div className='absolute inset-0 pointer-events-none'>
        {STARS.map((s, i) => (
          <div
            key={i}
            className='absolute bg-white rounded-full animate-pulse'
            style={{
              width: s.w + "px",
              height: s.h + "px",
              top: s.t + "%",
              left: s.l + "%",
              opacity: s.o,
              animationDelay: s.d + "s",
            }}
          />
        ))}
      </div>
      <StarBank score={score} onClear={clearStars} />
      <main className='relative z-10 w-full p-4 sm:p-6 flex flex-col items-center flex-1 min-h-0 overflow-hidden'>
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
                  {GRADE_LABEL[grade]}
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
                <div className='flex justify-center mb-2 shrink-0'>
                  <VisualScaffolding hint={problem.visualHint} />
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
