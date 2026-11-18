// The "Review with Claude" prompt: the question asked and the run settings in
// the report. Both describe only what the run had switched on. A disabled
// setting (no stop, no take profit, no slippage, long only) isn't mentioned at
// all, so Claude never weighs a stop the run didn't use, and every enabled
// one is written with the value the run used, not what the editor shows now.

import { positionCapPercent, stopOffPositionPercent, withRiskParams } from "@/app/lib/backtest-engine";
import type { RunSettings } from "./deployPrompt";

type ParamValue = number | boolean | string;

const n = (v: number) => String(+v.toFixed(4));

/** The run's stop, target and sizing after any per-result sweep values. */
function effective(run: RunSettings, params: Record<string, ParamValue>) {
  const risk = withRiskParams({ stopLossPercent: run.stopLossPercent, takeProfitPercent: run.takeProfitPercent, sizing: run.sizing }, params);
  const sz = risk.sizing!;
  const stop = !sz.useStopLoss ? null : sz.atrStopMultiple > 0 ? { atr: sz.atrStopMultiple, pct: risk.stopLossPercent } : risk.stopLossPercent > 0 ? { atr: 0, pct: risk.stopLossPercent } : null;
  const takeProfit = sz.useTakeProfit && risk.takeProfitPercent > 0 ? risk.takeProfitPercent : null;
  const trailing = Number(params.trailingStopEmaPeriod ?? 0) || 0;
  return { sz, stop, takeProfit, trailing };
}

/** The costs the run charged, or null when it charged none. */
export function costsText(run: RunSettings): string | null {
  const parts = [run.commissionBps > 0 && `${n(run.commissionBps)} bps commission`, run.slippageBps > 0 && `${n(run.slippageBps)} bps slippage`].filter(Boolean);
  return parts.length ? `${parts.join(" and ")} per fill (each entry and each exit)` : null;
}

/** The report's settings bullets: one per setting the run had on, none for one it had off. */
export function settingsLines(run: RunSettings, params: Record<string, ParamValue>): string[] {
  const { sz, stop, takeProfit, trailing } = effective(run, params);
  const lines: string[] = [];
  if (!sz.useStopLoss) lines.push(`- **Sizing:** ${n(stopOffPositionPercent(sz, run.positionSizePercent))}% of equity per trade`);
  else if (sz.mode === "risk") lines.push(`- **Sizing:** Risk ${n(sz.riskPercent)}% of equity per trade, positions capped at ${n(positionCapPercent(sz))}% of equity`);
  else lines.push(`- **Sizing:** Fixed ${n(Math.min(run.positionSizePercent, positionCapPercent(sz)))}% of equity per trade`);

  if (stop) lines.push(`- **Stop Loss:** ${stop.atr > 0 ? `${n(stop.atr)} × ATR(14) from entry${stop.pct > 0 ? ` (${n(stop.pct)}% until the ATR has warmed up)` : ""}` : `${n(stop.pct)}%`}`);
  if (sz.useStopLoss && sz.maxGapLossPercent > 0 && sz.gapShockPercent > 0) lines.push(`- **Gap Cap:** a ${n(sz.gapShockPercent)}% gap may cost at most ${n(sz.maxGapLossPercent)}% of equity`);
  if (trailing > 0) lines.push(`- **Trailing Stop:** EMA ${trailing}`);
  if (takeProfit !== null) lines.push(`- **Take Profit:** ${n(takeProfit)}%`);
  if (sz.maxDrawdownPercent > 0) lines.push(`- **Drawdown Limit:** ${n(sz.maxDrawdownPercent)}% below peak, then ${sz.drawdownPauseBars > 0 ? `sit out ${sz.drawdownPauseBars} bars` : "stop trading"}`);
  if (run.enableShorts) lines.push("- **Short Selling:** Enabled");
  if (sz.allowReversal) lines.push("- **Reversal:** an exit that fires the opposite entry flips to the other side at the same open");
  if (sz.wholeShares === false) lines.push("- **Fractional Shares:** Enabled");
  const costs = costsText(run);
  if (costs) lines.push(`- **Costs:** ${costs}`);
  return lines;
}

/** The question put to Claude, judging only what the run used. */
export function buildReviewPrompt(run: RunSettings, params: Record<string, ParamValue>): string {
  const { sz, stop, takeProfit, trailing } = effective(run, params);
  // What the live runtime can't do that this run relied on.
  const leans = [stop && "a stop loss", trailing > 0 && "a trailing stop", takeProfit !== null && "a take profit", sz.allowReversal && "reversal on an opposite signal", sz.wholeShares === false && "fractional shares"].filter(Boolean) as string[];
  const costs = costsText(run);
  const lines = [
    "Is this backtest worth paper trading? I'm screening candidates: the ones that hold up in paper trading become real-money trading systems. Paper trading costs me nothing, so the bar isn't perfection. It's a real, repeatable edge with a credible path to trading real money.",
    "",
    "Answer in this shape, nothing else:",
    "1. First line, one verdict: **PAPER TRADE**, **NOT YET** (name the one change or test to do first), or **REJECT**.",
    "2. Up to 5 bullets of reasons, each citing a number from the report.",
    "3. If PAPER TRADE: what live results, over how many trades, would confirm it for real money or kill it.",
    "No preamble, no general trading advice, no hedging.",
    "",
    "Judge it only on the settings listed in the report; anything not listed was off for this run.",
    "",
    "Judge it on:",
    "- Out-of-sample: does the last 30% still make money and beat buy & hold? An edge that's only in-sample is a reject. If it looks like the best of a big parameter sweep, assume it's overfit unless out-of-sample says otherwise.",
    "- Sample size: under ~30 trades the stats are noise. An infinite profit factor or near-100% win rate is a red flag, not a strength.",
    costs
      ? `- Edge after costs: the results already include ${costs}. Is the average trade comfortably bigger than that? Would it survive double the costs?`
      : "- Edge after costs: the results include no trading costs. Is the average trade big enough to survive realistic commission and slippage?",
    "- Drawdown: is the max drawdown something I'd sit through with real money, given the return?",
    "- Buy & hold: is it worth running instead of just holding?",
    `- Live fit: it runs on Tradier with 15-minute delayed data, market orders at the next bar's open, regular hours only, and whole shares.${run.enableShorts ? " Shorts need borrowable shares." : ""}${
      leans.length ? ` Live, it exits only on the strategy's own signals, but this run used ${leans.join(", ")}: say how much that changes it.` : ""
    }`,
  ];
  return lines.join("\n");
}
