// The "Copy Lambda prompt" text: a prompt that has Claude add a backtest result
// to the live paper-trading stack in trading/ as one entry in
// trading/deployments.ts. It's pasted straight to an agent with no one
// checking the numbers, so it is literal: every setting in the entry is the
// value the selected run used, nothing defaulted or inferred. minBars and
// historyDays, which the run doesn't have, come from what the strategy reads
// and the interval's real bar count. Anything that can't be known is written
// as UNKNOWN and listed for the agent to ask about before deploying.
//
// The runtime facts below (intervals, bars per session, history limits,
// SHARED_RISK) mirror trading/runtime; the tests check them against it.

import type { StrategyDefinition } from "@/app/strategies/types";
import { positionCapPercent, stopOffPositionPercent, withRiskParams, type SizingSettings } from "@/app/lib/backtest-engine";
import { strategyWarmup, type Warmup } from "@/app/lib/strategyWarmup";

type ParamValue = number | boolean | string;

/** The settings a run used for one strategy (StrategyRun in backtest.worker.ts). */
export interface RunSettings {
  stopLossPercent: number;
  takeProfitPercent: number;
  enableShorts: boolean;
  positionSizePercent: number;
  commissionBps: number;
  slippageBps: number;
  sizing: SizingSettings;
}

export interface DeployPromptInput {
  strategy: StrategyDefinition;
  /** The result's parameters: the strategy's, plus any stop or target a sweep varied. */
  params: Record<string, ParamValue>;
  /** What the run that produced the result used; null when that wasn't recorded. */
  run: RunSettings | null;
  /** null when the dataset isn't known. */
  symbol: string | null;
  /** The dataset's bar size as the backtester names it: "15m", "1h", "1d". */
  timeframe: string | null;
  /** The strategy source the backtest ran, or null if it couldn't be loaded. */
  source: string | null;
  backtest: {
    label: string;
    totalPnlPercent: number;
    totalTrades: number;
    winRate: number;
    maxDrawdownPercent: number;
    sharpeRatio: number;
    initialCapital: number;
  };
  /** Computed from the strategy when absent. */
  warmup?: Warmup;
}

// --- The runtime (trading/runtime/config.ts, run.ts, market.ts). ---

/** Dataset timeframe -> the runtime's Interval. */
export const LIVE_INTERVALS: Record<string, string> = { "1m": "1min", "5m": "5min", "15m": "15min", "30m": "30min", "1h": "1h", "1d": "1d" };

/** Regular-session bars (09:30-16:00 ET) a session. Hourly bars count from 09:30, so 15:30 is a half hour: 7. */
export const BARS_PER_SESSION: Record<string, number> = { "1min": 390, "5min": 78, "15min": 26, "30min": 13, "1h": 7, "1d": 1 };

/** Tradier keeps 40 days of intraday timesales and years of daily bars; config.ts enforces both. */
export const maxHistoryDays = (interval: string) => (interval === "1d" ? 3650 : 40);

/** Sessions any window of `days` calendar days holds, at worst: weekends, a holiday a month, today's unfinished session. */
export const guaranteedSessions = (days: number) => Math.max(0, Math.floor((days * 5) / 7) - Math.ceil(days / 30) - 1);

/** SHARED_RISK in trading/deployments.ts, which every entry spreads. */
export const SHARED_RISK = { startingEquity: 10_000, maxDailyLossPct: 2, drawdownLimitPct: 25, drawdownPauseBars: 20 } as const;

export interface HistoryWindow {
  /** Calendar days that always hold minBars bars, or the most allowed when none do. */
  historyDays: number;
  fits: boolean;
  /** Bars the most history allowed always holds. */
  maxBars: number;
}

/** The fewest calendar days of history that always hold `minBars` bars of `interval`. */
export function historyWindow(interval: string, minBars: number): HistoryWindow {
  const perSession = BARS_PER_SESSION[interval];
  const max = maxHistoryDays(interval);
  const maxBars = guaranteedSessions(max) * perSession;
  for (let days = 1; days <= max; days++) {
    if (guaranteedSessions(days) * perSession >= minBars) return { historyDays: days, fits: true, maxBars };
  }
  return { historyDays: max, fits: false, maxBars };
}

// --- The entry. ---

/** One line of the entry: a literal value, or UNKNOWN with what's missing. */
export interface EntryField {
  key: string;
  /** The literal value, or null when it can't be known. */
  value: string | null;
  /** Only for UNKNOWN: what's missing. */
  unknown?: string;
  /** A trailing comment, for a value whose meaning isn't obvious. */
  note?: string;
}

