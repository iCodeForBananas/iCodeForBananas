create table if not exists tasks (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  title        text        not null default 'Untitled',
  body         text        not null default '',
  board_column text        not null default 'backlog'
                             check (board_column in ('backlog', 'in-progress', 'done')),
  sort_order   integer     not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_tasks_user_id     on tasks(user_id);
create index idx_tasks_user_column on tasks(user_id, board_column);

alter table tasks enable row level security;

create policy "Users can manage their own tasks"
  on tasks for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
