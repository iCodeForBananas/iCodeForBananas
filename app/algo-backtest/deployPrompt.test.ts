import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AVAILABLE_STRATEGIES, getDefaultParams } from "@/app/strategies";
import { DEFAULT_SIZING, LEGACY_SIZING } from "@/app/lib/backtest-engine";
import { INTERVALS, validateDeployments } from "@/trading/runtime/config";
import {
  BARS_PER_SESSION,
  LIVE_INTERVALS,
  SHARED_RISK,
  buildDeployPrompt,
  guaranteedSessions,
  historyWindow,
  PAUSE_FOREVER_BARS,
  RISK_KEYS,
  type DeployPromptInput,
  type RunSettings,
} from "./deployPrompt";

type Params = Record<string, number | boolean | string>;

/** A run with fixed sizing and no stop: everything the runtime can take literally. */
const fixedRun = (over: Partial<RunSettings> = {}, sizing: Partial<RunSettings["sizing"]> = {}): RunSettings => ({
  stopLossPercent: 0,
  takeProfitPercent: 0,
  enableShorts: true,
  positionSizePercent: 100,
  commissionBps: 1,
  slippageBps: 2,
  ...over,
  sizing: { ...DEFAULT_SIZING, mode: "fixed", useStopLoss: false, useTakeProfit: false, maxDrawdownPercent: 25, drawdownPauseBars: 20, ...sizing },
});

function prompt(over: Partial<DeployPromptInput> & { strategyId: string; params?: Params }) {
  const { strategyId, params, ...rest } = over;
  return buildDeployPrompt({
    strategy: AVAILABLE_STRATEGIES[strategyId],
    params: { ...getDefaultParams(strategyId), ...params },
    run: fixedRun(),
    symbol: "SPY",
    timeframe: "1d",
    source: "export default {};",
    backtest: { label: "SPY 1d", totalPnlPercent: 12.3, totalTrades: 40, winRate: 55, maxDrawdownPercent: 8, sharpeRatio: 1.1, initialCapital: 10_000 },
    ...rest,
  });
}

/** The entry's code block. */
const entryOf = (text: string) => {
  const start = text.indexOf("```ts\n{");
  return text.slice(start, text.indexOf("```", start + 5));
};
/** An entry line by key: `  key: value,` or `  key: UNKNOWN, // ask: ...`. */
const line = (text: string, key: string) => entryOf(text).split("\n").find((l) => new RegExp(`^ {2,4}(// )?${key.replace(".", "\\.")}:`).test(l));
const unknownsOf = (text: string) => text.slice(text.indexOf("## 3."), text.indexOf("## 4."));

describe("matches the runtime", () => {
  it("knows exactly the runtime's intervals", () => {
    expect(new Set(Object.values(LIVE_INTERVALS))).toEqual(new Set(Object.keys(INTERVALS)));
    expect(new Set(Object.keys(BARS_PER_SESSION))).toEqual(new Set(Object.keys(INTERVALS)));
  });

  it("has the same SHARED_RISK as trading/deployments.ts", () => {
    const literal = /const SHARED_RISK = (\{[^}]*\})/.exec(readFileSync("trading/deployments.ts", "utf8"))?.[1];
    expect(literal).toBeDefined();
    expect(Function(`return (${literal!.replace(/_/g, "")});`)()).toEqual(SHARED_RISK);
  });
});

