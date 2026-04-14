create table polls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  question text not null,
  vote_mode text not null default 'approval' check (vote_mode in ('approval', 'single')),
  created_at timestamptz default now()
);

create table poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid references polls(id) on delete cascade not null,
  label text not null,
  sort_order int not null default 0
);

alter table polls enable row level security;
alter table poll_options enable row level security;

create policy "Users can insert their own polls" on polls for insert with check (auth.uid() = user_id);
create policy "Users can read their own polls" on polls for select using (auth.uid() = user_id);

create policy "Users can insert options for their polls" on poll_options for insert with check (
  exists (select 1 from polls where polls.id = poll_id and polls.user_id = auth.uid())
);
create policy "Users can read options for their polls" on poll_options for select using (
  exists (select 1 from polls where polls.id = poll_id and polls.user_id = auth.uid())
);
