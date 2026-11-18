// The "Copy Lambda prompt" text: a prompt that has Claude add a backtest result
// to the live paper-trading stack in trading/ as one entry in
// trading/deployments.ts. It's pasted straight to an agent, so whatever it
// gets wrong becomes a wrong deployment. Every number in it comes from the
// settings the run actually used and from what the strategy actually reads;
// where one can't be worked out, the prompt says so and tells the agent to stop.
//
// What the live runtime supports is written down here (RUNTIME below). If
// trading/runtime gains or loses a feature, change it with it.

import type { StrategyDefinition, StrategyParameter } from "@/app/strategies/types";
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

// --- What the live runtime does (trading/runtime/config.ts and run.ts). ---

/** Dataset timeframe -> the runtime's Interval. */
export const LIVE_INTERVALS: Record<string, string> = { "1m": "1min", "5m": "5min", "15m": "15min", "30m": "30min", "1h": "1h", "1d": "1d" };

/**
 * Regular-session bars (09:30-16:00 ET) in one session. Hourly bars are
 * counted from the 09:30 open, so the 15:30 bar is a half hour: 7 a day.
 */
export const BARS_PER_SESSION: Record<string, number> = { "1min": 390, "5min": 78, "15min": 26, "30min": 13, "1h": 7, "1d": 1 };

/** Tradier keeps 40 days of 1-, 5- and 15-minute timesales and years of daily bars; config.ts enforces both. */
export const maxHistoryDays = (interval: string) => (interval === "1d" ? 3650 : 40);

/**
 * Sessions any window of `days` calendar days holds, at worst: weekends, a
 * market holiday a month, and the session in progress not counted.
 */
export const guaranteedSessions = (days: number) => Math.max(0, Math.floor((days * 5) / 7) - Math.ceil(days / 30) - 1);

/** Sessions a window of `days` calendar days usually holds (252 a year). */
export const typicalSessions = (days: number) => Math.round((days * 252) / 365);

/** The runtime's SHARED_RISK in trading/deployments.ts, which every entry spreads. */
export const SHARED_RISK = { startingEquity: 10_000, maxDailyLossPct: 2, drawdownLimitPct: 25, drawdownPauseBars: 20 } as const;

export interface HistoryWindow {
  /** Calendar days that hold minBars bars at worst, or the most allowed when none do. */
  historyDays: number;
  fits: boolean;
  /** Bars the most history allowed holds at worst, and usually. */
  maxBars: number;
  typicalMaxBars: number;
}

/** The fewest calendar days of history that always hold `minBars` bars of `interval`. */
export function historyWindow(interval: string, minBars: number): HistoryWindow {
  const perSession = BARS_PER_SESSION[interval];
  const max = maxHistoryDays(interval);
  const maxBars = guaranteedSessions(max) * perSession;
  const typicalMaxBars = typicalSessions(max) * perSession;
  for (let days = 1; days <= max; days++) {
    if (guaranteedSessions(days) * perSession >= minBars) return { historyDays: days, fits: true, maxBars, typicalMaxBars };
  }
  return { historyDays: max, fits: false, maxBars, typicalMaxBars };
}

// --- Parameters. ---

/**
 * Parameter groups the strategies' own descriptions order, fastest or
 * shortest first. A sweep can produce values that invert them; the result is
 * still what was tested, but the code's comments no longer describe it.
 */
const ORDERED_GROUPS: string[][] = [
  ["fastPeriod", "midPeriod", "slowPeriod"],
  ["lipsPeriod", "teethPeriod", "jawPeriod"],
  ["lipsShift", "teethShift", "jawShift"],
  ["tenkanPeriod", "kijunPeriod", "senkouPeriod"],
  ["fastLength", "slowLength"],
  ["exitPeriod", "entryPeriod"],
  ["oversold", "overbought"],
];

const fmt = (v: ParamValue) => (typeof v === "string" ? `'${v}'` : String(v));

