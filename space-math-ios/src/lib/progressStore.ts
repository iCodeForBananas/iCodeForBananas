// On-device progress history. The web version of Space Math posted one row
// per answered question to Supabase and computed the parent view on the
// server; the iPad app keeps the same information in localStorage instead.
//
// Raw per-question rows would grow without bound, so history is kept in two
// layers:
//   - `skills`: lifetime totals per skill, updated on every answer
//   - `recent`: the raw rows from the last RECENT_DAYS, for the "this week" view
//
// Everything here except load/save is a pure function of its arguments.

import { SKILLS, SUBJECT_AREAS, findSkill, type SubjectAreaId } from "./spaceMathSkills";

export const PROGRESS_KEY = "space-math-progress";
const RECENT_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SkillTotals {
  correct: number;
  total: number;
  sessions: number;
  lastSessionId: string | null;
  lastPlayed: string | null;
  firstMasteredAt: string | null;
}

export interface RecentRow {
  skillId: string;
  sessionId: string;
  correct: boolean;
  at: string; // ISO timestamp
}

export interface ProgressData {
  version: 1;
  skills: Record<string, SkillTotals>;
  recent: RecentRow[];
  totalSessions: number;
  totalQuestions: number;
  lastSessionId: string | null;
}

export function emptyProgress(): ProgressData {
  return { version: 1, skills: {}, recent: [], totalSessions: 0, totalQuestions: 0, lastSessionId: null };
}

export function recordAnswer(
  data: ProgressData,
  answer: { skillId: string; sessionId: string; correct: boolean; mastered: boolean },
  now: Date = new Date(),
): ProgressData {
  if (!findSkill(answer.skillId)) return data;
  const at = now.toISOString();
  const prev: SkillTotals = data.skills[answer.skillId] ?? {
    correct: 0,
    total: 0,
    sessions: 0,
    lastSessionId: null,
    lastPlayed: null,
    firstMasteredAt: null,
  };
  const next: SkillTotals = {
    correct: prev.correct + (answer.correct ? 1 : 0),
    total: prev.total + 1,
    sessions: prev.sessions + (prev.lastSessionId === answer.sessionId ? 0 : 1),
    lastSessionId: answer.sessionId,
    lastPlayed: at,
    firstMasteredAt: prev.firstMasteredAt ?? (answer.mastered ? at : null),
  };
  const cutoff = now.getTime() - RECENT_DAYS * DAY_MS;
  const recent = [
    ...data.recent.filter((r) => Date.parse(r.at) >= cutoff),
    { skillId: answer.skillId, sessionId: answer.sessionId, correct: answer.correct, at },
  ];
  return {
    ...data,
    skills: { ...data.skills, [answer.skillId]: next },
    recent,
    totalQuestions: data.totalQuestions + 1,
    totalSessions: data.totalSessions + (data.lastSessionId === answer.sessionId ? 0 : 1),
    lastSessionId: answer.sessionId,
  };
}

export function normalizeProgress(raw: unknown): ProgressData {
  if (!raw || typeof raw !== "object" || (raw as ProgressData).version !== 1) return emptyProgress();
  const r = raw as ProgressData;
  return {
    version: 1,
    skills: r.skills && typeof r.skills === "object" ? r.skills : {},
    recent: Array.isArray(r.recent) ? r.recent : [],
    totalSessions: r.totalSessions ?? 0,
    totalQuestions: r.totalQuestions ?? 0,
    lastSessionId: r.lastSessionId ?? null,
  };
}

export function loadProgress(): ProgressData {
  try {
    return normalizeProgress(JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "null"));
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(data: ProgressData) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save progress", e);
  }
}

// ── Parent view summary ──────────────────────────────────────────────────────

export type SkillStatus = "mastered" | "practicing" | "not-started";

export interface SkillStat {
  key: string;
  name: string;
  standard: string;
  status: SkillStatus;
  correct: number;
  total: number;
  accuracy: number | null;
  sessionCount: number;
  lastPlayed: string | null;
}

export interface SubjectStat {
  id: SubjectAreaId;
  label: string;
  description: string;
  masteredCount: number;
  practicingCount: number;
  totalCount: number;
  skills: SkillStat[];
}

export interface ProgressSummary {
  subjects: SubjectStat[];
  overallMasteredCount: number;
  overallTotalCount: number;
  totalSessions: number;
  totalQuestions: number;
  week: {
    newlyMastered: string[];
    practicingCount: number;
    reviewedCount: number;
    questions: number;
    accuracy: number | null;
  };
}

export function summarizeProgress(data: ProgressData, now: Date = new Date()): ProgressSummary {
  const weekAgo = now.getTime() - 7 * DAY_MS;
  const weekRows = data.recent.filter((r) => Date.parse(r.at) >= weekAgo);
  const weekSkills = new Set(weekRows.map((r) => r.skillId));

  const stats: Record<string, SkillStat> = {};
  for (const skill of SKILLS) {
    const t = data.skills[skill.key];
    const total = t?.total ?? 0;
    const correct = t?.correct ?? 0;
    stats[skill.key] = {
      key: skill.key,
      name: skill.name,
      standard: skill.standard,
      status: t?.firstMasteredAt ? "mastered" : total > 0 ? "practicing" : "not-started",
      correct,
      total,
      accuracy: total > 0 ? correct / total : null,
      sessionCount: t?.sessions ?? 0,
      lastPlayed: t?.lastPlayed ?? null,
    };
  }

  const newlyMastered: string[] = [];
  let practicingCount = 0;
  let reviewedCount = 0;
  for (const skill of SKILLS) {
    if (!weekSkills.has(skill.key)) continue;
    const t = data.skills[skill.key];
    if (t?.firstMasteredAt && Date.parse(t.firstMasteredAt) >= weekAgo) newlyMastered.push(skill.name);
    else if (t?.firstMasteredAt) reviewedCount++;
    else practicingCount++;
  }

  const weekCorrect = weekRows.filter((r) => r.correct).length;

  return {
    subjects: SUBJECT_AREAS.map((area) => {
      const skills = SKILLS.filter((s) => s.subject === area.id).map((s) => stats[s.key]);
      return {
        id: area.id,
        label: area.label,
        description: area.description,
        masteredCount: skills.filter((s) => s.status === "mastered").length,
        practicingCount: skills.filter((s) => s.status === "practicing").length,
        totalCount: skills.length,
        skills,
      };
    }),
    overallMasteredCount: SKILLS.filter((s) => stats[s.key].status === "mastered").length,
    overallTotalCount: SKILLS.length,
    totalSessions: data.totalSessions,
    totalQuestions: data.totalQuestions,
    week: {
      newlyMastered,
      practicingCount,
      reviewedCount,
      questions: weekRows.length,
      accuracy: weekRows.length > 0 ? weekCorrect / weekRows.length : null,
    },
  };
}
