import { describe, it, expect } from "vitest";
import { emptyProgress, normalizeProgress, recordAnswer, summarizeProgress } from "./progressStore";

const T0 = new Date("2026-11-01T12:00:00Z");
const days = (n: number) => new Date(T0.getTime() + n * 24 * 60 * 60 * 1000);

describe("recordAnswer", () => {
  it("accumulates per-skill totals and counts sessions once", () => {
    let d = emptyProgress();
    d = recordAnswer(d, { skillId: "add-1-5", sessionId: "s1", correct: true, mastered: false }, T0);
    d = recordAnswer(d, { skillId: "add-1-5", sessionId: "s1", correct: false, mastered: false }, T0);
    d = recordAnswer(d, { skillId: "add-1-5", sessionId: "s2", correct: true, mastered: false }, T0);
    expect(d.skills["add-1-5"]).toMatchObject({ correct: 2, total: 3, sessions: 2 });
    expect(d.totalQuestions).toBe(3);
    expect(d.totalSessions).toBe(2);
  });

  it("ignores unknown skills", () => {
    const d = recordAnswer(emptyProgress(), { skillId: "nope", sessionId: "s1", correct: true, mastered: true }, T0);
    expect(d).toEqual(emptyProgress());
  });

  it("keeps mastery sticky after a later miss", () => {
    let d = emptyProgress();
    d = recordAnswer(d, { skillId: "add-1-5", sessionId: "s1", correct: true, mastered: true }, T0);
    d = recordAnswer(d, { skillId: "add-1-5", sessionId: "s1", correct: false, mastered: false }, days(1));
    expect(d.skills["add-1-5"].firstMasteredAt).toBe(T0.toISOString());
  });

  it("prunes recent rows older than two weeks", () => {
    let d = emptyProgress();
    d = recordAnswer(d, { skillId: "add-1-5", sessionId: "s1", correct: true, mastered: false }, T0);
    d = recordAnswer(d, { skillId: "add-1-5", sessionId: "s2", correct: true, mastered: false }, days(20));
    expect(d.recent).toHaveLength(1);
    expect(d.skills["add-1-5"].total).toBe(2);
  });
});

describe("summarizeProgress", () => {
  it("separates newly mastered from reviewed and practicing this week", () => {
    let d = emptyProgress();
    d = recordAnswer(d, { skillId: "add-1-5", sessionId: "s1", correct: true, mastered: true }, T0);
    d = recordAnswer(d, { skillId: "add-1-5", sessionId: "s2", correct: true, mastered: true }, days(10));
    d = recordAnswer(d, { skillId: "sub-1-5", sessionId: "s2", correct: true, mastered: true }, days(10));
    d = recordAnswer(d, { skillId: "add-1-10", sessionId: "s2", correct: false, mastered: false }, days(10));
    const s = summarizeProgress(d, days(10));
    expect(s.week.newlyMastered).toEqual(["Subtract within 5"]);
    expect(s.week.reviewedCount).toBe(1);
    expect(s.week.practicingCount).toBe(1);
    expect(s.week.questions).toBe(3);
    expect(s.overallMasteredCount).toBe(2);
  });
});

describe("normalizeProgress", () => {
  it("falls back to empty on garbage", () => {
    expect(normalizeProgress("x")).toEqual(emptyProgress());
    expect(normalizeProgress({ version: 99 })).toEqual(emptyProgress());
  });
});
