"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import BentoPageLayout from "../components/BentoPageLayout";

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

interface StageStat {
  stageId: number;
  rung: number | null; // position on the linear skill ladder, 1-based
  label: string;
  standard: string;
  correct: number;
  total: number;
  accuracy: number | null;
  mastered: boolean;
  lastPlayed: string | null;
  sessionCount: number;
}

interface ProgressData {
  player: string;
  overallLevel: number;
  ladder: StageStat[];
  upcoming: StageStat[];
  focusSkills: StageStat[];
  reviewSkills: StageStat[];
  skillsMastered: number;
  totalSkills: number;
  ladderAccuracy: number | null;
  ladderCorrect: number;
  ladderAttempts: number;
  syllabusComplete: boolean;
  categoryLevels: CategoryLevel[];
  strengths: string[];
  weaknesses: string[];
  notStarted: string[];
  totalSessions: number;
  totalQuestions: number;
}

/**
 * Mastery, as a colour. The system has no sequential ramp — Layer 2 names
 * planes, ink and three status colours, and inventing a five-step red-to-green
 * gradient here would be inventing a seventh palette rather than using the one
 * that exists. So the five bands collapse to the three the tokens can say:
 * not there yet, on the way, there. `levelLabel` still carries all five, which
 * is where the finer grain belongs — a word says it exactly, a hue only
 * approximates it.
 */
function levelColor(level: number): string {
  if (level === 0) return "bg-surface-overlay";
  if (level < 50) return "bg-danger";
  if (level < 85) return "bg-primary-solid";
  return "bg-success";
}

function levelTextColor(level: number): string {
  if (level === 0) return "text-ink-muted";
  if (level < 50) return "text-danger";
  if (level < 85) return "text-primary-text";
  return "text-success";
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
  if (trend === "up") return "text-success";
  if (trend === "down") return "text-danger";
  if (trend === "new") return "text-primary-text";
  return "text-ink-muted";
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
        <circle cx="70" cy="70" r={radius} fill="none" stroke="var(--ds-color-border-strong)" strokeWidth="12" />
        <circle
          cx="70" cy="70" r={radius} fill="none"
          stroke={
            level >= 80
              ? "var(--ds-color-success)"
              : level >= 50
                ? "var(--ds-color-primary-solid)"
                : "var(--ds-color-danger)"
          }
          strokeWidth="12"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s ease" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-3xl font-black text-ink-primary">{level}</div>
        <div className="text-xs text-ink-muted font-medium">/ 100</div>
      </div>
    </div>
  );
}

function CategoryRow({ cat }: { cat: CategoryLevel }) {
  return (
    <tr className="border-b border-line-subtle hover:bg-surface-sunken transition-colors">
      {/* Category */}
      <td className="px-4 py-3">
        <div className="font-semibold text-ink-primary text-sm">{cat.label}</div>
        <div className="text-xs text-ink-muted mt-0.5">{cat.description}</div>
      </td>

      {/* Level bar */}
      <td className="px-4 py-3 w-52">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-3 bg-surface-sunken rounded-full overflow-hidden">
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
          cat.level >= 85 ? "bg-success/15 text-success" :
          cat.level >= 70 ? "bg-success/15 text-success" :
          cat.level >= 50 ? "bg-primary-solid/15 text-primary-text" :
          cat.level >= 30 ? "bg-primary-solid/15 text-primary-text" :
          cat.total === 0 ? "bg-surface-sunken text-ink-muted" :
          "bg-danger/15 text-danger"
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
              className={`w-3 h-3 rounded-sm ${i < cat.masteredStages ? "bg-success" : "bg-surface-overlay"}`}
            />
          ))}
        </div>
        <div className="text-xs text-ink-muted mt-0.5">{cat.masteredStages}/{cat.totalStages} stages</div>
      </td>

      {/* Accuracy */}
      <td className="px-4 py-3 text-center">
        <div className="text-sm font-bold text-ink-primary">
          {cat.total > 0 ? `${Math.round((cat.correct / cat.total) * 100)}%` : "—"}
        </div>
        <div className="text-xs text-ink-muted">{cat.correct}/{cat.total} correct</div>
      </td>

      {/* Trend */}
      <td className="px-4 py-3 text-center">
        <span className={`text-lg font-bold ${trendColor(cat.trend)}`}>{trendIcon(cat.trend)}</span>
      </td>

      {/* Last played */}
      <td className="px-4 py-3 text-xs text-ink-muted text-right">
        {fmtDate(cat.lastPlayed)}
      </td>
    </tr>
  );
}