describe("literal settings", () => {
  it("emits every parameter exactly as the run had it, in the strategy's order, with no commentary", () => {
    const params = { jawPeriod: 35, jawShift: 8, teethPeriod: 3, teethShift: 5, lipsPeriod: 20, lipsShift: 3 };
    const text = prompt({ strategyId: "alligator", params, symbol: "SOFI", timeframe: "1h" });
    const block = entryOf(text);
    expect(block).toContain(
      ["  params: {", "    jawPeriod: 35,", "    jawShift: 8,", "    teethPeriod: 3,", "    teethShift: 5,", "    lipsPeriod: 20,", "    lipsShift: 3,", "  },"].join("\n"),
    );
    expect(block).not.toMatch(/default/);
  });

  it("passes every kind of parameter through: numbers, decimals, booleans, selects", () => {
    const params: Params = { fastPeriod: 7, slowPeriod: 33, signalPeriod: 4, rule: "zero", trendFilter: true, minHistogramPct: 0.15 };
    const text = prompt({ strategyId: "macd-crossover", params });
    for (const [k, v] of Object.entries(params)) expect(line(text, k)).toBe(`    ${k}: ${typeof v === "string" ? `'${v}'` : v},`);
  });

  it("emits the strategy, symbol and interval literally, translating only the interval's name", () => {
    for (const [tf, live] of Object.entries(LIVE_INTERVALS)) {
      const text = prompt({ strategyId: "ema-price-cross", symbol: "NFLX", timeframe: tf });
      expect(line(text, "strategyId")).toBe("  strategyId: 'ema-price-cross',");
      expect(line(text, "symbol")).toBe("  symbol: 'NFLX',");
      expect(line(text, "interval")).toBe(`  interval: '${live}',`);
    }
  });

  it("emits the run's shorts, size, drawdown and capital as bare values", () => {
    const text = prompt({ strategyId: "ema-price-cross", run: fixedRun({ enableShorts: false, positionSizePercent: 50 }, { maxDrawdownPercent: 12, drawdownPauseBars: 7 }) });
    expect(line(text, "startingEquity")).toBe("  startingEquity: 10000,");
    expect(line(text, "enableShorts")).toBe("  enableShorts: false,");
    expect(line(text, "positionSizePct")).toBe("  positionSizePct: 50,");
    expect(line(text, "drawdownLimitPct")).toBe("  drawdownLimitPct: 12,");
    expect(line(text, "drawdownPauseBars")).toBe("  drawdownPauseBars: 7,");
  });

  it("writes values that match the runtime's defaults too, so nothing comes from a default", () => {
    const text = prompt({ strategyId: "ema-price-cross", run: fixedRun({ enableShorts: true, positionSizePercent: 100 }) });
    expect(line(text, "enableShorts")).toBe("  enableShorts: true,");
    expect(line(text, "positionSizePct")).toBe("  positionSizePct: 100,");
  });

  it("writes every risk field itself: no ...SHARED_RISK, nothing left to a default", () => {
    const text = prompt({ strategyId: "ema-price-cross" });
    expect(entryOf(text)).not.toContain("SHARED_RISK");
    for (const key of RISK_KEYS) expect(line(text, key), key).toBeDefined();
    expect(text).not.toMatch(/daily loss limit, which the backtest didn't have/);
  });

  it("turns the daily loss limit off, since the backtest has none", () => {
    expect(line(prompt({ strategyId: "ema-price-cross" }), "maxDailyLossPct")).toBe("  maxDailyLossPct: 100, // off: the backtest had no daily loss limit");
  });

  it("uses the size the engine actually traded when the gap cap cut it", () => {
    const run = fixedRun({ positionSizePercent: 100, stopLossPercent: 2 }, { useStopLoss: true, atrStopMultiple: 0, gapShockPercent: 20, maxGapLossPercent: 10 });
    expect(line(prompt({ strategyId: "ema-price-cross", run }), "positionSizePct")).toBe("  positionSizePct: 50,");
  });

  it("uses the costs the run assumed", () => {
    expect(prompt({ strategyId: "ema-price-cross", run: fixedRun({ commissionBps: 3, slippageBps: 4.5 }) })).toContain("3 bps commission and 4.5 bps slippage");
  });

  it("leaves sweep-only keys out of the strategy's params", () => {
    const block = entryOf(prompt({ strategyId: "ema-price-cross", params: { stopLossPercent: 2 } }));
    expect(block).not.toContain("stopLossPercent");
  });

  it("has none of the old guessed prose", () => {
    const text = prompt({ strategyId: "ema-price-cross", params: { emaPeriod: 14 }, timeframe: "1h" });
    expect(text).not.toMatch(/longest parameter|are estimates|\(26\)/);
  });
});

describe("unknowns are stated, never filled in", () => {
  it("risk-based sizing leaves positionSizePct UNKNOWN and asks", () => {
    const run = fixedRun({ enableShorts: false, positionSizePercent: 50 }, { mode: "risk", useStopLoss: true, atrStopMultiple: 2, riskPercent: 1 });
    const text = prompt({ strategyId: "ema-price-cross", run });
    expect(line(text, "positionSizePct")).toBe("  positionSizePct: UNKNOWN, // ask: see Unknown values");
    expect(unknownsOf(text)).toContain("`positionSizePct`: the run sized each trade by risk (1% of equity per stop distance");
    expect(unknownsOf(text)).toContain("Stop and ask me");
  });

  it("no drawdown limit in the run is written as off, not SHARED_RISK's 25%", () => {
    const text = prompt({ strategyId: "ema-price-cross", run: fixedRun({}, { maxDrawdownPercent: 0 }) });
    expect(line(text, "drawdownLimitPct")).toBe("  drawdownLimitPct: 100, // off: the backtest had no drawdown limit");
    expect(unknownsOf(text)).toContain("None. Every value above is known.");
  });

  it("a drawdown pause of 0 (never again) is written as a pause that never ends", () => {
    const text = prompt({ strategyId: "ema-price-cross", run: fixedRun({}, { maxDrawdownPercent: 20, drawdownPauseBars: 0 }) });
    expect(line(text, "drawdownLimitPct")).toBe("  drawdownLimitPct: 20,");
    expect(line(text, "drawdownPauseBars")).toMatch(new RegExp(`^  drawdownPauseBars: ${PAUSE_FOREVER_BARS}, // never trade again`));
  });

  it("the entry it writes passes the runtime's validation", () => {
    for (const sizing of [{}, { maxDrawdownPercent: 0 }, { maxDrawdownPercent: 20, drawdownPauseBars: 0 }]) {
      const text = prompt({ strategyId: "ema-price-cross", run: fixedRun({}, sizing) });
      const body = entryOf(text).replace("```ts\n", "").replace(/\/\/.*$/gm, "");
      const entry = Function(`return (${body});`)();
      expect(validateDeployments([entry]), JSON.stringify(sizing)).toEqual([]);
    }
  });

  it("no recorded run settings: every risk field UNKNOWN", () => {
    const text = prompt({ strategyId: "ema-price-cross", run: null });
    for (const key of RISK_KEYS) {
      expect(line(text, key)).toBe(`  ${key}: UNKNOWN, // ask: see Unknown values`);
      expect(unknownsOf(text)).toContain(`\`${key}\`: the run's settings weren't recorded`);
    }
  });

  it("a parameter missing from the result is UNKNOWN, not the strategy's default", () => {
    const text = buildDeployPrompt({
      strategy: AVAILABLE_STRATEGIES["ema-crossover"],
      params: { fastPeriod: 5 },
      run: fixedRun(),
      symbol: "SPY",
      timeframe: "1d",
      source: null,
      backtest: { label: "x", totalPnlPercent: 0, totalTrades: 0, winRate: 0, maxDrawdownPercent: 0, sharpeRatio: 0, initialCapital: 10_000 },
    });
    expect(line(text, "fastPeriod")).toBe("    fastPeriod: 5,");
    expect(line(text, "slowPeriod")).toBe("    slowPeriod: UNKNOWN, // ask: see Unknown values");
    expect(line(text, "minBars")).toBe("  minBars: UNKNOWN, // ask: see Unknown values");
    expect(unknownsOf(text)).toContain("`params.slowPeriod`: not recorded");
  });

  it("unknown symbol and unsupported interval are UNKNOWN", () => {
    const text = prompt({ strategyId: "ema-price-cross", timeframe: "4h", symbol: null });
    expect(line(text, "symbol")).toBe("  symbol: UNKNOWN, // ask: see Unknown values");
    expect(line(text, "interval")).toBe("  interval: UNKNOWN, // ask: see Unknown values");
    expect(unknownsOf(text)).toContain("the run used 4h bars");
  });

  it("an unknowable warmup is UNKNOWN", () => {
    const text = prompt({ strategyId: "ema-price-cross", warmup: { kind: "unknown", reason: "test reason", parts: [] } });
    expect(line(text, "minBars")).toBe("  minBars: UNKNOWN, // ask: see Unknown values");
    expect(line(text, "historyDays")).toBe("  historyDays: UNKNOWN, // ask: see Unknown values");
    expect(unknownsOf(text)).toContain("`minBars`: test reason.");
  });

  it("says there are none when everything is known", () => {
    expect(unknownsOf(prompt({ strategyId: "ema-price-cross" }))).toContain("None. Every value above is known.");
  });
});

describe("minBars and historyDays", () => {
  it("IBS with the filter off needs only the current bar, whatever its percents", () => {
    const text = prompt({ strategyId: "ibs-mean-reversion", params: { entryIbs: 20, exitIbs: 76, trendFilter: false }, timeframe: "1h" });
    expect(line(text, "minBars")).toBe("  minBars: 1,");
  });

  it("EMA Price Cross 14 comes from EMA 14, with an achievable historyDays", () => {
    const text = prompt({ strategyId: "ema-price-cross", params: { emaPeriod: 14 }, timeframe: "1h" });
    expect(line(text, "minBars")).toBe("  minBars: 64,");
    const days = Number(/historyDays: (\d+),/.exec(entryOf(text))![1]);
    expect(guaranteedSessions(days) * 7).toBeGreaterThanOrEqual(64);
    expect(guaranteedSessions(days - 1) * 7).toBeLessThan(64);
    expect(text).toContain("`minBars` 64:");
    expect(text).toContain("EMA 14 (64)");
  });

  it("Connors %b's exit percent never becomes a lookback", () => {
    expect(line(prompt({ strategyId: "connors-percent-b", params: { exitPctB: 67, trendFilter: true } }), "minBars")).toBe("  minBars: 200,");
  });

  it("a 200 SMA on 1h bars doesn't fit in 40 days: historyDays UNKNOWN, minBars kept", () => {
    const text = prompt({ strategyId: "ibs-mean-reversion", params: { entryIbs: 20, exitIbs: 76, trendFilter: true }, timeframe: "1h" });
    expect(line(text, "minBars")).toBe("  minBars: 200,");
    expect(line(text, "historyDays")).toBe("  historyDays: UNKNOWN, // ask: see Unknown values");
    expect(unknownsOf(text)).toContain("200 1h bars don't fit");
  });

  it("historyWindow: 250 hourly bars never fit; the rest get the fewest days that always hold them", () => {
    expect(historyWindow("1h", 250)).toMatchObject({ fits: false, historyDays: 40 });
    for (const [interval, minBars] of [["1h", 150], ["15min", 375], ["30min", 300], ["1d", 805], ["5min", 2]] as const) {
      const w = historyWindow(interval, minBars);
      expect(w.fits, `${interval} ${minBars}`).toBe(true);
      expect(guaranteedSessions(w.historyDays) * BARS_PER_SESSION[interval]).toBeGreaterThanOrEqual(minBars);
      expect(guaranteedSessions(w.historyDays - 1) * BARS_PER_SESSION[interval]).toBeLessThan(minBars);
    }
  });
});

describe("runtime gaps: listed, not analyzed", () => {
  const lacksOf = (text: string) => text.slice(text.indexOf("## 4."), text.indexOf("## 5."));

  it("lists the run's stop, target and reversal plainly, without asking to stop", () => {
    const run = fixedRun({ stopLossPercent: 3, takeProfitPercent: 6 }, { useStopLoss: true, useTakeProfit: true, atrStopMultiple: 0, allowReversal: true });
    const text = prompt({ strategyId: "ema-price-cross", run });
    expect(lacksOf(text)).toContain("- Stop loss 3%");
    expect(lacksOf(text)).toContain("- Take profit 6%");
    expect(lacksOf(text)).toContain("- Reversal on an opposite signal");
    expect(unknownsOf(text)).toContain("None.");
  });

  it("uses the stop a sweep ran this result with, and the ATR stop when on", () => {
    expect(lacksOf(prompt({ strategyId: "ema-price-cross", run: fixedRun({ stopLossPercent: 1 }, { useStopLoss: true, atrStopMultiple: 0 }), params: { stopLossPercent: 4.5 } }))).toContain("Stop loss 4.5%");
    expect(lacksOf(prompt({ strategyId: "ema-price-cross", run: fixedRun({}, { useStopLoss: true, atrStopMultiple: 2.5 }) }))).toContain("ATR stop loss, 2.5 × ATR 14");
  });

  it("lists a trailing EMA stop and fractional shares", () => {
    expect(lacksOf(prompt({ strategyId: "breakout", params: { trailingStopEmaPeriod: 21 } }))).toContain("Trailing EMA 21 stop");
    expect(lacksOf(prompt({ strategyId: "ema-price-cross", run: fixedRun({}, { wholeShares: LEGACY_SIZING.wholeShares }) }))).toContain("Fractional shares");
  });

  it("says None when the run used nothing the runtime lacks", () => {
    expect(lacksOf(prompt({ strategyId: "ema-price-cross" }))).toContain("None.");
  });
});
