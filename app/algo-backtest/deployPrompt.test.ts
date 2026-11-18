import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AVAILABLE_STRATEGIES, getDefaultParams } from "@/app/strategies";
import { DEFAULT_SIZING, LEGACY_SIZING } from "@/app/lib/backtest-engine";
import { INTERVALS } from "@/trading/runtime/config";
import {
  BARS_PER_SESSION,
  LIVE_INTERVALS,
  SHARED_RISK,
  buildDeployPrompt,
  compareWithRuntime,
  guaranteedSessions,
  historyWindow,
  parameterNotes,
  type DeployPromptInput,
  type RunSettings,
} from "./deployPrompt";

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

function prompt(over: Partial<DeployPromptInput> & { strategyId: string; params?: Record<string, number | boolean | string> }) {
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

const entryLine = (text: string, key: string) => text.split("\n").find((l) => l.trimStart().startsWith(`${key}:`));
const section3 = (text: string) => text.slice(text.indexOf("## 3."), text.indexOf("## 4."));

describe("matches the runtime", () => {
  it("knows exactly the runtime's intervals", () => {
    expect(new Set(Object.values(LIVE_INTERVALS))).toEqual(new Set(Object.keys(INTERVALS)));
    expect(new Set(Object.keys(BARS_PER_SESSION))).toEqual(new Set(Object.keys(INTERVALS)));
  });

  it("has the same SHARED_RISK as trading/deployments.ts", () => {
    const src = readFileSync("trading/deployments.ts", "utf8");
    const literal = /const SHARED_RISK = (\{[^}]*\})/.exec(src)?.[1];
    expect(literal).toBeDefined();
    const parsed = Function(`return (${literal!.replace(/_/g, "")});`)();
    expect(parsed).toEqual(SHARED_RISK);
  });
});

describe("historyWindow", () => {
  // The old prompt emitted minBars 250 with historyDays 40 for 1h bars.
  it("says when hourly bars can't hold minBars", () => {
    const w = historyWindow("1h", 250);
    expect(w.fits).toBe(false);
    expect(w.historyDays).toBe(40);
    expect(w.maxBars).toBeLessThan(250);
    expect(w.typicalMaxBars).toBeLessThanOrEqual(196);
  });

  it("finds the fewest days that always hold minBars", () => {
    for (const [interval, minBars] of [["1h", 150], ["15min", 375], ["30min", 300], ["1d", 805], ["5min", 2]] as const) {
      const w = historyWindow(interval, minBars);
      expect(w.fits, `${interval} ${minBars}`).toBe(true);
      expect(guaranteedSessions(w.historyDays) * BARS_PER_SESSION[interval]).toBeGreaterThanOrEqual(minBars);
      expect(guaranteedSessions(w.historyDays - 1) * BARS_PER_SESSION[interval]).toBeLessThan(minBars);
    }
  });
});

describe("buildDeployPrompt: minBars and historyDays", () => {
  it("IBS with the filter off needs only the bar itself, whatever its percents", () => {
    const text = prompt({ strategyId: "ibs-mean-reversion", params: { entryIbs: 20, exitIbs: 76, trendFilter: false }, timeframe: "1h" });
    expect(entryLine(text, "minBars")).toMatch(/^ {2}minBars: 1,/);
    expect(text).not.toMatch(/longest parameter|\(76\)/);
  });

  it("IBS with the 200 SMA filter on 1h bars: needs 200, says 40 days can't hold them, and stops", () => {
    const text = prompt({ strategyId: "ibs-mean-reversion", params: { entryIbs: 20, exitIbs: 76, trendFilter: true }, timeframe: "1h" });
    expect(entryLine(text, "minBars")).toMatch(/^ {2}minBars: 200,/);
    expect(entryLine(text, "historyDays")).toMatch(/^ {2}historyDays: 40,/);
    expect(section3(text)).toContain("Not enough history for 1h bars");
    expect(section3(text)).toContain("Stop here and tell me");
  });

  it("EMA Price Cross 14 is sized from EMA 14, not MACD's 26", () => {
    const text = prompt({ strategyId: "ema-price-cross", params: { emaPeriod: 14 }, timeframe: "1h" });
    expect(entryLine(text, "minBars")).toMatch(/^ {2}minBars: 64,/);
    const days = Number(/historyDays: (\d+)/.exec(text)![1]);
    expect(guaranteedSessions(days) * 7).toBeGreaterThanOrEqual(64);
    expect(text).not.toContain("(26)");
    expect(text).toContain("EMA 14 needs");
  });

  it("Connors %b: the exit percent never becomes a lookback", () => {
    const text = prompt({ strategyId: "connors-percent-b", params: { exitPctB: 67, trendFilter: true } });
    expect(entryLine(text, "minBars")).toMatch(/^ {2}minBars: 200,/);
    expect(text).not.toContain("(67)");
  });

  it("says so, and stops, when the warmup can't be worked out", () => {
    const text = prompt({ strategyId: "ema-price-cross", warmup: { kind: "unknown", reason: "test reason", parts: [] } });
    expect(entryLine(text, "minBars")).toBeUndefined();
    expect(text).toContain("// minBars: couldn't be derived");
    expect(section3(text)).toContain("Warmup unknown");
    expect(section3(text)).toContain("test reason");
  });
});

