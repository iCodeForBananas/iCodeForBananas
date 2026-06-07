-- DRM: Dating Relationship Management schema

create table if not exists drm_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  avatar text,
  stage text not null default 'Matched',
  status_note text,
  last_contact date,
  next_action text,
  profile_notes text,
  reflection_notes text,
  stage_entered_at date default current_date,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table drm_people enable row level security;

create policy "drm_people: users manage own rows" on drm_people
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists drm_dates (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references drm_people(id) on delete cascade not null,
  date date not null,
  location text,
  notes text,
  rating integer check (rating between 1 and 5),
  created_at timestamp with time zone default now()
);

alter table drm_dates enable row level security;

create policy "drm_dates: users manage own rows" on drm_dates
  for all
  using (exists (select 1 from drm_people where id = drm_dates.person_id and user_id = auth.uid()))
  with check (exists (select 1 from drm_people where id = drm_dates.person_id and user_id = auth.uid()));

create table if not exists drm_green_flags (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references drm_people(id) on delete cascade not null,
  label text not null,
  checked boolean default false
);

alter table drm_green_flags enable row level security;

create policy "drm_green_flags: users manage own rows" on drm_green_flags
  for all
  using (exists (select 1 from drm_people where id = drm_green_flags.person_id and user_id = auth.uid()))
  with check (exists (select 1 from drm_people where id = drm_green_flags.person_id and user_id = auth.uid()));

create table if not exists drm_red_flags (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references drm_people(id) on delete cascade not null,
  label text not null,
  checked boolean default false
);

alter table drm_red_flags enable row level security;

create policy "drm_red_flags: users manage own rows" on drm_red_flags
  for all
  using (exists (select 1 from drm_people where id = drm_red_flags.person_id and user_id = auth.uid()))
  with check (exists (select 1 from drm_people where id = drm_red_flags.person_id and user_id = auth.uid()));
