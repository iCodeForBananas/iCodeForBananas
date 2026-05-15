"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface CategoryLevel {
  id: string;
  label: string;
  description: string;
  level: number;
  correct: number;
  total: number;
  masteredStages: number;
  totalStages: number;
  sessionCount: number;
  lastPlayed: string | null;
  trend: "up" | "down" | "neutral" | "new";
  recentAccuracy: number | null;
}

type GradeKey = "K" | "G1" | "G2" | "G3";

interface StageStat {
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
}

interface GradeBreakdown {
  grade: GradeKey;
  label: string;
  totalStages: number;
  masteredStages: number;
  complete: boolean;
  masteryPct: number;
  totalCorrect: number;
  totalAttempts: number;
  accuracy: number | null;
  stages: StageStat[];
}

interface GradeStat {
  grade: GradeKey;
  label: string;
  totalStages: number;
  masteredStages: number;
  complete: boolean;
}

interface ProgressData {
  player: string;
  overallLevel: number;
  currentGrade: GradeKey;
  currentGradeLabel: string;
  currentGradeBreakdown: GradeBreakdown;
  gradeBreakdown: GradeBreakdown[];
  gradeStats: GradeStat[];
  syllabusComplete: boolean;
  categoryLevels: CategoryLevel[];
  strengths: string[];
  weaknesses: string[];
  notStarted: string[];
  totalSessions: number;
  totalQuestions: number;
}

function levelColor(level: number): string {
  if (level === 0) return "bg-slate-200";
  if (level < 30) return "bg-red-400";
  if (level < 50) return "bg-orange-400";
  if (level < 70) return "bg-yellow-400";
  if (level < 85) return "bg-lime-400";
  return "bg-green-500";
}

function levelTextColor(level: number): string {
  if (level === 0) return "text-slate-400";
  if (level < 30) return "text-red-600";
  if (level < 50) return "text-orange-600";
  if (level < 70) return "text-yellow-600";
  if (level < 85) return "text-lime-600";
  return "text-green-600";
}

function levelLabel(level: number): string {
  if (level === 0) return "Not started";
  if (level < 30) return "Needs work";
  if (level < 50) return "Developing";
  if (level < 70) return "Progressing";
  if (level < 85) return "Proficient";
  return "Mastered";
}

function trendIcon(trend: CategoryLevel["trend"]): string {
  if (trend === "up") return "↑";
  if (trend === "down") return "↓";
  if (trend === "new") return "✦";
  return "→";
}

function trendColor(trend: CategoryLevel["trend"]): string {
  if (trend === "up") return "text-green-500";
  if (trend === "down") return "text-red-500";
  if (trend === "new") return "text-blue-500";
  return "text-slate-400";
}

