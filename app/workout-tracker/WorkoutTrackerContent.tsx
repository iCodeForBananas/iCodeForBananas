"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from "recharts";
import ClientOnly from "@/app/lib/ClientOnly";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import BentoPageLayout from "@/app/components/BentoPageLayout";
import BentoBoard, { type BentoPanel } from "@/app/components/BentoBoard";

interface LogEntry {
  id: string;
  user_id: string;
  exercise: string;
  date: string;
  weight?: number | null;
}

const COMPOUND: { name: string; type: "weighted" | "bodyweight" }[] = [
  { name: "Bench Press", type: "weighted" },
  { name: "Bent Over Rows", type: "weighted" },
  { name: "Bulgarian Split Squats", type: "weighted" },
  { name: "Deadlift", type: "weighted" },
  { name: "Overhead Press", type: "weighted" },
  { name: "Pull-ups", type: "bodyweight" },
  { name: "Push-ups", type: "bodyweight" },
  { name: "Squat", type: "weighted" },
];

const BODY_PART_MAP: Partial<Record<string, string[]>> = {
  "Bench Press": ["chest"],
  "Bent Over Rows": ["back"],
  "Bulgarian Split Squats": ["legs"],
  Deadlift: ["back", "legs"],
  "Overhead Press": ["shoulders"],
  "Pull-ups": ["back"],
  "Push-ups": ["chest"],
  Squat: ["legs"],
};

const BODY_PARTS = ["chest", "back", "shoulders", "legs"] as const;
type BodyPart = (typeof BODY_PARTS)[number];

/**
 * One color per body part: identity, not ranking, so it takes the
 * categorical set rather than a scale that would imply one part outranks
 * another.
 */
const BODY_PART_COLORS: Record<BodyPart, string> = {
  chest: "var(--ds-color-track-1)",
  back: "var(--ds-color-track-2)",
  shoulders: "var(--ds-color-track-3)",
  legs: "var(--ds-color-track-4)",
};

const BODY_PART_EXERCISES = (Object.entries(BODY_PART_MAP) as [string, string[]][]).reduce(
  (acc, [exercise, parts]) => {
    parts.forEach((part) => {
      if (part in acc) acc[part as BodyPart].push(exercise);
    });
    return acc;
  },
  { chest: [], back: [], shoulders: [], legs: [] } as Record<BodyPart, string[]>,
);

const localDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => localDateStr(new Date());
// noon avoids DST edges shifting a day across a boundary
const dayMs = (d: string) => new Date(d + "T12:00:00").getTime();
const DAY_MS = 86400000;

/**
 * One colour per exercise on the chart: identity, not ranking, which is what
 * color.track is for. There are six and the assignment wraps, exactly as
 * tokens/README says to use them.
 */
const COLORS = [
  "var(--ds-color-track-1)",
  "var(--ds-color-track-2)",
  "var(--ds-color-track-3)",
  "var(--ds-color-track-4)",
  "var(--ds-color-track-5)",
  "var(--ds-color-track-6)",
];

/**
 * Target working weights for a 5x5 program (deadlift is worked 1x5),
 * computed as bodyweight x ratio rather than hardcoded, so the lines move
 * with `bodyweightLbs` instead of going stale. Ratios are grouped by tier —
 * only "intermediate" is populated today, but a "novice" or "advanced" tier
 * slots in the same way without touching how targets are computed or drawn.
 */
const TARGET_CONFIG: { bodyweightLbs: number; tiers: Record<string, Record<string, number>> } = {
  bodyweightLbs: 185,
  tiers: {
    intermediate: {
      Squat: 1.25,
      "Bench Press": 0.8,
      Deadlift: 1.45,
      "Overhead Press": 0.6,
    },
  },
};

