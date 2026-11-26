-- DRM: Bubble/Ecosystem schema (fresh rebuild)
-- Drop old drm_* tables if they exist from a previous schema so we start clean.
drop table if exists drm_person_pillars cascade;
drop table if exists drm_evidence cascade;
drop table if exists drm_pillars cascade;
drop table if exists drm_dates cascade;
drop table if exists drm_green_flags cascade;
drop table if exists drm_red_flags cascade;
drop table if exists drm_planned_dates cascade;
drop table if exists drm_people cascade;

create table drm_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  color text not null default '#6366f1',
  pos_x float not null default 0.5,
  pos_y float not null default 0.5,
  created_at timestamp with time zone default now()
);

alter table drm_people enable row level security;

create policy "drm_people_own" on drm_people
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table drm_evidence (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references drm_people(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  content text not null,
  evidence_type text not null check (evidence_type in ('pro', 'con', 'evidence')),
  created_at timestamp with time zone default now()
);

alter table drm_evidence enable row level security;

create policy "drm_evidence_own" on drm_evidence
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table drm_pillars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamp with time zone default now()
);

alter table drm_pillars enable row level security;

create policy "drm_pillars_own" on drm_pillars
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table drm_person_pillars (
  person_id uuid references drm_people(id) on delete cascade not null,
  pillar_id uuid references drm_pillars(id) on delete cascade not null,
  primary key (person_id, pillar_id)
);

alter table drm_person_pillars enable row level security;

-- Use explicit table aliases so column references are unambiguous.
create policy "drm_person_pillars_own" on drm_person_pillars
  for all
  using (
    exists (
      select 1 from drm_people p
      where p.id = drm_person_pillars.person_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from drm_people p
      where p.id = drm_person_pillars.person_id
        and p.user_id = auth.uid()
    )
    and exists (
      select 1 from drm_pillars pl
      where pl.id = drm_person_pillars.pillar_id
        and pl.user_id = auth.uid()
    )
  );
