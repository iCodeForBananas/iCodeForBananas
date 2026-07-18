import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Returns two clients: authClient (clean, for token verification) and dbClient (JWT-forwarded, for queries).
// Keeping them separate prevents the global Authorization header from interfering with auth.getUser().
function makeClients(jwt: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL not configured");
  if (serviceKey) {
    const client = createClient(url, serviceKey);
    return { authClient: client, dbClient: client };
  }
  if (!anonKey) throw new Error("Supabase key not configured");
  const authClient = createClient(url, anonKey);
  const isJwt = jwt != null && jwt.split(".").length === 3;
  const dbClient = isJwt
    ? createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } })
    : authClient;
  return { authClient, dbClient };
}

// ── Auth helpers ────────────────────────────────────────────────────────────

function extractToken(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  return auth.replace("Bearer ", "");
}

// ── Error helpers ───────────────────────────────────────────────────────────

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
  const { dbClient: supabase } = makeClients(token);
  const server = new McpServer({ name: "icodeforbananas", version: "1.0.0" });

  // ── Seattle Events ───────────────────────────────────────────────────────

  server.tool(
    "get_seattle_events",
    "List upcoming Seattle events, ordered by start time. Optionally filter to a single day.",
    {
      date: z.string().optional().describe("Filter to events on this date (YYYY-MM-DD). Omit for all upcoming events."),
      limit: z.number().int().min(1).max(200).optional().default(50),
    },
    async ({ date, limit = 50 }) => {
      try {
        let q = supabase
          .from("seattle_events")
          .select("name, venue, time, description, link")
          .order("time", { ascending: true })
          .limit(limit);

        if (date) {
          const start = new Date(date);
          if (isNaN(start.getTime())) {
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: "Invalid date" }) }],
              isError: true,
            };
          }
          const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
          q = q.gte("time", start.toISOString()).lt("time", end.toISOString());
        } else {
          q = q.gte("time", new Date().toISOString());
        }

        const { data, error } = await q;
        if (error) throw error;
        return { content: [{ type: "text" as const, text: JSON.stringify(data ?? []) }] };
      } catch (e) { return toolErr("get_seattle_events", e); }
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
