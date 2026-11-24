// Single source of truth for every Space Math skill. The game's question
// generator, the spaced-repetition ladder, the progress API, and the
// learning-progress page all read this one list — there is nothing else to
// hand-edit when a topic is added. See spaceMathSkills.test.ts, which fails
// if a topic in the game has no entry here (or vice versa).
//
// One entry per game topic — no merging multiple topics under one shared
// id. Merging was the old design (TOPIC_STAGE in SpaceMathPage.tsx mapped
// several topics to one numeric "stage"), and it actively hid things: four
// skip-counting topics read as one "Skip Count" row, mastery of one
// regrouping-addition topic could be blocked for weeks by an unrelated
// topic 20 rungs away sharing its id, and so on. One topic, one row, one
// mastery flag.

export type ProblemType =
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
  | "add-sub-chain"
  // G2
  | "add-100-regroup"
  | "sub-100-regroup"
  | "place-value-3"
  | "order-numbers"
  | "add-no-regroup"
  | "add-whole-hundreds"
  | "add-harder-mixed"
  | "add-3digit"
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
  | "fraction-shade"
  | "fraction-words"
  | "fraction-of-set"
  | "compare-fractions-simple"
  | "fraction-compare-visual"
  // G2 enVision topics not covered above
  | "equal-groups"
  | "add-four-2digit"
  | "word-problem"
  | "tell-time"
  | "am-pm"
  | "count-coins"
  | "money-word"
  | "expanded-form"
  | "number-names"
  | "length-units"
  | "ruler-measure"
  | "length-compare"
  | "shape-attributes"
  | "partition-rect"
  | "number-line-jump"
  | "length-word"
  | "picture-graph"
  | "bar-graph"
  // G3
  | "multiply"
  | "divide"
  | "multiply-tens"
  | "mult-by-2-extended"
  | "round"
  | "round-ten-small"
  | "round-ten-large"
  | "round-hundred"
  | "fraction-line"
  | "equiv-fractions"
  | "compare-fractions"
  | "area"
  | "perimeter";

// The parent-facing groupings for the progress page. Deliberately not the
// same as Common Core strands — a parent doesn't think in "2.NBT.A.2", they
// think "counting" or "times tables".
export type SubjectAreaId =
  | "counting"
  | "add-subtract"
  | "place-value"
  | "times-divide"
  | "fractions"
  | "measurement"
  | "time-money"
  | "geometry"
  | "data";

export interface SubjectAreaDef {
  id: SubjectAreaId;
  label: string;
  description: string;
}

export const SUBJECT_AREAS: SubjectAreaDef[] = [
  { id: "counting", label: "Counting & Numbers", description: "Counting, skip-counting, comparing and ordering numbers" },
  { id: "add-subtract", label: "Add & Subtract", description: "Addition and subtraction fluency, fact families" },
  { id: "place-value", label: "Place Value", description: "Tens, hundreds, mental math, rounding" },
  { id: "times-divide", label: "Times & Divide", description: "Arrays, times tables, multiplication, division" },
  { id: "fractions", label: "Fractions", description: "Equal parts, reading/writing fractions, comparing fractions" },
  { id: "time-money", label: "Time & Money", description: "Telling time, a.m./p.m., counting coins, money problems" },
  { id: "measurement", label: "Measurement", description: "Length, rulers, units, area and perimeter" },
  { id: "geometry", label: "Shapes", description: "Sides, vertices, faces, splitting rectangles" },
  { id: "data", label: "Graphs & Data", description: "Reading picture graphs and bar graphs" },
];

export interface SkillDef {
  key: string; // stable id — the game topic key, the DB skill_id, the UI key. Never reused.
  type: ProblemType;
  min: number;
  max: number;
  name: string; // parent-friendly label
  subject: SubjectAreaId;
  standard: string; // Common Core code, best effort
}

