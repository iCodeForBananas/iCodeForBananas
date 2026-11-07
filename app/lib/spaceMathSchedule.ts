// What Space Math asks next. Two layers:
//
// 1. Across rounds, a spaced-repetition ladder per topic (TopicRecord). A
//    correct answer moves a topic up the interval ladder, a miss knocks it
//    down, and a topic counts as learned once it reaches LEARNED_INTERVAL.
//    Learned topics plus the next few unlearned ones are "unlocked".
//
// 2. Within a round, momentum: the number of questions in a row answered
//    right. Each question gets one answer. It starts at zero every round and drops back to zero on
//    any miss. Momentum decides how hard the next question is allowed to be:
//
//      momentum 0-1   review only: skills already learned, the solid ones first
//      momentum 2-3   plus skills already being practiced
//      momentum 4+    plus brand-new skills
//
//    and once stretch material is allowed, its share of the questions grows
//    with each further correct answer. So every round warms up on things the
//    learner can do and climbs toward new material, and a miss pulls them back
//    to solid ground for a couple of questions before feeding the harder
//    material back in.

import { type ProblemType, SKILLS } from "./spaceMathSkills";

export interface TopicRecord {
  correct: number;
  attempts: number;
  streak: number; // consecutive correct answers
  interval: number; // questions to wait before this topic comes back
  dueIn: number; // countdown to next review
  learned: boolean; // has reached LEARNED_INTERVAL at least once
}

export interface TopicDef {
  key: string;
  type: ProblemType;
  min: number;
  max: number;
}

// Review intervals, counted in questions asked. High rungs are the point: a
// solid skill stays in the mix but only resurfaces every 30-60 questions.
export const INTERVAL_STEPS = [1, 2, 4, 8, 16, 32, 60];

// A topic counts as learned once it reaches this interval. Learned topics are
// never retired; they just come back rarely, as reinforcement.
export const LEARNED_INTERVAL = 8;

// How many not-yet-learned topics may be unlocked at once. New material is
// only handed out when the learner is under this many, which keeps the
// progression linear instead of dumping the whole syllabus in at once.
export const LEARNING_CAP = 3;

// Momentum needed before skills still being practiced come back into the mix.
export const PRACTICE_MOMENTUM = 2;

// Momentum needed before a brand-new skill is introduced.
export const NEW_TOPIC_MOMENTUM = 4;

// One linear ladder of skills, easiest first, derived from SKILLS.
export const TOPIC_PROGRESSION: TopicDef[] = SKILLS.map(({ key, type, min, max }) => ({ key, type, min, max }));

export const DEFAULT_RECORD: TopicRecord = { correct: 0, attempts: 0, streak: 0, interval: 1, dueIn: 0, learned: false };