/** Notes on parameters that invert the order the strategy's descriptions give them. */
export function parameterNotes(strategy: StrategyDefinition, params: Record<string, ParamValue>): string[] {
  const defs = new Map((strategy.parameters ?? []).map((p) => [p.key, p]));
  const notes: string[] = [];
  for (const group of ORDERED_GROUPS) {
    const present = group.filter((k) => defs.has(k) && typeof params[k] === "number");
    if (present.length < 2) continue;
    const inverted: string[] = [];
    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) {
        const [a, b] = [present[i], present[j]];
        if ((params[a] as number) >= (params[b] as number)) inverted.push(`\`${a}\` ${params[a]} ≥ \`${b}\` ${params[b]}`);
      }
    }
    if (!inverted.length) continue;
    const described = present.map((k) => `\`${k}\`: "${defs.get(k)!.description}"`).join("; ");
    const defaults = present.map((k) => `${k} ${defs.get(k)!.default}`).join(", ");
    notes.push(
      `**${present.join(" / ")} are out of the order the strategy describes** (${inverted.join(", ")}). The strategy's own descriptions: ${described}. Its defaults are ${defaults}. At these values the lines swap roles, so the code's comments no longer describe what this trades. Deploy the values as tested, and say so in the entry's comment.`,
    );
  }
  return notes;
}

// --- The run's settings against the runtime. ---

export interface RuntimeComparison {
  /** Fields for the entry after `...SHARED_RISK`, each with where it came from. */
  fields: { key: string; value: string | null; comment: string }[];
  /** What the backtest did that the runtime can't: the agent stops on any of these. */
  blocking: string[];
  /** Where the runtime differs in ways worth knowing but not stopping for. */
  differences: string[];
}

/** The entry's risk fields, and every difference between how the run traded and how the runtime will. */
export function compareWithRuntime(run: RunSettings, params: Record<string, ParamValue>): RuntimeComparison {
  // A stop or target sweep ran this result with the values in its params.
  const risk = withRiskParams(
    { stopLossPercent: run.stopLossPercent, takeProfitPercent: run.takeProfitPercent, positionSizePercent: run.positionSizePercent, sizing: run.sizing },
    params,
  );
  const sz = risk.sizing!;
  const atrStop = sz.useStopLoss && sz.atrStopMultiple > 0;
  const pctStop = sz.useStopLoss && !atrStop && risk.stopLossPercent > 0;
  const tp = sz.useTakeProfit ? risk.takeProfitPercent : 0;
  const trailing = Number(params.trailingStopEmaPeriod ?? 0) || 0;

  const fields: RuntimeComparison["fields"] = [];
  const blocking: string[] = [];
  const differences: string[] = [];

  fields.push({
    key: "enableShorts",
    value: String(run.enableShorts),
    comment: run.enableShorts ? "the backtest traded long and short" : "the backtest traded long only",
  });

  // Sizing, as the engine does it (openPosition in backtest-engine.ts): with
  // the stop switched on, the gap and position caps apply even at 0%.
  if (sz.useStopLoss && sz.mode === "risk") {
    fields.push({ key: "positionSizePct", value: null, comment: "can't be derived: the backtest sized each trade from its stop distance (see section 3)" });
    blocking.push(
      `**Risk-based sizing** (${sz.riskPercent}% of equity lost at the stop, positions capped at ${+positionCapPercent(sz).toFixed(2)}% of equity). Each trade's size came from its stop distance, so there's no single fixed % that reproduces it. The runtime sizes every trade as a fixed % of equity (\`positionSizePct\`).`,
    );
  } else {
    const pct = sz.useStopLoss ? Math.min(run.positionSizePercent, positionCapPercent(sz)) : stopOffPositionPercent(sz, run.positionSizePercent);
    const why = !sz.useStopLoss
      ? sz.mode === "risk"
        ? "risk sizing with the stop off puts all of equity in"
        : `the backtest put ${pct}% of equity in each trade`
      : pct < run.positionSizePercent
        ? `the backtest's ${run.positionSizePercent}% capped to ${+pct.toFixed(2)}% by its gap cap`
        : `the backtest put ${pct}% of equity in each trade`;
    fields.push({ key: "positionSizePct", value: String(+pct.toFixed(2)), comment: why });
  }

  // Drawdown limit.
  if (sz.maxDrawdownPercent > 0) {
    fields.push({ key: "drawdownLimitPct", value: String(sz.maxDrawdownPercent), comment: "the backtest's drawdown limit" });
    if (sz.drawdownPauseBars > 0) {
      fields.push({ key: "drawdownPauseBars", value: String(sz.drawdownPauseBars), comment: "the backtest's pause after it tripped" });
    } else {
      fields.push({ key: "drawdownPauseBars", value: null, comment: "can't be matched: the backtest stopped for good once the limit tripped (see section 3)" });
      blocking.push(
        `**Drawdown limit ${sz.maxDrawdownPercent}%, then out for the rest of the run.** The backtest never traded again after it tripped (pause 0 = forever). In the runtime a pause of 0 means trading resumes on the next bar, and it has no "forever".`,
      );
    }
  } else {
    fields.push({ key: "drawdownLimitPct", value: "100", comment: "the backtest had no drawdown limit; the runtime requires one, and 100 never trips" });
    fields.push({ key: "drawdownPauseBars", value: "0", comment: "no limit, so no pause" });
    differences.push("**No drawdown limit in the backtest.** The runtime requires one; the entry sets 100%, which never trips.");
  }

  // Exits the runtime doesn't place.
  if (atrStop) blocking.push(`**ATR stop loss** (${sz.atrStopMultiple} × ATR 14 from the entry fill). The runtime places no stop orders; positions exit only on the strategy's signal.`);
  else if (pctStop) blocking.push(`**Stop loss ${risk.stopLossPercent}%** from the entry fill. The runtime places no stop orders; positions exit only on the strategy's signal.`);
  if (tp > 0) blocking.push(`**Take profit ${tp}%** from the entry fill. The runtime places no limit or target orders.`);
  if (trailing > 0) blocking.push(`**Trailing EMA ${trailing} stop.** The backtest engine applies it outside the strategy handler; the runtime doesn't.`);
  if (sz.allowReversal) blocking.push("**Reversals** (close and open the other side on the same bar). The runtime exits or enters on a bar, never both.");

  // Differences that don't change what's traded much, or only add protection.
  differences.push(
    `**Daily loss limit ${SHARED_RISK.maxDailyLossPct}%** (from \`SHARED_RISK\`). The backtest had none; the runtime stops opening trades for the day once realized losses reach it.`,
  );
  if (sz.wholeShares === false) differences.push("**Fractional shares in the backtest.** The runtime buys whole shares, rounded down.");
  if (!sz.useStopLoss && sz.mode === "risk") differences.push("**Risk sizing with the stop off** sizes at 100% of equity in the backtest, so the entry does too.");

  return { fields, blocking, differences };
}

