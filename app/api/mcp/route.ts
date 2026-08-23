import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// No auth of any kind — this endpoint must be callable unauthenticated by
// remote MCP clients (e.g. claude.ai connectors), hence the CORS headers below.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
};

// Public, read-only MCP server over the lead_sheets and workout_logs tables.
// Uses the anon key — relies on the "Public read" RLS policy on each table to
// permit selects.
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) throw new Error("Supabase not configured");
  return createClient(url, anonKey);
}

const WORKOUT_DEFAULT_LIMIT = 50;
const WORKOUT_MAX_LIMIT = 500;

const TOOLS = [
  {
    name: "get_songs",
    description: "List all songs (lead sheets) with their id, title, key, and tempo.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_song",
    description:
      "Get the full content of a song (lead sheet) by id, including its title, key, tempo, notes, and chord/lyric sections.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "The lead sheet id" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_workouts",
    description:
      "List logged workouts, most recent first. Each entry has the exercise name, the date it was performed " +
      "(YYYY-MM-DD), the weight lifted in pounds (null or 0 for bodyweight exercises like Pull-ups and Push-ups), " +
      "and created_at, the timestamp the entry was logged.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: `How many entries to return, newest first (default ${WORKOUT_DEFAULT_LIMIT}, max ${WORKOUT_MAX_LIMIT}).`,
          minimum: 1,
          maximum: WORKOUT_MAX_LIMIT,
        },
        exercise: {
          type: "string",
          description: 'Only return entries for this exercise, e.g. "Bench Press". Case-insensitive exact match.',
        },
        since: {
          type: "string",
          description: 'Only return entries performed on or after this date, as YYYY-MM-DD.',
        },
      },
      additionalProperties: false,
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const supabase = getSupabase();

  if (name === "get_songs") {
    const { data, error } = await supabase
      .from("lead_sheets")
      .select("id, title, key, tempo")
      .order("title", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  if (name === "get_song") {
    const id = args.id;
    if (typeof id !== "string" || !id) throw new Error("id is required");
    const { data, error } = await supabase
      .from("lead_sheets")
      .select("id, title, key, tempo, general_notes, sections, created_at, updated_at")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  }

  if (name === "get_workouts") {
    const rawLimit = args.limit;
    const limit =
      rawLimit === undefined
        ? WORKOUT_DEFAULT_LIMIT
        : Math.min(Math.max(Math.trunc(Number(rawLimit)) || WORKOUT_DEFAULT_LIMIT, 1), WORKOUT_MAX_LIMIT);

    let query = supabase
      .from("workout_logs")
      .select("id, exercise, date, weight, created_at")
      // date is the day it was performed; created_at breaks ties within a day
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (typeof args.exercise === "string" && args.exercise) query = query.ilike("exercise", args.exercise);
    if (typeof args.since === "string" && args.since) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(args.since)) throw new Error("since must be a YYYY-MM-DD date");
      query = query.gte("date", args.since);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row) => ({ ...row, weight_unit: "lbs" }));
  }

  throw new Error(`Unknown tool: ${name}`);
}

// ── JSON-RPC / MCP plumbing ─────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown> };
}

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result }, { headers: CORS_HEADERS });
}

function rpcError(id: string | number | null | undefined, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("text/event-stream")) {
    return NextResponse.json(
      { name: "icodeforbananas-songs", version: "1.0.0", protocol: "MCP/2025-03-26" },
      { headers: CORS_HEADERS }
    );
  }

  // Streamable HTTP transport — open SSE channel
  const sessionId = request.headers.get("mcp-session-id") ?? crypto.randomUUID();
  let intervalId: ReturnType<typeof setInterval>;
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode(": connected\n\n"));
      intervalId = setInterval(() => {
        try {
          controller.enqueue(enc.encode(": keep-alive\n\n"));
        } catch {
          clearInterval(intervalId);
        }
      }, 15000);
    },
    cancel() {
      clearInterval(intervalId);
    },
  });

  return new NextResponse(stream, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "Mcp-Session-Id": sessionId,
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...CORS_HEADERS,
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Accept",
    },
  });
}

export async function POST(request: NextRequest) {
  let body: JsonRpcRequest;
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const { id, method, params } = body;

  // Notifications carry no id and get no response body.
  if (id === undefined) {
    return new NextResponse(null, { status: 202, headers: CORS_HEADERS });
  }

  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "icodeforbananas-songs", version: "1.0.0" },
    });
  }

  if (method === "tools/list") {
    return rpcResult(id, { tools: TOOLS });
  }

  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments ?? {};
    if (!name) return rpcError(id, -32602, "Missing tool name");
    try {
      const result = await callTool(name, args);
      return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(result) }] });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      });
    }
  }

  return rpcError(id, -32601, `Method not found: ${method}`);
}
