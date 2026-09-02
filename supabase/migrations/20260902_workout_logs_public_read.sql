-- The workout tracker is a public view: anyone can read the log, while inserts,
-- updates and deletes stay owner-only via the existing per-user policies.
drop policy if exists "Users can read their own logs" on workout_logs;
drop policy if exists "Public read" on workout_logs;
create policy "Public read" on workout_logs for select using (true);
