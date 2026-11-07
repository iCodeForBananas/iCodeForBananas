import { describe, it, expect } from "vitest";
import {
  type TopicRecord,
  DEFAULT_RECORD,
  NEW_TOPIC_MOMENTUM,
  PRACTICE_MOMENTUM,
  TOPIC_PROGRESSION,
  advanceRecord,
  maxTierFor,
  nextMomentum,
  selectTopic,
  stretchShare,
  tickTopics,
  topicTier,
} from "./spaceMathSchedule";

// Deterministic PRNG so the simulations below are repeatable
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const learnedRecord: TopicRecord = { correct: 10, attempts: 10, streak: 10, interval: 16, dueIn: 0, learned: true };
const practicingRecord: TopicRecord = { correct: 1, attempts: 2, streak: 0, interval: 1, dueIn: 0, learned: false };

// First ten topics learned, the next one being practiced, the one after untouched
function midwayRecords(): Record<string, TopicRecord> {
  const records: Record<string, TopicRecord> = {};
  TOPIC_PROGRESSION.slice(0, 10).forEach((t) => (records[t.key] = { ...learnedRecord }));
  records[TOPIC_PROGRESSION[10].key] = { ...practicingRecord };
  return records;
}

describe("momentum", () => {
  it("climbs by one per correct answer and resets on a miss", () => {
    expect(nextMomentum(0, true)).toBe(1);
    expect(nextMomentum(5, true)).toBe(6);
    expect(nextMomentum(5, false)).toBe(0);
  });

  it("unlocks harder tiers in order", () => {
    expect(maxTierFor(0)).toBe(0);
    expect(maxTierFor(PRACTICE_MOMENTUM - 1)).toBe(0);
    expect(maxTierFor(PRACTICE_MOMENTUM)).toBe(1);
    expect(maxTierFor(NEW_TOPIC_MOMENTUM)).toBe(2);
  });

  it("gives stretch material a growing, capped share", () => {
    expect(stretchShare(0)).toBe(0);
    let prev = 0;
    for (let m = PRACTICE_MOMENTUM; m < 20; m++) {
      expect(stretchShare(m)).toBeGreaterThanOrEqual(prev);
      expect(stretchShare(m)).toBeLessThanOrEqual(0.8);
      prev = stretchShare(m);
    }
  });
});

describe("selectTopic", () => {
  it("only asks review questions at the start of a round and right after a miss", () => {
    const records = midwayRecords();
    const rng = mulberry32(1);
    for (let i = 0; i < 500; i++) {
      for (let m = 0; m < PRACTICE_MOMENTUM; m++) {
        const t = selectTopic(records, null, m, rng);
        expect(topicTier(records, t.key)).toBe(0);
      }
    }
  });

  it("never introduces a brand-new topic before NEW_TOPIC_MOMENTUM", () => {
    const records = midwayRecords();
    const rng = mulberry32(2);
    for (let i = 0; i < 500; i++) {
      for (let m = 0; m < NEW_TOPIC_MOMENTUM; m++) {
        const t = selectTopic(records, null, m, rng);
        expect(topicTier(records, t.key)).not.toBe(2);
      }
    }
  });

  it("asks more stretch questions the longer the streak", () => {
    const records = midwayRecords();
    const rng = mulberry32(3);
    const stretchRate = (m: number) => {
      let n = 0;
      for (let i = 0; i < 2000; i++) if (topicTier(records, selectTopic(records, null, m, rng).key) > 0) n++;
      return n / 2000;
    };
    const low = stretchRate(PRACTICE_MOMENTUM);
    const high = stretchRate(12);
    expect(low).toBeGreaterThan(0.2);
    expect(high).toBeGreaterThan(low + 0.25);
  });

  it("starts a first-time learner on the first topic", () => {
    expect(selectTopic({}, null, 0, mulberry32(4)).key).toBe(TOPIC_PROGRESSION[0].key);
  });

  it("keeps a first-time learner on what they've tried until momentum builds", () => {
    const records = { [TOPIC_PROGRESSION[0].key]: { ...practicingRecord } };
    const rng = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      expect(selectTopic(records, null, 0, rng).key).toBe(TOPIC_PROGRESSION[0].key);
    }
  });
});

// A learner who almost always gets learned skills right and gets anything
// newer right 60% of the time, playing many 25-correct rounds
describe("simulated rounds", () => {
  function play(seed: number) {
    const rng = mulberry32(seed);
    let records: Record<string, TopicRecord> = {};
    let lastKey: string | null = null;
    const afterMiss: number[] = []; // tier of each question asked right after a miss
    const byPosition: number[][] = Array.from({ length: 25 }, () => []);

    for (let round = 0; round < 30; round++) {
      let momentum = 0;
      let correctCount = 0;
      let asked = 0;
      let lastWasMiss = false;
      while (correctCount < 25 && asked < 200) {
        const topic = selectTopic(records, lastKey, momentum, rng);
        const tier = topicTier(records, topic.key);
        if (lastWasMiss) afterMiss.push(tier);
        if (asked < 25) byPosition[asked].push(tier > 0 ? 1 : 0);
        const correct = rng() < (tier === 0 ? 0.97 : 0.6);
        const updated = advanceRecord(records[topic.key] ?? DEFAULT_RECORD, correct);
        records = tickTopics({ ...records, [topic.key]: updated }, topic.key);
        momentum = nextMomentum(momentum, correct);
        lastKey = topic.key;
        lastWasMiss = !correct;
        if (correct) correctCount++;
        asked++;
      }
    }
    return { records, afterMiss, byPosition };
  }

  it("follows a miss with a review question once anything is learned", () => {
    const { afterMiss } = play(11);
    expect(afterMiss.length).toBeGreaterThan(20);
    // Only a learner with nothing learned yet can get stretch material right after a miss
    const stretchAfterMiss = afterMiss.filter((t) => t > 0).length / afterMiss.length;
    expect(stretchAfterMiss).toBeLessThan(0.05);
  });

  it("gets harder through a round: more stretch late than early", () => {
    const { byPosition } = play(12);
    const share = (rows: number[][]) => {
      const flat = rows.flat();
      return flat.reduce((a, b) => a + b, 0) / flat.length;
    };
    expect(share(byPosition.slice(15, 25))).toBeGreaterThan(share(byPosition.slice(0, 3)) + 0.2);
  });

  it("still makes progress up the ladder", () => {
    const { records } = play(13);
    const learned = Object.values(records).filter((r) => r.learned).length;
    expect(learned).toBeGreaterThan(10);
  });
});