export default function WorkoutTrackerContent() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const { user } = useAuth();
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const getSupabase = () => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  };
  const [date, setDate] = useState(today);
  const [selected, setSelected] = useState(COMPOUND[0].name);
  const [weight, setWeight] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;
  // Reads are public: anyone can see the log. Writes stay behind auth, both
  // here and in the workout_logs RLS policies.
  const reload = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { data } = await sb.from("workout_logs").select("id, user_id, exercise, date, weight");
    setLogs((data as LogEntry[]) ?? []);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  const sortedExercises = useMemo(() => {
    const latest = new Map<string, string>();
    for (const l of logs) {
      const prev = latest.get(l.exercise);
      if (!prev || l.date > prev) latest.set(l.exercise, l.date);
    }
    return [...COMPOUND].sort((a, b) => a.name.localeCompare(b.name));
  }, [logs]);

  const submit = async () => {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("workout_logs").insert({ user_id: user!.id, exercise: selected, date, weight: +weight || 0 });
    setWeight("");
    setPage(0);
    reload();
  };

  const remove = async (id: string) => {
    const sb = getSupabase();
    if (!sb || !user) return;
    await sb.from("workout_logs").delete().eq("id", id).eq("user_id", user.id);
    setPage((p) => Math.max(0, p));
    reload();
  };

  // chart data: logged exercises over the last three months (weight defaults to 0)
  const chartLogs = useMemo(() => {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setMonth(cutoff.getMonth() - 3);
    const min = cutoff.getTime();
    return logs.filter((l) => dayMs(l.date) >= min);
  }, [logs]);

  const exercisesWithLogs = useMemo(() => {
    return COMPOUND.filter((c) => chartLogs.some((l) => l.exercise === c.name));
  }, [chartLogs]);

  const chartData = useMemo(() => {
    const dates = [...new Set(chartLogs.map((l) => l.date))].sort();
    return dates.map((d) => {
      // numeric timestamp: spaces points by real elapsed time, not by index
      const row: Record<string, string | number> = { date: d, t: dayMs(d) };
      for (const ex of exercisesWithLogs) {
        const entry = chartLogs.find((l) => l.exercise === ex.name && l.date === d);
        if (entry) row[ex.name] = entry.weight ?? 0;
      }
      return row;
    });
  }, [chartLogs, exercisesWithLogs]);

  // One tick per week, or per month once the span gets long, so the gaps
  // between sessions stay readable rather than collapsing to even spacing.
  const chartTicks = useMemo(() => {
    if (chartData.length === 0) return [];
    const first = chartData[0].t as number;
    const last = chartData[chartData.length - 1].t as number;
    const spanDays = (last - first) / DAY_MS;
    const ticks: number[] = [];
    const cur = new Date(first);
    if (spanDays > 180) {
      cur.setDate(1);
      while (cur.getTime() <= last) {
        if (cur.getTime() >= first) ticks.push(cur.getTime());
        cur.setMonth(cur.getMonth() + 1);
      }
    } else {
      const step = spanDays > 70 ? 14 : 7;
      while (cur.getTime() <= last) {
        ticks.push(cur.getTime());
        cur.setDate(cur.getDate() + step);
      }
    }
    if (ticks[ticks.length - 1] !== last) ticks.push(last);
    return ticks;
  }, [chartData]);

  const [hovered, setHovered] = useState<{ date: string; exercises: string[]; x: number; y: number } | null>(null);
  const [focusedExercise, setFocusedExercise] = useState<string | null>(null);
  const [hoveredBodyPart, setHoveredBodyPart] = useState<BodyPart | null>(null);

  // One target line per exercise per tier, in the same color as that
  // exercise's data line. Isolating the chart to one exercise (via the
  // legend) isolates its target lines the same way.
  const activeTargets = useMemo(() => {
    const lines: { exercise: string; tier: string; weight: number; color: string }[] = [];
    for (const [tier, ratios] of Object.entries(TARGET_CONFIG.tiers)) {
      exercisesWithLogs.forEach((ex, i) => {
        if (focusedExercise && focusedExercise !== ex.name) return;
        const ratio = ratios[ex.name];
        if (ratio == null) return;
        lines.push({
          exercise: ex.name,
          tier,
          weight: Math.round(TARGET_CONFIG.bodyweightLbs * ratio),
          color: COLORS[i % COLORS.length],
        });
      });
    }
    return lines;
  }, [exercisesWithLogs, focusedExercise]);

  // Reference lines don't factor into Recharts' own auto-domain calculation,
  // so a target above the highest logged weight would otherwise sit outside
  // the visible axis. Padded and rounded to a clean 5lb step to read the way
  // Recharts' own "auto" max would have.
  const yDomain = useMemo((): [number, number] => {
    const loggedMax = Math.max(
      0,
      ...chartData.flatMap((row) => exercisesWithLogs.map((ex) => Number(row[ex.name]) || 0)),
    );
    const targetMax = Math.max(0, ...activeTargets.map((t) => t.weight));
    const max = Math.max(loggedMax, targetMax);
    return [0, Math.ceil((max * 1.08) / 5) * 5];
  }, [chartData, exercisesWithLogs, activeTargets]);

  // Responsive activity graph: measure the container and compute how many weeks
  // fit at ~18px per cell so the grid is always 100% wide with no scrollbar.
  const graphRef = useRef<HTMLDivElement>(null);
  const [numWeeks, setNumWeeks] = useState(52);
  useEffect(() => {
    const el = graphRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      const cellTarget = 18; // target cell size in px
      const gapPx = 2;
      const computed = Math.floor((w + gapPx) / (cellTarget + gapPx));
      setNumWeeks(Math.min(52, Math.max(8, computed)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const contributionData = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const l of logs) {
      const arr = map.get(l.date) ?? [];
      arr.push(l.exercise + (l.weight ? ` @ ${l.weight} lbs` : ""));
      map.set(l.date, arr);
    }

    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 364); // 52 weeks
    // align to Sunday
    start.setDate(start.getDate() - start.getDay());

    const weeks: { date: string; count: number; exercises: string[] }[][] = [];
    let week: { date: string; count: number; exercises: string[] }[] = [];
    const cur = new Date(start);
    while (cur <= end) {
      const key = localDateStr(cur);
      const exercises = map.get(key) ?? [];
      week.push({ date: key, count: exercises.length, exercises });
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
      cur.setDate(cur.getDate() + 1);
    }
    if (week.length) weeks.push(week);
    return weeks;
  }, [logs]);

  // Count distinct days logged per exercise in the last 14 days
  const bodyPartCoverage = useMemo(() => {
    const todayStr = localDateStr(new Date());
    const cutoff = new Date(todayStr + "T12:00:00");
    cutoff.setDate(cutoff.getDate() - 13);
    const cutoffStr = localDateStr(cutoff);
    const recentLogs = logs.filter((l) => l.date >= cutoffStr && l.date <= todayStr);
    return BODY_PARTS.map((part) => ({
      part,
      days: new Set(recentLogs.filter((l) => (BODY_PART_MAP[l.exercise] ?? []).includes(part)).map((l) => l.date)).size,
    }));
  }, [logs]);

  // ── Bento panel contents ──────────────────────────────────────────────────

  const activityContent = (
    <div ref={graphRef} className='relative flex gap-[2px] w-full'>
      {contributionData.slice(-numWeeks).map((week, wi) => (
        <div key={wi} className='flex flex-col gap-[2px] flex-1'>
          {week.map((day) => (
            <div
              key={day.date}
              className='w-full aspect-square rounded-sm cursor-default'
              style={{
                backgroundColor:
                  day.count === 0
                    ? "var(--ds-color-surface-overlay)"
                    : day.count <= 1
                      ? "color-mix(in oklab, var(--ds-color-primary-solid) 30%, var(--ds-color-surface-overlay))"
                      : day.count <= 3
                        ? "color-mix(in oklab, var(--ds-color-primary-solid) 65%, var(--ds-color-surface-overlay))"
                        : "var(--ds-color-primary-solid)",
              }}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const parent = e.currentTarget.closest(".relative")!.getBoundingClientRect();
                setHovered({
                  date: day.date,
                  exercises: day.exercises,
                  x: rect.left - parent.left + rect.width / 2,
                  y: rect.top - parent.top - 8,
                });
              }}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </div>
      ))}
      {hovered && (
        <div
          className='absolute z-10 rounded-lg border border-line-subtle bg-surface-overlay px-3 py-2 text-10 text-ink-primary shadow-overlay pointer-events-none'
          style={{ left: hovered.x, top: hovered.y, transform: "translate(-50%, -100%)" }}
        >
          <div className='font-semibold mb-1'>
            {new Date(hovered.date + "T12:00:00").toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </div>
          {hovered.exercises.length === 0 ? (
            <div className='text-ink-muted'>No workouts</div>
          ) : (
            hovered.exercises.map((e, i) => <div key={i}>{e}</div>)
          )}
        </div>
      )}
    </div>
  );

  const coverageContent = (
    <div>
      <p className='text-xs text-ink-muted mb-4'>sessions in last 14 days</p>
      <div className='space-y-1'>
        {bodyPartCoverage.map(({ part, days }) => (
          <div
            key={part}
            className='relative flex items-center gap-3 py-3 px-3 rounded-lg cursor-default'
            onMouseEnter={() => setHoveredBodyPart(part as BodyPart)}
            onMouseLeave={() => setHoveredBodyPart(null)}
          >
            <div className='capitalize text-sm w-20'>{part}</div>
            <div className='flex gap-1'>
              {Array.from({ length: days }, (_, i) => (
                <span
                  key={i}
                  className='w-4 h-4 rounded-sm'
                  style={{ backgroundColor: BODY_PART_COLORS[part as BodyPart] }}
                />
              ))}
            </div>
            <div className='text-xs text-ink-muted w-8 text-right'>{days}x</div>
            {hoveredBodyPart === part && (
              <div className='absolute top-full left-0 mt-1 z-20 rounded-lg border border-line-subtle bg-surface-overlay px-3 py-2 text-10 text-ink-primary shadow-overlay pointer-events-none whitespace-nowrap'>
                <div className='font-semibold mb-1 capitalize'>{part} exercises</div>
                {BODY_PART_EXERCISES[part as BodyPart].map((ex) => (
                  <div key={ex} className='text-ink-muted'>{ex}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const allEntriesContent = (() => {
    if (logs.length === 0) {
      return (
        <p className='text-sm text-ink-muted'>
          {user ? "No entries yet. Log a workout above to get started." : "No entries yet."}
        </p>
      );
    }
    const sorted = [...logs].sort(
      (a, b) => b.date.localeCompare(a.date) || a.exercise.localeCompare(b.exercise),
    );
    const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
    const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    return (
      <>
        <div className='text-xs text-ink-muted mb-3'>{sorted.length} total</div>
        <div className='space-y-1'>
          {paged.map((l) => (
            <div
              key={l.id}
              className='flex items-center justify-between gap-2 py-3 border-b border-line-strong last:border-0'
            >
              <div className='text-sm min-w-0'>
                <span className='text-ink-muted mr-2 text-xs shrink-0'>
                  {new Date(l.date + "T12:00:00").toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span className='font-medium'>{l.exercise}</span>
                {l.weight != null && l.weight > 0 && (
                  <span className='text-ink-muted ml-1 text-xs'>@ {l.weight} lbs</span>
                )}
              </div>
              {user?.id === l.user_id && (
                <button
                  onClick={() => remove(l.id)}
                  className='shrink-0 w-11 h-11 flex items-center justify-center text-xl text-ink-muted hover:text-danger -mr-2'
                  aria-label='Delete'
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        {totalPages > 1 && (
          <div className='flex items-center justify-center gap-3 mt-4'>
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 0}
              className='text-sm px-4 py-2.5 rounded border border-line-strong disabled:opacity-30 min-h-[44px]'
            >
              ← Prev
            </button>
            <span className='text-sm text-ink-muted'>
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages - 1}
              className='text-sm px-4 py-2.5 rounded border border-line-strong disabled:opacity-30 min-h-[44px]'
            >
              Next →
            </button>
          </div>
        )}
      </>
    );
  })();

  const bentoPanels: BentoPanel[] = [
    {
      id: "activity",
      title: "Activity",
      tooltip: "Your workout frequency over the past year — darker yellow means more sessions that day.",
      defaultColSpan: 8,
      defaultRowSpan: 3,
      content: activityContent,
    },
    {
      id: "coverage",
      title: "Body Part Coverage",
      tooltip: "How many sessions you've hit each muscle group in the last 14 days.",
      defaultColSpan: 4,
      defaultRowSpan: 3,
      content: coverageContent,
    },
    {
      id: "entries",
      title: "All Entries",
      tooltip: user
        ? "Every workout you've logged, sorted newest first. Click × to delete an entry."
        : "Every workout logged, sorted newest first.",
      defaultColSpan: 12,
      defaultRowSpan: 4,
      content: allEntriesContent,
    },
  ];

  return (
    <BentoPageLayout title="Workout Tracker">
      {/* Log form */}
      {user && (
        <div className='rounded-2xl bg-surface-raised p-4 sm:p-5 mb-4' style={{ border: "1px solid var(--border-color)" }}>
          <div className='flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-end max-w-3xl mx-auto'>
            <input
              type='date'
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className='border border-line-strong rounded px-3 py-2.5 text-base bg-surface-raised min-h-[44px] w-full sm:w-auto'
            />
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className='border border-line-strong rounded px-3 py-2.5 text-base min-h-[44px] w-full sm:flex-1 sm:min-w-[140px]'
            >
              {sortedExercises.map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
            <input
              type='number'
              min={0}
              step={5}
              value={weight}
              placeholder='lbs'
              onChange={(e) => setWeight(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className='w-full sm:w-24 border border-line-strong rounded px-3 py-2.5 text-base min-h-[44px]'
            />
            <button
              onClick={submit}
              className='w-full sm:flex-none rounded bg-surface-base px-5 py-2.5 text-base font-medium text-primary-text hover:bg-surface-sunken/70 min-h-[44px]'
            >
              Submit
            </button>
          </div>
        </div>
      )}

      {/* Weight progress chart */}
      {exercisesWithLogs.length > 0 && chartData.length > 0 && (
        <div className='rounded-2xl bg-surface-raised mb-4' style={{ border: "1px solid var(--border-color)" }}>
          <div className='flex items-center gap-2 border-b px-3 py-2' style={{ borderColor: "var(--border-color)" }}>
            <h2 className='text-xs font-bold uppercase tracking-wide text-ink-muted'>Weight Progress</h2>
          </div>
          <div className='p-4 h-[360px] sm:h-[480px]'>
            <ClientOnly>
              <ResponsiveContainer width='100%' height='100%'>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray='3 3' stroke='var(--ds-color-border-subtle)' />
                  <XAxis
                    dataKey='t'
                    type='number'
                    scale='time'
                    domain={["dataMin", "dataMax"]}
                    ticks={chartTicks}
                    fontSize={11}
                    tickFormatter={(t) => {
                      const dt = new Date(t);
                      return `${dt.getMonth() + 1}/${dt.getDate()}`;
                    }}
                  />
                  <YAxis fontSize={11} unit=' lbs' domain={yDomain} />
                  <Tooltip
                    labelFormatter={(t) =>
                      new Date(t).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })
                    }
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "12px", cursor: "pointer" }}
                    onClick={(e) => setFocusedExercise((prev) => (prev === e.value ? null : (e.value as string)))}
                  />
                  {activeTargets.map((t) => (
                    <ReferenceLine
                      key={`${t.tier}-${t.exercise}`}
                      y={t.weight}
                      stroke={t.color}
                      strokeOpacity={0.6}
                      strokeDasharray='6 4'
                      label={{
                        value: `${t.exercise} ${t.tier} (${t.weight})`,
                        position: "insideTopLeft",
                        fill: t.color,
                        fontSize: 10,
                      }}
                    />
                  ))}
                  {exercisesWithLogs.map((ex, i) => (
                    <Line
                      key={ex.name}
                      type='monotone'
                      dataKey={ex.name}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                      hide={focusedExercise != null && focusedExercise !== ex.name}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ClientOnly>
          </div>
        </div>
      )}

      {/* Activity, Body Part Coverage, All Entries — bento grid */}
      <BentoBoard panels={bentoPanels} storageKey="workout-tracker-bento-layout" />
    </BentoPageLayout>
  );
}
