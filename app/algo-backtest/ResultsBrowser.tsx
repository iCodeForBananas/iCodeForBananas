"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flex, Select, Switch, Text } from "@radix-ui/themes";
import { Button } from "@/app/components/ui/button";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronDown } from "lucide-react";
import { Bento } from "../components/ui/bento";
import { cn } from "@/app/lib/utils";
import {
  countMatching,
  filteredCount,
  needsScan,
  queryPage,
  type PageCursor,
  type ResultRow,
  type RowFilter,
  type RunMeta,
  type SortField,
} from "./runStore";

type Direction = "asc" | "desc";

interface Metric {
  label: string;
  /** Short form for the row's right-hand column. */
  short: string;
  /** The stored field it sorts on; each has an IndexedDB index. */
  field: SortField;
  format: (v: number) => string;
  /** Which way is better, so picking a metric puts the best results first. */
  better: Direction;
  /** Colour the value green/red by sign. */
  signed?: boolean;
}

const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const money = (v: number) => `$${v.toFixed(2)}`;

const METRICS = {
  pnl: { label: "Strategy P&L", short: "P&L", field: "totalPnlPercent", format: pct, better: "desc", signed: true },
  buyHold: { label: "Buy & hold", short: "B&H", field: "buyAndHoldPnlPercent", format: pct, better: "desc", signed: true },
  alpha: { label: "Alpha vs buy & hold", short: "Alpha", field: "alpha", format: pct, better: "desc", signed: true },
  // Choose by the first 70% of the bars, then check the last 30%, which the
  // choice never saw. The best of a sweep usually does far worse there.
  inSample: { label: "In-sample P&L (first 70%)", short: "In-sample", field: "inSamplePnlPercent", format: pct, better: "desc", signed: true },
  outOfSample: { label: "Out-of-sample P&L (last 30%)", short: "Out-of-sample", field: "outOfSamplePnlPercent", format: pct, better: "desc", signed: true },
  winRate: { label: "Win rate", short: "Win", field: "winRate", format: (v) => `${v.toFixed(1)}%`, better: "desc" },
  // Infinity (no losing trades) sorts above every finite factor.
  profitFactor: { label: "Profit factor", short: "PF", field: "profitFactor", format: (v) => (v === Infinity ? "∞" : v.toFixed(2)), better: "desc" },
  maxDrawdown: { label: "Max drawdown", short: "DD", field: "maxDrawdownPercent", format: (v) => `-${v.toFixed(2)}%`, better: "asc" },
  sharpe: { label: "Sharpe ratio", short: "Sharpe", field: "sharpeRatio", format: (v) => v.toFixed(2), better: "desc", signed: true },
  trades: { label: "Total trades", short: "Trades", field: "totalTrades", format: (v) => String(v), better: "desc" },
  avgWin: { label: "Average win", short: "Avg win", field: "averageWin", format: money, better: "desc" },
  avgLoss: { label: "Average loss", short: "Avg loss", field: "averageLoss", format: money, better: "asc" },
} satisfies Record<string, Metric>;

type MetricKey = keyof typeof METRICS;

const ALL = "__all__";
/** Rows read from IndexedDB per page; more load as the list scrolls. */
const PAGE_SIZE = 100;
const BEATS_BUY_HOLD_KEY = "algo-backtest-beats-buy-hold";
// Sort and filters, remembered like the switch above.
const VIEW_KEY = "algo-backtest-results-view";

interface SavedView {
  sortKey?: string;
  direction?: string;
  strategy?: string;
  dataset?: string;
  minTrades?: number;
  maxDrawdown?: string;
  profitable?: boolean;
  profitableOutOfSample?: boolean;
  finiteProfitFactor?: boolean;
}

/** Choices for the minimum-trades filter; 0 is any. */
const MIN_TRADES = [0, 5, 10, 20, 30, 50, 100];
/** Choices for the max-drawdown filter, in percent. */
const MAX_DRAWDOWNS = ["10", "15", "20", "25", "30", "40", "50"];

