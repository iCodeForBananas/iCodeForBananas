import { NextRequest, NextResponse } from "next/server";
import { supabaseAnon, executeStrategy, DeployedStrategy } from "../lib/executor";

export const dynamic = "force-dynamic";

// Manual "Run now" endpoint — requires authenticated user
export async function POST(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id)
    return NextResponse.json({ success: false, error: "id required" }, { status: 400 });

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

  const { data: strategy, error: stratErr } = await db
    .from("trading_lambdas")
    .select("*")
    .eq("id", id)
    .single();

  if (stratErr || !strategy)
    return NextResponse.json({ success: false, error: "Strategy not found" }, { status: 404 });
  if (strategy.status !== "active")
    return NextResponse.json({ success: false, error: "Strategy is not active" }, { status: 400 });

  try {
    const result = await executeStrategy(strategy as DeployedStrategy);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Execution failed" },
      { status: 500 }
    );
  }
}