describe("buildDeployPrompt: risk settings", () => {
  it("carries every risk setting from the run, explicitly, with where it came from", () => {
    const text = prompt({ strategyId: "ema-price-cross", run: fixedRun({ enableShorts: false, positionSizePercent: 50 }) });
    expect(entryLine(text, "enableShorts")).toBe("  enableShorts: false, // the backtest traded long only");
    expect(entryLine(text, "positionSizePct")).toBe("  positionSizePct: 50, // the backtest put 50% of equity in each trade");
    expect(entryLine(text, "drawdownLimitPct")).toMatch(/^ {2}drawdownLimitPct: 25,/);
    expect(entryLine(text, "drawdownPauseBars")).toMatch(/^ {2}drawdownPauseBars: 20,/);
    expect(section3(text)).toContain("Nothing: every setting this backtest used maps onto the runtime.");
  });

  it("writes enableShorts and the size even when they match the runtime's defaults", () => {
    const text = prompt({ strategyId: "ema-price-cross", run: fixedRun({ enableShorts: true, positionSizePercent: 100 }) });
    expect(entryLine(text, "enableShorts")).toMatch(/^ {2}enableShorts: true,/);
    expect(entryLine(text, "positionSizePct")).toMatch(/^ {2}positionSizePct: 100,/);
  });

  // NFLX: an ATR stop with risk-based sizing.
  it("names an ATR stop and risk sizing, and leaves the size underived", () => {
    const run = fixedRun({ enableShorts: false, positionSizePercent: 50 }, { mode: "risk", useStopLoss: true, atrStopMultiple: 2, riskPercent: 1 });
    const text = prompt({ strategyId: "ema-price-cross", run });
    const gaps = section3(text);
    expect(gaps).toContain("ATR stop loss");
    expect(gaps).toContain("Risk-based sizing");
    expect(gaps).toContain("Stop here and tell me");
    expect(entryLine(text, "positionSizePct")).toBeUndefined();
    expect(text).toContain("// positionSizePct: can't be derived");
  });

  it("finds a percent stop, a target and reversals, never answering \"Nothing\"", () => {
    const run = fixedRun({ stopLossPercent: 3, takeProfitPercent: 6 }, { useStopLoss: true, useTakeProfit: true, atrStopMultiple: 0, allowReversal: true });
    const gaps = section3(prompt({ strategyId: "ema-price-cross", run }));
    expect(gaps).toContain("Stop loss 3%");
    expect(gaps).toContain("Take profit 6%");
    expect(gaps).toContain("Reversals");
    expect(gaps).not.toContain("Nothing:");
  });

  it("uses the stop a sweep ran this result with", () => {
    const run = fixedRun({ stopLossPercent: 1 }, { useStopLoss: true, atrStopMultiple: 0 });
    expect(section3(prompt({ strategyId: "ema-price-cross", run, params: { stopLossPercent: 4.5 } }))).toContain("Stop loss 4.5%");
  });

  it("caps a fixed size by the gap cap the way the engine does", () => {
    const run = fixedRun({ positionSizePercent: 100 }, { useStopLoss: true, atrStopMultiple: 0, gapShockPercent: 20, maxGapLossPercent: 10 });
    const c = compareWithRuntime({ ...run, stopLossPercent: 2 }, {});
    expect(c.fields.find((f) => f.key === "positionSizePct")?.value).toBe("50");
  });

  it("flags a trailing EMA stop from the strategy's parameters", () => {
    const gaps = section3(prompt({ strategyId: "breakout", params: { trailingStopEmaPeriod: 21 } }));
    expect(gaps).toContain("Trailing EMA 21 stop");
  });

  it("sets a never-tripping drawdown limit when the backtest had none, and says so", () => {
    const text = prompt({ strategyId: "ema-price-cross", run: fixedRun({}, { maxDrawdownPercent: 0 }) });
    expect(entryLine(text, "drawdownLimitPct")).toMatch(/^ {2}drawdownLimitPct: 100,/);
    expect(text).toContain("No drawdown limit in the backtest");
  });

  it("stops on a drawdown limit that ended trading for good", () => {
    const gaps = section3(prompt({ strategyId: "ema-price-cross", run: fixedRun({}, { maxDrawdownPercent: 20, drawdownPauseBars: 0 }) }));
    expect(gaps).toContain("out for the rest of the run");
  });

  it("notes fractional shares", () => {
    expect(prompt({ strategyId: "ema-price-cross", run: fixedRun({}, { wholeShares: LEGACY_SIZING.wholeShares }) })).toContain("Fractional shares");
  });

  it("refuses to guess when the run's settings weren't recorded", () => {
    const text = prompt({ strategyId: "ema-price-cross", run: null });
    expect(entryLine(text, "enableShorts")).toBeUndefined();
    expect(entryLine(text, "positionSizePct")).toBeUndefined();
    expect(section3(text)).toContain("weren't recorded");
    expect(text).toContain("sides not recorded");
  });
});

