import { NextRequest, NextResponse } from "next/server";
import { supabaseAnon } from "../lib/executor";

export const dynamic = "force-dynamic";

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
    const { data: lambdas, error: lambdaError } = await db
      .from("trading_lambdas")
      .select("id")
      .eq("user_id", user.id);
    if (lambdaError) throw lambdaError;

    const lambdaIds = (lambdas ?? []).map((l) => l.id);
    if (lambdaIds.length === 0) {
      return NextResponse.json({ success: true, trades: [] });
    }

    const { data, error } = await db
      .from("lambda_trades")
      .select("*")
      .in("lambda_id", lambdaIds)
      .order("entry_time", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ success: true, trades: data ?? [] });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
