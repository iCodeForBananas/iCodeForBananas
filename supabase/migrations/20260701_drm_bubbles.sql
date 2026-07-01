-- DRM: Bubble/Ecosystem schema (fresh rebuild)

create table if not exists drm_people (
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

create table if not exists drm_evidence (
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

create table if not exists drm_pillars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamp with time zone default now()
);

alter table drm_pillars enable row level security;

create policy "drm_pillars_own" on drm_pillars
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists drm_person_pillars (
  person_id uuid references drm_people(id) on delete cascade not null,
  pillar_id uuid references drm_pillars(id) on delete cascade not null,
  primary key (person_id, pillar_id)
);

alter table drm_person_pillars enable row level security;

create policy "drm_person_pillars_own" on drm_person_pillars
  for all
  using (
    exists (select 1 from drm_people where id = drm_person_pillars.person_id and user_id = auth.uid())
  )
  with check (
    exists (select 1 from drm_people where id = drm_person_pillars.person_id and user_id = auth.uid())
    and exists (select 1 from drm_pillars where id = drm_person_pillars.pillar_id and user_id = auth.uid())
  );