describe("parameters", () => {
  it("marks each parameter that differs from the strategy's default", () => {
    const text = prompt({ strategyId: "ema-price-cross", params: { emaPeriod: 14 } });
    expect(text).toContain("    emaPeriod: 14, // default 21");
    expect(prompt({ strategyId: "ema-price-cross" })).toContain("    emaPeriod: 21,\n");
  });

  // SOFI: jaw 35 / teeth 3 / lips 20 inverts the fastest-to-slowest order.
  it("flags Alligator lines out of their described order", () => {
    const params = { ...getDefaultParams("alligator"), jawPeriod: 35, teethPeriod: 3, lipsPeriod: 20 };
    const notes = parameterNotes(AVAILABLE_STRATEGIES.alligator, params);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("`lipsPeriod` 20 ≥ `teethPeriod` 3");
    expect(notes[0]).toContain("the slowest line");
    const text = prompt({ strategyId: "alligator", params });
    expect(text).toContain("are out of the order the strategy describes");
    expect(text).toContain("    jawPeriod: 35, // default 13");
  });

  it("says nothing when the order holds", () => {
    expect(parameterNotes(AVAILABLE_STRATEGIES.alligator, getDefaultParams("alligator"))).toEqual([]);
    expect(parameterNotes(AVAILABLE_STRATEGIES["ema-crossover"], { fastPeriod: 9, slowPeriod: 21 })).toEqual([]);
    expect(parameterNotes(AVAILABLE_STRATEGIES["ema-crossover"], { fastPeriod: 50, slowPeriod: 31 })).toHaveLength(1);
  });

  it("leaves sweep-only keys out of the strategy's params", () => {
    const text = prompt({ strategyId: "ema-price-cross", params: { stopLossPercent: 2 } });
    const block = text.slice(text.indexOf("  params: {"), text.indexOf("  },"));
    expect(block).not.toContain("stopLossPercent");
  });
});

describe("prompt shape", () => {
  it("names the unsupported interval and unknown symbol", () => {
    const text = prompt({ strategyId: "ema-price-cross", timeframe: "4h", symbol: null });
    expect(section3(text)).toContain("Bar interval 4h");
    expect(section3(text)).toContain("isn't known; ask me which ticker");
    expect(text).toContain("symbol: 'UNKNOWN'");
  });
});
