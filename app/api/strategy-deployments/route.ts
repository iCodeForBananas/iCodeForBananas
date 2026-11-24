import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { DEPLOYMENTS } from "@/trading/deployments";
import { deploymentToRow, rowToDeployment, validateAppDeployment, type AppDeploymentInput } from "@/trading/runtime/app-deployments";

export const dynamic = "force-dynamic";

// Strategies deployed from the backtester (public.strategy_deployments). The
// dispatcher Lambda reads the enabled rows every 5 minutes and paper-trades
// them on Tradier, so a write here is the whole deploy. Validation is the
// runtime's own (trading/runtime/app-deployments.ts), against the code
// deployments in trading/deployments.ts too; row-level security limits every
// read and write to trading operators.

const COLUMNS =
  "id, strategy_id, symbol, bar_interval, params, enable_shorts, starting_equity, position_size_pct, max_daily_loss_pct, drawdown_limit_pct, drawdown_pause_bars, min_bars, history_days, enabled, backtest, last_run_at, last_action, last_reason, last_error, teardown_requested_at, created_at, updated_at";

const fail = (status: number, error: string, details?: string[]) => NextResponse.json({ error, details }, { status });

async function client() {
  const supabase = createClient(await cookies());
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

/** A unique-index violation on an enabled symbol reads better as the rule it enforces. */
function dbError(err: { code?: string; message: string }, symbol?: string) {
  if (err.code === "23505") return fail(409, `${symbol ?? "That symbol"} already has an enabled deployment; pause it first (one Tradier account holds one position per symbol).`);
  if (err.code === "42501") return fail(403, "Only trading operators can deploy strategies.");
  return fail(500, err.message);
}

export async function GET() {
  const { supabase, user } = await client();
  if (!user) return fail(401, "Sign in to see deployed strategies.");
  const { data, error } = await supabase.from("strategy_deployments").select(COLUMNS).order("created_at", { ascending: false });
  if (error) return dbError(error);
  return NextResponse.json({ deployments: data });
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await client();
  if (!user) return fail(401, "Sign in to deploy a strategy.");
  const body = (await request.json().catch(() => null)) as { deployment?: AppDeploymentInput; backtest?: unknown } | null;
  const d = body?.deployment;
  if (!d || typeof d !== "object") return fail(400, "Missing deployment.");

  const input: AppDeploymentInput = {
    strategyId: String(d.strategyId),
    symbol: String(d.symbol).toUpperCase(),
    interval: d.interval,
    params: d.params ?? {},
    enableShorts: d.enableShorts === true,
    startingEquity: Number(d.startingEquity),
    positionSizePct: Number(d.positionSizePct),
    maxDailyLossPct: Number(d.maxDailyLossPct),
    drawdownLimitPct: Number(d.drawdownLimitPct),
    drawdownPauseBars: Number(d.drawdownPauseBars),
    minBars: Number(d.minBars),
    historyDays: Number(d.historyDays),
  };
  const errors = validateAppDeployment({ ...input, enabled: true }, DEPLOYMENTS);
  if (errors.length) return fail(422, "This deployment isn't valid.", errors);

  // The id comes from the settings, so deploying the same settings again
  // re-enables that deployment (and its state) rather than adding a second.
  const row = { ...deploymentToRow(input), enabled: true, backtest: body?.backtest ?? null, user_id: user.id };
  const { data, error } = await supabase.from("strategy_deployments").upsert(row, { onConflict: "id" }).select(COLUMNS).single();
  if (error) return dbError(error, input.symbol);
  return NextResponse.json({ deployment: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { supabase, user } = await client();
  if (!user) return fail(401, "Sign in to change a deployment.");
  const body = (await request.json().catch(() => null)) as { id?: string; enabled?: boolean } | null;
  if (!body?.id || typeof body.enabled !== "boolean") return fail(400, "Send an id and enabled.");

  if (body.enabled) {
    const { data: current, error } = await supabase.from("strategy_deployments").select(COLUMNS).eq("id", body.id).maybeSingle();
    if (error) return dbError(error);
    if (!current) return fail(404, "No such deployment.");
    const errors = validateAppDeployment({ ...rowToDeployment(current), enabled: true }, DEPLOYMENTS);
    if (errors.length) return fail(422, "It can't be resumed.", errors);
  }
  // Enabling one that was deleted but hasn't finished closing calls the delete off.
  const change = body.enabled ? { enabled: true, teardown_requested_at: null } : { enabled: false };
  const { data, error } = await supabase.from("strategy_deployments").update(change).eq("id", body.id).select(COLUMNS).maybeSingle();
  if (error) return dbError(error);
  if (!data) return fail(404, "No such deployment.");
  return NextResponse.json({ deployment: data });
}

export async function DELETE(request: NextRequest) {
  const { supabase, user } = await client();
  if (!user) return fail(401, "Sign in to remove a deployment.");
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return fail(400, "Send an id.");
  // A delete closes the position first, and only the dispatcher can reach
  // Tradier: this turns it off and asks; the dispatcher closes the position
  // on its next tick (at the next open, if the market is shut) and then
  // deletes the row itself.
  const { data, error } = await supabase
    .from("strategy_deployments")
    .update({ enabled: false, teardown_requested_at: new Date().toISOString() })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) return dbError(error);
  if (!data) return fail(404, "No such deployment.");
  return NextResponse.json({ deployment: data }, { status: 202 });
}
