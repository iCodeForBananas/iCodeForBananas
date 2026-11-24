// The dispatcher: one Lambda, invoked every 5 minutes by EventBridge Scheduler,
// that runs every deployment published from the backtester. Each tick it reads
// the enabled deployments from Supabase, picks the ones a bar just became
// available for, and runs each through runDeployment, the same run the
// per-deployment Lambdas do, with the strategy taken from the registry
// (every strategy in app/strategies is bundled). Publishing, pausing or
// removing a deployment is a database write; no CDK deploy.
//
// Dependencies are injected so the whole tick runs in tests against fakes.

import type { StrategyDefinition } from '@/app/strategies/types';
import { DATA_DELAY_MS, resolveDeployment, type Deployment, type Interval, type ResolvedDeployment } from './config';
import { TICK_MINUTES, rowToDeployment, validateAppDeployment, type AppDeploymentRow } from './app-deployments';
import { expectedBarClose, runDeployment, type RunDeps, type RunEvent } from './run';
import { teardownDeployment } from './teardown';
import { etParts } from './time';

const TICK_MS = TICK_MINUTES * 60_000;

/**
 * Whether a dispatcher tick at `t` should run a deployment on `interval`: the
 * tick is the first one at or after a bar became available. Intraday bars
 * become available DATA_DELAY_MS after they close (09:45, 10:00, ... 16:15 ET
 * for 15-minute bars); daily runs go at 16:30 ET, after the close, like the
 * code deployments' schedules. runDeployment still checks the timing itself.
 */
export function isDue(interval: Interval, t: number): boolean {
  if (interval === '1d') {
    const p = etParts(t);
    const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    const minuteOfDay = p.hour * 60 + p.minute;
    return weekday !== 0 && weekday !== 6 && minuteOfDay >= 16 * 60 + 30 && minuteOfDay < 16 * 60 + 30 + TICK_MINUTES;
  }
  const expected = expectedBarClose(interval, t - DATA_DELAY_MS);
  if (expected === null) return false;
  const sinceAvailable = t - (expected + DATA_DELAY_MS);
  return sinceAvailable >= 0 && sinceAvailable < TICK_MS;
}

export interface Selection {
  run: ResolvedDeployment[];
  rejected: { id: string; errors: string[] }[];
}

/**
 * The enabled rows that are valid, oldest first. A second enabled row on a
 * symbol is rejected: the database forbids it, this is belt and braces.
 */
export function selectRunnable(rows: AppDeploymentRow[], codeDeployments: Deployment[]): Selection {
  const run: ResolvedDeployment[] = [];
  const rejected: Selection['rejected'] = [];
  const symbols = new Map<string, string>();
  const sorted = rows.filter((r) => r.enabled).sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
  for (const row of sorted) {
    const d = rowToDeployment(row);
    const errors = validateAppDeployment(d, codeDeployments);
    const other = symbols.get(d.symbol);
    if (other) errors.push(`${d.symbol} is already traded by app deployment "${other}"`);
    if (errors.length) {
      rejected.push({ id: row.id, errors });
      continue;
    }
    symbols.set(d.symbol, row.id);
    run.push(resolveDeployment(d));
  }
  return { run, rejected };
}

/** What happened to one deployment on a tick; also written back to its row. */
export interface RunOutcome {
  id: string;
  at: number;
  action: string;
  reason: string | null;
  error: string | null;
}

export interface DeploymentSource {
  list(): Promise<AppDeploymentRow[]>;
  /** Best effort: a failure is logged, never fatal. */
  reportRun(outcome: RunOutcome): Promise<void>;
  /** Deletes a torn-down deployment's row once it's flat. */
  finishTeardown(id: string): Promise<void>;
}

export interface DispatchEvent extends RunEvent {
  /** Run only these deployment ids, whether or not a bar is due (with dryRun, to check one by hand). */
  ids?: string[];
  /** Run every enabled deployment, whether or not a bar is due (with dryRun: scripts/dry-run.ts). */
  all?: boolean;
}

export interface DispatchDeps extends Omit<RunDeps, 'strategy'> {
  source: DeploymentSource;
  strategies: Record<string, StrategyDefinition>;
  /** trading/deployments.ts: their ids and enabled symbols are off limits. */
  codeDeployments: Deployment[];
}