function loadView(): SavedView {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(VIEW_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

/**
 * Every result from a run, filterable and sortable by any metric it collected.
 * The rows stay in IndexedDB; this reads them a page at a time in the chosen
 * order, so a run of any size costs only what has been scrolled into view.
 */
export default function ResultsBrowser({
  meta,
  active,
  onSelect,
  datasetLabel,
}: {
  meta: RunMeta;
  /** The result on the chart. */
  active: ResultRow | null;
  onSelect: (row: ResultRow) => void;
  datasetLabel: (file: string) => string;
}) {
  // A saved filter for a strategy or dataset this run doesn't have falls
  // back to all, so it can't hide every row.
  const [saved] = useState(loadView);
  const [sortKey, setSortKey] = useState<MetricKey>(() =>
    saved.sortKey && saved.sortKey in METRICS ? (saved.sortKey as MetricKey) : "pnl",
  );
  const [direction, setDirection] = useState<Direction>(() => (saved.direction === "asc" ? "asc" : "desc"));
  const [strategy, setStrategy] = useState(() =>
    saved.strategy && meta.groups.some((g) => g.strategyId === saved.strategy) ? saved.strategy : ALL,
  );
  const [dataset, setDataset] = useState(() =>
    saved.dataset && meta.groups.some((g) => g.dataset === saved.dataset) ? saved.dataset : ALL,
  );
  const [minTrades, setMinTrades] = useState(() => (MIN_TRADES.includes(saved.minTrades ?? 0) ? (saved.minTrades ?? 0) : 0));
  const [maxDrawdown, setMaxDrawdown] = useState(() => (saved.maxDrawdown && MAX_DRAWDOWNS.includes(saved.maxDrawdown) ? saved.maxDrawdown : ALL));
  const [profitable, setProfitable] = useState(() => saved.profitable === true);
  const [profitableOutOfSample, setProfitableOutOfSample] = useState(() => saved.profitableOutOfSample === true);
  const [finiteProfitFactor, setFiniteProfitFactor] = useState(() => saved.finiteProfitFactor === true);
  const extraActive = [minTrades > 0, maxDrawdown !== ALL, profitable, profitableOutOfSample, finiteProfitFactor].filter(Boolean).length;
  // Open on arrival when a remembered filter is on, so it never hides rows unseen.
  const [moreOpen, setMoreOpen] = useState(extraActive > 0);
  useEffect(() => {
    try {
      localStorage.setItem(
        VIEW_KEY,
        JSON.stringify({ sortKey, direction, strategy, dataset, minTrades, maxDrawdown, profitable, profitableOutOfSample, finiteProfitFactor }),
      );
    } catch {
      // Not remembered this time; the controls still work.
    }
  }, [sortKey, direction, strategy, dataset, minTrades, maxDrawdown, profitable, profitableOutOfSample, finiteProfitFactor]);
  // Remembered across visits. This list only renders once a run has results,
  // so it never renders on the server and can read storage up front. Storage
  // can still be unavailable (private window, blocked), so it's best-effort.
  const [beatsBuyHold, setBeatsBuyHold] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(BEATS_BUY_HOLD_KEY) === "1";
    } catch {
      return false;
    }
  });
  const changeBeatsBuyHold = (next: boolean) => {
    setBeatsBuyHold(next);
    try {
      localStorage.setItem(BEATS_BUY_HOLD_KEY, next ? "1" : "0");
    } catch {
      // Not remembered this time; the switch still works.
    }
  };

  const strategies = useMemo(() => {
    const seen = new Map<string, string>();
    for (const g of meta.groups) if (g.strategyId) seen.set(g.strategyId, g.strategyName);
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [meta]);

  const datasets = useMemo(
    () => [...new Set(meta.groups.map((g) => g.dataset).filter(Boolean))].sort(),
    [meta],
  );

  const filter = useMemo<RowFilter>(
    () => ({
      strategyId: strategy === ALL ? undefined : strategy,
      dataset: dataset === ALL ? undefined : dataset,
      beatsBuyHold,
      minTrades,
      maxDrawdownPct: maxDrawdown === ALL ? undefined : Number(maxDrawdown),
      profitable,
      profitableOutOfSample,
      finiteProfitFactor,
    }),
    [strategy, dataset, beatsBuyHold, minTrades, maxDrawdown, profitable, profitableOutOfSample, finiteProfitFactor],
  );
  const filterKey = JSON.stringify(filter);
  const countKey = `${meta.runId}|${filterKey}`;
  // The group tallies count the simple filters instantly; the rest need one
  // pass over the stored rows, so the count shows once that pass is done.
  const tallied = needsScan(filter) ? null : filteredCount(meta, filter);
  const [scanned, setScanned] = useState<{ key: string; n: number } | null>(null);
  useEffect(() => {
    if (!needsScan(filter)) return;
    let cancelled = false;
    countMatching(meta, filter)
      .then((n) => {
        if (!cancelled) setScanned({ key: countKey, n });
      })
      .catch((err) => console.error("Failed to count results:", err));
    return () => {
      cancelled = true;
    };
  }, [meta, filter, countKey]);
  const matching = tallied ?? (scanned?.key === countKey ? scanned.n : null);

  // The pages read so far, and where the next one starts. A query is keyed
  // by everything that shapes it, so a reply to an older one is dropped.
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [next, setNext] = useState<PageCursor | null>(null);
  const [loading, setLoading] = useState(false);
  const queryKey = `${meta.runId}|${sortKey}|${direction}|${filterKey}`;
  const queryKeyRef = useRef(queryKey);

  const load = useCallback(
    async (after: PageCursor | null) => {
      const key = queryKey;
      setLoading(true);
      try {
        const page = await queryPage({
          runId: meta.runId,
          field: METRICS[sortKey].field,
          direction,
          ...filter,
          after,
          limit: PAGE_SIZE,
        });
        if (queryKeyRef.current !== key) return;
        setRows((prev) => (after ? [...prev, ...page.rows] : page.rows));
        setNext(page.next);
      } catch (err) {
        console.error("Failed to read results:", err);
      } finally {
        if (queryKeyRef.current === key) setLoading(false);
      }
    },
    [queryKey, meta.runId, sortKey, direction, filter],
  );

  useEffect(() => {
    queryKeyRef.current = queryKey;
    setRows([]);
    setNext(null);
    void load(null);
  }, [queryKey, load]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (next && !loading && el.scrollTop + el.clientHeight > el.scrollHeight - 400) void load(next);
  };

  const metric: Metric = METRICS[sortKey];
  const showStrategy = strategies.length > 1;
  const showDataset = datasets.length > 1;

  return (
    <Bento
      fill
      title={`Results · ${
        matching === meta.total ? meta.total.toLocaleString() : `${matching === null ? "…" : matching.toLocaleString()} of ${meta.total.toLocaleString()}`
      }`}
      bodyClassName='flex flex-col p-0 overflow-hidden'
    >
      <Flex direction='column' gap='2' className='shrink-0 border-b border-line-subtle p-3'>
        <Flex gap='2' align='center'>
          <Select.Root
            size='1'
            value={sortKey}
            onValueChange={(v) => {
              const key = v as MetricKey;
              setSortKey(key);
              setDirection(METRICS[key].better);
            }}
          >
            <Select.Trigger className='min-w-0 flex-1' aria-label='Sort by' />
            <Select.Content position='popper'>
              <Select.Group>
                <Select.Label>Sort by</Select.Label>
                {(Object.keys(METRICS) as MetricKey[]).map((key) => (
                  <Select.Item key={key} value={key}>
                    {METRICS[key].label}
                  </Select.Item>
                ))}
              </Select.Group>
            </Select.Content>
          </Select.Root>
          <Button
            size='icon-sm'
            variant='secondary'
            onClick={() => setDirection((d) => (d === "desc" ? "asc" : "desc"))}
            aria-label={direction === "desc" ? "Highest first" : "Lowest first"}
            title={direction === "desc" ? "Highest first" : "Lowest first"}
          >
            {direction === "desc" ? <ArrowDownWideNarrow className='size-3.5' /> : <ArrowUpNarrowWide className='size-3.5' />}
          </Button>
        </Flex>
        {(showStrategy || showDataset) && (
          <Flex gap='2'>
            {showStrategy && (
              <Select.Root size='1' value={strategy} onValueChange={setStrategy}>
                <Select.Trigger className='min-w-0 flex-1' aria-label='Strategy' />
                <Select.Content position='popper'>
                  <Select.Item value={ALL}>All strategies</Select.Item>
                  {strategies.map(([id, name]) => (
                    <Select.Item key={id} value={id}>
                      {name}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            )}
            {showDataset && (
              <Select.Root size='1' value={dataset} onValueChange={setDataset}>
                <Select.Trigger className='min-w-0 flex-1' aria-label='Dataset' />
                <Select.Content position='popper'>
                  <Select.Item value={ALL}>All datasets</Select.Item>
                  {datasets.map((file) => (
                    <Select.Item key={file} value={file}>
                      {datasetLabel(file)}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            )}
          </Flex>
        )}
        <Text as='label' size='1' color='gray'>
          <Flex gap='2' align='center'>
            <Switch size='1' checked={beatsBuyHold} onCheckedChange={changeBeatsBuyHold} />
            Only results that beat buy &amp; hold
          </Flex>
        </Text>
        <button
          type='button'
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          className='flex min-h-6 items-center gap-1 self-start text-xs text-ink-muted hover:text-ink-primary'
        >
          More filters{extraActive > 0 && ` (${extraActive} on)`}
          <ChevronDown aria-hidden className={cn("size-3.5 transition-transform", moreOpen && "rotate-180")} />
        </button>
        {moreOpen && (
          <Flex direction='column' gap='2'>
            <Flex gap='2'>
              <Select.Root size='1' value={String(minTrades)} onValueChange={(v) => setMinTrades(Number(v))}>
                <Select.Trigger className='min-w-0 flex-1' aria-label='Minimum trades' />
                <Select.Content position='popper'>
                  {MIN_TRADES.map((n) => (
                    <Select.Item key={n} value={String(n)}>
                      {n === 0 ? "Any number of trades" : `At least ${n} trades`}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
              <Select.Root size='1' value={maxDrawdown} onValueChange={setMaxDrawdown}>
                <Select.Trigger className='min-w-0 flex-1' aria-label='Maximum drawdown' />
                <Select.Content position='popper'>
                  <Select.Item value={ALL}>Any drawdown</Select.Item>
                  {MAX_DRAWDOWNS.map((d) => (
                    <Select.Item key={d} value={d}>
                      Drawdown at most {d}%
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Flex>
            {(
              [
                [finiteProfitFactor, setFiniteProfitFactor, "Hide infinite profit factor (no losing trades)"],
                [profitable, setProfitable, "Only profitable results"],
                [profitableOutOfSample, setProfitableOutOfSample, "Only profitable out-of-sample (last 30%)"],
              ] as const
            ).map(([checked, set, label]) => (
              <Text key={label} as='label' size='1' color='gray'>
                <Flex gap='2' align='center'>
                  <Switch size='1' checked={checked} onCheckedChange={set} />
                  {label}
                </Flex>
              </Text>
            ))}
          </Flex>
        )}
      </Flex>

      <div className='min-h-0 flex-1 overflow-y-auto' onScroll={onScroll}>
        {rows.length === 0 ? (
          <Text as='p' size='2' color='gray' className='p-4 text-center'>
            {loading ? "Loading…" : "No results match these filters."}
          </Text>
        ) : (
          <ul role='listbox' aria-label='Backtest results' className='divide-y divide-line-subtle'>
            {rows.map((r, rank) => {
              const selected = active !== null && r.runId === active.runId && r.seq === active.seq;
              const value = r[metric.field];
              return (
                <li key={r.seq} role='option' aria-selected={selected}>
                  <button
                    type='button'
                    onClick={() => onSelect(r)}
                    className={cn(
                      "flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-[var(--gray-a3)]",
                      selected && "bg-[var(--accent-a4)] hover:bg-[var(--accent-a4)]",
                    )}
                  >
                    <Text size='1' color='gray' className='w-7 shrink-0 pt-1 tabular-nums'>
                      {rank + 1}
                    </Text>
                    <Flex direction='column' gap='1' className='min-w-0 flex-1'>
                      <Text size='2' weight='medium' className='truncate'>
                        {[showStrategy && r.strategyName, (showDataset || !showStrategy) && r.dataset && datasetLabel(r.dataset)]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                      <Text size='1' color='gray' className='truncate font-mono' title={r.label}>
                        {r.label || "default parameters"}
                      </Text>
                      <Text size='1' color='gray' className='tabular-nums'>
                        P&amp;L <Text color={r.totalPnlPercent >= 0 ? "green" : "red"}>{pct(r.totalPnlPercent)}</Text>
                        {" · "}B&amp;H {pct(r.buyAndHoldPnlPercent)}
                        {" · "}
                        {r.winRate.toFixed(0)}% win · PF {r.profitFactor == null ? "–" : METRICS.profitFactor.format(r.profitFactor)}
                        {" · "}
                        {r.totalTrades} trades
                      </Text>
                      {r.outOfSamplePnlPercent !== undefined && (
                        <Text size='1' color='gray' className='tabular-nums'>
                          In-sample <Text color={(r.inSamplePnlPercent ?? 0) >= 0 ? "green" : "red"}>{pct(r.inSamplePnlPercent ?? 0)}</Text>
                          {" · "}Out-of-sample <Text color={r.outOfSamplePnlPercent >= 0 ? "green" : "red"}>{pct(r.outOfSamplePnlPercent)}</Text>
                          {" "}(B&amp;H {pct(r.outOfSampleBuyAndHoldPercent ?? 0)})
                        </Text>
                      )}
                    </Flex>
                    <Flex direction='column' align='end' className='shrink-0'>
                      <Text
                        size='2'
                        weight='bold'
                        className='tabular-nums'
                        color={metric.signed ? (value >= 0 ? "green" : "red") : undefined}
                        highContrast={!metric.signed}
                      >
                        {metric.format(value)}
                      </Text>
                      <Text size='1' color='gray'>
                        {metric.short}
                      </Text>
                    </Flex>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {next && rows.length > 0 && (
          <Text as='p' size='1' color='gray' className='border-t border-line-subtle p-3 text-center'>
            {loading ? "Loading more…" : `Showing ${rows.length.toLocaleString()}${matching === null ? "" : ` of ${matching.toLocaleString()}`}. Scroll for more.`}
          </Text>
        )}
      </div>
    </Bento>
  );
}
