/**
 * Word Climb's scheduler: SuperMemo SM-2 (Wozniak, 1987) plus the rules for
 * moving up the reading ladder. Pure functions, so "today" is always passed in.
 *
 * The four buttons map onto SM-2's 0-5 quality scale the way Anki's do:
 *
 *   Again 1   needed help              repetitions reset, due tomorrow
 *   Hard  3   got it, with a struggle  counts as a pass, ease drops 0.14
 *   Good  4   read it without help     ease unchanged
 *   Easy  5   read it instantly        ease rises 0.10
 *
 * Intervals are SM-2's: 1 day, then 6 days, then the previous interval times
 * the ease, rounded up. Below quality 3 the ease stays where it was. Also from
 * SM-2: cards graded under 4 are repeated within the session until they reach
 * 4. Those repeats come straight after the child was helped, so they don't
 * change the schedule and don't count toward unlocking the next level.
 */

import { CARDS, LEVELS, type Card } from "./wordClimbContent";

export type Grade = "again" | "hard" | "good" | "easy";

export const GRADE_QUALITY: Record<Grade, number> = { again: 1, hard: 3, good: 4, easy: 5 };

export const INITIAL_EASE = 2.5;
export const MIN_EASE = 1.3;

/** Share of a level that must be read without help to open the next one. */
export const UNLOCK_SHARE = 0.8;
/** Flashcards shown per round, counting same-round repeats. */
export const ROUND_SIZE = 25;
/** Cards that pass between a missed card and its repeat. */
export const REDRILL_GAP = 3;

export interface CardState {
  reps: number;
  ease: number;
  intervalDays: number;
  /** Local calendar day, YYYY-MM-DD. Null until the card has been graded. */
  dueOn: string | null;
  /** Ever graded Good or Easy on a scheduled pass. Sticky, so a level can't re-lock. */
  secure: boolean;
  lapses: number;
  reviews: number;
  lastGrade: Grade | null;
  /** Epoch ms of the last change, used to merge this device with the server. */
  updatedAt: number;
}

export type CardStates = Record<string, CardState>;

export const NEW_CARD_STATE: CardState = {
  reps: 0,
  ease: INITIAL_EASE,
  intervalDays: 0,
  dueOn: null,
  secure: false,
  lapses: 0,
  reviews: 0,
  lastGrade: null,
  updatedAt: 0,
};

// ─── Dates ────────────────────────────────────────────────────────────────────

/** The local calendar day. A card is due on a day, not at an hour. */
export function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// ─── SM-2 ─────────────────────────────────────────────────────────────────────

export function nextEase(ease: number, quality: number): number {
  const miss = 5 - quality;
  return Math.max(MIN_EASE, ease + (0.1 - miss * (0.08 + miss * 0.02)));
}

/** Applies one scheduled grade. */
export function applyGrade(state: CardState, grade: Grade, today: string, now: number): CardState {
  const quality = GRADE_QUALITY[grade];
  const base = { ...state, reviews: state.reviews + 1, lastGrade: grade, updatedAt: now };

  if (quality < 3) {
    return {
      ...base,
      reps: 0,
      intervalDays: 1,
      dueOn: addDays(today, 1),
      lapses: state.reviews > 0 ? state.lapses + 1 : state.lapses,
    };
  }

  const ease = nextEase(state.ease, quality);
  const intervalDays = state.reps === 0 ? 1 : state.reps === 1 ? 6 : Math.ceil(state.intervalDays * ease);
  return {
    ...base,
    ease,
    intervalDays,
    reps: state.reps + 1,
    dueOn: addDays(today, intervalDays),
    secure: state.secure || quality >= 4,
  };
}

// ─── The ladder ───────────────────────────────────────────────────────────────

const CARDS_BY_LEVEL: Card[][] = LEVELS.map((_, index) => CARDS.filter((card) => card.levelIndex === index));

export interface LevelProgress {
  secure: number;
  total: number;
  /** Secure cards needed to open the next level. */
  needed: number;
}

