// Types, defaults and validation for a live strategy deployment. Shared by the
// CDK app (which validates deployments.ts at synth time and creates one Lambda
// per entry) and the runtime (which receives one resolved entry as JSON in the
// DEPLOYMENT environment variable). Pure: no AWS imports.

import { createHash } from 'node:crypto';
import { AVAILABLE_STRATEGIES } from '@/app/strategies';

/** Bar sizes in minutes. */
export const INTERVALS = { '1min': 1, '5min': 5, '15min': 15, '30min': 30, '1h': 60, '1d': 1440 } as const;
export type Interval = keyof typeof INTERVALS;

/**
 * The timesales interval each bar size is built from. Tradier serves 1, 5 and
 * 15 minutes; 30-minute and 1-hour bars are aggregated from 15-minute ones
 * (aligned to the ET :00, and :30 for 30 minutes).
 */
export const SOURCE_INTERVAL: Record<Interval, '1min' | '5min' | '15min' | 'daily'> = { '1min': '1min', '5min': '5min', '15min': '15min', '30min': '15min', '1h': '15min', '1d': 'daily' };

/**
 * Tradier's sandbox delays all market data by 15 minutes. An intraday bar is
 * treated as available (and complete) only 15 minutes after it closes: runs
 * act on the bar that closed 15 minutes before the run, and anything newer in
 * the response is ignored as possibly incomplete.
 */
export const DATA_DELAY_MS = 15 * 60 * 1000;

/** Daily bars come from /markets/history, which keeps years of them. */
export const isDaily = (interval: Interval) => interval === '1d';

export type ParamValue = number | boolean | string;

export interface Deployment {
  /**
   * Optional. By default the id is built from the settings (see deploymentId),
   * so it names the Lambda, schedule, state row and dashboard row uniquely.
   * Changing a setting therefore makes a new deployment with fresh state.
   */
  id?: string;
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

/** Lambda function and schedule names are limited to 64 characters. */
export const AWS_NAME_MAX = 64;

export const DEFAULTS = {
  enabled: true,
  // Every strategy trades both sides unless an entry says otherwise.
  enableShorts: true,
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

const slug = (v: ParamValue) =>
  typeof v === 'boolean'
    ? v ? 'y' : 'n'
    : String(v).toLowerCase().replace(/-/g, 'm').replace(/\./g, 'p').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * strategy-symbol-interval-<param values in the strategy's order>-<ls|l>, e.g.
 * "ibs-mean-reversion-qqq-15m-20-50-n-ls" (entryIbs 20, exitIbs 50, trendFilter
 * off, long and short). Booleans are y/n, "." is p and "-" is m.
 */
export function deploymentId(d: Omit<Deployment, 'id'>): string {
  const params = { ...strategyDefaults(d.strategyId), ...(d.params ?? {}) };
  const keys = [...(AVAILABLE_STRATEGIES[d.strategyId]?.parameters ?? []).map((p) => p.key), ...Object.keys(params)];
  const values = [...new Set(keys)].filter((k) => k in params).map((k) => slug(params[k]));
  const interval = String(d.interval).replace('min', 'm');
  const sides = d.enableShorts ?? DEFAULTS.enableShorts ? 'ls' : 'l';
  return [d.strategyId, d.symbol.toLowerCase().replace(/\./g, 'p'), interval, ...values, sides].filter(Boolean).join('-');
}

/** `${prefix}-${id}`, cut to AWS_NAME_MAX with a hash of the full id appended when it's too long. */
export function awsName(prefix: string, id: string, max = AWS_NAME_MAX): string {
  const full = `${prefix}-${id}`;
  if (full.length <= max) return full;
  const hash = createHash('sha256').update(id).digest('hex').slice(0, 8);
  return `${full.slice(0, max - hash.length - 1).replace(/-+$/, '')}-${hash}`;
}

/** The deployment's Lambda function name, also its schedule's and log group's. */
export const functionName = (d: { id: string }) => awsName('tradier', d.id);

export function resolveDeployment(d: Deployment): ResolvedDeployment {
  return {
    ...DEFAULTS,
    ...d,
    id: d.id ?? deploymentId(d),
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
    const id = d.id ?? deploymentId(d);
    const at = `deployment "${id}"`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) || id.length > 200) errors.push(`${at}: id must be lowercase letters, digits and single hyphens, at most 200 characters`);
    if (ids.has(id)) errors.push(`${at}: duplicate id (same settings as another deployment?)`);
    ids.add(id);

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
    // Tradier keeps 40 days of 1-, 5- and 15-minute timesales, and years of daily history.
    const maxDays = isDaily(r.interval) ? 3650 : 40;
    if (!(Number.isInteger(r.historyDays) && r.historyDays >= 1 && r.historyDays <= maxDays)) errors.push(`${at}: historyDays must be a whole number from 1 to ${maxDays}`);

    if (r.enabled) {
      allocation += r.allocationPct;
      // One Tradier account holds one net position per symbol, so two live
      // deployments on a symbol would each see the other's shares as theirs.
      const other = liveSymbols.get(d.symbol);
      if (other) errors.push(`${at}: ${d.symbol} is already traded by enabled deployment "${other}"; one enabled deployment per symbol`);
      else liveSymbols.set(d.symbol, id);
    }
  }
  if (allocation > 100 + 1e-9) errors.push(`enabled deployments allocate ${allocation}% of the account; the total must be <= 100`);
  return errors;
}
