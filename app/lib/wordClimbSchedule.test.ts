import { describe, it, expect } from "vitest";
import { CARDS, LEVELS } from "./wordClimbContent";
import {
  type CardState,
  type CardStates,
  MIN_EASE,
  NEW_CARD_STATE,
  REDRILL_GAP,
  ROUND_SIZE,
  addDays,
  advanceQueue,
  applyGrade,
  buildRound,
  dueCards,
  levelProgress,
  localDay,
  newCards,
  nextEase,
  parseCardState,
  topUpQueue,
  unlockedLevelCount,
} from "./wordClimbSchedule";

const TODAY = "2026-11-09";
const grade = (state: CardState, g: Parameters<typeof applyGrade>[1], day = TODAY) => applyGrade(state, g, day, 1000);

/** Marks a share of one level as read without help. */
function secureLevel(states: CardStates, levelIndex: number, share = 1): CardStates {
  const cards = CARDS.filter((card) => card.levelIndex === levelIndex);
  const next = { ...states };
  cards.slice(0, Math.ceil(cards.length * share)).forEach((card) => {
    next[card.id] = grade(NEW_CARD_STATE, "good");
  });
  return next;
}

describe("dates", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 6)).toBe("2027-01-06");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("formats the local day with padding", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});

describe("SM-2", () => {
  it("matches the published ease formula", () => {
    expect(nextEase(2.5, 5)).toBeCloseTo(2.6);
    expect(nextEase(2.5, 4)).toBeCloseTo(2.5);
    expect(nextEase(2.5, 3)).toBeCloseTo(2.36);
  });

  it("never lets the ease fall below 1.3", () => {
    expect(nextEase(1.3, 3)).toBe(MIN_EASE);
  });

  it("schedules 1 day, then 6 days, then interval times ease rounded up", () => {
    const first = grade(NEW_CARD_STATE, "good");
    expect([first.intervalDays, first.dueOn]).toEqual([1, "2026-11-10"]);
    const second = grade(first, "good");
    expect([second.intervalDays, second.dueOn]).toEqual([6, "2026-11-15"]);
    expect(grade(second, "good").intervalDays).toBe(15);
    expect(grade(second, "easy").intervalDays).toBe(Math.ceil(6 * 2.6));
  });

  it("restarts a missed card without changing its ease", () => {
    const learned = grade(grade(NEW_CARD_STATE, "easy"), "easy");
    const missed = grade(learned, "again");
    expect(missed).toMatchObject({ reps: 0, intervalDays: 1, ease: learned.ease, lapses: 1, dueOn: "2026-11-10" });
  });

  it("doesn't call a first-time miss a lapse", () => {
    expect(grade(NEW_CARD_STATE, "again").lapses).toBe(0);
  });

  it("treats Hard as a pass that lowers the ease", () => {
    const hard = grade(NEW_CARD_STATE, "hard");
    expect(hard.reps).toBe(1);
    expect(hard.ease).toBeCloseTo(2.36);
  });

  it("only marks a card secure on Good or Easy", () => {
    expect(grade(NEW_CARD_STATE, "again").secure).toBe(false);
    expect(grade(NEW_CARD_STATE, "hard").secure).toBe(false);
    expect(grade(NEW_CARD_STATE, "good").secure).toBe(true);
    expect(grade(NEW_CARD_STATE, "easy").secure).toBe(true);
  });

  it("keeps a card secure after a later miss", () => {
    expect(grade(grade(NEW_CARD_STATE, "good"), "again").secure).toBe(true);
  });
});

describe("unlocking", () => {
  it("starts with only the first level open", () => {
    expect(unlockedLevelCount({})).toBe(1);
    expect(new Set(newCards({}).map((card) => card.levelIndex))).toEqual(new Set([0]));
  });

  it("stays locked one card short of the threshold", () => {
    const { needed } = levelProgress({}, 0);
    const cards = CARDS.filter((card) => card.levelIndex === 0).slice(0, needed - 1);
    const states = Object.fromEntries(cards.map((card) => [card.id, grade(NEW_CARD_STATE, "good")]));
    expect(unlockedLevelCount(states)).toBe(1);
  });

  it("opens the next level at 80% read without help", () => {
    expect(unlockedLevelCount(secureLevel({}, 0, 0.8))).toBe(2);
  });

  it("isn't opened by Hard grades", () => {
    const states = Object.fromEntries(
      CARDS.filter((card) => card.levelIndex === 0).map((card) => [card.id, grade(NEW_CARD_STATE, "hard")]),
    );
    expect(unlockedLevelCount(states)).toBe(1);
  });

  it("stays open after later misses", () => {
    const states = secureLevel({}, 0);
    for (const card of CARDS.filter((c) => c.levelIndex === 0)) states[card.id] = grade(states[card.id], "again");
    expect(unlockedLevelCount(states)).toBe(2);
  });

  it("can reach the top of the ladder and stop", () => {
    let states: CardStates = {};
    LEVELS.forEach((_, index) => {
      states = secureLevel(states, index);
    });
    expect(unlockedLevelCount(states)).toBe(LEVELS.length);
  });
});

