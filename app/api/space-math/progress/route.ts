import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Stage → syllabus category mapping. Each stage is one Common Core skill.
const STAGE_CATEGORY: Record<number, string> = {
  // ── Kindergarten ──
  1:  "addition_subtraction", // K Add within 5
  2:  "addition_subtraction", // K Subtract within 5
  3:  "addition_subtraction", // K Add within 10
  4:  "addition_subtraction", // K Subtract within 10
  11: "number_sense",         // K Count by 1s to 100
  17: "number_sense",         // K Count by 10s to 100
  12: "addition_subtraction", // K Make 10
  13: "number_sense",         // K Compare 1–10
  14: "geometry",             // K Shapes
  15: "place_value",          // K Teen numbers (10 + ones)
  // ── Grade 1 ──
  5:  "addition_subtraction", // G1 Add within 20
  60: "addition_subtraction", // G1 Subtract within 20
  61: "addition_subtraction", // G1 Three-addend addition
  62: "addition_subtraction", // G1 Fact families
  16: "addition_subtraction", // G1 Equal sign true/false
  63: "addition_subtraction", // G1 Unknown addend
  6:  "number_sense",         // G1 Compare 2-digit numbers
  7:  "place_value",          // G1 Tens & ones place value
  64: "place_value",          // G1 Mental ±10
  65: "place_value",          // G1 Subtract multiples of 10
  9:  "measurement",          // G1 Compare lengths
  66: "measurement",          // G1 Time (hour & half-hour)
  8:  "addition_subtraction", // G1 Add within 100
  67: "addition_subtraction", // G1 Word problems within 20
  68: "number_sense",         // G1 Count to 120
  10: "geometry",             // G1 Halves & fourths
  // ── Grade 2 ──
  20: "addition_subtraction", // G2 Add within 100
  21: "addition_subtraction", // G2 Subtract within 100
  22: "place_value",          // G2 3-digit place value
  23: "number_sense",         // G2 Skip count
  24: "number_sense",         // G2 Compare 3-digit
  25: "place_value",          // G2 Mental ±100
  26: "number_sense",         // G2 Odd/even
  27: "multiplication",       // G2 Arrays
  28: "measurement",          // G2 Time to 5 min
  29: "measurement",          // G2 Money
  30: "geometry",             // G2 Thirds
  31: "geometry",             // G2 Polygons
  // ── Grade 3 ──
  40: "multiplication",       // G3 Multiplication
  41: "multiplication",       // G3 ×Multiples of 10
  42: "multiplication",       // G3 Division
  43: "place_value",          // G3 Rounding
  44: "fractions",            // G3 Fractions on number line
  45: "fractions",            // G3 Equivalent fractions
  46: "fractions",            // G3 Compare fractions
  47: "measurement",          // G3 Area
  48: "measurement",          // G3 Perimeter
  49: "measurement",          // G3 Time to the minute
  50: "measurement",          // G3 Elapsed time
};

// For stages that cover two categories, also record in a secondary one
const STAGE_SECONDARY_CATEGORY: Record<number, string> = {
  1: "number_sense",
  2: "number_sense",
  3: "number_sense",
  4: "number_sense",
  7: "number_sense",
  20: "place_value",
  21: "place_value",
  27: "addition_subtraction",
  47: "multiplication",
  48: "addition_subtraction",
  62: "number_sense",         // fact families touch number sense
  65: "addition_subtraction", // sub-multiples of 10
};

const SYLLABUS_CATEGORIES = [
  { id: "number_sense",         label: "Number Sense",          description: "Counting, skip-count, compare numbers, odd/even" },
  { id: "addition_subtraction", label: "Addition & Subtraction", description: "Fluency within 20, word problems, regrouping within 100" },
  { id: "place_value",          label: "Place Value",            description: "Tens, hundreds, mental ±10/±100, rounding" },
  { id: "multiplication",       label: "Multiplication & Division", description: "Arrays, multiplication facts, division within 100" },
  { id: "fractions",            label: "Fractions",              description: "Halves/fourths/thirds, fractions on number line, equivalents" },
  { id: "measurement",          label: "Measurement",            description: "Time, money, length, area, perimeter, elapsed time" },
  { id: "geometry",             label: "Geometry",               description: "2D/3D shapes, polygons, partition shapes" },
];

