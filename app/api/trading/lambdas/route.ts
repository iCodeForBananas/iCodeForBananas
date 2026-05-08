import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}

// POST: save a new paper-trading lambda config, returns the generated UUID
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, strategy_id, strategy_name, symbol, params, position_size, initial_capital, is_sandbox, tradier_api_key, tradier_account_id } = body;

    if (!strategy_id || !strategy_name || !symbol) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const db = supabase();
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
        tradier_api_key: tradier_api_key ?? null,
        tradier_account_id: tradier_account_id ?? null,
        status: "active",
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

// GET: list saved lambdas
export async function GET() {
  try {
    const db = supabase();
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
