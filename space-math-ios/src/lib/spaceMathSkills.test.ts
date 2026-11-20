import { describe, it, expect } from "vitest";
import { SKILLS, SUBJECT_AREAS } from "./spaceMathSkills";
import { buildProblem } from "./spaceMathGenerator";

describe("spaceMathSkills", () => {
  it("has no duplicate keys", () => {
    const seen = new Set<string>();
    for (const skill of SKILLS) {
      expect(seen.has(skill.key)).toBe(false);
      seen.add(skill.key);
    }
  });

  it("every skill belongs to a known subject area", () => {
    const subjectIds = new Set(SUBJECT_AREAS.map((s) => s.id));
    for (const skill of SKILLS) {
      expect(subjectIds.has(skill.subject)).toBe(true);
    }
  });

  it("every skill's standard code is non-empty", () => {
    for (const skill of SKILLS) {
      expect(skill.standard.length).toBeGreaterThan(0);
    }
  });

  // The guard against drift: if a skill is listed here but the generator has
  // no working branch for its type (removed, typo'd, never wired up), the
  // generator falls back to plain "addition" and this catches it — a skill
  // can't quietly go dark the way topics used to under the old TOPIC_STAGE
  // merge, where a typo in a shared stage id just meant the row never saved.
  it("every skill's generator actually produces a problem of that type", () => {
    for (const skill of SKILLS) {
      for (let i = 0; i < 5; i++) {
        const problem = buildProblem(skill.type, skill.min, skill.max);
        expect(problem.type, `${skill.key} (${skill.type})`).toBe(skill.type);
      }
    }
  });
});
