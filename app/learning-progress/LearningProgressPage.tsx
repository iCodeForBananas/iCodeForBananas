"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import BentoPageLayout from "../components/BentoPageLayout";
import { Bento } from "../components/ui/bento";
import { Badge, Button, Callout, Flex, Tabs } from "@radix-ui/themes";

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
  reviewedThisWeek: number;
}

interface SubjectStat {
  id: string;
  label: string;
  description: string;
  masteredCount: number;
  practicingCount: number;
  notStartedCount: number;
  totalCount: number;
  skills: SkillStat[];
}

interface WeeklySummary {
  newlyMastered: string[];
  practicingCount: number;
  reviewedCount: number;
  reviewedAccuracy: number | null;
}

interface ProgressData {
  player: string;
  subjects: SubjectStat[];
  weeklySummary: WeeklySummary;
  overallMasteredCount: number;
  overallTotalCount: number;
  totalSessions: number;
  totalQuestions: number;
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

// ─── WeeklySummary ──────────────────────────────────────────────────────────

function WeeklySummaryLine({ summary }: { summary: WeeklySummary }) {
  const { newlyMastered, practicingCount, reviewedCount, reviewedAccuracy } = summary;
  const nothingThisWeek = newlyMastered.length === 0 && practicingCount === 0 && reviewedCount === 0;

  if (nothingThisWeek) {
    return (
      <Bento size="3" className="text-sm text-ink-muted">
        No play sessions this week yet — <Link href="/space-math" className="underline font-semibold">play Space Math</Link> to get started.
      </Bento>
    );
  }

  const parts: string[] = [];
  if (newlyMastered.length > 0) {
    parts.push(`mastered ${newlyMastered.length} new skill${newlyMastered.length === 1 ? "" : "s"} (${newlyMastered.join(", ")})`);
  }
  if (practicingCount > 0) {
    parts.push(`practicing ${practicingCount}`);
  }
  if (reviewedCount > 0) {
    const pct = reviewedAccuracy != null ? ` at ${Math.round(reviewedAccuracy * 100)}%` : "";
    parts.push(`reviewed ${reviewedCount} old skill${reviewedCount === 1 ? "" : "s"}${pct}`);
  }

  return (
    <Bento size="3" className="bg-[var(--green-a3)]">
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">📅</span>
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-1">This week</div>
          <p className="text-sm text-ink-primary font-medium">{parts.join(" · ")}</p>
        </div>
      </div>
    </Bento>
  );
}

// ─── SkillRow ───────────────────────────────────────────────────────────────

function SkillRow({ skill }: { skill: SkillStat }) {
  const acc = skill.accuracy != null ? Math.round(skill.accuracy * 100) : null;
  return (
    <div className="px-4 py-2.5 flex items-center gap-3 hover:bg-surface-sunken">
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
          skill.status === "mastered"
            ? "bg-success/25 text-success"
            : skill.status === "practicing"
              ? "bg-primary-solid/25 text-primary-text border border-primary-solid/40"
              : "bg-surface-sunken text-ink-muted border border-line-subtle"
        }`}
      >
        {skill.status === "mastered" ? "✓" : skill.status === "practicing" ? "•" : ""}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-ink-primary truncate">{skill.name}</div>
        <div className="text-[10px] text-ink-muted font-mono">{skill.standard}</div>
      </div>
      <div className="text-right text-xs shrink-0">
        {skill.status === "mastered" ? (
          skill.reviewedThisWeek > 0 ? (
            <span className="text-success font-semibold">✓ reviewed {skill.reviewedThisWeek}× this week</span>
          ) : (
            <span className="text-ink-muted">Mastered · {fmtDate(skill.lastPlayed)}</span>
          )
        ) : skill.status === "practicing" ? (
          <span className="text-ink-primary font-semibold">{acc}% so far · {fmtDate(skill.lastPlayed)}</span>
        ) : (
          <span className="text-ink-muted italic">Not started</span>
        )}
      </div>
    </div>
  );
}

// ─── SubjectCard ────────────────────────────────────────────────────────────

function SplitBar({ mastered, practicing, notStarted }: { mastered: number; practicing: number; notStarted: number }) {
  const total = Math.max(mastered + practicing + notStarted, 1);
  return (
    <div className="flex h-2.5 rounded-full overflow-hidden bg-surface-sunken w-full">
      {mastered > 0 && <div className="bg-success" style={{ width: `${(mastered / total) * 100}%` }} />}
      {practicing > 0 && <div className="bg-primary-solid" style={{ width: `${(practicing / total) * 100}%` }} />}
      {notStarted > 0 && <div className="bg-surface-overlay" style={{ width: `${(notStarted / total) * 100}%` }} />}
    </div>
  );
}

function SubjectCard({ subject }: { subject: SubjectStat }) {
  const [open, setOpen] = useState(false);

  if (subject.totalCount === 0) {
    return (
      <Bento size="2" className="opacity-60">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-ink-primary">{subject.label}</h3>
            <p className="text-xs text-ink-muted mt-0.5">{subject.description}</p>
          </div>
          <Badge radius="full" color="gray">Coming soon</Badge>
        </div>
      </Bento>
    );
  }

  return (
    <Bento size="2" className="overflow-hidden !p-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-5 py-4 hover:bg-surface-sunken transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-ink-primary">{subject.label}</h3>
            <p className="text-xs text-ink-muted mt-0.5">{subject.description}</p>
          </div>
          <span className={`text-ink-muted text-sm shrink-0 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </div>
        <div className="mt-3">
          <SplitBar mastered={subject.masteredCount} practicing={subject.practicingCount} notStarted={subject.notStartedCount} />
          <div className="flex items-center gap-3 mt-2 text-xs font-semibold flex-wrap">
            <span className="text-success">{subject.masteredCount} ✓</span>
            <span className="text-primary-text">{subject.practicingCount} practicing</span>
            <span className="text-ink-muted">{subject.notStartedCount} to go</span>
          </div>
        </div>
      </button>
      {open && (
        <div className="border-t border-line-subtle divide-y divide-line-subtle">
          {subject.skills.map((s) => (
            <SkillRow key={s.key} skill={s} />
          ))}
        </div>
      )}
    </Bento>
  );
}