export function levelProgress(states: CardStates, levelIndex: number): LevelProgress {
  const cards = CARDS_BY_LEVEL[levelIndex];
  return {
    secure: cards.filter((card) => states[card.id]?.secure).length,
    total: cards.length,
    needed: Math.ceil(cards.length * UNLOCK_SHARE),
  };
}

/** How many levels are open, counted from the bottom of the ladder. Always at least one. */
export function unlockedLevelCount(states: CardStates): number {
  let count = 1;
  while (count < LEVELS.length) {
    const { secure, needed } = levelProgress(states, count - 1);
    if (secure < needed) break;
    count++;
  }
  return count;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export interface QueueItem {
  cardId: string;
  /** A same-session repeat of a missed card, which leaves the schedule alone. */
  redrill: boolean;
}

export function dueCards(states: CardStates, today: string): Card[] {
  return CARDS.filter((card) => {
    const due = states[card.id]?.dueOn;
    return !!due && states[card.id].reviews > 0 && due <= today;
  }).sort((a, b) => states[a.id].dueOn!.localeCompare(states[b.id].dueOn!));
}

export function newCards(states: CardStates): Card[] {
  const unlocked = unlockedLevelCount(states);
  return CARDS.filter((card) => card.levelIndex < unlocked && !states[card.id]?.reviews);
}

/**
 * Trims the queue to the slots left in the round, then fills any gap: reviews
 * first, overdue before due, then new cards up the ladder. Filling as the round
 * goes means a level that opens mid-round feeds its cards into the same round.
 */
export function topUpQueue(queue: QueueItem[], states: CardStates, today: string, slots: number): QueueItem[] {
  const open = Math.max(0, slots);
  const kept = queue.slice(0, open);
  const queued = new Set(kept.map((item) => item.cardId));
  const extra = [...dueCards(states, today), ...newCards(states)]
    .filter((card) => !queued.has(card.id))
    .slice(0, open - kept.length)
    .map((card) => ({ cardId: card.id, redrill: false }));
  return [...kept, ...extra];
}

export function buildRound(states: CardStates, today: string): QueueItem[] {
  return topUpQueue([], states, today, ROUND_SIZE);
}

/** Moves past the card at the front, sending it back in if it scored under Good. */
export function advanceQueue(queue: QueueItem[], grade: Grade): QueueItem[] {
  const [current, ...rest] = queue;
  if (!current || GRADE_QUALITY[grade] >= 4) return rest;
  const at = Math.min(REDRILL_GAP, rest.length);
  return [...rest.slice(0, at), { cardId: current.cardId, redrill: true }, ...rest.slice(at)];
}

// ─── Saved progress ───────────────────────────────────────────────────────────

const GRADES: readonly string[] = Object.keys(GRADE_QUALITY);
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const isCount = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < 1_000_000;

/** Validates a state that came from the network. */
export function parseCardState(value: unknown): CardState | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const validDay = v.dueOn === null || (typeof v.dueOn === "string" && DAY_PATTERN.test(v.dueOn));
  const validGrade = v.lastGrade === null || (typeof v.lastGrade === "string" && GRADES.includes(v.lastGrade));
  const validEase = typeof v.ease === "number" && Number.isFinite(v.ease) && v.ease >= MIN_EASE && v.ease < 100;
  const validTime = typeof v.updatedAt === "number" && Number.isFinite(v.updatedAt) && v.updatedAt >= 0;
  if (!validDay || !validGrade || !validEase || !validTime) return null;
  if (!isCount(v.reps) || !isCount(v.intervalDays) || !isCount(v.lapses) || !isCount(v.reviews)) return null;
  if (typeof v.secure !== "boolean") return null;
  return {
    reps: v.reps as number,
    ease: v.ease as number,
    intervalDays: v.intervalDays as number,
    dueOn: v.dueOn as string | null,
    secure: v.secure,
    lapses: v.lapses as number,
    reviews: v.reviews as number,
    lastGrade: v.lastGrade as Grade | null,
    updatedAt: v.updatedAt as number,
  };
}
