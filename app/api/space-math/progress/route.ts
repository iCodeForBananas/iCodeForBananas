import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SKILLS, SUBJECT_AREAS, findSkill, type SubjectAreaId } from "../../../lib/spaceMathSkills";

export const dynamic = "force-dynamic";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}

// ── POST: save one topic's result ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { player_name, session_id, skill_id, correct, total, mastered } = body;

    if (!session_id || !skill_id) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const skill = findSkill(skill_id);

    const db = supabase();
    const { error } = await db.from("space_math_progress").insert({
      player_name: player_name ?? "cai",
      session_id,
      skill_id,
      skill_label: skill?.name ?? skill_id,
      skill_category: skill?.subject ?? null,
      correct,
      total,
      mastered,
    });
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to save" },
      { status: 500 }
    );
  }
}

// ── GET: return progress grouped by parent-facing subject area ───────────────

type SkillStatus = "mastered" | "practicing" | "not-started";

interface SkillStat {
  key: string;
  name: string;
  standard: string;
  status: SkillStatus;
  correct: number;
  total: number;
  accuracy: number | null;
  sessionCount: number;
  lastPlayed: string | null;
  reviewedThisWeek: number; // distinct sessions this skill came up in, last 7 days
}

interface SubjectStat {
  id: SubjectAreaId;
  label: string;
  description: string;
  masteredCount: number;
  practicingCount: number;
  notStartedCount: number;
  totalCount: number;
  skills: SkillStat[];
}

export async function GET(req: NextRequest) {
  try {
    const player = req.nextUrl.searchParams.get("player") ?? "cai";
    const db = supabase();

    const { data, error } = await db
      .from("space_math_progress")
      .select("*")
      .eq("player_name", player)
      .order("played_at", { ascending: true });

    if (error) throw error;

    // Legacy rows from before the skill_id migration carry their old numeric
    // stage id (as text) and don't match any current skill key — they stay
    // in the table as history but aren't attributable to one specific skill
    // under the new one-row-per-topic model, so they're excluded from the
    // per-skill/per-subject breakdown below (and from totalQuestions, so
    // the headline count only reflects what's actually attributable).
    const rows = (data ?? []).filter((r) => findSkill(r.skill_id));

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const rowsBySkill = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = rowsBySkill.get(row.skill_id);
      if (list) list.push(row);
      else rowsBySkill.set(row.skill_id, [row]);
    }

    const skillStats: Record<string, SkillStat> = {};
    for (const skill of SKILLS) {
      const skillRows = rowsBySkill.get(skill.key) ?? [];
      const correct = skillRows.reduce((s, r) => s + (r.correct ?? 0), 0);
      const total = skillRows.reduce((s, r) => s + (r.total ?? 0), 0);
      const mastered = skillRows.some((r) => r.mastered);
      const lastPlayed = skillRows.reduce<string | null>(
        (latest, r) => (!latest || r.played_at > latest ? r.played_at : latest),
        null
      );
      const recentRows = skillRows.filter((r) => r.played_at >= sevenDaysAgo);
      const status: SkillStatus = mastered ? "mastered" : total > 0 ? "practicing" : "not-started";

      skillStats[skill.key] = {
        key: skill.key,
        name: skill.name,
        standard: skill.standard,
        status,
        correct,
        total,
        accuracy: total > 0 ? correct / total : null,
        sessionCount: new Set(skillRows.map((r) => r.session_id)).size,
        lastPlayed,
        reviewedThisWeek: new Set(recentRows.map((r) => r.session_id)).size,
      };
    }

    const subjects: SubjectStat[] = SUBJECT_AREAS.map((area) => {
      const skillsInArea = SKILLS.filter((s) => s.subject === area.id).map((s) => skillStats[s.key]);
      return {
        id: area.id,
        label: area.label,
        description: area.description,
        masteredCount: skillsInArea.filter((s) => s.status === "mastered").length,
        practicingCount: skillsInArea.filter((s) => s.status === "practicing").length,
        notStartedCount: skillsInArea.filter((s) => s.status === "not-started").length,
        totalCount: skillsInArea.length,
        skills: skillsInArea,
      };
    });

    // ── This week ──────────────────────────────────────────────────────────
    // A skill is "newly mastered this week" if the first row that ever
    // carried mastered=true for it falls in the last 7 days.
    const newlyMastered: string[] = [];
    let practicingThisWeek = 0;
    let reviewedThisWeek = 0;
    let reviewedCorrect = 0;
    let reviewedTotal = 0;

    for (const skill of SKILLS) {
      const skillRows = rowsBySkill.get(skill.key) ?? [];
      const stat = skillStats[skill.key];
      const recentRows = skillRows.filter((r) => r.played_at >= sevenDaysAgo);
      if (recentRows.length === 0) continue;

      if (stat.status === "mastered") {
        const firstMastered = skillRows.find((r) => r.mastered);
        if (firstMastered && firstMastered.played_at >= sevenDaysAgo) {
          newlyMastered.push(stat.name);
        } else {
          // Already mastered before this week, and played again this week —
          // that's a spaced-repetition pull-back, i.e. reinforcement, not a
          // regression. It must never read as the skill getting worse.
          reviewedThisWeek++;
          reviewedCorrect += recentRows.reduce((s, r) => s + (r.correct ?? 0), 0);
          reviewedTotal += recentRows.reduce((s, r) => s + (r.total ?? 0), 0);
        }
      } else if (stat.status === "practicing") {
        practicingThisWeek++;
      }
    }

    const weeklySummary = {
      newlyMastered,
      practicingCount: practicingThisWeek,
      reviewedCount: reviewedThisWeek,
      reviewedAccuracy: reviewedTotal > 0 ? reviewedCorrect / reviewedTotal : null,
    };

    const overallMasteredCount = SKILLS.filter((s) => skillStats[s.key].status === "mastered").length;

    return NextResponse.json({
      success: true,
      player,
      subjects,
      weeklySummary,
      overallMasteredCount,
      overallTotalCount: SKILLS.length,
      totalSessions: new Set(rows.map((r) => r.session_id)).size,
      totalQuestions: rows.reduce((s, r) => s + (r.total ?? 0), 0),
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to load" },
      { status: 500 }
    );
  }
}
