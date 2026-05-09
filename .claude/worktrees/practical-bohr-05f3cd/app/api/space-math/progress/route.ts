import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Stage → syllabus category mapping
// A stage can contribute to multiple categories; we use the primary one here
const STAGE_CATEGORY: Record<number, string> = {
  1: "addition_subtraction",  // Add to 5
  2: "addition_subtraction",  // Subtract to 5
  3: "addition_subtraction",  // Add to 10
  4: "addition_subtraction",  // Subtract to 10
  5: "place_value",           // Place Value + mental ±10
  6: "addition_subtraction",  // Add to 100 + word problems
  7: "number_sense",          // Compare Numbers + mental math
  8: "measurement",           // Time & Shapes (covers both measurement + geometry)
  9: "geometry",              // Fractions
};

// For stages that cover two categories, also record in a secondary one
const STAGE_SECONDARY_CATEGORY: Record<number, string> = {
  1: "number_sense",
  2: "number_sense",
  3: "number_sense",
  4: "number_sense",
  7: "place_value",
  8: "geometry",  // shapes portion
};

const SYLLABUS_CATEGORIES = [
  { id: "number_sense",         label: "Number Sense",          description: "Counting to 120, reading/writing numerals, number comparison" },
  { id: "addition_subtraction", label: "Addition & Subtraction", description: "Fluency within 20, word problems, fact families" },
  { id: "place_value",          label: "Place Value",            description: "Tens & ones, compare 2-digit numbers, mental +/- 10" },
  { id: "measurement",          label: "Measurement",            description: "Tell time to the hour and half-hour, order by length" },
  { id: "geometry",             label: "Geometry",               description: "2D/3D shape recognition, halves and fourths" },
];

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}

// ── POST: save a stage result ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { player_name, session_id, stage_id, stage_label, correct, total, mastered } = body;

    if (!session_id || !stage_id) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const db = supabase();
    const rows = [
      {
        player_name: player_name ?? "cai",
        session_id,
        stage_id,
        stage_label,
        skill_category: STAGE_CATEGORY[stage_id] ?? "number_sense",
        correct,
        total,
        mastered,
      },
    ];

    // If this stage maps to a secondary category, insert a second row
    if (STAGE_SECONDARY_CATEGORY[stage_id]) {
      rows.push({
        ...rows[0],
        skill_category: STAGE_SECONDARY_CATEGORY[stage_id],
      });
    }

    const { error } = await db.from("space_math_progress").insert(rows);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to save" },
      { status: 500 }
    );
  }
}

// ── GET: return aggregated skill levels for a player ─────────────────────────
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

    const rows = data ?? [];

    // Aggregate per category
    const categoryMap: Record<string, {
      correct: number; total: number; masteredCount: number; sessionCount: number;
      recentCorrect: number; recentTotal: number; lastPlayed: string | null;
    }> = {};

    for (const cat of SYLLABUS_CATEGORIES) {
      categoryMap[cat.id] = { correct: 0, total: 0, masteredCount: 0, sessionCount: 0, recentCorrect: 0, recentTotal: 0, lastPlayed: null };
    }

    // Split into all-time vs recent (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    for (const row of rows) {
      const c = categoryMap[row.skill_category];
      if (!c) continue;
      c.correct += row.correct ?? 0;
      c.total += row.total ?? 0;
      if (row.mastered) c.masteredCount++;
      c.sessionCount++;
      if (!c.lastPlayed || row.played_at > c.lastPlayed) c.lastPlayed = row.played_at;
      if (row.played_at >= sevenDaysAgo) {
        c.recentCorrect += row.correct ?? 0;
        c.recentTotal += row.total ?? 0;
      }
    }

    // Stage mastery map
    const masteredStages = new Set(
      rows.filter((r) => r.mastered && r.skill_category === STAGE_CATEGORY[r.stage_id]).map((r) => r.stage_id)
    );

    // Compute 0-100 level per category
    const categoryLevels = SYLLABUS_CATEGORIES.map((cat) => {
      const c = categoryMap[cat.id];

      // Which stages map to this category?
      const stagesForCat = Object.entries(STAGE_CATEGORY)
        .filter(([, v]) => v === cat.id)
        .map(([k]) => Number(k));
      const secondaryStages = Object.entries(STAGE_SECONDARY_CATEGORY)
        .filter(([, v]) => v === cat.id)
        .map(([k]) => Number(k));
      const allStages = Array.from(new Set([...stagesForCat, ...secondaryStages]));
      const masteredInCat = allStages.filter((s) => masteredStages.has(s)).length;

      let level = 0;
      if (c.total > 0) {
        const accuracy = c.correct / c.total;           // 0-1
        const masteryBonus = masteredInCat / Math.max(allStages.length, 1); // 0-1
        // Weighted: 60% accuracy, 40% mastery
        level = Math.round((accuracy * 0.6 + masteryBonus * 0.4) * 100);
        level = Math.max(0, Math.min(100, level));
      }

      const recentAccuracy = c.recentTotal > 0 ? c.recentCorrect / c.recentTotal : null;
      const trend: "up" | "down" | "neutral" | "new" =
        c.total === 0 ? "new"
        : recentAccuracy === null ? "neutral"
        : recentAccuracy > (c.correct / c.total) ? "up"
        : recentAccuracy < (c.correct / c.total) ? "down"
        : "neutral";

      return {
        ...cat,
        level,
        correct: c.correct,
        total: c.total,
        masteredStages: masteredInCat,
        totalStages: allStages.length,
        sessionCount: c.sessionCount,
        lastPlayed: c.lastPlayed,
        trend,
        recentAccuracy,
      };
    });

    const overallLevel = categoryLevels.length > 0
      ? Math.round(categoryLevels.reduce((s, c) => s + c.level, 0) / categoryLevels.length)
      : 0;

    const strengths = categoryLevels.filter((c) => c.level >= 70);
    const weaknesses = categoryLevels.filter((c) => c.level < 40 && c.total > 0);
    const notStarted = categoryLevels.filter((c) => c.total === 0);

    return NextResponse.json({
      success: true,
      player,
      overallLevel,
      syllabusComplete: categoryLevels.every((c) => c.level >= 80),
      categoryLevels,
      strengths: strengths.map((c) => c.label),
      weaknesses: weaknesses.map((c) => c.label),
      notStarted: notStarted.map((c) => c.label),
      totalSessions: new Set(rows.map((r) => r.session_id)).size,
      totalQuestions: rows.reduce((s, r) => s + (r.total ?? 0), 0) / 2, // halve because dual-category rows
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to load" },
      { status: 500 }
    );
  }
}