// Easiest first — this ordering IS the spaced-repetition ladder
// (SpaceMathPage.tsx derives TOPIC_PROGRESSION from this array directly).
export const SKILLS: SkillDef[] = [
  { key: "add-1-5", type: "addition", min: 1, max: 5, name: "Add within 5", subject: "add-subtract", standard: "K.OA.A.5" },
  { key: "sub-1-5", type: "subtraction", min: 1, max: 5, name: "Subtract within 5", subject: "add-subtract", standard: "K.OA.A.5" },
  { key: "k-count-by-1", type: "count-by-1", min: 1, max: 100, name: "Count by 1s to 100", subject: "counting", standard: "K.CC.A.1" },
  { key: "k-count-next", type: "count-next", min: 1, max: 97, name: "Count the next number", subject: "counting", standard: "K.CC.A.2" },
  { key: "add-1-10", type: "addition", min: 1, max: 10, name: "Add within 10", subject: "add-subtract", standard: "K.OA.A.2" },
  { key: "sub-1-10", type: "subtraction", min: 1, max: 10, name: "Subtract within 10", subject: "add-subtract", standard: "K.OA.A.2" },
  { key: "k-compare-10", type: "comparison", min: 1, max: 10, name: "Compare numbers 1-10", subject: "counting", standard: "K.CC.C.6" },
  { key: "k-make-10", type: "make-10", min: 1, max: 9, name: "Make 10", subject: "add-subtract", standard: "K.OA.A.4" },
  { key: "k-count-by-10", type: "count-by-10", min: 10, max: 100, name: "Count by 10s to 100", subject: "counting", standard: "K.CC.A.1" },
  { key: "k-teen", type: "teen-decompose", min: 11, max: 19, name: "Teen numbers as 10 + ones", subject: "place-value", standard: "K.NBT.A.1" },
  { key: "add-1-20", type: "addition", min: 1, max: 20, name: "Add within 20", subject: "add-subtract", standard: "1.OA.C.6" },
  { key: "sub-1-20", type: "subtraction", min: 1, max: 20, name: "Subtract within 20", subject: "add-subtract", standard: "1.OA.C.6" },
  { key: "g1-equal-sign", type: "equal-sign", min: 1, max: 10, name: "Equal sign true or false", subject: "add-subtract", standard: "1.OA.D.7" },
  { key: "g1-unknown", type: "unknown-addend", min: 1, max: 20, name: "Unknown addend", subject: "add-subtract", standard: "1.OA.D.8" },
  { key: "compare-20", type: "comparison", min: 1, max: 20, name: "Compare numbers to 20", subject: "counting", standard: "1.NBT.B.3" },
  { key: "three-addend", type: "three-addend", min: 1, max: 6, name: "Add three numbers", subject: "add-subtract", standard: "1.OA.A.2" },
  { key: "fact-family", type: "fact-family", min: 1, max: 10, name: "Fact families", subject: "add-subtract", standard: "1.OA.B.4" },
  { key: "g1-add-regroup", type: "add-regroup-mental", min: 1, max: 9, name: "Add 2-4 numbers (mental)", subject: "add-subtract", standard: "1.OA.C.6" },
  { key: "g1-add-sub-chain", type: "add-sub-chain", min: 1, max: 9, name: "Add and subtract in a chain", subject: "add-subtract", standard: "1.OA.A.2" },
  { key: "place-value", type: "place-value", min: 1, max: 9, name: "Tens & ones place value", subject: "place-value", standard: "1.NBT.B.2" },
  { key: "count-120", type: "count-120", min: 1, max: 120, name: "Count to 120", subject: "counting", standard: "1.NBT.A.1" },
  { key: "mental-ten", type: "mental-ten", min: 10, max: 90, name: "Mental plus/minus 10", subject: "place-value", standard: "1.NBT.C.5" },
  { key: "g1-add-whole-tens", type: "add-whole-tens", min: 10, max: 150, name: "Add whole tens", subject: "place-value", standard: "1.NBT.C.4" },
  { key: "add-100", type: "add-100", min: 10, max: 90, name: "Add within 100 (round numbers)", subject: "add-subtract", standard: "1.NBT.C.4" },
  { key: "g1-sub-mult-10", type: "sub-mult-10", min: 10, max: 90, name: "Subtract multiples of 10 (to 90)", subject: "place-value", standard: "1.NBT.C.6" },
  // enVision Grade 2, Topics 1-15 in order. Topic 1 (facts within 20) is the end of the G1 run above.
  // T2 Work with Equal Groups
  { key: "g2-odd-even", type: "odd-even", min: 1, max: 20, name: "Odd or even", subject: "counting", standard: "2.OA.C.3" },
  { key: "g2-equal-groups", type: "equal-groups", min: 2, max: 5, name: "Equal groups (repeated addition)", subject: "times-divide", standard: "2.OA.C.4" },
  { key: "g2-array", type: "array", min: 2, max: 5, name: "Rectangular arrays", subject: "times-divide", standard: "2.OA.C.4" },
  // T3-4 Add within 100
  { key: "g2-add-no-regroup", type: "add-no-regroup", min: 10, max: 89, name: "Add within 100 (no regrouping)", subject: "add-subtract", standard: "2.NBT.B.5" },
  { key: "g2-add-regroup", type: "add-100-regroup", min: 10, max: 99, name: "Add within 100 (regrouping)", subject: "add-subtract", standard: "2.NBT.B.5" },
  { key: "g2-add-four", type: "add-four-2digit", min: 10, max: 40, name: "Add up to four 2-digit numbers", subject: "add-subtract", standard: "2.NBT.B.6" },
  // T5-6 Subtract within 100
  { key: "g2-sub-regroup", type: "sub-100-regroup", min: 10, max: 99, name: "Subtract within 100 (regrouping)", subject: "add-subtract", standard: "2.NBT.B.5" },
  // T7 Word problems
  { key: "g2-word-problem", type: "word-problem", min: 5, max: 50, name: "One- and two-step word problems", subject: "add-subtract", standard: "2.OA.A.1" },
  // T8 Time and money
  { key: "g2-time", type: "tell-time", min: 1, max: 12, name: "Tell time to 5 minutes", subject: "time-money", standard: "2.MD.C.7" },
  { key: "g2-am-pm", type: "am-pm", min: 1, max: 1, name: "a.m. or p.m.", subject: "time-money", standard: "2.MD.C.7" },
  { key: "g2-coins", type: "count-coins", min: 1, max: 99, name: "Count coins", subject: "time-money", standard: "2.MD.C.8" },
  { key: "g2-money-word", type: "money-word", min: 5, max: 45, name: "Dollar word problems", subject: "time-money", standard: "2.MD.C.8" },
  // T9 Numbers to 1,000
  { key: "g2-place-3", type: "place-value-3", min: 1, max: 9, name: "3-digit place value", subject: "place-value", standard: "2.NBT.A.1" },
  { key: "g2-expanded", type: "expanded-form", min: 100, max: 999, name: "Expanded form", subject: "place-value", standard: "2.NBT.A.3" },
  { key: "g2-number-names", type: "number-names", min: 100, max: 999, name: "Number names to 1,000", subject: "place-value", standard: "2.NBT.A.3" },
  { key: "g2-skip-small", type: "skip-small", min: 2, max: 9, name: "Skip count by 2s-9s", subject: "counting", standard: "2.NBT.A.2" },
  { key: "g2-skip-10-flex", type: "skip-10-flex", min: 1, max: 80, name: "Skip count by 10s (any start)", subject: "counting", standard: "2.NBT.A.2" },
  { key: "g2-skip-big", type: "skip-big", min: 20, max: 100, name: "Skip count by 20s, 25s, 50s, 100s", subject: "counting", standard: "2.NBT.A.2" },
  { key: "g2-skip-backward", type: "skip-backward", min: 2, max: 10, name: "Skip count backwards", subject: "counting", standard: "2.NBT.A.2" },
  { key: "g2-compare-99", type: "comparison", min: 21, max: 99, name: "Compare two-digit numbers (21-99)", subject: "counting", standard: "1.NBT.B.3" },
  { key: "g2-compare-999", type: "compare-3digit", min: 100, max: 999, name: "Compare 3-digit numbers", subject: "counting", standard: "2.NBT.A.4" },
  { key: "g2-order", type: "order-numbers", min: 1, max: 99, name: "Order numbers (1-99)", subject: "counting", standard: "2.NBT.A.4" },
  { key: "g2-mental-100", type: "mental-hundred", min: 100, max: 800, name: "Mental plus/minus 100", subject: "place-value", standard: "2.NBT.B.8" },
  // T10 Add within 1,000
  { key: "g2-add-whole-hundreds", type: "add-whole-hundreds", min: 100, max: 900, name: "Add whole hundreds", subject: "place-value", standard: "2.NBT.B.8" },
  { key: "g2-add-harder", type: "add-harder-mixed", min: 10, max: 899, name: "Add mixed 2 & 3-digit numbers", subject: "add-subtract", standard: "2.NBT.B.7" },
  { key: "g2-add-3digit", type: "add-3digit", min: 100, max: 899, name: "Add 3-digit numbers in columns", subject: "add-subtract", standard: "2.NBT.B.7" },
  // T11 Subtract within 1,000
  { key: "g2-sub-single", type: "sub-single-digit", min: 1, max: 999, name: "Subtract a 1-digit number", subject: "add-subtract", standard: "2.NBT.B.5" },
  { key: "g2-sub-whole-tens", type: "sub-whole-tens", min: 10, max: 1000, name: "Subtract whole tens (to 1000)", subject: "place-value", standard: "2.NBT.B.8" },
  { key: "g2-sub-whole-hundreds", type: "sub-whole-hundreds", min: 100, max: 900, name: "Subtract whole hundreds", subject: "place-value", standard: "2.NBT.B.8" },
  { key: "g2-sub-no-regroup", type: "sub-no-regroup", min: 10, max: 899, name: "Subtract within 1000 (no regrouping)", subject: "add-subtract", standard: "2.NBT.B.7" },
  { key: "g2-sub-borrow-hard", type: "sub-borrow-hard", min: 10, max: 999, name: "Subtract within 1000 (borrowing)", subject: "add-subtract", standard: "2.NBT.B.7" },
  // T12 Measuring length
  { key: "g2-length-units", type: "length-units", min: 1, max: 1, name: "Choose a unit of length", subject: "measurement", standard: "2.MD.A.1" },
  { key: "g2-ruler", type: "ruler-measure", min: 2, max: 12, name: "Measure with a ruler", subject: "measurement", standard: "2.MD.A.1" },
  { key: "g2-length-compare", type: "length-compare", min: 5, max: 40, name: "How much longer?", subject: "measurement", standard: "2.MD.A.4" },
  // T13 Shapes
  { key: "g2-shapes", type: "shape-attributes", min: 1, max: 1, name: "Shapes: sides, vertices, faces", subject: "geometry", standard: "2.G.A.1" },
  { key: "g2-partition", type: "partition-rect", min: 2, max: 5, name: "Split rectangles into rows and columns", subject: "geometry", standard: "2.G.A.2" },
  { key: "g2-frac-equal-parts", type: "fraction-equal-parts", min: 2, max: 10, name: "Equal parts (halves, thirds, quarters...)", subject: "fractions", standard: "2.G.A.3" },
  // T14 More addition, subtraction and length
  { key: "g2-number-line", type: "number-line-jump", min: 10, max: 100, name: "Add and subtract on a number line", subject: "add-subtract", standard: "2.MD.B.6" },
  { key: "g2-length-word", type: "length-word", min: 5, max: 50, name: "Length word problems", subject: "measurement", standard: "2.MD.B.5" },
  // T15 Graphs and data
  { key: "g2-picture-graph", type: "picture-graph", min: 1, max: 9, name: "Picture graphs", subject: "data", standard: "2.MD.D.10" },
  { key: "g2-bar-graph", type: "bar-graph", min: 2, max: 15, name: "Bar graphs", subject: "data", standard: "2.MD.D.10" },
  // Beyond Grade 2: times tables, fractions, Grade 3
  { key: "g2-mult-tables-single", type: "mult-tables-single", min: 1, max: 10, name: "Times tables (2, 3, 5, 10)", subject: "times-divide", standard: "3.OA.C.7" },
  { key: "g2-mult-tables-mixed", type: "mult-tables-mixed", min: 1, max: 10, name: "Mixed times tables practice", subject: "times-divide", standard: "3.OA.C.7" },
  { key: "g2-mult-missing-factor", type: "mult-missing-factor", min: 1, max: 10, name: "Missing factor", subject: "times-divide", standard: "3.OA.A.4" },
  { key: "g2-frac-pic-to-frac", type: "fraction-pic-to-frac", min: 2, max: 10, name: "Read a fraction from a picture", subject: "fractions", standard: "3.NF.A.1" },
  { key: "g2-frac-notation", type: "fraction-notation", min: 2, max: 10, name: "Numerator & denominator", subject: "fractions", standard: "3.NF.A.1" },
  { key: "g2-frac-frac-to-pic", type: "fraction-frac-to-pic", min: 2, max: 10, name: "Match a fraction to a picture", subject: "fractions", standard: "3.NF.A.1" },
  { key: "g2-frac-shade", type: "fraction-shade", min: 2, max: 10, name: "Color a fraction (shapes & groups)", subject: "fractions", standard: "3.NF.A.1" },
  { key: "g2-frac-words", type: "fraction-words", min: 1, max: 1, name: "Fractions in words", subject: "fractions", standard: "3.NF.A.1" },
  { key: "g2-frac-of-set", type: "fraction-of-set", min: 6, max: 12, name: "Fractions of a set", subject: "fractions", standard: "3.NF.A.1" },
  { key: "g2-compare-frac-simple", type: "compare-fractions-simple", min: 2, max: 10, name: "Compare fractions (same denominator/numerator)", subject: "fractions", standard: "3.NF.A.3.d" },
  { key: "g2-frac-compare-visual", type: "fraction-compare-visual", min: 2, max: 10, name: "Compare fractions with pictures", subject: "fractions", standard: "3.NF.A.3.d" },
  { key: "g3-mult", type: "multiply", min: 0, max: 10, name: "Multiplication within 100", subject: "times-divide", standard: "3.OA.C.7" },
  { key: "g3-divide", type: "divide", min: 1, max: 10, name: "Division within 100", subject: "times-divide", standard: "3.OA.C.7" },
  { key: "g3-mult-tens", type: "multiply-tens", min: 10, max: 90, name: "Multiply by multiples of 10", subject: "times-divide", standard: "3.NBT.A.3" },
  { key: "g3-mult-by-2", type: "mult-by-2-extended", min: 2, max: 95, name: "Multiply by 2 (bigger numbers)", subject: "times-divide", standard: "3.OA.C.7" },
  { key: "g3-round-ten-small", type: "round-ten-small", min: 1, max: 99, name: "Round to the nearest ten (to 100)", subject: "place-value", standard: "3.NBT.A.1" },
  { key: "g3-round-ten-large", type: "round-ten-large", min: 10, max: 999, name: "Round to the nearest ten (to 1000)", subject: "place-value", standard: "3.NBT.A.1" },
  { key: "g3-round-hundred", type: "round-hundred", min: 10, max: 990, name: "Round to the nearest hundred", subject: "place-value", standard: "3.NBT.A.1" },
  { key: "g3-round", type: "round", min: 10, max: 999, name: "Round to the nearest ten or hundred", subject: "place-value", standard: "3.NBT.A.1" },
  { key: "g3-fraction-line", type: "fraction-line", min: 2, max: 8, name: "Fractions on a number line", subject: "fractions", standard: "3.NF.A.2" },
  { key: "g3-equiv-frac", type: "equiv-fractions", min: 2, max: 8, name: "Equivalent fractions", subject: "fractions", standard: "3.NF.A.3.b" },
  { key: "g3-compare-frac", type: "compare-fractions", min: 2, max: 8, name: "Compare fractions (different denominators)", subject: "fractions", standard: "3.NF.A.3.d" },
  { key: "g3-area", type: "area", min: 2, max: 9, name: "Area of rectangles", subject: "measurement", standard: "3.MD.C.7" },
  { key: "g3-perimeter", type: "perimeter", min: 2, max: 12, name: "Perimeter of polygons", subject: "measurement", standard: "3.MD.D.8" },
];

export function skillsBySubject(subject: SubjectAreaId): SkillDef[] {
  return SKILLS.filter((s) => s.subject === subject);
}

export function findSkill(key: string): SkillDef | undefined {
  return SKILLS.find((s) => s.key === key);
}