// Fill in fields older saves didn't have, and drop keys no longer on the ladder
export function normalizeRecords(raw: unknown): Record<string, TopicRecord> {
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

// A miss drops the topic two rungs rather than all the way back, so one slip
// on a solid skill turns into a check-in, not a drill
function stepDown(interval: number): number {
  const idx = INTERVAL_STEPS.findIndex((s) => s >= interval);
  const from = idx === -1 ? INTERVAL_STEPS.length - 1 : idx;
  return INTERVAL_STEPS[Math.max(0, from - 2)];
}

// Everything the learner has reached so far: all learned topics plus the next
// few still being learned. Nothing ever leaves this set.
export function unlockedTopics(records: Record<string, TopicRecord>): TopicDef[] {
  const out: TopicDef[] = [];
  let learning = 0;
  for (const t of TOPIC_PROGRESSION) {
    out.push(t);
    if (!records[t.key]?.learned) learning++;
    if (learning >= LEARNING_CAP) break;
  }
  return out;
}

// 0 = learned (review), 1 = being practiced, 2 = never tried
export function topicTier(records: Record<string, TopicRecord>, key: string): 0 | 1 | 2 {
  const r = records[key];
  if (r?.learned) return 0;
  return (r?.attempts ?? 0) > 0 ? 1 : 2;
}

// Hardest tier the current momentum allows
export function maxTierFor(momentum: number): 0 | 1 | 2 {
  if (momentum >= NEW_TOPIC_MOMENTUM) return 2;
  if (momentum >= PRACTICE_MOMENTUM) return 1;
  return 0;
}

// Chance the next question is stretch material (practiced or new) rather than
// review, once stretch material is allowed at all. Climbs with each correct
// answer in a row: 35% at the threshold, up to 80%.
export function stretchShare(momentum: number): number {
  if (momentum < PRACTICE_MOMENTUM) return 0;
  return Math.min(0.8, 0.35 + 0.1 * (momentum - PRACTICE_MOMENTUM));
}

function accuracyOf(r: TopicRecord): number {
  return r.attempts > 0 ? r.correct / r.attempts : 0.5;
}

function weightedPick<T>(items: T[], weights: number[], rng: () => number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let rand = rng() * total;
  for (let i = 0; i < items.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return items[i];
  }
  return items[items.length - 1];
}

// Spaced-repetition pick: due topics first, weighted toward overdue, shaky and
// brand-new ones
function pickBySchedule(
  candidates: TopicDef[],
  records: Record<string, TopicRecord>,
  lastKey: string | null,
  rng: () => number,
): TopicDef {
  const due = candidates.filter((t) => (records[t.key]?.dueIn ?? 0) <= 0);
  const pool = due.length > 0 ? due : candidates;
  const weights = pool.map((t) => {
    const r = records[t.key] ?? DEFAULT_RECORD;
    const interval = Math.max(r.interval, 1);
    const ripeness = (interval - r.dueIn) / interval; // 1 exactly at due, >1 overdue
    const need = 1.5 - accuracyOf(r); // shaky topics get a bigger share
    const fresh = r.attempts === 0 ? 2 : 1;
    const repeat = t.key === lastKey ? 0.15 : 1; // avoid back-to-back repeats
    return Math.max(ripeness, 0.02) ** 2 * need * fresh * repeat;
  });
  return weightedPick(pool, weights, rng);
}

// Confidence pick, for warming up and recovering after a miss: favor the
// skills answered most reliably, and among those the more advanced ones, so
// the learner lands on solid ground that is still close to where they are.
function pickForConfidence(
  candidates: TopicDef[],
  records: Record<string, TopicRecord>,
  lastKey: string | null,
  rng: () => number,
): TopicDef {
  const weights = candidates.map((t, i) => {
    const r = records[t.key] ?? DEFAULT_RECORD;
    const accuracy = accuracyOf(r);
    const nearFrontier = 0.5 + (i + 1) / candidates.length; // ladder order, 0.5..1.5
    const repeat = t.key === lastKey ? 0.15 : 1;
    return Math.max(accuracy, 0.05) ** 3 * nearFrontier * repeat;
  });
  return weightedPick(candidates, weights, rng);
}

// Pick the next topic for a learner with this much momentum in the round.
export function selectTopic(
  records: Record<string, TopicRecord>,
  lastKey: string | null,
  momentum: number,
  rng: () => number = Math.random,
): TopicDef {
  const pool = unlockedTopics(records);
  const review = pool.filter((t) => topicTier(records, t.key) === 0);
  const maxTier = maxTierFor(momentum);
  const stretch = pool.filter((t) => {
    const tier = topicTier(records, t.key);
    return tier >= 1 && tier <= maxTier;
  });

  if (stretch.length > 0 && (review.length === 0 || rng() < stretchShare(momentum))) {
    return pickBySchedule(stretch, records, lastKey, rng);
  }
  if (review.length > 0) {
    return momentum < PRACTICE_MOMENTUM
      ? pickForConfidence(review, records, lastKey, rng)
      : pickBySchedule(review, records, lastKey, rng);
  }

  // Nothing learned yet and nothing stretch allowed: a first-time learner.
  // Stay on the easiest material available, preferring skills already tried.
  const practiced = pool.filter((t) => topicTier(records, t.key) === 1);
  if (practiced.length > 0) return pickBySchedule(practiced, records, lastKey, rng);
  return pool[0];
}

// Spaced repetition: correct moves the topic up the interval ladder, a miss
// moves it down
export function advanceRecord(record: TopicRecord, correct: boolean): TopicRecord {
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
export function tickTopics(records: Record<string, TopicRecord>, exceptKey: string): Record<string, TopicRecord> {
  const out: Record<string, TopicRecord> = {};
  for (const [k, v] of Object.entries(records)) {
    out[k] = k === exceptKey ? v : { ...v, dueIn: Math.max(0, v.dueIn - 1) };
  }
  return out;
}

// Momentum after an answer: a correct answer adds one, a miss resets it.
export function nextMomentum(momentum: number, correct: boolean): number {
  return correct ? momentum + 1 : 0;
}
