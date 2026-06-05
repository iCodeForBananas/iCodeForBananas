# iCodeForBananas

Personal dashboard built with Next.js 16, React 19, TypeScript, Supabase, and Vercel.

## Features

- **Wordsmith** — AI-powered writing assistant with note management
- **Task Board** — Kanban board (backlog / in-progress / done)
- **Algorithmic Trading** — Deploy and monitor trading strategies via Tradier
- **Space Math** — Cai's math practice progress dashboard
- **Lead Sheets** — Jazz lead sheet editor

## MCP Server

The app exposes a remote MCP (Model Context Protocol) server at `/api/mcp`, allowing Claude.ai to read and write your data as a custom connector.

### Tools (26 total)

| # | Tool | Feature | Auth |
|---|------|---------|------|
| 1 | `list_notes` | Wordsmith | required |
| 2 | `get_note` | Wordsmith | required |
| 3 | `create_note` | Wordsmith | required |
| 4 | `update_note` | Wordsmith | required |
| 5 | `delete_note` | Wordsmith | required |
| 6 | `search_notes` | Wordsmith | required |
| 7 | `list_tasks` | Task Board | required |
| 8 | `create_task` | Task Board | required |
| 9 | `update_task` | Task Board | required |
| 10 | `move_task` | Task Board | required |
| 11 | `delete_task` | Task Board | required |
| 12 | `list_strategies` | Trading | required |
| 13 | `get_strategy` | Trading | required |
| 14 | `deploy_strategy` | Trading | required |
| 15 | `execute_strategy` | Trading | required |
| 16 | `pause_strategy` | Trading | required |
| 17 | `delete_strategy` | Trading | required |
| 18 | `get_trades` | Trading | required |
| 19 | `get_leaderboard` | Trading | public |
| 20 | `get_space_math_progress` | Space Math | public |
| 21 | `get_space_math_sessions` | Space Math | public |
| 22 | `list_lead_sheets` | Lead Sheets | required |
| 23 | `get_lead_sheet` | Lead Sheets | required |
| 24 | `create_lead_sheet` | Lead Sheets | required |
| 25 | `update_lead_sheet` | Lead Sheets | required |
| 26 | `delete_lead_sheet` | Lead Sheets | required |

### Deployment

**1. Add Vercel environment variables**

In the Vercel dashboard for this project, add:

```
NEXT_PUBLIC_APP_URL=https://icodeforbananas.com
MCP_API_KEY=<random-secret>          # bearer token issued to Claude.ai
MCP_OAUTH_CLIENT_ID=<random-string>  # shown to Claude.ai in the connector dialog
MCP_OAUTH_CLIENT_SECRET=<random-secret>
```

Generate values with: `openssl rand -hex 32`

**2. Run the Supabase migration**

```bash
supabase db push
# or apply manually: supabase/migrations/20260528_create_notes.sql
```

This creates the `notes` table used by the Wordsmith MCP tools.

**3. Deploy**

Push to `main` — Vercel deploys automatically. Confirm the route is live:

```
https://icodeforbananas.com/api/mcp
```

### Connecting in Claude.ai

Claude.ai uses OAuth 2.0 for MCP connectors. The app implements a minimal OAuth server at `/api/oauth/`.

1. Go to **Settings → Connectors → Add custom connector**
2. Enter URL: `https://icodeforbananas.com/api/mcp`
3. Open **Advanced settings**
4. Enter `MCP_OAUTH_CLIENT_ID` as the **OAuth Client ID**
5. Enter `MCP_OAUTH_CLIENT_SECRET` as the **OAuth Client Secret**
6. Click **Add** — Claude.ai will redirect you to the app's authorization page
7. Click **Authorize** on the approval page
8. You're connected

OAuth flow summary: Claude.ai discovers endpoints via `/.well-known/oauth-authorization-server`, prompts you to authorize, then exchanges the code for your `MCP_API_KEY` as the long-lived bearer token.

### Smoke tests

Run these prompts in Claude.ai after connecting:

**Wordsmith**
- "List all my notes"
- "Create a note called 'MCP Test' with content 'Hello from Claude'"
- "Search my notes for [keyword]"
- "Delete the MCP Test note"

**Task Board**
- "List all my tasks"
- "Create a task called 'Test task' in backlog"
- "Move the 'Test task' to in-progress"
- "Delete the 'Test task'"

**Trading**
- "List my trading strategies"
- "Show me my recent trades"
- "Show me the trading leaderboard"

**Space Math**
- "How is Cai doing in Space Math?"

**Lead Sheets**
- "List my lead sheets"
- "Create a lead sheet called 'Autumn Leaves' in the key of F"

**Error handling**
- Fetch a note with a fake UUID → should return a clean error, not 500
- Try a protected tool without auth → should return 401

## Tech Stack

- **Framework**: Next.js 16.1.1, React 19, TypeScript 5.9, App Router
- **Backend**: Supabase (`@supabase/supabase-js`, `@supabase/ssr`)
- **AI**: Google Gemini (`@google/genai`)
- **MCP**: `@modelcontextprotocol/sdk`
- **Deployment**: Vercel
