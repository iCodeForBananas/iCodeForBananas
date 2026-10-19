"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import ClientOnly from "@/app/lib/ClientOnly";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import BentoPageLayout from "@/app/components/BentoPageLayout";
import BentoBoard, { type BentoPanel } from "@/app/components/BentoBoard";
import { Bento } from "@/app/components/ui/bento";
import { Button, Flex, IconButton, Select, Text, TextField } from "@radix-ui/themes";
import { X } from "lucide-react";
import { PERCENTILE_LIFTS, latestWeights, percentileBand, populationPercentile } from "./percentile";
import { weeklyCoverage } from "./coverage";

interface LogEntry {
  id: string;
  user_id: string;
  exercise: string;
  date: string;
  weight?: number | null;
}

/**
 * What can be logged: the five lifts of a 5x5 program, in program order.
 *   A: Squat, Bench Press, Barbell Row
 *   B: Squat, Overhead Press, Deadlift
 */
const LIFTS = ["Squat", "Bench Press", "Barbell Row", "Overhead Press", "Deadlift"];

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

export default function WorkoutTrackerContent() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const { user } = useAuth();
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const getSupabase = () => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  };
  const [date, setDate] = useState(today);
  // Explicit rather than LIFTS[0] — that coupled the log form's
  // default to whatever happened to sort first in the array, and silently
  // changed to "Barbell Row" the moment it was added at the top of the list.
  const [selected, setSelected] = useState("Bench Press");
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
    // From the logs rather than LIFTS, so exercises logged before the 5x5
    // list still chart.
    return [...new Set(chartLogs.map((l) => l.exercise))].sort().map((name) => ({ name }));
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

  // The most recent entry per exercise, which is what the population
  // percentiles below are measured on.
  const latest = useMemo(() => latestWeights(logs), [logs]);

  // Picking an exercise prefills the weight it was last logged at, so a
  // lift that's always the same number doesn't need retyping every time.
  // Bodyweight exercises are typically logged with no weight at all, so a
  // last value of 0 clears the field rather than filling in a literal "0"
  // that would read as a real number instead of "bodyweight only".
  const selectExercise = (name: string) => {
    setSelected(name);
    const last = latest.get(name)?.weight;
    setWeight(last ? String(last) : "");
  };

  // Axis text is sized down on a narrow chart. Measuring the chart's own rendered width (rather than the viewport) means
  // this tracks a resized sidebar or split view too, not just a phone.
  //
  // A callback ref rather than useRef+useEffect: the chart's div only exists
  // once logs have loaded and exercisesWithLogs is non-empty, so an effect
  // with an empty dependency array would run before that div is ever mounted
  // and never find it. A callback ref fires exactly when the node attaches.
  const [chartWidth, setChartWidth] = useState(0);
  const chartObserverRef = useRef<ResizeObserver | null>(null);
  const chartRef = useCallback((el: HTMLDivElement | null) => {
    chartObserverRef.current?.disconnect();
    if (!el) return;
    // Measured directly rather than waiting on the observer's own first
    // callback, so the very first paint already has a real width instead of
    // one render at the 0-width (non-narrow) default.
    setChartWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setChartWidth(entry.contentRect.width));
    ro.observe(el);
    chartObserverRef.current = ro;
  }, []);
  const narrowChart = chartWidth > 0 && chartWidth < 480;

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

  // Which muscle groups the last 7 days reached, and through what
  const coverage = useMemo(() => weeklyCoverage(logs, today()), [logs]);

  // ── Bento panel contents ──────────────────────────────────────────────────

  // Lift names get the same color they have on the chart, and a fixed color
  // for the ones that haven't been logged in the chart's window.
  const liftColor = (name: string) => {
    const i = exercisesWithLogs.findIndex((ex) => ex.name === name);
    return i >= 0 ? COLORS[i % COLORS.length] : "var(--ds-color-primary-solid)";
  };

  const progressContent = (
    <div className='space-y-4'>
      {PERCENTILE_LIFTS.map((name) => {
          const entry = latest.get(name);
          const pct = entry ? populationPercentile(name, entry.weight) : null;
          const band = entry ? percentileBand(name, entry.weight) : null;
          return (
            <div key={name}>
              <div className='flex items-baseline justify-between gap-2 mb-1.5'>
                <span className='text-sm font-medium'>
                  {name}
                  {entry && entry.weight > 0 && (
                    <span className='ml-2 text-xs font-normal text-ink-muted'>{entry.weight} lbs</span>
                  )}
                </span>
                <span className='text-xs text-ink-muted'>
                  {band != null ? (
                    <>
                      <span className='text-ink-primary font-medium'>{band}</span> percentile
                    </>
                  ) : (
                    "Not logged yet"
                  )}
                </span>
              </div>
              <div
                className='relative h-2.5 rounded-full bg-surface-overlay'
                role='meter'
                aria-label={`${name}: percentile against the general adult male population, estimated`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct != null ? Math.round(pct) : 0}
              >
                <div
                  className='absolute inset-y-0 left-0 rounded-full'
                  style={{ width: `${pct ?? 0}%`, backgroundColor: liftColor(name) }}
                />
                {/* Quartile notches; the median is the middle one. */}
                {[25, 50, 75].map((q) => (
                  <div key={q} className='absolute inset-y-0 w-0.5 bg-surface-base' style={{ left: `${q}%` }} />
                ))}
              </div>
              <div className='relative h-4 text-10 text-ink-muted mt-1'>
                <span className='absolute left-0'>0</span>
                <span className='absolute left-1/2 -translate-x-1/2'>Median</span>
                <span className='absolute right-0'>100</span>
              </div>
            </div>
          );
      })}
    </div>
  );

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

  const coverageContent = (() => {
    const most = Math.max(...coverage.map((c) => c.score));
    const missed = coverage.filter((c) => c.score === 0).map((c) => c.muscle);
    return (
      <div>
        <p className='text-sm mb-4'>
          {most === 0
            ? "Nothing logged in the last 7 days."
            : missed.length
              ? <>Not worked this week: <span className='text-danger font-medium'>{missed.join(", ")}</span></>
              : "Every muscle group worked this week."}
        </p>
        <div className='space-y-3'>
          {coverage.map(({ muscle, score, exercises }) => (
            <div key={muscle}>
              <div className='flex items-center gap-3'>
                <div className={`capitalize text-sm w-24 shrink-0 ${score === 0 ? "text-danger" : ""}`}>{muscle}</div>
                <div className='flex-1 h-2 rounded-full bg-surface-sunken overflow-hidden'>
                  {score > 0 && (
                    <div
                      className='h-full rounded-full'
                      style={{ width: `${(score / most) * 100}%`, backgroundColor: "var(--ds-color-primary-solid)" }}
                    />
                  )}
                </div>
              </div>
              <ul className='text-xs mt-1 flex flex-wrap gap-x-3 gap-y-0.5'>
                {exercises.map((e) => (
                  <li key={e.exercise} className={e.days > 0 ? "text-ink-primary font-medium" : "text-ink-muted"}>
                    {e.exercise}
                    {e.days > 1 && ` ×${e.days}`}
                    {!e.primary && <span className='font-normal text-ink-muted'> (assist)</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  })();

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
                <IconButton size='3' variant='ghost' color='red' onClick={() => remove(l.id)} aria-label='Delete' className='shrink-0'>
                  <X className='h-4 w-4' />
                </IconButton>
              )}
            </div>
          ))}
        </div>
        {totalPages > 1 && (
          <Flex align='center' justify='center' gap='3' mt='4'>
            <Button size='3' variant='surface' color='gray' onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
              ← Prev
            </Button>
            <Text size='2' color='gray'>
              {page + 1} / {totalPages}
            </Text>
            <Button size='3' variant='surface' color='gray' onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1}>
              Next →
            </Button>
          </Flex>
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
      title: "Muscle Coverage",
      tooltip:
        "Which muscle groups your workouts in the last 7 days reached, and through which exercises. Under each group are the exercises that work it, the ones you did this week in bold. The bar is days that group was worked, with an assisting role (triceps on a bench, biceps on a row) counting as half. Anything not worked this week is what to balance out next.",
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
        <Bento className='mb-4'>
          <div className='flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-end max-w-3xl mx-auto'>
            <TextField.Root
              type='date'
              size='3'
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label='Date'
              className='w-full sm:w-auto'
            />
            <Select.Root size='3' value={selected} onValueChange={selectExercise}>
              <Select.Trigger aria-label='Exercise' className='w-full sm:flex-1 sm:min-w-[140px]' />
              <Select.Content position='popper'>
                {LIFTS.map((name) => (
                  <Select.Item key={name} value={name}>{name}</Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
            <TextField.Root
              type='number'
              size='3'
              min={0}
              step={5}
              value={weight}
              placeholder='lbs'
              aria-label='Weight in pounds'
              onChange={(e) => setWeight(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className='w-full sm:w-24'
            />
            <Button size='3' onClick={submit} className='w-full sm:w-auto'>
              Submit
            </Button>
          </div>
        </Bento>
      )}

      {/* Weight progress chart */}
      {exercisesWithLogs.length > 0 && chartData.length > 0 && (
        <Bento
          title='Weight Progress'
          className='mb-4'
        >
          <div ref={chartRef} className='h-[360px] sm:h-[480px]'>
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
                    fontSize={narrowChart ? 10 : 11}
                    tickFormatter={(t) => {
                      const dt = new Date(t);
                      return `${dt.getMonth() + 1}/${dt.getDate()}`;
                    }}
                  />
                  <YAxis fontSize={narrowChart ? 10 : 11} unit=' lbs' />
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
        </Bento>
      )}

      {/* Strength vs the general adult male population, per
          lift. "Male, Est." in the title rather than leaving that assumption
          silent — the source table is user-supplied, not a cited dataset,
          and doesn't cover women or account for age. Its own panel right
          after the chart rather than folded into the draggable board below,
          so it stays put next to the numbers it explains. */}
      <Bento title='Strength Percentile (Male, Est.)' className='mb-4'>
        {progressContent}
      </Bento>

      {/* Activity, Body Part Coverage, All Entries — bento grid */}
      <BentoBoard panels={bentoPanels} storageKey="workout-tracker-bento-layout" />
    </BentoPageLayout>
  );
}