const lit = (v: ParamValue) => (typeof v === "string" ? `'${v}'` : String(v));
const num = (n: number) => String(+n.toFixed(4));

/**
 * The runtime's way to write "off" for a percent limit: the limit trips only
 * once the loss reaches 100% of equity, which a cash account can't pass.
 * validateDeployments requires these percents to be > 0 and <= 100.
 */
export const LIMIT_OFF_PCT = 100;

/**
 * drawdownPauseBars for "never trade again", the backtest's pause of 0. The
 * runtime counts the bars since the trip within the history it fetched, which
 * never holds this many, so entries stay paused for good.
 */
export const PAUSE_FOREVER_BARS = 1_000_000;

/** Every risk field the entry writes, so none comes from SHARED_RISK or the runtime's DEFAULTS. */
export const RISK_KEYS = ["startingEquity", "enableShorts", "positionSizePct", "maxDailyLossPct", "drawdownLimitPct", "drawdownPauseBars"] as const;

/** The run's risk settings as entry fields, each the run's own value or UNKNOWN. */
export function riskFields(run: RunSettings, initialCapital: number): EntryField[] {
  const sz = run.sizing;
  const fields: EntryField[] = [
    { key: "startingEquity", value: num(initialCapital) },
    { key: "enableShorts", value: String(run.enableShorts) },
  ];

  // What the engine put in each trade (openPosition in backtest-engine.ts).
  if (!sz.useStopLoss) {
    fields.push({ key: "positionSizePct", value: num(stopOffPositionPercent(sz, run.positionSizePercent)) });
  } else if (sz.mode === "fixed") {
    fields.push({ key: "positionSizePct", value: num(Math.min(run.positionSizePercent, positionCapPercent(sz))) });
  } else {
    fields.push({
      key: "positionSizePct",
      value: null,
      unknown: `the run sized each trade by risk (${num(sz.riskPercent)}% of equity per stop distance, at most ${num(positionCapPercent(sz))}% of equity), not a fixed %`,
    });
  }

  // The backtest has no daily loss limit.
  fields.push({ key: "maxDailyLossPct", value: String(LIMIT_OFF_PCT), note: "off: the backtest had no daily loss limit" });

  if (sz.maxDrawdownPercent > 0 && sz.maxDrawdownPercent < LIMIT_OFF_PCT) {
    fields.push({ key: "drawdownLimitPct", value: num(sz.maxDrawdownPercent) });
    fields.push(
      sz.drawdownPauseBars > 0
        ? { key: "drawdownPauseBars", value: String(sz.drawdownPauseBars) }
        : { key: "drawdownPauseBars", value: String(PAUSE_FOREVER_BARS), note: "never trade again, like the backtest's pause of 0 (in the runtime 0 would resume on the next bar)" },
    );
  } else {
    fields.push({ key: "drawdownLimitPct", value: String(LIMIT_OFF_PCT), note: "off: the backtest had no drawdown limit" });
    fields.push({ key: "drawdownPauseBars", value: "0", note: "unused: the drawdown limit is off" });
  }
  return fields;
}

/** Backtest features this run used that the runtime doesn't have, one fact each. */
export function runtimeLacks(run: RunSettings, params: Record<string, ParamValue>): string[] {
  const risk = withRiskParams({ stopLossPercent: run.stopLossPercent, takeProfitPercent: run.takeProfitPercent, sizing: run.sizing }, params);
  const sz = risk.sizing!;
  const out: string[] = [];
  if (sz.useStopLoss && sz.atrStopMultiple > 0) out.push(`ATR stop loss, ${num(sz.atrStopMultiple)} × ATR 14`);
  else if (sz.useStopLoss && risk.stopLossPercent > 0) out.push(`Stop loss ${num(risk.stopLossPercent)}%`);
  if (sz.useTakeProfit && risk.takeProfitPercent > 0) out.push(`Take profit ${num(risk.takeProfitPercent)}%`);
  const trailing = Number(params.trailingStopEmaPeriod ?? 0) || 0;
  if (trailing > 0) out.push(`Trailing EMA ${trailing} stop`);
  if (sz.allowReversal) out.push("Reversal on an opposite signal");
  if (sz.wholeShares === false) out.push("Fractional shares (the runtime buys whole shares)");
  return out;
}

/** minBars from the strategy's warmup, as a field and a one-line source. */
function minBarsField(w: Warmup): { field: EntryField; source: string } {
  if (w.kind === "unknown") return { field: { key: "minBars", value: null, unknown: w.reason }, source: "" };
  const reads = w.parts.map((p) => `${p.label} (${p.bars})`).join(", ");
  const source =
    w.kind === "derived"
      ? `the most bars any input the strategy reads needs at these parameters: ${reads || "only the current bar"}`
      : `measured: the strategy computes over its whole history, and its signals matched a full-history run from ${w.matchedFrom} bars; ${w.bars} is that plus half${reads ? `. It also reads ${reads}` : ""}`;
  return { field: { key: "minBars", value: String(w.bars) }, source };
}