// ─── MathTab ────────────────────────────────────────────────────────────────

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

  const { subjects, weeklySummary, overallMasteredCount, overallTotalCount, totalSessions, totalQuestions } = data;

  return (
    <div className="space-y-5">
      <WeeklySummaryLine summary={weeklySummary} />

      {/* Headline */}
      <Bento size="3" className="flex items-center gap-5 flex-wrap">
        <div className="w-20 h-20 rounded-2xl flex flex-col items-center justify-center shadow-sm shrink-0 bg-primary-solid text-ink-on-primary">
          <span className="text-3xl font-black leading-none tabular-nums">{overallMasteredCount}</span>
          <span className="text-[10px] font-semibold opacity-80 mt-0.5">of {overallTotalCount}</span>
        </div>
        <div className="flex-1 min-w-[220px]">
          <div className="text-10 font-semibold uppercase tracking-wider text-ink-muted mb-0.5">Skills mastered so far</div>
          <h2 className="text-2xl font-black text-ink-primary">Spaced repetition · one skill at a time</h2>
          <p className="text-xs text-ink-muted mt-1">
            No grade level — Cai works up a single ordered list of skills. A skill that&apos;s mastered doesn&apos;t
            disappear; it keeps coming back on a widening interval so it stays sharp, and that review is shown as
            reinforcement below, never as a lower score.
          </p>
        </div>
        <div className="flex gap-6 flex-wrap">
          <div>
            <div className="text-xl font-bold text-ink-primary tabular-nums">{totalSessions}</div>
            <div className="text-xs text-ink-muted">Play sessions</div>
          </div>
          <div>
            <div className="text-xl font-bold text-ink-primary tabular-nums">{Math.round(totalQuestions)}</div>
            <div className="text-xs text-ink-muted">Questions answered</div>
          </div>
        </div>
      </Bento>

      {/* Subject cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {subjects.map((s) => (
          <SubjectCard key={s.id} subject={s} />
        ))}
      </div>

      {totalQuestions === 0 && (
        <Bento size="3" className="text-center">
          <div className="text-3xl mb-2">🚀</div>
          <div className="font-medium text-ink-primary">No play sessions yet</div>
          <p className="text-ink-muted text-13 mt-1">
            Head to <Link href="/space-math" className="underline font-semibold">Space Math</Link> and play a few rounds — Cai&apos;s progress will appear here automatically.
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
