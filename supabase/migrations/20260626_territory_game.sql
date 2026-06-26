-- territory game schema
-- grid: 50×50 square tiles (2 500 tiles total)
-- cooldown: 15 seconds between attacks (see v_cooldown constant in attack_tile)
-- capture rule: attacking an adjacent unclaimed or enemy tile always succeeds
-- adjancency: 4-directional (up / down / left / right — no diagonals)

-- ─── Player profiles ────────────────────────────────────────────────────────
create table if not exists public.game_players (
  id             uuid        primary key references auth.users(id) on delete cascade,
  color_hue      smallint    not null default 0,   -- 0-359 HSL hue, derived from uid
  last_action_at timestamptz,
  created_at     timestamptz not null default now()
);

alter table public.game_players enable row level security;

create policy "game_players_select_all"
  on public.game_players for select using (true);

-- ─── Tile grid ──────────────────────────────────────────────────────────────
create table if not exists public.game_tiles (
  x          smallint    not null,
  y          smallint    not null,
  owner_id   uuid        references public.game_players(id) on delete set null,
  claimed_at timestamptz,
  primary key (x, y)
);

alter table public.game_tiles enable row level security;

create policy "game_tiles_select_all"
  on public.game_tiles for select using (true);

-- fast adjacency lookup inside the attack RPC
create index if not exists idx_game_tiles_owner
  on public.game_tiles (owner_id) where owner_id is not null;

-- pre-populate the full 50×50 grid with unclaimed tiles
insert into public.game_tiles (x, y)
select x::smallint, y::smallint
from generate_series(0, 49) as x
cross join generate_series(0, 49) as y;

-- enable realtime change streaming (client subscribes via postgres_changes)
alter publication supabase_realtime add table public.game_tiles;
alter publication supabase_realtime add table public.game_players;

-- ─── RPC: join_territory_game ───────────────────────────────────────────────
-- Claims a random unclaimed tile for the calling user.
-- Safe to call again after elimination — re-grants a fresh starting tile.
create or replace function public.join_territory_game()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid     := auth.uid();
  v_hue  smallint;
  v_x    smallint;
  v_y    smallint;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  -- deterministic hue: replicates playerHue() in the frontend
  v_hue := ((hashtext(v_uid::text) % 360) + 360) % 360;

  insert into public.game_players (id, color_hue)
  values (v_uid, v_hue)
  on conflict (id) do nothing;

  -- already has tiles → already in game
  if exists (select 1 from public.game_tiles where owner_id = v_uid limit 1) then
    return jsonb_build_object('ok', true, 'already_in_game', true);
  end if;

  -- pick a random unclaimed tile
  select x, y into v_x, v_y
  from public.game_tiles
  where owner_id is null
  order by random()
  limit 1;

  if v_x is null then
    return jsonb_build_object('ok', false, 'error', 'no_unclaimed_tiles');
  end if;

  update public.game_tiles
  set owner_id = v_uid, claimed_at = now()
  where x = v_x and y = v_y;

  return jsonb_build_object('ok', true, 'start_x', v_x, 'start_y', v_y);
end;
$$;

-- ─── RPC: attack_tile ───────────────────────────────────────────────────────
-- Atomically validates and executes a territory capture.
-- Enforces: authentication · bounds · cooldown · adjacency · not-own-tile.
-- Capture rule: always succeeds (no strength system in v1).
create or replace function public.attack_tile(target_x smallint, target_y smallint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid    := auth.uid();
  v_cooldown     constant integer := 15;   -- seconds; tune this constant to adjust pacing
  v_grid         constant integer := 50;   -- must match GRID_SIZE in the frontend
  v_last_action  timestamptz;
  v_secs         numeric;
  v_target_owner uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if target_x < 0 or target_x >= v_grid or target_y < 0 or target_y >= v_grid then
    return jsonb_build_object('ok', false, 'error', 'out_of_bounds');
  end if;

  if not exists (select 1 from public.game_players where id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_in_game');
  end if;

  -- cooldown check
  select last_action_at into v_last_action
  from public.game_players where id = v_uid;

  if v_last_action is not null then
    v_secs := extract(epoch from (now() - v_last_action));
    if v_secs < v_cooldown then
      return jsonb_build_object(
        'ok', false,
        'error', 'cooldown',
        'retry_in', (v_cooldown - v_secs)
      );
    end if;
  end if;

  -- adjacency check: player must own an orthogonal neighbour of the target
  if not exists (
    select 1 from public.game_tiles
    where owner_id = v_uid
      and ((x = target_x - 1 and y = target_y)
        or (x = target_x + 1 and y = target_y)
        or (x = target_x     and y = target_y - 1)
        or (x = target_x     and y = target_y + 1))
  ) then
    if not exists (select 1 from public.game_tiles where owner_id = v_uid limit 1) then
      return jsonb_build_object('ok', false, 'error', 'eliminated');
    end if;
    return jsonb_build_object('ok', false, 'error', 'not_adjacent');
  end if;

  select owner_id into v_target_owner
  from public.game_tiles where x = target_x and y = target_y;

  if v_target_owner = v_uid then
    return jsonb_build_object('ok', false, 'error', 'own_tile');
  end if;

  -- capture (always succeeds — v1 rule)
  update public.game_tiles
  set owner_id = v_uid, claimed_at = now()
  where x = target_x and y = target_y;

  update public.game_players
  set last_action_at = now()
  where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.join_territory_game()               to authenticated;
grant execute on function public.attack_tile(smallint, smallint)     to authenticated;
