import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function makeQueryClient(jwt: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL not configured");
  if (serviceKey) return createClient(url, serviceKey);
  if (!anonKey) throw new Error("Supabase key not configured");
  // Forward JWT so auth.uid() resolves in RLS — only when it's a real JWT (3 parts)
  const isJwt = jwt != null && jwt.split(".").length === 3;
  return createClient(url, anonKey, isJwt ? {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  } : undefined);
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://icodeforbananas.com";

// ── Auth helpers ────────────────────────────────────────────────────────────

function extractToken(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  return auth.replace("Bearer ", "");
}

async function getUser(token: string, db: ReturnType<typeof makeQueryClient>) {
  // Static API key — avoids needing a Supabase JWT from the browser
  if (process.env.MCP_API_KEY && token === process.env.MCP_API_KEY) {
    const id = process.env.TASK_REMINDER_USER_ID;
    if (!id) return null;
    return { id };
  }
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// ── Error helpers ───────────────────────────────────────────────────────────

const UNAUTH = {
  content: [{ type: "text" as const, text: JSON.stringify({ error: "Unauthorized" }) }],
  isError: true,
};

function toolErr(name: string, e: unknown) {
  const msg = e instanceof Error ? e.message : typeof e === "object" ? JSON.stringify(e) : String(e);
  console.error(`[mcp:${name}]`, e);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
    isError: true,
  };
}

// ── Server factory ──────────────────────────────────────────────────────────

function makeServer(token: string | null): McpServer {
  const supabase = makeQueryClient(token);
  const server = new McpServer({ name: "icodeforbananas", version: "1.0.0" });

  // ── Wordsmith ────────────────────────────────────────────────────────────

  server.tool(
    "list_notes",
    "List all notes for the authenticated user, sorted by most recently updated.",
    {},
    async () => {
      if (!token) return UNAUTH;
      const user = await getUser(token, supabase);
      if (!user) return UNAUTH;
      try {
        const { data, error } = await supabase
          .from("notes")
          .select("id, title, updated_at")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false });
        if (error) throw error;
        return { content: [{ type: "text" as const, text: JSON.stringify(data ?? []) }] };
      } catch (e) { return toolErr("list_notes", e); }
    }
  );

  server.tool(
    "get_note",
    "Get the full content of a single note by ID.",
    { id: z.string().uuid() },
    async ({ id }) => {
      if (!token) return UNAUTH;
      const user = await getUser(token, supabase);
      if (!user) return UNAUTH;
      try {
        const { data, error } = await supabase
          .from("notes")
          .select("id, title, content, prompt, created_at, updated_at")
          .eq("id", id)
          .eq("user_id", user.id)
          .single();
        if (error) throw error;
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (e) { return toolErr("get_note", e); }
    }
  );

  server.tool(
    "create_note",
    "Create a new note with a title and optional content.",
    {
      title: z.string().min(1).max(255),
      content: z.string().optional().default(""),
      prompt: z.string().optional(),
    },
    async ({ title, content, prompt }) => {
      if (!token) return UNAUTH;
      const user = await getUser(token, supabase);
      if (!user) return UNAUTH;
      try {
        const { data, error } = await supabase
          .from("notes")
          .insert({ user_id: user.id, title, content, prompt })
          .select("id, title, created_at")
          .single();
        if (error) throw error;
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (e) { return toolErr("create_note", e); }
    }
  );

  server.tool(
    "update_note",
    "Update the title and/or content of an existing note.",
    {
      id: z.string().uuid(),
      title: z.string().min(1).max(255).optional(),
      content: z.string().optional(),
      prompt: z.string().optional(),
    },
    async ({ id, title, content, prompt }) => {
      if (!token) return UNAUTH;
      const user = await getUser(token, supabase);
      if (!user) return UNAUTH;
      if (title === undefined && content === undefined && prompt === undefined) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "At least one of title, content, or prompt must be provided" }) }],
          isError: true,
        };
      }
      try {
        const fields: Record<string, unknown> = {};
        if (title !== undefined) fields.title = title;
        if (content !== undefined) fields.content = content;
        if (prompt !== undefined) fields.prompt = prompt;
        const { data, error } = await supabase
          .from("notes")
          .update({ ...fields, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", user.id)
          .select("id, title, updated_at")
          .single();
        if (error) throw error;
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (e) { return toolErr("update_note", e); }
    }
  );

  server.tool(
    "delete_note",
    "Permanently delete a note by ID.",
    { id: z.string().uuid() },
    async ({ id }) => {
      if (!token) return UNAUTH;
      const user = await getUser(token, supabase);
      if (!user) return UNAUTH;
      try {
        const { error } = await supabase
          .from("notes")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);
        if (error) throw error;
        return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, id }) }] };
      } catch (e) { return toolErr("delete_note", e); }
    }
  );

  server.tool(
    "search_notes",
    "Search notes by keyword across title and content.",
    { query: z.string().min(1) },
    async ({ query }) => {
      if (!token) return UNAUTH;
      const user = await getUser(token, supabase);
      if (!user) return UNAUTH;
      try {
        const { data, error } = await supabase
          .from("notes")
          .select("id, title, content, updated_at")
          .eq("user_id", user.id)
          .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
          .order("updated_at", { ascending: false })
          .limit(10);
        if (error) throw error;
        const results = (data ?? []).map(note => ({
          id: note.id,
          title: note.title,
          updated_at: note.updated_at,
          snippet: (note.content as string).slice(0, 200),
        }));
        return { content: [{ type: "text" as const, text: JSON.stringify(results) }] };
      } catch (e) { return toolErr("search_notes", e); }
    }
  );

  // ── Task Board ───────────────────────────────────────────────────────────

  server.tool(
    "list_tasks",
    "List all tasks for the authenticated user, optionally filtered by board column.",
    { column: z.enum(["backlog", "in-progress", "done"]).optional() },
    async ({ column }) => {
      if (!token) return UNAUTH;
      const user = await getUser(token, supabase);
      if (!user) return UNAUTH;
      try {
        let q = supabase
          .from("tasks")
          .select("id, title, body, board_column, sort_order, created_at, updated_at")
          .eq("user_id", user.id)
          .order("board_column")
          .order("sort_order");
        if (column) q = q.eq("board_column", column);
        const { data, error } = await q;
        if (error) throw error;
        return { content: [{ type: "text" as const, text: JSON.stringify(data ?? []) }] };
      } catch (e) { return toolErr("list_tasks", e); }
    }
  );

  server.tool(
    "create_task",
    "Create a new task in the specified board column.",
    {
      title: z.string().min(1),
      body: z.string().optional().default(""),
      board_column: z.enum(["backlog", "in-progress", "done"]).default("backlog"),
    },
    async ({ title, body, board_column }) => {
      if (!token) return UNAUTH;
      const user = await getUser(token, supabase);
      if (!user) return UNAUTH;
      try {
        const { data, error } = await supabase
          .from("tasks")
          .insert({ user_id: user.id, title, body, board_column, sort_order: 0 })
          .select("id, title, board_column, created_at")
          .single();
        if (error) throw error;
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (e) { return toolErr("create_task", e); }
    }
  );

  server.tool(
    "update_task",
    "Update a task's title or body.",
    {
      id: z.string().uuid(),
      title: z.string().min(1).optional(),
      body: z.string().optional(),
    },
    async ({ id, title, body }) => {
      if (!token) return UNAUTH;
      const user = await getUser(token, supabase);
      if (!user) return UNAUTH;
      try {
        const fields: Record<string, unknown> = {};
        if (title !== undefined) fields.title = title;
        if (body !== undefined) fields.body = body;
        const { data, error } = await supabase
          .from("tasks")
          .update({ ...fields, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", user.id)
          .select("id, title, updated_at")
          .single();
        if (error) throw error;
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (e) { return toolErr("update_task", e); }
    }
  );

  server.tool(
    "move_task",
    "Move a task to a different board column (backlog, in-progress, or done).",
    {
      id: z.string().uuid(),
      board_column: z.enum(["backlog", "in-progress", "done"]),
    },
    async ({ id, board_column }) => {
      if (!token) return UNAUTH;
      const user = await getUser(token, supabase);
      if (!user) return UNAUTH;
      try {
        const { data, error } = await supabase
          .from("tasks")
          .update({ board_column, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", user.id)
          .select("id, board_column, updated_at")
          .single();
        if (error) throw error;
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (e) { return toolErr("move_task", e); }
    }
  );

  server.tool(
    "delete_task",
    "Permanently delete a task.",
    { id: z.string().uuid() },
    async ({ id }) => {
      if (!token) return UNAUTH;
      const user = await getUser(token, supabase);
      if (!user) return UNAUTH;
      try {
        const { error } = await supabase
          .from("tasks")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);
        if (error) throw error;
        return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, id }) }] };
      } catch (e) { return toolErr("delete_task", e); }
    }
  );

  // ── Trading ──────────────────────────────────────────────────────────────

  server.tool(
    "list_strategies",
    "List all deployed trading strategies for the authenticated user.",
    { status: z.enum(["active", "paused", "stopped"]).optional() },
    async ({ status }) => {
      if (!token) return UNAUTH;
      const user = await getUser(token, supabase);
      if (!user) return UNAUTH;
      try {
        let q = supabase
          .from("trading_lambdas")
          .select("id, name, strategy_id, strategy_name, symbol, status, timeframe, position_size, initial_capital, is_sandbox, last_run_at, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        if (status) q = q.eq("status", status);
        const { data, error } = await q;
        if (error) throw error;
        return { content: [{ type: "text" as const, text: JSON.stringify(data ?? []) }] };
      } catch (e) { return toolErr("list_strategies", e); }
    }
  );

  server.tool(
    "get_strategy",
    "Get full details and recent trade history for a single strategy.",
    { id: z.string().uuid() },
    async ({ id }) => {
      if (!token) return UNAUTH;
      const user = await getUser(token, supabase);
      if (!user) return UNAUTH;
      try {
        const [{ data: strategy, error: stratErr }, { data: trades, error: tradesErr }] = await Promise.all([
          supabase.from("trading_lambdas").select("*").eq("id", id).eq("user_id", user.id).single(),
          supabase.from("lambda_trades").select("*").eq("lambda_id", id).order("entry_time", { ascending: false }).limit(20),
        ]);
        if (stratErr) throw stratErr;
        if (tradesErr) throw tradesErr;
        return { content: [{ type: "text" as const, text: JSON.stringify({ strategy, trades: trades ?? [] }) }] };
      } catch (e) { return toolErr("get_strategy", e); }
    }
  );

  server.tool(
    "deploy_strategy",
    "Deploy a new trading strategy (creates a new lambda instance).",
    {
      name: z.string().optional(),
      strategy_id: z.string(),
      strategy_name: z.string(),
      symbol: z.string(),
      params: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])).optional(),
      position_size: z.number().int().positive().optional().default(100),
      initial_capital: z.number().positive().optional().default(10000),
      is_sandbox: z.boolean().optional().default(true),
      timeframe: z.enum(["daily", "weekly", "monthly"]).optional().default("daily"),
    },
    async (args) => {
      if (!token) return UNAUTH;
      try {
        const res = await fetch(`${baseUrl}/api/trading/lambdas`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ...args, symbol: (args.symbol as string).toUpperCase() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Deploy failed");
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (e) { return toolErr("deploy_strategy", e); }
    }
  );

  server.tool(
    "execute_strategy",
    "Manually trigger a strategy to run now (checks market conditions and places a trade if signal fires).",
    { id: z.string().uuid() },
    async ({ id }) => {
      if (!token) return UNAUTH;
      try {
        const res = await fetch(`${baseUrl}/api/trading/execute?id=${id}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Execution failed");
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (e) { return toolErr("execute_strategy", e); }
    }
  );

  server.tool(
    "pause_strategy",
    "Pause or resume a deployed strategy.",
    {
      id: z.string().uuid(),
      status: z.enum(["active", "paused"]),
    },
    async ({ id, status }) => {
      if (!token) return UNAUTH;
      const user = await getUser(token, supabase);
      if (!user) return UNAUTH;
      try {
        const { data, error } = await supabase
          .from("trading_lambdas")
          .update({ status, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", user.id)
          .select("id, status, updated_at")
          .single();
        if (error) throw error;
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (e) { return toolErr("pause_strategy", e); }
    }
  );

  server.tool(
    "delete_strategy",
    "Permanently delete a strategy and all its trade history.",
    { id: z.string().uuid() },
    async ({ id }) => {
      if (!token) return UNAUTH;
      const user = await getUser(token, supabase);
      if (!user) return UNAUTH;
      try {
        const { error } = await supabase
          .from("trading_lambdas")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);
        if (error) throw error;
        return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, id }) }] };
      } catch (e) { return toolErr("delete_strategy", e); }
    }
  );

  server.tool(
    "get_trades",
    "Get trade history, optionally filtered by strategy ID.",
    {
      lambda_id: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(100).optional().default(50),
    },
    async ({ lambda_id, limit = 50 }) => {
      if (!token) return UNAUTH;
      const user = await getUser(token, supabase);
      if (!user) return UNAUTH;
      try {
        // Two-query approach: fetch user's lambda IDs first, then filter trades
        const { data: lambdas, error: lambdaErr } = await supabase
          .from("trading_lambdas")
          .select("id")
          .eq("user_id", user.id);
        if (lambdaErr) throw lambdaErr;
        const lambdaIds = (lambdas ?? []).map((l: { id: string }) => l.id);
        if (lambdaIds.length === 0) {
          return { content: [{ type: "text" as const, text: JSON.stringify([]) }] };
        }
        let q = supabase
          .from("lambda_trades")
          .select("*")
          .in("lambda_id", lambdaIds)
          .order("entry_time", { ascending: false })
          .limit(limit);
        if (lambda_id) q = q.eq("lambda_id", lambda_id);
        const { data, error } = await q;
        if (error) throw error;
        return { content: [{ type: "text" as const, text: JSON.stringify(data ?? []) }] };
      } catch (e) { return toolErr("get_trades", e); }
    }
  );

  server.tool(
    "get_leaderboard",
    "Get the public trading leaderboard with aggregated stats for all strategies.",
    {},
    async () => {
      try {
        const res = await fetch(`${baseUrl}/api/trading/leaderboard`);
        const data = await res.json();
        if (!res.ok) throw new Error("Leaderboard fetch failed");
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (e) { return toolErr("get_leaderboard", e); }
    }
  );

  // ── Space Math ───────────────────────────────────────────────────────────

  server.tool(
    "get_space_math_progress",
    "Get Space Math skill mastery summary for a player, aggregated by skill category and stage. Default player is 'cai'.",
    { player_name: z.string().optional().default("cai") },
    async ({ player_name = "cai" }) => {
      try {
        const { data, error } = await supabase
          .from("space_math_progress")
          .select("*")
          .eq("player_name", player_name)
          .order("played_at", { ascending: false });
        if (error) throw error;

        type ProgressRow = {
          session_id: string;
          played_at: string;
          skill_category: string;
          mastered: boolean;
          correct: number;
          total: number;
        };
        const rows: ProgressRow[] = data ?? [];
        const sessionSet = new Set<string>();
        const byCategory: Record<string, {
          category: string;
          stages_attempted: number;
          stages_mastered: number;
          total_correct: number;
          total_questions: number;
          accuracy: number;
        }> = {};

        for (const row of rows) {
          sessionSet.add(row.session_id);
          if (!byCategory[row.skill_category]) {
            byCategory[row.skill_category] = {
              category: row.skill_category,
              stages_attempted: 0,
              stages_mastered: 0,
              total_correct: 0,
              total_questions: 0,
              accuracy: 0,
            };
          }
          const cat = byCategory[row.skill_category];
          cat.stages_attempted++;
          if (row.mastered) cat.stages_mastered++;
          cat.total_correct += row.correct;
          cat.total_questions += row.total;
        }

        for (const cat of Object.values(byCategory)) {
          cat.accuracy = cat.total_questions > 0 ? (cat.total_correct / cat.total_questions) * 100 : 0;
        }

        const allStages = Object.values(byCategory).reduce((s, c) => s + c.stages_attempted, 0);
        const masteredStages = Object.values(byCategory).reduce((s, c) => s + c.stages_mastered, 0);
        const overall_mastery_rate = allStages > 0 ? (masteredStages / allStages) * 100 : 0;

        const sessionMap = new Map<string, { session_id: string; played_at: string; stages_played: number }>();
        for (const row of rows) {
          if (!sessionMap.has(row.session_id)) {
            sessionMap.set(row.session_id, { session_id: row.session_id, played_at: row.played_at, stages_played: 0 });
          }
          sessionMap.get(row.session_id)!.stages_played++;
        }
        const recent_sessions = Array.from(sessionMap.values())
          .sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime())
          .slice(0, 5);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ player_name, total_sessions: sessionSet.size, overall_mastery_rate, by_category: byCategory, recent_sessions }),
          }],
        };
      } catch (e) { return toolErr("get_space_math_progress", e); }
    }
  );

  server.tool(
    "get_space_math_sessions",
    "Get recent Space Math play sessions for a player with per-stage results.",
    {
      player_name: z.string().optional().default("cai"),
      limit: z.number().int().min(1).max(20).optional().default(5),
    },
    async ({ player_name = "cai", limit = 5 }) => {
      try {
        const { data: sessionData, error: sessErr } = await supabase
          .from("space_math_progress")
          .select("session_id, played_at")
          .eq("player_name", player_name)
          .order("played_at", { ascending: false });
        if (sessErr) throw sessErr;

        const uniqueSessions: Array<{ session_id: string; played_at: string }> = [];
        const seen = new Set<string>();
        for (const row of sessionData ?? []) {
          if (!seen.has(row.session_id)) {
            seen.add(row.session_id);
            uniqueSessions.push(row);
            if (uniqueSessions.length >= limit) break;
          }
        }

        if (uniqueSessions.length === 0) {
          return { content: [{ type: "text" as const, text: JSON.stringify([]) }] };
        }

        const sessionIds = uniqueSessions.map(s => s.session_id);
        const { data: rows, error: rowsErr } = await supabase
          .from("space_math_progress")
          .select("*")
          .in("session_id", sessionIds);
        if (rowsErr) throw rowsErr;

        type StageRow = {
          session_id: string;
          stage_id: string;
          stage_label: string;
          skill_category: string;
          correct: number;
          total: number;
          mastered: boolean;
        };
        const result = uniqueSessions.map(s => ({
          session_id: s.session_id,
          played_at: s.played_at,
          stages: (rows as StageRow[] ?? [])
            .filter(r => r.session_id === s.session_id)
            .map(r => ({
              stage_id: r.stage_id,
              stage_label: r.stage_label,
              skill_category: r.skill_category,
              correct: r.correct,
              total: r.total,
              mastered: r.mastered,
            })),
        }));

        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (e) { return toolErr("get_space_math_sessions", e); }
    }
  );

  // ── Lead Sheets ──────────────────────────────────────────────────────────

  server.tool(
    "list_lead_sheets",
    "List all lead sheets for the authenticated user.",
    {},
    async () => {
      if (!token) return UNAUTH;
      const user = await getUser(token, supabase);
      if (!user) return UNAUTH;
      try {
        const { data, error } = await supabase
          .from("lead_sheets")
          .select("id, title, key, tempo, updated_at")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false });
        if (error) throw error;
        return { content: [{ type: "text" as const, text: JSON.stringify(data ?? []) }] };
      } catch (e) { return toolErr("list_lead_sheets", e); }
    }
  );

  server.tool(
    "get_lead_sheet",
    "Get the full lead sheet including all sections.",
    { id: z.string().uuid() },
    async ({ id }) => {
      if (!token) return UNAUTH;
      const user = await getUser(token, supabase);
      if (!user) return UNAUTH;
      try {
        const { data, error } = await supabase
          .from("lead_sheets")
          .select("*")
          .eq("id", id)
          .eq("user_id", user.id)
          .single();
        if (error) throw error;
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (e) { return toolErr("get_lead_sheet", e); }
    }
  );

  server.tool(
    "create_lead_sheet",
    "Create a new lead sheet.",
    {
      title: z.string().min(1).default("Untitled"),
      key: z.string().optional().default(""),
      tempo: z.number().int().positive().optional(),
      general_notes: z.string().optional().default(""),
      sections: z.array(z.any()).optional().default([]),
    },
    async ({ title, key, tempo, general_notes, sections }) => {
      if (!token) return UNAUTH;
      const user = await getUser(token, supabase);
      if (!user) return UNAUTH;
      try {
        const { data, error } = await supabase
          .from("lead_sheets")
          .insert({ user_id: user.id, title, key, tempo, general_notes, sections })
          .select("id, title, created_at")
          .single();
        if (error) throw error;
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (e) { return toolErr("create_lead_sheet", e); }
    }
  );

  server.tool(
    "update_lead_sheet",
    "Update a lead sheet's metadata or sections.",
    {
      id: z.string().uuid(),
      title: z.string().min(1).optional(),
      key: z.string().optional(),
      tempo: z.number().int().positive().optional(),
      general_notes: z.string().optional(),
      sections: z.array(z.any()).optional(),
    },
    async ({ id, title, key, tempo, general_notes, sections }) => {
      if (!token) return UNAUTH;
      const user = await getUser(token, supabase);
      if (!user) return UNAUTH;
      try {
        const fields: Record<string, unknown> = {};
        if (title !== undefined) fields.title = title;
        if (key !== undefined) fields.key = key;
        if (tempo !== undefined) fields.tempo = tempo;
        if (general_notes !== undefined) fields.general_notes = general_notes;
        if (sections !== undefined) fields.sections = sections;
        const { data, error } = await supabase
          .from("lead_sheets")
          .update({ ...fields, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", user.id)
          .select("id, title, updated_at")
          .single();
        if (error) throw error;
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (e) { return toolErr("update_lead_sheet", e); }
    }
  );

  server.tool(
    "delete_lead_sheet",
    "Permanently delete a lead sheet.",
    { id: z.string().uuid() },
    async ({ id }) => {
      if (!token) return UNAUTH;
      const user = await getUser(token, supabase);
      if (!user) return UNAUTH;
      try {
        const { error } = await supabase
          .from("lead_sheets")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);
        if (error) throw error;
        return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, id }) }] };
      } catch (e) { return toolErr("delete_lead_sheet", e); }
    }
  );

  return server;
}

// ── Route handlers ──────────────────────────────────────────────────────────

async function handleMcpRequest(request: Request): Promise<Response> {
  const token = extractToken(request);
  if (!token) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "www.icodeforbananas.com";
    const resourceMetadata = `${proto}://${host}/.well-known/oauth-protected-resource`;
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadata}", scope="mcp"`,
        "Content-Type": "application/json",
      },
    });
  }
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = makeServer(token);
  await server.connect(transport);
  return transport.handleRequest(request);
}

export const GET = handleMcpRequest;
export const POST = handleMcpRequest;