// --- The prompt. ---

function describeWarmup(w: Warmup): string {
  const parts = w.parts.map((p) => `${p.label} needs ${p.bars} (${p.why})`);
  if (w.kind === "derived") {
    return parts.length ? `From what the strategy reads at these parameters: ${parts.join("; ")}.` : "The strategy reads nothing but the bar itself.";
  }
  if (w.kind === "measured") {
    return (
      `The strategy computes some of its indicators over its whole history, so this was measured rather than derived: on a synthetic series its signals matched a full-history run at all ${w.checked} points checked from ${w.matchedFrom} bars on, and ${w.bars} adds half again as margin.` +
      (parts.length ? ` It also reads: ${parts.join("; ")}.` : "")
    );
  }
  return `It couldn't be worked out: ${w.reason}.`;
}

const entryLine = (key: string, value: string | null, comment: string) =>
  value === null ? `  // ${key}: ${comment}` : `  ${key}: ${value}, // ${comment}`;

function paramLine(p: StrategyParameter, value: ParamValue, recorded: boolean): string {
  const notes: string[] = [];
  if (!recorded) notes.push(`not in the result; the strategy's default`);
  else if (value !== p.default) notes.push(`default ${fmt(p.default)}`);
  return `    ${p.key}: ${fmt(value)},${notes.length ? ` // ${notes.join("; ")}` : ""}`;
}

