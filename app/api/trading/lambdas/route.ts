import { NextRequest, NextResponse } from "next/server";
import { supabaseAnon } from "../lib/executor";

export const dynamic = "force-dynamic";

// POST: deploy a new strategy
export async function POST(req: NextRequest) {
  // Verify auth
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const db = supabaseAnon();
  const { data: { user }, error: authError } = await db.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, strategy_id, strategy_name, symbol, params, position_size, initial_capital, is_sandbox, timeframe } = body;

    if (!strategy_id || !strategy_name || !symbol) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const { data, error } = await db
      .from("trading_lambdas")
      .insert({
        name: name || `${strategy_name} on ${symbol}`,
        strategy_id,
        strategy_name,
        symbol: symbol.toUpperCase(),
        params: params ?? {},
        position_size: position_size ?? 100,
        initial_capital: initial_capital ?? 10000,
        is_sandbox: is_sandbox ?? true,
        timeframe: timeframe ?? "daily",
        status: "active",
        user_id: user.id,
      })
      .select("id, name, created_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, lambda: data });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to save" },
      { status: 500 }
    );
  }
}

// GET: list deployed strategies (auth required)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const db = supabaseAnon();
  const { data: { user }, error: authError } = await db.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data, error } = await db
      .from("trading_lambdas")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ success: true, lambdas: data ?? [] });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to load" },
      { status: 500 }
    );
  }
}