describe("sessions", () => {
  it("starts a new child on the first level's words, easiest first", () => {
    const firstLevel = CARDS.filter((card) => card.levelIndex === 0);
    expect(buildRound({}, TODAY).map((item) => item.cardId)).toEqual(firstLevel.map((card) => card.id));
  });

  it("caps a round at 25 cards", () => {
    let states: CardStates = {};
    LEVELS.forEach((_, index) => {
      states = secureLevel(states, index);
    });
    const allDue = Object.fromEntries(Object.entries(states).map(([id, state]) => [id, { ...state, dueOn: TODAY }]));
    expect(ROUND_SIZE).toBe(25);
    expect(buildRound(allDue, TODAY)).toHaveLength(25);
  });

  it("fills the round from a level that opens partway through", () => {
    const states = secureLevel({}, 0);
    const next = topUpQueue([], states, TODAY, 5);
    expect(next).toHaveLength(5);
    for (const item of next) expect(CARDS.find((card) => card.id === item.cardId)?.levelIndex).toBe(1);
  });

  it("keeps a repeat ahead of filler and doesn't queue a card twice", () => {
    const repeat = { cardId: CARDS[0].id, redrill: true };
    const next = topUpQueue([repeat], {}, TODAY, 4);
    expect(next[0]).toEqual(repeat);
    expect(new Set(next.map((item) => item.cardId)).size).toBe(4);
  });

  it("drops what no longer fits when the round runs out of slots", () => {
    const queue = CARDS.slice(0, 3).map((card) => ({ cardId: card.id, redrill: false }));
    expect(topUpQueue(queue, {}, TODAY, 2)).toEqual(queue.slice(0, 2));
    expect(topUpQueue(queue, {}, TODAY, 0)).toEqual([]);
    expect(topUpQueue(queue, {}, TODAY, -1)).toEqual([]);
  });

  it("puts due reviews ahead of new cards, oldest first", () => {
    const [a, b] = CARDS;
    const states: CardStates = {
      [a.id]: { ...grade(NEW_CARD_STATE, "good"), dueOn: "2026-11-09" },
      [b.id]: { ...grade(NEW_CARD_STATE, "good"), dueOn: "2026-11-01" },
    };
    expect(buildRound(states, TODAY).slice(0, 2).map((item) => item.cardId)).toEqual([b.id, a.id]);
  });

  it("doesn't show a card again before it's due", () => {
    const states = { [CARDS[0].id]: grade(NEW_CARD_STATE, "good") };
    expect(dueCards(states, TODAY)).toEqual([]);
    expect(dueCards(states, "2026-11-10").map((card) => card.id)).toEqual([CARDS[0].id]);
  });

  it("treats an undone card as new again", () => {
    const states = { [CARDS[0].id]: { ...NEW_CARD_STATE, updatedAt: 5 } };
    expect(newCards(states)[0].id).toBe(CARDS[0].id);
    expect(dueCards(states, "2030-01-01")).toEqual([]);
  });

  const queue = ["a", "b", "c", "d", "e", "f"].map((cardId) => ({ cardId, redrill: false }));

  it.each(["good", "easy"] as const)("drops a card graded %s", (g) => {
    expect(advanceQueue(queue, g).map((item) => item.cardId)).toEqual(["b", "c", "d", "e", "f"]);
  });

  it.each(["again", "hard"] as const)("brings a card graded %s back after a gap", (g) => {
    const next = advanceQueue(queue, g);
    expect(next).toHaveLength(6);
    expect(next[REDRILL_GAP]).toEqual({ cardId: "a", redrill: true });
  });

  it("repeats the last card when nothing else is left", () => {
    expect(advanceQueue([queue[0]], "again")).toEqual([{ cardId: "a", redrill: true }]);
  });
});

describe("saved progress", () => {
  const saved = grade(NEW_CARD_STATE, "good");

  it("accepts a real state", () => {
    expect(parseCardState(saved)).toEqual(saved);
    expect(parseCardState(NEW_CARD_STATE)).toEqual(NEW_CARD_STATE);
  });

  it.each([
    ["null", null],
    ["a string", "x"],
    ["a bad grade", { ...saved, lastGrade: "great" }],
    ["a bad date", { ...saved, dueOn: "tomorrow" }],
    ["an ease under the floor", { ...saved, ease: 1 }],
    ["a negative count", { ...saved, reps: -1 }],
    ["a fractional count", { ...saved, reviews: 1.5 }],
    ["a missing field", { ...saved, secure: undefined }],
  ])("rejects %s", (_name, value) => {
    expect(parseCardState(value)).toBeNull();
  });
});
