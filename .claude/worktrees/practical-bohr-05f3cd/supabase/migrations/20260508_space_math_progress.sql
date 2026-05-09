-- Space Math progress tracking for Cai
create table if not exists space_math_progress (
  id uuid primary key default gen_random_uuid(),
  player_name text not null default 'cai',
  session_id uuid not null,            -- groups all stage results from one play session
  stage_id integer not null,           -- 1-9 matching STAGES array
  stage_label text not null,           -- "Add to 5", "Place Value", etc.
  skill_category text not null,        -- number_sense | addition_subtraction | place_value | measurement | geometry
  correct integer not null default 0,
  total integer not null default 0,
  mastered boolean not null default false,
  played_at timestamptz not null default now()
);

-- Index for fast per-player lookups
create index if not exists idx_smp_player on space_math_progress(player_name);
create index if not exists idx_smp_session on space_math_progress(session_id);
create index if not exists idx_smp_stage on space_math_progress(player_name, stage_id);

-- RLS
alter table space_math_progress enable row level security;

-- Public read (parent dashboard is public)
create policy "Public can read space math progress"
  on space_math_progress for select using (true);

-- Service role / anon can insert (no auth on the game)
create policy "Anyone can insert space math progress"
  on space_math_progress for insert with check (true);
