create table if not exists seattle_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  venue text not null,
  time timestamptz not null,
  description text not null default '',
  link text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_seattle_events_time on seattle_events(time);

alter table seattle_events enable row level security;

create policy "Public read" on seattle_events
  for select
  using (true);