function fmtDate(s: string | null): string {
  if (!s) return "Never";
  const d = new Date(s);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function OverallGauge({ level }: { level: number }) {
  const radius = 54;
  const circ = 2 * Math.PI * radius;
  const dash = (level / 100) * circ;

  return (
    <div className="relative flex items-center justify-center w-36 h-36">
      <svg className="w-36 h-36 -rotate-90" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="12" />
        <circle
          cx="70" cy="70" r={radius} fill="none"
          stroke={level >= 80 ? "#22c55e" : level >= 50 ? "#f59e0b" : "#ef4444"}
          strokeWidth="12"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s ease" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-3xl font-black text-gray-800">{level}</div>
        <div className="text-xs text-gray-500 font-medium">/ 100</div>
      </div>
    </div>
  );
}

function CategoryRow({ cat }: { cat: CategoryLevel }) {
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      {/* Category */}
      <td className="px-4 py-3">
        <div className="font-semibold text-gray-800 text-sm">{cat.label}</div>
        <div className="text-xs text-gray-400 mt-0.5">{cat.description}</div>
      </td>

      {/* Level bar */}
      <td className="px-4 py-3 w-52">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${levelColor(cat.level)}`}
              style={{ width: `${cat.level}%` }}
            />
          </div>
          <span className={`text-sm font-bold w-8 text-right tabular-nums ${levelTextColor(cat.level)}`}>
            {cat.level}
          </span>
        </div>
      </td>

      {/* Status badge */}
      <td className="px-4 py-3">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          cat.level >= 85 ? "bg-green-100 text-green-700" :
          cat.level >= 70 ? "bg-lime-100 text-lime-700" :
          cat.level >= 50 ? "bg-yellow-100 text-yellow-700" :
          cat.level >= 30 ? "bg-orange-100 text-orange-700" :
          cat.total === 0 ? "bg-slate-100 text-slate-500" :
          "bg-red-100 text-red-600"
        }`}>
          {levelLabel(cat.level)}
        </span>
      </td>

      {/* Stages mastered */}
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-0.5">
          {Array.from({ length: cat.totalStages }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-sm ${i < cat.masteredStages ? "bg-green-400" : "bg-gray-200"}`}
            />
          ))}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">{cat.masteredStages}/{cat.totalStages} stages</div>
      </td>

      {/* Accuracy */}
      <td className="px-4 py-3 text-center">
        <div className="text-sm font-bold text-gray-700">
          {cat.total > 0 ? `${Math.round((cat.correct / cat.total) * 100)}%` : "—"}
        </div>
        <div className="text-xs text-gray-400">{cat.correct}/{cat.total} correct</div>
      </td>

      {/* Trend */}
      <td className="px-4 py-3 text-center">
        <span className={`text-lg font-bold ${trendColor(cat.trend)}`}>{trendIcon(cat.trend)}</span>
      </td>

      {/* Last played */}
      <td className="px-4 py-3 text-xs text-gray-400 text-right">
        {fmtDate(cat.lastPlayed)}
      </td>
    </tr>
  );
}

function CurrentGradeSyllabus({ breakdown }: { breakdown: GradeBreakdown }) {
  const { label, stages, masteredStages, totalStages, masteryPct, totalCorrect, totalAttempts, accuracy } = breakdown;
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-bold text-gray-800">{label} Syllabus · Common Core Standards</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Skills student must master to advance. {masteredStages} of {totalStages} mastered ({masteryPct}%).
          </p>
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <div className="text-lg font-bold text-gray-800 tabular-nums">{accuracy != null ? `${Math.round(accuracy * 100)}%` : "—"}</div>
            <div className="text-[10px] uppercase tracking-wide text-gray-400">{label} accuracy</div>
          </div>
          <div>
            <div className="text-lg font-bold text-gray-800 tabular-nums">{totalCorrect}<span className="text-gray-400 font-normal text-sm">/{totalAttempts}</span></div>
            <div className="text-[10px] uppercase tracking-wide text-gray-400">Correct / total</div>
          </div>
        </div>
      </div>
      <div className="divide-y divide-gray-100">
        {stages.map((s) => {
          const status: "mastered" | "learning" | "not_started" =
            s.mastered ? "mastered" : s.total > 0 ? "learning" : "not_started";
          const acc = s.accuracy != null ? Math.round(s.accuracy * 100) : null;
          return (
            <div key={s.stageId} className="px-6 py-3 flex items-center gap-4 hover:bg-gray-50">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                status === "mastered" ? "bg-emerald-500 text-white" :
                status === "learning" ? "bg-yellow-100 text-yellow-700 border border-yellow-300" :
                "bg-slate-100 text-slate-400 border border-slate-200"
              }`}>
                {status === "mastered" ? "✓" : status === "learning" ? "•" : ""}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-800 text-sm">{s.label}</div>
                <div className="text-xs text-gray-400 font-mono mt-0.5">{s.standard}</div>
              </div>
              <div className="hidden sm:block w-32">
                {s.total > 0 ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          (acc ?? 0) >= 80 ? "bg-emerald-500" :
                          (acc ?? 0) >= 60 ? "bg-yellow-400" : "bg-orange-400"
                        }`}
                        style={{ width: `${acc ?? 0}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-gray-700 tabular-nums w-9 text-right">{acc}%</span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400 italic">Not started</span>
                )}
              </div>
              <div className="text-right text-xs text-gray-400 w-24 hidden md:block">
                {s.total > 0 ? `${s.correct}/${s.total} correct` : ""}
              </div>
              <div className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full shrink-0 ${
                status === "mastered" ? "bg-emerald-100 text-emerald-700" :
                status === "learning" ? "bg-yellow-100 text-yellow-700" :
                "bg-slate-100 text-slate-400"
              }`}>
                {status === "mastered" ? "Mastered" : status === "learning" ? "Learning" : "Not started"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MathTab({ data, loading, error, onRefresh }: {
  data: ProgressData | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  if (loading && !data) {
    return <div className="text-center py-20 text-gray-400">Loading Cai&apos;s progress…</div>;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
        {error}{" "}
        <button onClick={onRefresh} className="underline ml-1">Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const { categoryLevels, overallLevel, currentGradeLabel, currentGradeBreakdown, gradeStats, syllabusComplete, strengths, weaknesses, notStarted, totalSessions, totalQuestions } = data;
  const currentGradeStat = gradeStats.find((g) => g.label === currentGradeLabel);
  const gradeProgressPct = currentGradeStat && currentGradeStat.totalStages > 0
    ? Math.round((currentGradeStat.masteredStages / currentGradeStat.totalStages) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Current grade callout */}
      <div className={`rounded-2xl border p-5 shadow-sm flex items-center gap-5 flex-wrap ${
        syllabusComplete
          ? "bg-gradient-to-r from-emerald-50 to-green-50 border-emerald-200"
          : "bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-200"
      }`}>
        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-black shadow-sm ${
          syllabusComplete ? "bg-emerald-500 text-white" : "bg-indigo-600 text-white"
        }`}>
          {data.currentGrade}
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="text-xs font-bold uppercase tracking-wider text-indigo-500 mb-0.5">
            {syllabusComplete ? "Math Complete" : "Currently working at"}
          </div>
          <h2 className="text-2xl font-black text-gray-900">{currentGradeLabel} Math</h2>
          {currentGradeStat && !syllabusComplete && (
            <div className="mt-2 flex items-center gap-3">
              <div className="flex-1 h-2 bg-white/70 rounded-full overflow-hidden border border-indigo-100 max-w-[300px]">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-700"
                  style={{ width: `${gradeProgressPct}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-indigo-700 tabular-nums">
                {currentGradeStat.masteredStages}/{currentGradeStat.totalStages} stages mastered ({gradeProgressPct}%)
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {gradeStats.map((g) => (
            <div
              key={g.grade}
              className={`flex flex-col items-center px-3 py-2 rounded-lg text-xs font-bold ${
                g.complete
                  ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                  : g.label === currentGradeLabel
                  ? "bg-indigo-100 text-indigo-700 border border-indigo-300 ring-2 ring-indigo-300"
                  : "bg-slate-100 text-slate-400 border border-slate-200"
              }`}
              title={`${g.masteredStages} of ${g.totalStages} stages mastered`}
            >
              <span>{g.grade}</span>
              <span className="text-[10px] font-normal mt-0.5">
                {g.complete ? "✓" : `${g.masteredStages}/${g.totalStages}`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Current grade syllabus checklist */}
      <CurrentGradeSyllabus breakdown={currentGradeBreakdown} />

      {/* Hero summary */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-8 flex-wrap">
          <OverallGauge level={overallLevel} />
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-xl font-bold text-gray-900">
              {overallLevel >= 80 ? "🎉 K–Grade 3 Math Complete!" :
               overallLevel >= 50 ? "📈 Making Great Progress" :
               overallLevel > 0 ? "🚀 Just Getting Started" :
               "✦ Ready to Begin"}
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              Overall score across Kindergarten through Grade 3 math topics
            </p>
            <div className="flex gap-6 mt-4 flex-wrap">
              <div>
                <div className="text-2xl font-bold text-gray-800">{totalSessions}</div>
                <div className="text-xs text-gray-400">Play sessions</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-800">{Math.round(totalQuestions)}</div>
                <div className="text-xs text-gray-400">Questions answered</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-800">
                  {categoryLevels.filter((c) => c.masteredStages === c.totalStages && c.totalStages > 0).length}
                  <span className="text-gray-400 font-normal text-lg">/{categoryLevels.length}</span>
                </div>
                <div className="text-xs text-gray-400">Topics mastered</div>
              </div>
            </div>
          </div>

          {/* Strengths + Weaknesses quick summary */}
          <div className="flex flex-col gap-2 min-w-[180px]">
            {strengths.length > 0 && (
              <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                <div className="text-xs font-bold text-green-700 mb-1">💪 Strengths</div>
                {strengths.map((s) => (
                  <div key={s} className="text-xs text-green-600">{s}</div>
                ))}
              </div>
            )}
            {weaknesses.length > 0 && (
              <div className="bg-red-50 rounded-lg p-3 border border-red-100">
                <div className="text-xs font-bold text-red-700 mb-1">🎯 Focus areas</div>
                {weaknesses.map((w) => (
                  <div key={w} className="text-xs text-red-600">{w}</div>
                ))}
              </div>
            )}
            {notStarted.length > 0 && (
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                <div className="text-xs font-bold text-slate-500 mb-1">⏳ Not yet started</div>
                {notStarted.map((n) => (
                  <div key={n} className="text-xs text-slate-400">{n}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Syllabus table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-800">All Grades · Lifetime Skills Heat Map</h3>
            <p className="text-xs text-gray-400 mt-0.5">Aggregated across K–Grade 3 · Level 0–100 · 80+ = Mastered</p>
          </div>
          <Link
            href="/space-math"
            className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors"
          >
            🚀 Play Space Math
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Topic</th>
                <th className="px-4 py-3 text-left">Level</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-center">Stages</th>
                <th className="px-4 py-3 text-center">Accuracy</th>
                <th className="px-4 py-3 text-center">Trend</th>
                <th className="px-4 py-3 text-right">Last Played</th>
              </tr>
            </thead>
            <tbody>
              {categoryLevels.map((cat) => (
                <CategoryRow key={cat.id} cat={cat} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Heat map visual */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h3 className="font-bold text-gray-800 mb-4">Skill Heat Map</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {categoryLevels.map((cat) => (
            <div key={cat.id} className="flex flex-col items-center gap-2">
              <div
                className={`w-full rounded-xl flex items-center justify-center font-black text-white text-xl shadow-sm transition-all duration-700 ${levelColor(cat.level)}`}
                style={{ height: `${Math.max(40, cat.level)}px`, minHeight: "40px" }}
              >
                {cat.level > 20 ? cat.level : ""}
              </div>
              <div className="text-xs text-gray-500 text-center font-medium leading-tight">{cat.label}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-4 text-xs text-gray-400">
          <span>0</span>
          {[0, 30, 50, 70, 85, 100].map((v, i, arr) => i < arr.length - 1 && (
            <div key={v} className={`flex-1 h-2 rounded ${levelColor(v + 1)}`} />
          ))}
          <span>100</span>
          <span className="ml-2">← Needs work · Developing · Progressing · Proficient · Mastered →</span>
        </div>
      </div>

      {data.totalQuestions === 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 text-center">
          <div className="text-3xl mb-2">🚀</div>
          <div className="font-semibold text-indigo-800">No play sessions yet</div>
          <p className="text-indigo-600 text-sm mt-1">
            Head to <Link href="/space-math" className="underline font-semibold">Space Math</Link> and play a few stages — Student&apos; progress will appear here automatically.
          </p>
        </div>
      )}
    </div>
  );
}

export default function LearningProgressPage() {
  const [activeTab, setActiveTab] = useState<"math" | "language">("math");
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/space-math/progress?player=cai");
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setData(json);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const TABS = [
    { id: "math", label: "📐 Math", available: true },
    { id: "language", label: "📖 Language Arts", available: false },
  ] as const;

  return (
    <div className="flex flex-col flex-1 bg-gray-50 min-h-screen">
      <main className="px-4 py-8 flex-1 max-w-5xl mx-auto w-full">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-900">Cai&apos;s Learning Progress</h1>
            <p className="text-gray-500 mt-1 text-sm">Common Core K–Grade 3 · Syllabus coverage tracker</p>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-gray-400">Updated {lastUpdated.toLocaleTimeString()}</span>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-white text-gray-600 disabled:opacity-50 bg-white shadow-sm"
            >
              {loading ? "Loading…" : "↻ Refresh"}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white rounded-xl border border-gray-200 p-1 shadow-sm w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => tab.available && setActiveTab(tab.id as "math" | "language")}
              disabled={!tab.available}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? "bg-indigo-600 text-white shadow-sm"
                  : tab.available
                  ? "text-gray-600 hover:bg-gray-50"
                  : "text-gray-300 cursor-not-allowed"
              }`}
            >
              {tab.label}
              {!tab.available && (
                <span className="ml-1.5 text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full font-medium">
                  Soon
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "math" && (
          <MathTab data={data} loading={loading} error={error} onRefresh={load} />
        )}
        {activeTab === "language" && (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center">
            <div className="text-4xl mb-3">📖</div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Language Arts coming soon</h3>
            <p className="text-gray-400 text-sm max-w-sm mx-auto">
              Reading comprehension, spelling, and phonics progress will appear here once those games are built.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