// Each stage = one Common Core syllabus skill the child must master to advance the grade.
type GradeKey = "K" | "G1" | "G2" | "G3";
const STAGE_INFO: Record<number, { grade: GradeKey; label: string; standard: string }> = {
  // ── Kindergarten ──
  1:  { grade: "K",  label: "Add within 5",                       standard: "K.OA.A.5" },
  2:  { grade: "K",  label: "Subtract within 5",                  standard: "K.OA.A.5" },
  3:  { grade: "K",  label: "Add within 10",                      standard: "K.OA.A.2" },
  4:  { grade: "K",  label: "Subtract within 10",                 standard: "K.OA.A.2" },
  11: { grade: "K",  label: "Count by 1s to 100",                 standard: "K.CC.A.1" },
  17: { grade: "K",  label: "Count by 10s to 100",                standard: "K.CC.A.1" },
  12: { grade: "K",  label: "Make 10 (find pair to make 10)",     standard: "K.OA.A.4" },
  13: { grade: "K",  label: "Compare numbers 1–10",               standard: "K.CC.C.6" },
  14: { grade: "K",  label: "Identify shapes (2D & 3D)",          standard: "K.G.A.2" },
  15: { grade: "K",  label: "Teen numbers as 10 + ones",          standard: "K.NBT.A.1" },
  // ── Grade 1 ──
  5:  { grade: "G1", label: "Add within 20",                      standard: "1.OA.C.6" },
  60: { grade: "G1", label: "Subtract within 20",                 standard: "1.OA.C.6" },
  61: { grade: "G1", label: "Three-addend addition",              standard: "1.OA.A.2" },
  62: { grade: "G1", label: "Fact families (use ↔ subtraction)",  standard: "1.OA.B.4" },
  16: { grade: "G1", label: "Equal sign true/false",              standard: "1.OA.D.7" },
  63: { grade: "G1", label: "Unknown addend (8 + ? = 11)",        standard: "1.OA.D.8" },
  6:  { grade: "G1", label: "Compare two-digit numbers",          standard: "1.NBT.B.3" },
  7:  { grade: "G1", label: "Tens & ones place value",            standard: "1.NBT.B.2" },
  64: { grade: "G1", label: "Mental ±10",                         standard: "1.NBT.C.5" },
  65: { grade: "G1", label: "Subtract multiples of 10 (70 − 30)", standard: "1.NBT.C.6" },
  9:  { grade: "G1", label: "Order & compare lengths",            standard: "1.MD.A.1" },
  66: { grade: "G1", label: "Tell time to hour & half-hour",      standard: "1.MD.B.3" },
  8:  { grade: "G1", label: "Add within 100 (2-digit + 1-digit / multiple of 10)", standard: "1.NBT.C.4" },
  67: { grade: "G1", label: "Word problems within 20",            standard: "1.OA.A.1" },
  68: { grade: "G1", label: "Count to 120 from any number",       standard: "1.NBT.A.1" },
  10: { grade: "G1", label: "Halves & fourths (partition shapes)", standard: "1.G.A.3" },
  // ── Grade 2 ──
  20: { grade: "G2", label: "Add within 100 (with regrouping)",   standard: "2.NBT.B.5" },
  21: { grade: "G2", label: "Subtract within 100 (with regrouping)", standard: "2.NBT.B.5" },
  22: { grade: "G2", label: "3-digit place value",                standard: "2.NBT.A.1" },
  23: { grade: "G2", label: "Skip count by 5s, 10s, 100s",        standard: "2.NBT.A.2" },
  24: { grade: "G2", label: "Compare 3-digit numbers",            standard: "2.NBT.A.4" },
  25: { grade: "G2", label: "Mental ±100",                        standard: "2.NBT.B.8" },
  26: { grade: "G2", label: "Odd or even (within 20)",            standard: "2.OA.C.3" },
  27: { grade: "G2", label: "Rectangular arrays (foundations of ×)", standard: "2.OA.C.4" },
  28: { grade: "G2", label: "Tell time to the nearest 5 min",     standard: "2.MD.C.7" },
  29: { grade: "G2", label: "Money (coins / cents)",              standard: "2.MD.C.8" },
  30: { grade: "G2", label: "Thirds (partition shapes)",          standard: "2.G.A.3" },
  31: { grade: "G2", label: "Identify polygons (quadrilaterals, pentagons, hexagons)", standard: "2.G.A.1" },
  // ── Grade 3 ──
  40: { grade: "G3", label: "Multiplication within 100",          standard: "3.OA.C.7" },
  41: { grade: "G3", label: "Multiply by multiples of 10",        standard: "3.NBT.A.3" },
  42: { grade: "G3", label: "Division within 100",                standard: "3.OA.C.7" },
  43: { grade: "G3", label: "Round to nearest 10 or 100",         standard: "3.NBT.A.1" },
  44: { grade: "G3", label: "Fractions on a number line",         standard: "3.NF.A.2" },
  45: { grade: "G3", label: "Equivalent fractions",               standard: "3.NF.A.3.b" },
  46: { grade: "G3", label: "Compare fractions",                  standard: "3.NF.A.3.d" },
  47: { grade: "G3", label: "Area of rectangles",                 standard: "3.MD.C.7" },
  48: { grade: "G3", label: "Perimeter of polygons",              standard: "3.MD.D.8" },
  49: { grade: "G3", label: "Tell time to the minute",            standard: "3.MD.A.1" },
  50: { grade: "G3", label: "Elapsed time word problems",         standard: "3.MD.A.1" },
};
const GRADE_LABEL: Record<GradeKey, string> = { K: "Kindergarten", G1: "Grade 1", G2: "Grade 2", G3: "Grade 3" };
const GRADE_ORDER: GradeKey[] = ["K", "G1", "G2", "G3"];

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

    // ── Per-stage stats (only count primary-category rows so totals aren't doubled) ──
    type StageStat = {
      stageId: number;
      grade: GradeKey;
      label: string;
      standard: string;
      correct: number;
      total: number;
      accuracy: number | null;
      mastered: boolean;
      lastPlayed: string | null;
      sessionCount: number;
    };
    const stageMap: Record<number, StageStat> = {};
    for (const id of Object.keys(STAGE_INFO).map(Number)) {
      const info = STAGE_INFO[id];
      stageMap[id] = {
        stageId: id, grade: info.grade, label: info.label, standard: info.standard,
        correct: 0, total: 0, accuracy: null, mastered: masteredStages.has(id),
        lastPlayed: null, sessionCount: 0,
      };
    }
    for (const row of rows) {
      const id = row.stage_id;
      if (!stageMap[id]) continue;
      // Avoid double counting: only sum from the primary-category row
      if (row.skill_category !== STAGE_CATEGORY[id]) continue;
      const s = stageMap[id];
      s.correct += row.correct ?? 0;
      s.total += row.total ?? 0;
      s.sessionCount++;
      if (!s.lastPlayed || row.played_at > s.lastPlayed) s.lastPlayed = row.played_at;
    }
    for (const id of Object.keys(stageMap).map(Number)) {
      const s = stageMap[id];
      s.accuracy = s.total > 0 ? s.correct / s.total : null;
    }

    // ── Group stages by grade ──
    const gradeBreakdown = GRADE_ORDER.map((g) => {
      const stages = Object.values(stageMap).filter((s) => s.grade === g)
        .sort((a, b) => a.stageId - b.stageId);
      const mastered = stages.filter((s) => s.mastered).length;
      const totalCorrect = stages.reduce((acc, s) => acc + s.correct, 0);
      const totalAttempts = stages.reduce((acc, s) => acc + s.total, 0);
      return {
        grade: g,
        label: GRADE_LABEL[g],
        totalStages: stages.length,
        masteredStages: mastered,
        complete: stages.length > 0 && mastered === stages.length,
        masteryPct: stages.length > 0 ? Math.round((mastered / stages.length) * 100) : 0,
        totalCorrect,
        totalAttempts,
        accuracy: totalAttempts > 0 ? totalCorrect / totalAttempts : null,
        stages,
      };
    });
    // Current grade = lowest grade not fully mastered (matches in-game gating)
    const currentGradeEntry = gradeBreakdown.find((g) => !g.complete) ?? gradeBreakdown[gradeBreakdown.length - 1];

    return NextResponse.json({
      success: true,
      player,
      overallLevel,
      currentGrade: currentGradeEntry.grade,
      currentGradeLabel: currentGradeEntry.label,
      currentGradeBreakdown: currentGradeEntry,
      gradeBreakdown,
      // Backward-compat shape
      gradeStats: gradeBreakdown.map((g) => ({
        grade: g.grade, label: g.label, totalStages: g.totalStages,
        masteredStages: g.masteredStages, complete: g.complete,
      })),
      syllabusComplete: gradeBreakdown.every((g) => g.complete),
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
