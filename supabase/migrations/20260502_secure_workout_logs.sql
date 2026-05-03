alter table workout_logs add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table workout_logs enable row level security;

create policy "Users can read their own logs" on workout_logs for select using (auth.uid() = user_id);
create policy "Users can insert their own logs" on workout_logs for insert with check (auth.uid() = user_id);
create policy "Users can delete their own logs" on workout_logs for delete using (auth.uid() = user_id);
