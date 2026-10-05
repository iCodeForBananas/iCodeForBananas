// Pure question-generator logic for Space Math, split out of the
// SpaceMathPage.tsx UI component so it can be unit tested with plain
// vitest (node environment) instead of needing a DOM — SpaceMathPage.tsx
// pulls in framer-motion/@radix-ui/lucide-react, none of which belong in a
// node-environment test. See spaceMathSkills.test.ts, which imports
// buildProblem from here to verify every entry in the shared skill list
// actually produces a problem of its own type.

import type { ProblemType } from "./spaceMathSkills";

export interface FractionVisual {
  shape: "circle" | "square" | "bar" | "set";
  total: number;
  shaded: number;
}

export interface Problem {
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
  // When present, the question is graded by interactive click-to-shade
  // (ShadeGrid in SpaceMathPage.tsx) instead of multiple-choice buttons.
  // `answer` is the target shaded count as a number; the UI calls back with
  // however many cells the kid actually shaded, compared the same way any
  // other answer is.
  shadeTarget?: { shape: FractionVisual["shape"]; total: number; target: number };
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

export function buildProblem(type: ProblemType, min: number, max: number): Problem {
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
    const variants: Array<() => { question: string; answer: number | string; candidates?: string[]; sig: string }> = [
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
      // — and sometimes all three: 273 = __ x 100 + __ x 10 + __ x 1
      () => {
        const h = Math.floor(Math.random() * 9) + 1;
        const t = Math.floor(Math.random() * 10);
        const o = Math.floor(Math.random() * 10);
        const num = h * 100 + t * 10 + o;
        const digits = [h, t, o];
        if (Math.random() < 0.5) {
          const blank = Math.floor(Math.random() * 3); // 0=hundreds, 1=tens, 2=ones
          const coeffs = digits.map((c, i) => (i === blank ? "__" : String(c)));
          return { question: `${num} = ${coeffs[0]} x 100 + ${coeffs[1]} x 10 + ${coeffs[2]} x 1`, answer: digits[blank], sig: `pv3-expand:${num}-${blank}` };
        }
        // All three blank — the "answer" is the H,T,O triple, picked from a
        // multiple-choice set of plausible place-value mix-ups.
        const answer = `${h},${t},${o}`;
        const candidates = [answer, `${t},${h},${o}`, `${h},${o},${t}`, `${o},${t},${h}`];
        return {
          question: `${num} = __ x 100 + __ x 10 + __ x 1`,
          answer,
          candidates,
          sig: `pv3-expand-all:${num}`,
        };
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
      options: typeof v.answer === "number" ? numOpts(v.answer) : strOpts(v.answer, v.candidates ?? [v.answer]),
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
      // Independent draws, not capped to a shared total — three whole-hundreds
      // addends can genuinely sum past 900 (e.g. 600 + 300 + 400 = 1300).
      const a = hundreds(9);
      const b = hundreds(9);
      const c = hundreds(9);
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
      return build([d2(10, 89), tensMul(4)], null, `ahm5`);
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
      // Full 2-digit range (10-99), not 10-89 — 97 is a valid 2-digit number.
      return build([d2(10, 99), d2(10, 99), d2(10, 99), d2(10, 99)], null, `ahm11`);
    }
    // Two 2-digit addends, missing addend, carrying allowed: 39 + __ = 50
    const a = d2(10, 89);
    const b = d2(10, Math.max(10, 98 - a));
    return build([a, b], 1, `ahm12:${a},${b}`);
  }

  if (type === "add-3digit") {
    const variant = Math.floor(Math.random() * 3);
    if (variant === 0) {
      // Two 3-digit numbers, no carrying: 111 + 121 = ?
      const hA = Math.floor(Math.random() * 9) + 1;
      const tA = Math.floor(Math.random() * 10);
      const oA = Math.floor(Math.random() * 10);
      const hB = Math.floor(Math.random() * (9 - hA)) + 1;
      const tB = Math.floor(Math.random() * (10 - tA));
      const oB = Math.floor(Math.random() * (10 - oA));
      const left = hA * 100 + tA * 10 + oA;
      const right = hB * 100 + tB * 10 + oB;
      const { question, answer } = chainAdd([left, right], null);
      return { id, type, question, answer, options: numOpts(answer), signature: `a3d-nc:${left},${right}` };
    }
    if (variant === 1) {
      // Two 3-digit numbers, with carrying: 397 + 984 = ?
      const hA = Math.floor(Math.random() * 8) + 1;
      const tA = Math.floor(Math.random() * 10);
      const oA = Math.floor(Math.random() * 8) + 1; // 1..8
      const hB = Math.floor(Math.random() * (9 - hA)) + 1;
      const tB = Math.floor(Math.random() * 10);
      const oB = Math.floor(Math.random() * oA) + (10 - oA); // forces oA + oB >= 10, both single digits
      const left = hA * 100 + tA * 10 + oA;
      const right = hB * 100 + tB * 10 + oB;
      const { question, answer } = chainAdd([left, right], null);
      return { id, type, question, answer, options: numOpts(answer), signature: `a3d-c:${left},${right}` };
    }
    // Three 3-digit addends: 456 + 678 + 789 = ?
    const terms = [
      Math.floor(Math.random() * 700) + 100,
      Math.floor(Math.random() * 700) + 100,
      Math.floor(Math.random() * 700) + 100,
    ];
    const { question, answer } = chainAdd(terms, null);
    return { id, type, question, answer, options: numOpts(answer), signature: `a3d-3:${terms.join(",")}` };
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
    // Fixed algebraic candidates rather than rejection sampling: for total=2
    // there's only one possible shaded count (1), so a "keep drawing until
    // it differs" loop never terminates. A candidate from a different
    // denominator always gives at least one real distractor.
    const otherTotal = FRACTION_DENOMS[(FRACTION_DENOMS.indexOf(total) + 1) % FRACTION_DENOMS.length];
    const otherShaded = Math.floor(Math.random() * (otherTotal - 1)) + 1;
    const candidates = [
      answer,
      `${total - shaded}/${total}`,
      `${Math.max(1, shaded - 1)}/${total}`,
      `${Math.min(total - 1, shaded + 1)}/${total}`,
      `${otherShaded}/${otherTotal}`,
    ];
    const options = strOpts(answer, candidates);
    return {
      id,
      type,
      question: `Which picture shows ${answer}?`,
      answer,
      options,
      optionsArePictures: true,
      optionShape: shape,
      signature: `ff2p:${shape}-${answer}`,
    };
  }

  if (type === "fraction-shade") {
    // The actually-interactive version of "show this fraction": the kid taps
    // cells/wedges to shade them in, graded on how many end up shaded (any N
    // of M is correct — which specific ones doesn't matter for a fraction).
    // The UI (ShadeGrid in SpaceMathPage.tsx) owns the tap-by-tap mechanics;
    // this just picks the shape and the target count.
    const shape = FRACTION_SHAPES[Math.floor(Math.random() * FRACTION_SHAPES.length)];
    const total = FRACTION_DENOMS[Math.floor(Math.random() * FRACTION_DENOMS.length)];
    const target = Math.floor(Math.random() * (total - 1)) + 1;
    const question =
      shape === "set"
        ? `Color ${target} out of ${total} to show ${target}/${total}.`
        : `Color ${target} equal parts to show ${target}/${total}.`;
    return {
      id,
      type,
      question,
      answer: target,
      options: [],
      shadeTarget: { shape, total, target },
      signature: `fshade:${shape}-${target}/${total}`,
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
    // total=2 has only one possible shaded count (1), so two *different*
    // shaded counts need total >= 3.
    const compareDenoms = FRACTION_DENOMS.filter((d) => d > 2);
    const total = compareDenoms[Math.floor(Math.random() * compareDenoms.length)];
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
    // At most newDenom-1 distinct numerators exist for this denominator —
    // for 1/2=2/4, that's only 3 possible strings total, so demanding 4
    // distinct options would never terminate.
    const maxOptions = Math.min(4, newDenom - 1);
    while (optSet.size < maxOptions) {
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
      // d=2 has only one possible numerator (1), so "keep drawing a second,
      // distinct numerator" would never terminate — needs d >= 3 to have
      // two numerators to compare.
      const sameDenomPool = denoms.filter((x) => x > 2);
      const d = sameDenomPool[Math.floor(Math.random() * sameDenomPool.length)];
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
