create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled',
  content text not null default '',
  prompt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_notes_user_id on notes(user_id);
create index idx_notes_updated_at on notes(user_id, updated_at desc);

alter table notes enable row level security;

create policy "Users can manage their own notes" on notes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