export function buildDeployPrompt(input: DeployPromptInput): string {
  const { strategy, run, source, backtest } = input;
  const symbol = input.symbol ?? "UNKNOWN";
  const timeframe = (input.timeframe ?? "unknown").toLowerCase();
  const interval = LIVE_INTERVALS[timeframe] ?? null;

  const defs = strategy.parameters ?? [];
  const params = Object.fromEntries(defs.map((p) => [p.key, input.params[p.key] ?? p.default])) as Record<string, ParamValue>;
  const warmup = input.warmup ?? strategyWarmup(strategy, params);

  const blocking: string[] = [];
  const differences: string[] = [];
  if (!interval) blocking.push(`**Bar interval ${timeframe}.** The runtime supports ${Object.values(LIVE_INTERVALS).join(", ")} only.`);
  if (!input.symbol) blocking.push("**Symbol.** The dataset this result came from isn't known; ask me which ticker.");
  if (!run) {
    blocking.push(
      "**The run's risk settings weren't recorded with this result** (shorts, sizing, stops, drawdown limit), so the entry below has none of them. Ask me for them; don't assume the defaults.",
    );
  }
  const comparison = run ? compareWithRuntime(run, input.params) : null;
  if (comparison) {
    blocking.push(...comparison.blocking);
    differences.push(...comparison.differences);
  }

  // minBars and historyDays, from the warmup and the interval.
  let minBarsLine: string;
  let historyLine: string;
  let windowNote: string;
  if (warmup.kind === "unknown") {
    minBarsLine = entryLine("minBars", null, "couldn't be derived (see section 3)");
    historyLine = entryLine("historyDays", null, "depends on minBars");
    windowNote = `- **minBars / historyDays** aren't set: the bars this strategy needs before its signal is reliable couldn't be worked out. ${describeWarmup(warmup)}`;
    blocking.push(`**Warmup unknown.** ${describeWarmup(warmup)} Ask me what \`minBars\` should be; don't pick one.`);
  } else if (!interval) {
    minBarsLine = entryLine("minBars", String(warmup.bars), "bars the strategy needs; see the note below");
    historyLine = entryLine("historyDays", null, "depends on the interval (see section 3)");
    windowNote = `- **minBars ${warmup.bars}.** ${describeWarmup(warmup)}`;
  } else {
    const win = historyWindow(interval, warmup.bars);
    const perSession = BARS_PER_SESSION[interval];
    const unit = interval === "1d" ? "sessions" : `${interval} bars`;
    minBarsLine = entryLine("minBars", String(warmup.bars), warmup.kind === "derived" ? "the strategy's warmup at these parameters" : "measured warmup plus margin");
    if (win.fits) {
      historyLine = entryLine(
        "historyDays",
        String(win.historyDays),
        interval === "1d"
          ? `at least ${guaranteedSessions(win.historyDays)} sessions`
          : `at least ${guaranteedSessions(win.historyDays)} sessions of ${perSession} regular-session bars`,
      );
      windowNote =
        `- **minBars ${warmup.bars}.** ${describeWarmup(warmup)}\n` +
        `- **historyDays ${win.historyDays}** is the fewest calendar days that always hold ${warmup.bars} ${unit}, allowing for weekends, a holiday a month and the session in progress${interval === "1d" ? "" : ` (${perSession} regular-session bars a session)`}. Don't lower \`minBars\` below ${warmup.bars}: fewer bars and the newest signal isn't the one the backtest would have given.`;
    } else {
      historyLine = entryLine("historyDays", String(win.historyDays), `the most allowed for ${interval}; not enough (see section 3)`);
      windowNote = `- **minBars ${warmup.bars}.** ${describeWarmup(warmup)}`;
      blocking.push(
        `**Not enough history for ${interval} bars.** The strategy needs ${warmup.bars} bars, but the ${win.historyDays} days of data the runtime can fetch hold at least ${win.maxBars} (about ${win.typicalMaxBars} in a typical stretch), so every run would skip with too few bars. Lowering \`minBars\` would trade on indicators that haven't warmed up, which the backtest never did. Options: a longer interval (1d keeps years), or parameters that need fewer bars, backtested again.`,
      );
    }
  }

  const entry = [
    "{",
    `  strategyId: '${strategy.id}',`,
    `  symbol: '${symbol}',`,
    `  interval: '${interval ?? timeframe}',`,
    "  params: {",
    ...defs.map((p) => paramLine(p, params[p.key], input.params[p.key] !== undefined)),
    "  },",
    "  ...SHARED_RISK,",
    ...(comparison ? comparison.fields.map((f) => entryLine(f.key, f.value, f.comment)) : ["  // enableShorts, positionSizePct, drawdownLimitPct, drawdownPauseBars: not recorded with this result (see section 3)"]),
    minBarsLine,
    historyLine,
    "}",
  ];

  const lines: string[] = [
    `# Deploy ${strategy.name} on ${symbol} (${interval ?? timeframe}) to the Tradier paper-trading stack`,
    "",
    "Add this backtested strategy to the live paper-trading CDK stack in `trading/`, deploy it, and check it's running. Read `trading/README.md`, `trading/deployments.ts` and `trading/runtime/config.ts` first; they're the source of truth for how this works. Don't write a new Lambda, deploy script or CloudFormation template: the stack builds the Lambda, schedule, state row, alarm and dashboard section from one entry in `DEPLOYMENTS`, and bundles the strategy straight from `app/strategies/`.",
    "",
    "Work through it without stopping to ask, except where a step below says to stop.",
    "",
    "## 1. The strategy code",
    "",
    `Make \`app/strategies/${strategy.id}.ts\` match the source below, which is what the backtest ran. If the file is missing, create it and register it in \`app/strategies/index.ts\` under \`'${strategy.id}'\`. If it exists and differs, the source below wins; tell me what changed. If it already matches, leave it.`,
    "",
  ];
  if (source) lines.push("```ts", source.trimEnd(), "```");
  else lines.push(`(The source couldn't be loaded when this prompt was copied. Use \`app/strategies/${strategy.id}.ts\` as it is and say so.)`);

  const notes = parameterNotes(strategy, params);
  lines.push(
    "",
    "## 2. The deployment entry",
    "",
    "Add this to `DEPLOYMENTS` in `trading/deployments.ts`. Every value below comes from the run this result came from; keep the inline comments' substance in a short comment like the existing entries have.",
    "",
    "```ts",
    ...entry,
    "```",
    "",
    windowNote,
    ...notes.map((n) => `- ${n}`),
    `- **One enabled deployment per symbol.** If another enabled entry already trades ${symbol}, set it to \`enabled: false\` with a comment saying this one replaced it (the existing TXN and TQQQ entries show the pattern). The new deployment adopts Tradier's open position on its first run.`,
    "- **Allocations must total ≤ 100%** across enabled entries. If adding this one goes over, stop and show me the current split and a proposed rebalance before changing any other entry.",
    "- Synth fails on an unknown strategy or parameter; fix the entry, don't loosen the validation.",
  );

  lines.push("", "## 3. What the backtest did that the live runtime can't", "");
  if (blocking.length) {
    lines.push(
      "The runtime trades market orders on the strategy signal only, with fixed-% sizing, a daily loss limit and a drawdown pause. Compared with that, this backtest:",
      "",
      ...blocking.map((g) => `- ${g}`),
      "",
      "**Stop here and tell me** before deploying: as it stands, live results won't match the backtest, or the deployment can't run. I'll either accept it, or ask you to add the feature to `trading/runtime` (with tests in `runtime/*.test.ts`) first.",
    );
  } else {
    lines.push("Nothing: every setting this backtest used maps onto the runtime.");
  }
  if (differences.length) lines.push("", "Also different live, not a reason to stop:", "", ...differences.map((d) => `- ${d}`));
  lines.push(
    "",
    run
      ? `Costs the backtest assumed, for comparing results later (nothing to configure): ${run.commissionBps} bps commission, ${run.slippageBps} bps slippage per fill.`
      : "The costs the backtest assumed weren't recorded with this result.",
  );

  lines.push(
    "",
    "## 4. Check, ship, deploy",
    "",
    "1. From the repo root: `npx tsc --noEmit`, `npx eslint <changed files>`, `npm run build`, `npm test`. In `trading/`: `npm run typecheck`. Fix anything this change broke.",
    "2. Commit and push following `CLAUDE.md` (branch, then fast-forward `main`). Never push red.",
    "3. `aws sts get-caller-identity` to confirm credentials resolve. If they don't, stop and tell me how to sign in; never ask me to paste keys.",
    "4. `cd trading && npx cdk diff`. Expect new resources for this deployment, plus a disabled schedule if you replaced one. If it would replace or delete anything else (the state table, another deployment's Lambda), stop and show me.",
    "5. `npx cdk deploy --require-approval never`.",
    "6. `npm run dry-run -- --latest <deployment id>` (the id is built from the entry; see `deploymentId` in `runtime/config.ts`). Confirm the logged line shows bars, indicator values and a signal with no error, and at least `minBars` bars.",
    "",
    "Finish with: the deployment id and Lambda name, the dry-run signal, what the `TradierTrading` dashboard URL is (stack output), and anything you changed beyond the new entry.",
    "",
    "---",
    "",
    `*Backtest this came from (for comparison, not to enforce): ${backtest.label}, ${run ? (run.enableShorts ? "long and short" : "long only") : "sides not recorded"}, ${backtest.totalPnlPercent >= 0 ? "+" : ""}${backtest.totalPnlPercent.toFixed(2)}% over ${backtest.totalTrades} trades, ${backtest.winRate.toFixed(1)}% win rate, ${backtest.maxDrawdownPercent.toFixed(2)}% max drawdown, Sharpe ${backtest.sharpeRatio.toFixed(2)}, starting from $${backtest.initialCapital.toLocaleString("en-US")}.*`,
  );

  return lines.join("\n");
}