function SkillLadder({ data }: { data: ProgressData }) {
  const { ladder, upcoming, skillsMastered, totalSkills, ladderAccuracy, ladderCorrect, ladderAttempts } = data;
  const pct = totalSkills > 0 ? Math.round((skillsMastered / totalSkills) * 100) : 0;
  return (
    <div className="bg-surface-raised rounded-2xl border border-line-subtle shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-line-subtle flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-bold text-ink-primary">Skill Ladder · Common Core Standards</h3>
          <p className="text-xs text-ink-muted mt-0.5">
            One linear progression, easiest first. {skillsMastered} of {totalSkills} mastered ({pct}%).
            Mastered skills stay in the review mix.
          </p>
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <div className="text-lg font-bold text-ink-primary tabular-nums">{ladderAccuracy != null ? `${Math.round(ladderAccuracy * 100)}%` : "—"}</div>
            <div className="text-[10px] uppercase tracking-wide text-ink-muted">Accuracy</div>
          </div>
          <div>
            <div className="text-lg font-bold text-ink-primary tabular-nums">{ladderCorrect}<span className="text-ink-muted font-normal text-sm">/{ladderAttempts}</span></div>
            <div className="text-[10px] uppercase tracking-wide text-ink-muted">Correct / total</div>
          </div>
        </div>
      </div>
      <div className="divide-y divide-line-subtle">
        {ladder.map((s) => {
          const status: "mastered" | "learning" | "not_started" =
            s.mastered ? "mastered" : s.total > 0 ? "learning" : "not_started";
          const acc = s.accuracy != null ? Math.round(s.accuracy * 100) : null;
          return (
            <div key={s.stageId} className="px-6 py-3 flex items-center gap-4 hover:bg-surface-sunken">
              <div className="text-xs font-mono text-ink-muted w-5 text-right shrink-0 tabular-nums">{s.rung}</div>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                status === "mastered" ? "bg-success/25 text-success" :
                status === "learning" ? "bg-primary-solid/25 text-primary-text border border-primary-solid/40" :
                "bg-surface-sunken text-ink-muted border border-line-subtle"
              }`}>
                {status === "mastered" ? "✓" : status === "learning" ? "•" : ""}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink-primary text-sm">{s.label}</div>
                <div className="text-xs text-ink-muted font-mono mt-0.5">{s.standard}</div>
              </div>
              <div className="hidden sm:block w-32">
                {s.total > 0 ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-surface-sunken rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          (acc ?? 0) >= 80 ? "bg-success" :
                          (acc ?? 0) >= 60 ? "bg-primary-solid" : "bg-danger"
                        }`}
                        style={{ width: `${acc ?? 0}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-ink-primary tabular-nums w-9 text-right">{acc}%</span>
                  </div>
                ) : (
                  <span className="text-xs text-ink-muted italic">Not started</span>
                )}
              </div>
              <div className="text-right text-xs text-ink-muted w-24 hidden md:block">
                {s.total > 0 ? `${s.correct}/${s.total} correct` : ""}
              </div>
              <div className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full shrink-0 ${
                status === "mastered" ? "bg-success/15 text-success" :
                status === "learning" ? "bg-primary-solid/15 text-primary-text" :
                "bg-surface-sunken text-ink-muted"
              }`}>
                {status === "mastered" ? "In review" : status === "learning" ? "Learning" : "Not started"}
              </div>
            </div>
          );
        })}
      </div>
      {upcoming.length > 0 && (
        <div className="px-6 py-3 bg-surface-sunken border-t border-line-subtle">
          <div className="text-[10px] uppercase tracking-wide text-ink-muted font-bold mb-1">
            Not in the game yet
          </div>
          <div className="text-xs text-ink-muted">
            {upcoming.map((s) => s.label).join(" · ")}
          </div>
        </div>
      )}
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
    return <div className="text-center py-20 text-ink-muted">Loading Cai&apos;s progress…</div>;
  }

  if (error) {
    return (
      <div className="bg-danger/10 border border-danger/40 rounded-xl p-4 text-danger text-13">
        {error}{" "}
        <button onClick={onRefresh} className="underline ml-1">Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const { categoryLevels, overallLevel, focusSkills, reviewSkills, skillsMastered, totalSkills, syllabusComplete, strengths, weaknesses, notStarted, totalSessions, totalQuestions } = data;
  const ladderPct = totalSkills > 0 ? Math.round((skillsMastered / totalSkills) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Where the learner is on the ladder — no grade placement */}
      <div className={`rounded-2xl border p-5 shadow-sm flex items-start gap-5 flex-wrap ${
        syllabusComplete
          ? "bg-success/10 border-success/40"
          : "bg-surface-raised border-line-subtle"
      }`}>
        <div className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center shadow-sm shrink-0 ${
          syllabusComplete ? "bg-success/25 text-success" : "bg-primary-solid text-ink-on-primary"
        }`}>
          <span className="text-3xl font-black leading-none tabular-nums">{skillsMastered}</span>
          <span className="text-[10px] font-semibold opacity-80 mt-0.5">of {totalSkills}</span>
        </div>
        <div className="flex-1 min-w-[220px]">
          <div className="text-10 font-semibold uppercase tracking-wider text-ink-muted mb-0.5">
            {syllabusComplete ? "Every skill mastered" : "Skills mastered so far"}
          </div>
          <h2 className="text-2xl font-black text-ink-primary">Spaced repetition · one linear ladder</h2>
          <p className="text-xs text-ink-muted mt-1">
            No grade level. Cai works up a single ordered list of skills, and every skill already
            mastered keeps coming back on a widening interval so it stays sharp.
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex-1 h-2 bg-surface-sunken rounded-full overflow-hidden border border-line-subtle max-w-[300px]">
              <div
                className="h-full bg-primary-solid rounded-full transition-all duration-700"
                style={{ width: `${ladderPct}%` }}
              />
            </div>
            <span className="text-10 font-semibold text-ink-primary tabular-nums">{ladderPct}%</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 min-w-[200px]">
          <div className="bg-surface-raised rounded-lg p-3 border border-line-subtle">
            <div className="text-10 font-semibold uppercase tracking-wide text-ink-muted mb-1">
              Working on now
            </div>
            {focusSkills.length > 0 ? (
              focusSkills.map((s) => (
                <div key={s.stageId} className="text-xs text-ink-primary truncate" title={s.label}>
                  {s.rung}. {s.label}
                </div>
              ))
            ) : (
              <div className="text-xs text-ink-muted">Nothing left to learn 🎉</div>
            )}
          </div>
          <div className="bg-surface-raised rounded-lg p-3 border border-line-subtle">
            <div className="text-[10px] font-bold uppercase tracking-wide text-success mb-1">
              In review rotation
            </div>
            <div className="text-xs text-ink-muted">
              {reviewSkills.length > 0
                ? `${reviewSkills.length} mastered skills still mixed in`
                : "Nothing mastered yet"}
            </div>
          </div>
        </div>
      </div>

      {/* Full ladder checklist */}
      <SkillLadder data={data} />

      {/* Hero summary */}
      <div className="bg-surface-raised rounded-2xl border border-line-subtle shadow-sm p-6">
        <div className="flex items-center gap-8 flex-wrap">
          <OverallGauge level={overallLevel} />
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-xl font-bold text-ink-primary">
              {overallLevel >= 80 ? "🎉 Math Syllabus Complete!" :
               overallLevel >= 50 ? "📈 Making Great Progress" :
               overallLevel > 0 ? "🚀 Just Getting Started" :
               "✦ Ready to Begin"}
            </h2>
            <p className="text-ink-muted text-sm mt-1">
              Overall score across every skill on the ladder
            </p>
            <div className="flex gap-6 mt-4 flex-wrap">
              <div>
                <div className="text-2xl font-bold text-ink-primary">{totalSessions}</div>
                <div className="text-xs text-ink-muted">Play sessions</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-ink-primary">{Math.round(totalQuestions)}</div>
                <div className="text-xs text-ink-muted">Questions answered</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-ink-primary">
                  {categoryLevels.filter((c) => c.masteredStages === c.totalStages && c.totalStages > 0).length}
                  <span className="text-ink-muted font-normal text-lg">/{categoryLevels.length}</span>
                </div>
                <div className="text-xs text-ink-muted">Topics mastered</div>
              </div>
            </div>
          </div>

          {/* Strengths + Weaknesses quick summary */}
          <div className="flex flex-col gap-2 min-w-[180px]">
            {strengths.length > 0 && (
              <div className="bg-success/10 rounded-lg p-3 border border-success/40">
                <div className="text-xs font-bold text-success mb-1">💪 Strengths</div>
                {strengths.map((s) => (
                  <div key={s} className="text-xs text-success">{s}</div>
                ))}
              </div>
            )}
            {weaknesses.length > 0 && (
              <div className="bg-danger/10 rounded-lg p-3 border border-danger/40">
                <div className="text-xs font-bold text-danger mb-1">🎯 Focus areas</div>
                {weaknesses.map((w) => (
                  <div key={w} className="text-xs text-danger">{w}</div>
                ))}
              </div>
            )}
            {notStarted.length > 0 && (
              <div className="bg-surface-sunken rounded-lg p-3 border border-line-subtle">
                <div className="text-xs font-bold text-ink-muted mb-1">⏳ Not yet started</div>
                {notStarted.map((n) => (
                  <div key={n} className="text-xs text-ink-muted">{n}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Syllabus table */}
      <div className="bg-surface-raised rounded-2xl border border-line-subtle shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-line-subtle flex items-center justify-between">
          <div>
            <h3 className="font-bold text-ink-primary">Lifetime Skills Heat Map</h3>
            <p className="text-xs text-ink-muted mt-0.5">Aggregated across the whole ladder · Level 0–100 · 80+ = Mastered</p>
          </div>
          <Link
            href="/space-math"
            className="text-10 px-3 py-1.5 bg-primary-solid hover:bg-primary-hover text-ink-on-primary font-medium rounded-lg transition-colors duration-120 ease-ui"
          >
            🚀 Play Space Math
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-sunken text-xs text-ink-muted font-semibold uppercase tracking-wide">
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
      <div className="bg-surface-raised rounded-2xl border border-line-subtle shadow-sm p-6">
        <h3 className="font-bold text-ink-primary mb-4">Skill Heat Map</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {categoryLevels.map((cat) => (
            <div key={cat.id} className="flex flex-col items-center gap-2">
              <div
                className={`w-full rounded-xl flex items-center justify-center font-black text-ink-primary text-xl shadow-sm transition-all duration-700 ${levelColor(cat.level)}`}
                style={{ height: `${Math.max(40, cat.level)}px`, minHeight: "40px" }}
              >
                {cat.level > 20 ? cat.level : ""}
              </div>
              <div className="text-xs text-ink-muted text-center font-medium leading-tight">{cat.label}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-4 text-xs text-ink-muted">
          <span>0</span>
          {[0, 30, 50, 70, 85, 100].map((v, i, arr) => i < arr.length - 1 && (
            <div key={v} className={`flex-1 h-2 rounded ${levelColor(v + 1)}`} />
          ))}
          <span>100</span>
          <span className="ml-2">← Needs work · Developing · Progressing · Proficient · Mastered →</span>
        </div>
      </div>

      {data.totalQuestions === 0 && (
        <div className="bg-surface-raised border border-line-subtle rounded-xl p-5 text-center">
          <div className="text-3xl mb-2">🚀</div>
          <div className="font-medium text-ink-primary">No play sessions yet</div>
          <p className="text-ink-muted text-13 mt-1">
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
    <BentoPageLayout title="Cai's Learning Progress">
        {/* Toolbar */}
        <div className="mb-6 flex items-center justify-end flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-ink-muted">Updated {lastUpdated.toLocaleTimeString()}</span>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="text-sm px-3 py-1.5 rounded-lg border border-line-subtle hover:bg-surface-raised text-ink-primary disabled:opacity-50 bg-surface-raised shadow-sm"
            >
              {loading ? "Loading…" : "↻ Refresh"}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-surface-raised rounded-xl border border-line-subtle p-1 shadow-sm w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => tab.available && setActiveTab(tab.id as "math" | "language")}
              disabled={!tab.available}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? "bg-primary-solid text-ink-on-primary shadow-raised"
                  : tab.available
                  ? "text-ink-primary hover:bg-surface-sunken"
                  : "text-ink-muted cursor-not-allowed"
              }`}
            >
              {tab.label}
              {!tab.available && (
                <span className="ml-1.5 text-[10px] bg-surface-sunken text-ink-muted px-1.5 py-0.5 rounded-full font-medium">
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
          <div className="bg-surface-raised rounded-2xl border border-dashed border-line-subtle p-12 text-center">
            <div className="text-4xl mb-3">📖</div>
            <h3 className="text-lg font-semibold text-ink-primary mb-2">Language Arts coming soon</h3>
            <p className="text-ink-muted text-sm max-w-sm mx-auto">
              Reading comprehension, spelling, and phonics progress will appear here once those games are built.
            </p>
          </div>
        )}
    </BentoPageLayout>
  );
}
