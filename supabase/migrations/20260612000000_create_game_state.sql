-- Multiplayer game server state (players, zombies, open gates).
-- Written/read only by the game server process via the service role
-- key, so it survives EC2 instance/container redeploys.
create table if not exists game_state (
  id text primary key default 'main',
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- RLS enabled with no policies: only the service role (used by the
-- game server) can read/write, since it bypasses RLS entirely.
alter table game_state enable row level security;
