"use client";

import { useMemo, useState } from "react";
import { Flex, IconButton, Select, Switch, Text } from "@radix-ui/themes";
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { Bento } from "../components/ui/bento";
import { cn } from "@/app/lib/utils";
import type { ParameterizedResult } from "@/app/strategies";

type Direction = "asc" | "desc";

interface Metric {
  label: string;
  /** Short form for the row's right-hand column. */
  short: string;
  value: (r: ParameterizedResult) => number;
  format: (v: number) => string;
  /** Which way is better, so picking a metric puts the best results first. */
  better: Direction;
  /** Colour the value green/red by sign. */
  signed?: boolean;
}

const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const money = (v: number) => `$${v.toFixed(2)}`;

const METRICS = {
  pnl: { label: "Strategy P&L", short: "P&L", value: (r) => r.totalPnlPercent, format: pct, better: "desc", signed: true },
  buyHold: { label: "Buy & hold", short: "B&H", value: (r) => r.buyAndHoldPnlPercent, format: pct, better: "desc", signed: true },
  alpha: {
    label: "Alpha vs buy & hold",
    short: "Alpha",
    value: (r) => r.totalPnlPercent - r.buyAndHoldPnlPercent,
    format: pct,
    better: "desc",
    signed: true,
  },
  winRate: { label: "Win rate", short: "Win", value: (r) => r.winRate, format: (v) => `${v.toFixed(1)}%`, better: "desc" },
  profitFactor: {
    label: "Profit factor",
    short: "PF",
    // Infinity (no losing trades) sorts above every finite factor.
    value: (r) => r.profitFactor ?? 0,
    format: (v) => (v === Infinity ? "∞" : v.toFixed(2)),
    better: "desc",
  },
  maxDrawdown: {
    label: "Max drawdown",
    short: "DD",
    value: (r) => r.maxDrawdownPercent,
    format: (v) => `-${v.toFixed(2)}%`,
    better: "asc",
  },
  sharpe: { label: "Sharpe ratio", short: "Sharpe", value: (r) => r.sharpeRatio, format: (v) => v.toFixed(2), better: "desc", signed: true },
  trades: { label: "Total trades", short: "Trades", value: (r) => r.totalTrades, format: (v) => String(v), better: "desc" },
  avgWin: { label: "Average win", short: "Avg win", value: (r) => r.averageWin, format: money, better: "desc" },
  avgLoss: { label: "Average loss", short: "Avg loss", value: (r) => r.averageLoss, format: money, better: "asc" },
} satisfies Record<string, Metric>;

type MetricKey = keyof typeof METRICS;

const ALL = "__all__";
/** A wide sweep can return thousands of results; past this the list stops earning its render cost. */
const MAX_ROWS = 500;
const BEATS_BUY_HOLD_KEY = "algo-backtest-beats-buy-hold";

/** Every result from a run, filterable and sortable by any metric it collected. */
export default function ResultsBrowser({
  results,
  activeIndex,
  onSelect,
  datasetLabel,
}: {
  results: ParameterizedResult[];
  /** Index into `results` of the one on the chart. */
  activeIndex: number;
  onSelect: (index: number) => void;
  datasetLabel: (file: string) => string;
}) {
  const [sortKey, setSortKey] = useState<MetricKey>("pnl");
  const [direction, setDirection] = useState<Direction>("desc");
  const [strategy, setStrategy] = useState(ALL);
  const [dataset, setDataset] = useState(ALL);
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
    for (const r of results) if (r.strategyId) seen.set(r.strategyId, r.strategyName ?? r.strategyId);
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [results]);

  const datasets = useMemo(
    () => [...new Set(results.map((r) => r.dataset).filter((d): d is string => !!d))].sort(),
    [results],
  );

  const rows = useMemo(() => {
    const metric: Metric = METRICS[sortKey];
    const sign = direction === "desc" ? -1 : 1;
    return results
      .map((result, index) => ({ result, index }))
      .filter(({ result: r }) => strategy === ALL || r.strategyId === strategy)
      .filter(({ result: r }) => dataset === ALL || r.dataset === dataset)
      .filter(({ result: r }) => !beatsBuyHold || r.totalPnlPercent > r.buyAndHoldPnlPercent)
      .sort((a, b) => {
        const d = metric.value(a.result) - metric.value(b.result);
        // Infinity − Infinity is NaN; treat equal values as ties.
        return Number.isNaN(d) || d === 0 ? a.index - b.index : sign * Math.sign(d);
      });
  }, [results, sortKey, direction, strategy, dataset, beatsBuyHold]);

  const metric: Metric = METRICS[sortKey];
  const showStrategy = strategies.length > 1;
  const showDataset = datasets.length > 1;

  return (
    <Bento
      fill
      title={`Results · ${rows.length === results.length ? results.length : `${rows.length} of ${results.length}`}`}
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
          <IconButton
            size='1'
            variant='soft'
            color='gray'
            onClick={() => setDirection((d) => (d === "desc" ? "asc" : "desc"))}
            aria-label={direction === "desc" ? "Highest first" : "Lowest first"}
            title={direction === "desc" ? "Highest first" : "Lowest first"}
          >
            {direction === "desc" ? <ArrowDownWideNarrow className='size-3.5' /> : <ArrowUpNarrowWide className='size-3.5' />}
          </IconButton>
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
      </Flex>

      <div className='min-h-0 flex-1 overflow-y-auto'>
        {rows.length === 0 ? (
          <Text as='p' size='2' color='gray' className='p-4 text-center'>
            No results match these filters.
          </Text>
        ) : (
          <ul role='listbox' aria-label='Backtest results' className='divide-y divide-line-subtle'>
            {rows.slice(0, MAX_ROWS).map(({ result: r, index }, rank) => {
              const selected = index === activeIndex;
              const value = metric.value(r);
              return (
                <li key={index} role='option' aria-selected={selected}>
                  <button
                    type='button'
                    onClick={() => onSelect(index)}
                    className={cn(
                      "flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-[var(--gray-a3)]",
                      selected && "bg-[var(--accent-a4)] hover:bg-[var(--accent-a4)]",
                    )}
                  >
                    <Text size='1' color='gray' className='w-7 shrink-0 pt-0.5 tabular-nums'>
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
                        {r.winRate.toFixed(0)}% win · {r.totalTrades} trades
                      </Text>
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
        {rows.length > MAX_ROWS && (
          <Text as='p' size='1' color='gray' className='border-t border-line-subtle p-3 text-center'>
            Showing the first {MAX_ROWS} of {rows.length}. Filter to narrow it down.
          </Text>
        )}
      </div>
    </Bento>
  );
}
