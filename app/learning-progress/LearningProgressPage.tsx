"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import BentoPageLayout from "../components/BentoPageLayout";
import { Bento } from "../components/ui/bento";
import { Badge, Button, Callout, Flex, Table, Tabs, Text } from "@radix-ui/themes";
import { cn } from "../lib/utils";

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
    <Table.Row className="hover:bg-[var(--gray-a3)]">
      {/* Category */}
      <Table.Cell>
        <div className="font-semibold text-ink-primary text-sm">{cat.label}</div>
        <div className="text-xs text-ink-muted mt-0.5">{cat.description}</div>
      </Table.Cell>

      {/* Level bar */}
      <Table.Cell className="w-52">
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
      </Table.Cell>

      {/* Status badge */}
      <Table.Cell>
        <Badge
          radius="full"
          color={cat.level >= 70 ? "green" : cat.level >= 30 ? "amber" : cat.total === 0 ? "gray" : "red"}
        >
          {levelLabel(cat.level)}
        </Badge>
      </Table.Cell>

      {/* Stages mastered */}
      <Table.Cell justify="center">
        <div className="flex items-center justify-center gap-0.5">
          {Array.from({ length: cat.totalStages }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-sm ${i < cat.masteredStages ? "bg-success" : "bg-surface-overlay"}`}
            />
          ))}
        </div>
        <div className="text-xs text-ink-muted mt-0.5">{cat.masteredStages}/{cat.totalStages} stages</div>
      </Table.Cell>

      {/* Accuracy */}
      <Table.Cell justify="center">
        <div className="text-sm font-bold text-ink-primary">
          {cat.total > 0 ? `${Math.round((cat.correct / cat.total) * 100)}%` : "—"}
        </div>
        <div className="text-xs text-ink-muted">{cat.correct}/{cat.total} correct</div>
      </Table.Cell>

      {/* Trend */}
      <Table.Cell justify="center">
        <span className={`text-lg font-bold ${trendColor(cat.trend)}`}>{trendIcon(cat.trend)}</span>
      </Table.Cell>

      {/* Last played */}
      <Table.Cell justify="end" className="text-xs text-ink-muted">
        {fmtDate(cat.lastPlayed)}
      </Table.Cell>
    </Table.Row>
  );
}

function SkillLadder({ data }: { data: ProgressData }) {
  const { ladder, upcoming, skillsMastered, totalSkills, ladderAccuracy, ladderCorrect, ladderAttempts } = data;
  const pct = totalSkills > 0 ? Math.round((skillsMastered / totalSkills) * 100) : 0;
  return (
    <Bento className="overflow-hidden p-0">
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
              <Badge
                radius="full"
                className="shrink-0 uppercase"
                color={status === "mastered" ? "green" : status === "learning" ? "amber" : "gray"}
              >
                {status === "mastered" ? "In review" : status === "learning" ? "Learning" : "Not started"}
              </Badge>
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
    </Bento>
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
      <Callout.Root color="red" role="alert">
        <Callout.Text>
          {error}{" "}
          <Button size="1" variant="soft" color="red" onClick={onRefresh} className="ml-1">
            Retry
          </Button>
        </Callout.Text>
      </Callout.Root>
    );
  }

  if (!data) return null;

  const { categoryLevels, overallLevel, focusSkills, reviewSkills, skillsMastered, totalSkills, syllabusComplete, strengths, weaknesses, notStarted, totalSessions, totalQuestions } = data;
  const ladderPct = totalSkills > 0 ? Math.round((skillsMastered / totalSkills) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Where the learner is on the ladder — no grade placement */}
      <Bento size="3" className={cn("flex items-start gap-5 flex-wrap", syllabusComplete && "bg-[var(--green-a3)]")}>
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
          <Bento size="1" title="Working on now">
            {focusSkills.length > 0 ? (
              focusSkills.map((s) => (
                <div key={s.stageId} className="text-xs text-ink-primary truncate" title={s.label}>
                  {s.rung}. {s.label}
                </div>
              ))
            ) : (
              <div className="text-xs text-ink-muted">Nothing left to learn 🎉</div>
            )}
          </Bento>
          <Bento size="1" title={<Text color="green">In review rotation</Text>}>
            <div className="text-xs text-ink-muted">
              {reviewSkills.length > 0
                ? `${reviewSkills.length} mastered skills still mixed in`
                : "Nothing mastered yet"}
            </div>
          </Bento>
        </div>
      </Bento>

      {/* Full ladder checklist */}
      <SkillLadder data={data} />

      {/* Hero summary */}
      <Bento size="3">
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
              <Callout.Root size="1" color="green" variant="surface">
                <Callout.Text size="1">
                  <strong className="mb-1 block">💪 Strengths</strong>
                  {strengths.map((s) => (
                    <span key={s} className="block">{s}</span>
                  ))}
                </Callout.Text>
              </Callout.Root>
            )}
            {weaknesses.length > 0 && (
              <Callout.Root size="1" color="red" variant="surface">
                <Callout.Text size="1">
                  <strong className="mb-1 block">🎯 Focus areas</strong>
                  {weaknesses.map((w) => (
                    <span key={w} className="block">{w}</span>
                  ))}
                </Callout.Text>
              </Callout.Root>
            )}
            {notStarted.length > 0 && (
              <Callout.Root size="1" color="gray" variant="surface">
                <Callout.Text size="1">
                  <strong className="mb-1 block">⏳ Not yet started</strong>
                  {notStarted.map((n) => (
                    <span key={n} className="block">{n}</span>
                  ))}
                </Callout.Text>
              </Callout.Root>
            )}
          </div>
        </div>
      </Bento>

      {/* Syllabus table */}
      <Bento className="overflow-hidden p-0">
        <div className="px-6 py-4 border-b border-line-subtle flex items-center justify-between">
          <div>
            <h3 className="font-bold text-ink-primary">Lifetime Skills Heat Map</h3>
            <p className="text-xs text-ink-muted mt-0.5">Aggregated across the whole ladder · Level 0–100 · 80+ = Mastered</p>
          </div>
          <Button asChild size="1">
            <Link href="/space-math">🚀 Play Space Math</Link>
          </Button>
        </div>
        <Table.Root variant="ghost">
          <Table.Header>
            <Table.Row className="text-xs uppercase tracking-wide">
              <Table.ColumnHeaderCell>Topic</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Level</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell justify="center">Stages</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell justify="center">Accuracy</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell justify="center">Trend</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell justify="end">Last Played</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {categoryLevels.map((cat) => (
              <CategoryRow key={cat.id} cat={cat} />
            ))}
          </Table.Body>
        </Table.Root>
      </Bento>

      {/* Heat map visual */}
      <Bento size="3">
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
      </Bento>

      {data.totalQuestions === 0 && (
        <Bento size="3" className="text-center">
          <div className="text-3xl mb-2">🚀</div>
          <div className="font-medium text-ink-primary">No play sessions yet</div>
          <p className="text-ink-muted text-13 mt-1">
            Head to <Link href="/space-math" className="underline font-semibold">Space Math</Link> and play a few stages — Student&apos; progress will appear here automatically.
          </p>
        </Bento>
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
            <Button variant="surface" color="gray" onClick={load} disabled={loading}>
              {loading ? "Loading…" : "↻ Refresh"}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs.Root value={activeTab} onValueChange={(v) => setActiveTab(v as "math" | "language")} className="mb-6">
          <Tabs.List>
            {TABS.map((tab) => (
              <Tabs.Trigger key={tab.id} value={tab.id} disabled={!tab.available}>
                <Flex align="center" gap="2">
                  {tab.label}
                  {!tab.available && (
                    <Badge size="1" radius="full" color="gray">
                      Soon
                    </Badge>
                  )}
                </Flex>
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs.Root>

        {/* Tab content */}
        {activeTab === "math" && (
          <MathTab data={data} loading={loading} error={error} onRefresh={load} />
        )}
        {activeTab === "language" && (
          <Bento size="5" className="text-center">
            <div className="text-4xl mb-3">📖</div>
            <h3 className="text-lg font-semibold text-ink-primary mb-2">Language Arts coming soon</h3>
            <p className="text-ink-muted text-sm max-w-sm mx-auto">
              Reading comprehension, spelling, and phonics progress will appear here once those games are built.
            </p>
          </Bento>
        )}
    </BentoPageLayout>
  );
}
