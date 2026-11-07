// Types, defaults and validation for a live strategy deployment. Shared by the
// CDK app (which validates deployments.ts at synth time and creates one Lambda
// per entry) and the runtime (which receives one resolved entry as JSON in the
// DEPLOYMENT environment variable). Pure: no AWS imports.

import { AVAILABLE_STRATEGIES } from '@/app/strategies';

/** Bar sizes Tradier's /markets/timesales serves. */
export const INTERVALS = { '1min': 1, '5min': 5, '15min': 15 } as const;
export type Interval = keyof typeof INTERVALS;

export type ParamValue = number | boolean | string;

export interface Deployment {
  /** Unique, stable, lowercase-hyphenated. Names the Lambda, the state row and the dashboard row. Never rename a live one. */
  id: string;
  /** Key in AVAILABLE_STRATEGIES (app/strategies/index.ts). */
  strategyId: string;
  symbol: string;
  interval: Interval;
  /** Overrides on top of the strategy's own defaults. Unknown keys fail synth. */
  params?: Record<string, ParamValue>;
  /** false: the Lambda exists but its schedule is disabled. */
  enabled?: boolean;
  enableShorts?: boolean;
  /** Share of the account's equity this deployment trades with, when it first runs. Enabled deployments must sum to <= 100. */
  allocationPct: number;
  /** Percent of the deployment's equity put into each position. */
  positionSizePct?: number;
  maxDailyLossPct?: number;
  drawdownLimitPct?: number;
  drawdownPauseBars?: number;
  /** Bars needed before the first signal, so indicators are warm. */
  minBars?: number;
  /** Calendar days of history fetched on every run (always the same window). */
  historyDays?: number;
}

export type ResolvedDeployment = Required<Omit<Deployment, 'params'>> & { params: Record<string, ParamValue> };

export const DEFAULTS = {
  enabled: true,
  enableShorts: false,
  positionSizePct: 100,
  maxDailyLossPct: 2,
  drawdownLimitPct: 25,
  drawdownPauseBars: 20,
  minBars: 250,
  historyDays: 10,
} as const;

export function strategyDefaults(strategyId: string): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const p of AVAILABLE_STRATEGIES[strategyId]?.parameters ?? []) out[p.key] = p.default;
  return out;
}

export function resolveDeployment(d: Deployment): ResolvedDeployment {
  return {
    ...DEFAULTS,
    ...d,
    params: { ...strategyDefaults(d.strategyId), ...(d.params ?? {}) },
  } as ResolvedDeployment;
}

/** Every problem with the list, or [] when it's deployable. */
export function validateDeployments(list: Deployment[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const liveSymbols = new Map<string, string>();
  let allocation = 0;

  for (const d of list) {
    const at = `deployment "${d.id}"`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.id) || d.id.length > 48) errors.push(`${at}: id must be lowercase letters, digits and single hyphens, at most 48 characters`);
    if (ids.has(d.id)) errors.push(`${at}: duplicate id`);
    ids.add(d.id);

    const strategy = AVAILABLE_STRATEGIES[d.strategyId];
    if (!strategy) {
      errors.push(`${at}: unknown strategyId "${d.strategyId}"`);
    } else {
      const known = new Map((strategy.parameters ?? []).map((p) => [p.key, p]));
      for (const [key, value] of Object.entries(d.params ?? {})) {
        const p = known.get(key);
        if (!p) errors.push(`${at}: "${d.strategyId}" has no parameter "${key}" (has: ${[...known.keys()].join(', ') || 'none'})`);
        else if (p.type === 'number' && typeof value !== 'number') errors.push(`${at}: parameter "${key}" must be a number`);
        else if (p.type === 'boolean' && typeof value !== 'boolean') errors.push(`${at}: parameter "${key}" must be true or false`);
        else if (p.type === 'select' && !(p.options ?? []).includes(String(value))) errors.push(`${at}: parameter "${key}" must be one of ${(p.options ?? []).join(', ')}`);
      }
    }

    if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(d.symbol)) errors.push(`${at}: symbol "${d.symbol}" doesn't look like a ticker`);
    if (!(d.interval in INTERVALS)) errors.push(`${at}: interval must be one of ${Object.keys(INTERVALS).join(', ')}`);

    const r = resolveDeployment(d);
    const pct = (name: string, v: number, max = 100) => {
      if (!(typeof v === 'number' && v > 0 && v <= max)) errors.push(`${at}: ${name} must be > 0 and <= ${max}`);
    };
    pct('allocationPct', r.allocationPct);
    pct('positionSizePct', r.positionSizePct);
    pct('maxDailyLossPct', r.maxDailyLossPct);
    pct('drawdownLimitPct', r.drawdownLimitPct);
    if (!(Number.isInteger(r.drawdownPauseBars) && r.drawdownPauseBars >= 0)) errors.push(`${at}: drawdownPauseBars must be a whole number >= 0`);
    if (!(Number.isInteger(r.minBars) && r.minBars >= 1)) errors.push(`${at}: minBars must be a whole number >= 1`);
    if (!(Number.isInteger(r.historyDays) && r.historyDays >= 1 && r.historyDays <= 30)) errors.push(`${at}: historyDays must be a whole number from 1 to 30`);

    if (r.enabled) {
      allocation += r.allocationPct;
      // One Tradier account holds one net position per symbol, so two live
      // deployments on a symbol would each see the other's shares as theirs.
      const other = liveSymbols.get(d.symbol);
      if (other) errors.push(`${at}: ${d.symbol} is already traded by enabled deployment "${other}"; one enabled deployment per symbol`);
      else liveSymbols.set(d.symbol, d.id);
    }
  }
  if (allocation > 100 + 1e-9) errors.push(`enabled deployments allocate ${allocation}% of the account; the total must be <= 100`);
  return errors;
}