// An UNKNOWN is written as a bare identifier, not commented out: commented
// out, the field would silently take the runtime's default and the entry
// would still deploy. As written, it fails typecheck until it's filled in.
const fieldLine = (f: EntryField, indent = "  ") =>
  f.value === null ? `${indent}${f.key}: UNKNOWN, // ask: see Unknown values` : `${indent}${f.key}: ${f.value},${f.note ? ` // ${f.note}` : ""}`;

export function buildDeployPrompt(input: DeployPromptInput): string {
  const { strategy, run, source, backtest } = input;
  const symbol = input.symbol ?? null;
  const timeframe = input.timeframe?.toLowerCase() ?? null;
  const interval = timeframe ? (LIVE_INTERVALS[timeframe] ?? null) : null;

  const defs = strategy.parameters ?? [];
  const missing = defs.filter((p) => input.params[p.key] === undefined).map((p) => p.key);
  const params = Object.fromEntries(defs.filter((p) => input.params[p.key] !== undefined).map((p) => [p.key, input.params[p.key]]));
  // The warmup needs every parameter; without them it isn't known.
  const warmup: Warmup = missing.length
    ? { kind: "unknown", reason: "the run's parameters weren't all recorded", parts: [] }
    : (input.warmup ?? strategyWarmup(strategy, params));

  const unknowns: string[] = [];
  const unknown = (key: string, why: string) => unknowns.push(`\`${key}\`: ${why}.`);

  if (!symbol) unknown("symbol", "the dataset this result came from isn't known");
  if (!interval) unknown("interval", timeframe ? `the run used ${timeframe} bars; the runtime supports ${Object.values(LIVE_INTERVALS).join(", ")}` : "the dataset's bar size isn't known");
  for (const key of missing) unknown(`params.${key}`, "not recorded with this result");

  const risk: EntryField[] = run
    ? riskFields(run, backtest.initialCapital)
    : RISK_KEYS.map((key) => ({ key, value: null, unknown: "the run's settings weren't recorded with this result" }));
  for (const f of risk) if (f.value === null) unknown(f.key, f.unknown!);

  const mb = minBarsField(warmup);
  const notes: string[] = [];
  let historyField: EntryField;
  if (mb.field.value === null) {
    unknown("minBars", mb.field.unknown!);
    historyField = { key: "historyDays", value: null };
    unknown("historyDays", "depends on minBars");
  } else if (!interval) {
    historyField = { key: "historyDays", value: null };
    unknown("historyDays", "depends on the interval");
    notes.push(`\`minBars\` ${mb.field.value}: ${mb.source}.`);
  } else {
    const minBars = Number(mb.field.value);
    const win = historyWindow(interval, minBars);
    notes.push(`\`minBars\` ${minBars}: ${mb.source}.`);
    if (win.fits) {
      historyField = { key: "historyDays", value: String(win.historyDays) };
      notes.push(
        `\`historyDays\` ${win.historyDays}: the fewest calendar days that always hold ${minBars} ${interval} bars (${BARS_PER_SESSION[interval]} regular-session bar${BARS_PER_SESSION[interval] === 1 ? "" : "s"} a session; weekends, a holiday a month and the unfinished session excluded).`,
      );
    } else {
      historyField = { key: "historyDays", value: null };
      unknown("historyDays", `${minBars} ${interval} bars don't fit: the runtime fetches at most ${win.historyDays} days, which always holds ${win.maxBars}. Don't lower \`minBars\`; ask me`);
    }
  }

  const entry = [
    "{",
    `  strategyId: '${strategy.id}',`,
    fieldLine({ key: "symbol", value: symbol ? `'${symbol}'` : null }),
    fieldLine({ key: "interval", value: interval ? `'${interval}'` : null }),
    "  params: {",
    ...defs.map((p) => fieldLine({ key: p.key, value: input.params[p.key] === undefined ? null : lit(input.params[p.key]) }, "    ")),
    "  },",
    // No ...SHARED_RISK: every risk field is written out, so none comes from it.
    ...risk.map((f) => fieldLine(f)),
    fieldLine(mb.field),
    fieldLine(historyField),
    "}",
  ];

  const title = `${strategy.name} on ${symbol ?? "UNKNOWN"} (${interval ?? timeframe ?? "UNKNOWN"})`;
  const lines: string[] = [
    `# Deploy ${title} to the Tradier paper-trading stack`,
    "",
    "Add this backtested strategy to the live paper-trading CDK stack in `trading/`, deploy it, and check it's running. Read `trading/README.md`, `trading/deployments.ts` and `trading/runtime/config.ts` first. Don't write a new Lambda, deploy script or CloudFormation template: the stack builds everything from one entry in `DEPLOYMENTS`, and bundles the strategy straight from `app/strategies/`.",
    "",
    "## 1. The strategy code",
    "",
    `Make \`app/strategies/${strategy.id}.ts\` match the source below, which is what the backtest ran. If the file is missing, create it and register it in \`app/strategies/index.ts\` under \`'${strategy.id}'\`. If it exists and differs, the source below wins; tell me what changed.`,
    "",
  ];
  if (source) lines.push("```ts", source.trimEnd(), "```");
  else lines.push(`The source couldn't be loaded when this prompt was copied. Use \`app/strategies/${strategy.id}.ts\` as it is and say so.`);

  lines.push(
    "",
    "## 2. The deployment entry",
    "",
    "Add this to `DEPLOYMENTS` in `trading/deployments.ts` exactly as written. Every value is the one the backtest run used; don't change any of them, don't add `...SHARED_RISK` or any other field, and don't drop a field because it matches a default. Every risk setting is written out so nothing comes from `SHARED_RISK` or the runtime's `DEFAULTS`.",
    "",
    "```ts",
    ...entry,
    "```",
    "",
    ...notes.map((n) => `- ${n}`),
    `- One enabled deployment per symbol: if another enabled entry trades ${symbol ?? "this symbol"}, set it to \`enabled: false\` with a comment that this one replaced it.`,
    "- Allocations must total ≤ 100% across enabled entries. If this one takes it over, stop and show me the split.",
  );

  lines.push("", "## 3. Unknown values", "");
  if (unknowns.length) {
    lines.push(
      "These couldn't be taken from the run, and are written as `UNKNOWN` above so the entry won't compile until they're set. **Stop and ask me for each one before deploying**; don't fill them in, comment them out or delete them:",
      "",
      ...unknowns.map((u) => `- ${u}`),
    );
  } else {
    lines.push("None. Every value above is known.");
  }

  const lacks = run ? runtimeLacks(run, input.params) : [];
  lines.push("", "## 4. Backtest features the runtime doesn't have", "");
  if (!run) lines.push("Not known: the run's settings weren't recorded.");
  else if (lacks.length) lines.push("Deploy without them; nothing to configure:", "", ...lacks.map((l) => `- ${l}`));
  else lines.push("None.");
  lines.push(
    "",
    run ? `Costs the backtest assumed: ${num(run.commissionBps)} bps commission, ${num(run.slippageBps)} bps slippage per fill.` : "Costs the backtest assumed: not recorded.",
  );

  lines.push(
    "",
    "## 5. Check, ship, deploy",
    "",
    "1. From the repo root: `npx tsc --noEmit`, `npx eslint <changed files>`, `npm run build`, `npm test`. In `trading/`: `npm run typecheck`.",
    "2. Commit and push following `CLAUDE.md` (branch, then fast-forward `main`). Never push red.",
    "3. `aws sts get-caller-identity`. If credentials don't resolve, stop and tell me how to sign in; never ask me to paste keys.",
    "4. `cd trading && npx cdk diff`. If it would replace or delete anything besides this deployment (and a schedule you disabled), stop and show me.",
    "5. `npx cdk deploy --require-approval never`.",
    "6. `npm run dry-run -- --latest <deployment id>` (see `deploymentId` in `runtime/config.ts`). Confirm bars, indicator values and a signal with no error, and at least `minBars` bars.",
    "",
    "Finish with: the deployment id and Lambda name, the dry-run signal, the `TradierTrading` dashboard URL (stack output), and anything you changed beyond the new entry.",
    "",
    "---",
    "",
    `*Backtest: ${backtest.label}, ${run ? (run.enableShorts ? "long and short" : "long only") : "sides not recorded"}, ${backtest.totalPnlPercent >= 0 ? "+" : ""}${backtest.totalPnlPercent.toFixed(2)}% over ${backtest.totalTrades} trades, ${backtest.winRate.toFixed(1)}% win rate, ${backtest.maxDrawdownPercent.toFixed(2)}% max drawdown, Sharpe ${backtest.sharpeRatio.toFixed(2)}, from $${backtest.initialCapital.toLocaleString("en-US")}.*`,
  );

  return lines.join("\n");
}
