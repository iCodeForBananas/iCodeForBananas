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
//
// Uses the service role key, server-side only — never sent to a client,
// never committed (SUPABASE_SERVICE_ROLE_KEY is in .gitignore'd .env* files
// locally and set directly in Vercel). This used to run on the anon key,
// which relied on each table's RLS letting an anonymous reader in. That
// happened to work for workout_logs (its "Public read" policy is
// `USING (true)`) and silently failed for lead_sheets (every row is
// `visibility = 'private'`, and the anon-readable policy only covers
// 'unlisted'/'public') — RLS filtered every row out and get_songs returned
// `[]` instead of an error, which is exactly the failure mode that made
// this hard to spot. The service role bypasses RLS entirely, so an empty
// result from here now means what it says — zero rows — rather than zero
// permitted rows; a real auth/config problem (missing or invalid key)
// throws instead (see the `if (error) throw error` below each query, and
// the config check below), so the two cases don't collapse into the same
// silent `[]` again.
//
// A remote MCP client has no login of its own to carry a user's session, so
// "authenticate as the user" isn't available here the way it would be for
// a request from the browser app — service role is the only way for this
// server-side endpoint to read the data at all. Single-user app, so
// OWNER_USER_ID below is hardcoded rather than derived from a request;
// lead_sheets queries filter by it explicitly even though the service role
// doesn't require it, so the tool keeps returning only its owner's songs if
// this ever stops being a single-user app.
const OWNER_USER_ID = "9d9c360a-9c84-4afb-9fc8-fbbe3cd766ae"; // icodeforbananas@gmail.com — the only user this project has

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase not configured");
  return createClient(url, serviceKey);
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
      .eq("user_id", OWNER_USER_ID)
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
      .eq("user_id", OWNER_USER_ID)
      .single();
    if (error) throw error;
    return data;
  }

  if (name === "get_workouts") {
    // Unlike lead_sheets above, this is deliberately not filtered to
    // OWNER_USER_ID: workout_logs' own "Public read" RLS policy is
    // `USING (true)` (flagged separately — anyone with the anon key can
    // already read all of it, not just this server), and 28 of its rows
    // have a null user_id, which an owner filter would silently start
    // excluding. Not changing what this tool returns as part of the RLS fix.
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
