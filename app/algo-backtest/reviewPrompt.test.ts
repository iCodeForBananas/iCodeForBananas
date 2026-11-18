// Integrity: the review prompt, the report's settings and the Lambda prompt
// describe only what the run had switched on. A disabled setting is never
// mentioned; an enabled one always is, with the run's own value.
import { describe, expect, it } from "vitest";
import { AVAILABLE_STRATEGIES, getDefaultParams } from "@/app/strategies";
import { DEFAULT_SIZING } from "@/app/lib/backtest-engine";
import { buildDeployPrompt, type RunSettings } from "./deployPrompt";
import { buildReviewPrompt, settingsLines } from "./reviewPrompt";

type Params = Record<string, number | boolean | string>;

/** Everything optional switched off. */
const allOff = (over: Partial<RunSettings> = {}, sizing: Partial<RunSettings["sizing"]> = {}): RunSettings => ({
  stopLossPercent: 2,
  takeProfitPercent: 4,
  enableShorts: false,
  positionSizePercent: 100,
  commissionBps: 0,
  slippageBps: 0,
  ...over,
  sizing: {
    ...DEFAULT_SIZING,
    mode: "fixed",
    useStopLoss: false,
    useTakeProfit: false,
    atrStopMultiple: 2,
    maxGapLossPercent: 10,
    maxDrawdownPercent: 0,
    allowReversal: false,
    wholeShares: true,
    ...sizing,
  },
});

const STRATEGY = "ema-price-cross";
const params = (extra: Params = {}): Params => ({ ...getDefaultParams(STRATEGY), ...extra });

/** Everything Claude is shown about a run: both prompts, and the report's settings. */
function everything(run: RunSettings, p: Params = params()) {
  const review = `${buildReviewPrompt(run, p)}\n${settingsLines(run, p).join("\n")}`;
  const lambda = buildDeployPrompt({
    strategy: AVAILABLE_STRATEGIES[STRATEGY],
    params: p,
    run,
    symbol: "SPY",
    timeframe: "1d",
    source: "export default {};",
    backtest: { label: "SPY 1d", totalPnlPercent: 5, totalTrades: 40, winRate: 50, maxDrawdownPercent: 8, sharpeRatio: 1, initialCapital: 10_000 },
  });
  // The Lambda entry must set enableShorts and the limits explicitly (the
  // runtime would otherwise default them on), so only the prose is checked.
  const prose = lambda.replace(/```ts\n\{[\s\S]*?```/, "");
  return { review, lambda: prose };
}

const STOP = /stop loss|stop-loss|\bATR\b|gap cap|trailing/i;
const TARGET = /take[ -]profit/i;
const SLIPPAGE = /slippage/i;
const COMMISSION = /commission/i;

describe("a disabled setting is never mentioned", () => {
  const { review, lambda } = everything(allOff());

  for (const [name, re] of [["stop loss", STOP], ["take profit", TARGET]] as const) {
    it(`no ${name}`, () => {
      expect(review).not.toMatch(re);
      expect(lambda).not.toMatch(re);
    });
  }
  it("no slippage or commission when none was charged", () => {
    expect(settingsLines(allOff(), params()).join("\n")).not.toMatch(/slippage|commission|costs/i);
    expect(lambda).not.toMatch(SLIPPAGE);
    expect(lambda).not.toMatch(COMMISSION);
    // The review asks about realistic costs in general, not the run's.
    expect(buildReviewPrompt(allOff(), params())).toContain("include no trading costs");
  });
  it("no shorts, drawdown limit, reversal or fractional shares", () => {
    expect(review).not.toMatch(/short|drawdown limit|revers|fractional/i);
    expect(lambda).not.toMatch(/revers|fractional/i);
  });
  it("a stop percent left in the editor doesn't count while stops are off", () => {
    expect(everything(allOff({ stopLossPercent: 3 }, { atrStopMultiple: 0 })).review).not.toMatch(STOP);
  });
});

describe("an enabled setting is always mentioned, with the run's value", () => {
  it("slippage alone", () => {
    const { review, lambda } = everything(allOff({ slippageBps: 5 }));
    expect(review).toContain("5 bps slippage");
    expect(lambda).toContain("5 bps slippage");
    expect(review).not.toMatch(COMMISSION);
    expect(lambda).not.toMatch(COMMISSION);
  });
  it("commission and slippage", () => {
    const { review, lambda } = everything(allOff({ commissionBps: 1.5, slippageBps: 3 }));
    for (const text of [review, lambda]) expect(text).toContain("1.5 bps commission and 3 bps slippage");
  });
  it("a percent stop", () => {
    const { review, lambda } = everything(allOff({ stopLossPercent: 2 }, { useStopLoss: true, atrStopMultiple: 0, maxGapLossPercent: 0 }));
    expect(review).toContain("**Stop Loss:** 2%");
    expect(review).toMatch(/this run used a stop loss/);
    expect(lambda).toContain("Stop loss 2%");
  });
  it("an ATR stop and its gap cap", () => {
    const { review } = everything(allOff({}, { useStopLoss: true, atrStopMultiple: 1.5 }));
    expect(review).toContain("1.5 × ATR(14)");
    expect(review).toContain("**Gap Cap:**");
  });
  it("a swept stop uses the result's value, not the run's", () => {
    const { review } = everything(allOff({ stopLossPercent: 2 }, { useStopLoss: true, atrStopMultiple: 0 }), params({ stopLossPercent: 3.5 }));
    expect(review).toContain("**Stop Loss:** 3.5%");
  });
  it("a take profit", () => {
    const { review, lambda } = everything(allOff({ takeProfitPercent: 4 }, { useTakeProfit: true }));
    expect(review).toContain("**Take Profit:** 4%");
    expect(lambda).toContain("Take profit 4%");
  });
  it("shorts, drawdown limit, reversal and fractional shares", () => {
    const { review, lambda } = everything(allOff({ enableShorts: true }, { maxDrawdownPercent: 20, drawdownPauseBars: 10, allowReversal: true, wholeShares: false }));
    expect(review).toContain("**Short Selling:** Enabled");
    expect(review).toContain("Shorts need borrowable shares");
    expect(review).toContain("**Drawdown Limit:** 20% below peak, then sit out 10 bars");
    expect(review).toContain("**Reversal:**");
    expect(review).toContain("**Fractional Shares:**");
    expect(lambda).toMatch(/Reversal on an opposite signal/);
    expect(lambda).toMatch(/Fractional shares/);
  });
});
