-- DRM: replace green flags with three-pillar evidence tracking system

create table if not exists drm_pillars (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references drm_people(id) on delete cascade not null,
  key text not null check (key in ('directed_curiosity','reciprocal_investment','emotional_range')),
  rating text check (rating in ('strong','emerging','weak','absent')),
  created_at timestamptz default now(),
  unique(person_id, key)
);

alter table drm_pillars enable row level security;

create policy "drm_pillars: users manage own rows" on drm_pillars
  for all
  using (exists (select 1 from drm_people where id = drm_pillars.person_id and user_id = auth.uid()))
  with check (exists (select 1 from drm_people where id = drm_pillars.person_id and user_id = auth.uid()));

create table if not exists drm_pillar_entries (
  id uuid primary key default gen_random_uuid(),
  pillar_id uuid references drm_pillars(id) on delete cascade not null,
  text text not null,
  polarity text not null check (polarity in ('positive','negative')),
  created_at timestamptz default now()
);

alter table drm_pillar_entries enable row level security;

create policy "drm_pillar_entries: users manage own rows" on drm_pillar_entries
  for all
  using (exists (
    select 1 from drm_pillars p
    join drm_people pe on pe.id = p.person_id
    where p.id = drm_pillar_entries.pillar_id and pe.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from drm_pillars p
    join drm_people pe on pe.id = p.person_id
    where p.id = drm_pillar_entries.pillar_id and pe.user_id = auth.uid()
  ));

drop table if exists drm_green_flags;