export interface DispatchResult {
  tick: string;
  enabled: number;
  due: string[];
  outcomes: RunOutcome[];
  rejected: Selection['rejected'];
  /** Deleted deployments worked on this tick: closing their positions, or removed once flat. */
  teardowns: RunOutcome[];
}

export async function dispatch(event: DispatchEvent | undefined, deps: DispatchDeps): Promise<DispatchResult> {
  const t = deps.now();
  const rows = await deps.source.list();
  const { run, rejected } = selectRunnable(rows, deps.codeDeployments);
  const ids = event?.ids?.length ? new Set(event.ids) : null;
  const due = run.filter((d) => (ids ? ids.has(d.id) : event?.all === true || isDue(d.interval, t)));
  const runEvent: RunEvent = { dryRun: event?.dryRun === true, evaluateLatest: event?.evaluateLatest === true };

  // In parallel: each run must start within 2 minutes of its bar becoming
  // available (MAX_LATENESS_MS), so none waits on another.
  const settled = await Promise.allSettled(
    due.map((d) => {
      const strategy = deps.strategies[d.strategyId];
      if (!strategy) return Promise.reject(new Error(`strategy "${d.strategyId}" isn't in this build of the dispatcher; redeploy the stack`));
      return runDeployment(d, runEvent, { ...deps, strategy });
    }),
  );
  // Deleted deployments, every tick until they're flat: cancel, close, remove.
  // Not with `ids`, which is for checking named deployments by hand.
  const tearingDown = ids ? [] : rows.filter((r) => r.teardown_requested_at && !r.enabled);
  const enabledSymbols = new Set(run.map((d) => d.symbol));
  const teardowns: RunOutcome[] = await Promise.all(
    tearingDown.map(async (r): Promise<RunOutcome> => {
      try {
        const res = await teardownDeployment(r, enabledSymbols.has(r.symbol), runEvent.dryRun === true, deps);
        if (res.status === 'flat' && !runEvent.dryRun) {
          await deps.source.finishTeardown(r.id);
          return { id: r.id, at: t, action: `removed (${res.action})`, reason: res.reason, error: null };
        }
        return { id: r.id, at: t, action: `teardown: ${res.action}`, reason: res.reason, error: null };
      } catch (err) {
        return { id: r.id, at: t, action: 'teardown error', reason: null, error: String((err as Error)?.message ?? err) };
      }
    }),
  );

  const outcomes: RunOutcome[] = settled.map((s, i) => ({
    id: due[i].id,
    at: t,
    action: s.status === 'fulfilled' ? s.value.action : 'error',
    reason: s.status === 'fulfilled' ? (s.value.reason ?? null) : null,
    error: s.status === 'rejected' ? String((s.reason as Error)?.message ?? s.reason) : null,
  }));

  // Dry runs leave the rows alone, like they leave the state alone.
  if (!runEvent.dryRun) {
    const reports = [
      ...outcomes,
      ...rejected.map((r) => ({ id: r.id, at: t, action: 'rejected', reason: r.errors.join('; '), error: null })),
      // A removed row has nothing left to report to.
      ...teardowns.filter((o) => !o.action.startsWith('removed')),
    ];
    const failed: string[] = [];
    await Promise.all(reports.map((o) => deps.source.reportRun(o).catch((err: Error) => failed.push(`${o.id}: ${err.message}`))));
    if (failed.length) deps.log(JSON.stringify({ level: 'warn', dispatcher: true, runReportErrors: failed }));
  }

  if (teardowns.some((o) => o.error)) deps.log(JSON.stringify({ level: 'warn', dispatcher: true, teardownErrors: teardowns.filter((o) => o.error) }));
  const result: DispatchResult = { tick: new Date(t).toISOString(), enabled: rows.filter((r) => r.enabled).length, due: due.map((d) => d.id), outcomes, rejected, teardowns };
  deps.log(JSON.stringify({ level: outcomes.some((o) => o.error) || rejected.length ? 'warn' : 'info', dispatcher: true, ...result }));
  return result;
}
