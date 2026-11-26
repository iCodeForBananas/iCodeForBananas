-- Fix overly-permissive RLS policies

-- trading_lambdas: restrict to per-user ownership (replace auth.uid() is not null)
drop policy if exists "Auth users can read lambdas" on trading_lambdas;
drop policy if exists "Auth users can insert lambdas" on trading_lambdas;

create policy "Users can read their own lambdas"
  on trading_lambdas for select using (auth.uid() = user_id);

create policy "Users can insert their own lambdas"
  on trading_lambdas for insert with check (auth.uid() = user_id);

create policy "Users can delete their own lambdas"
  on trading_lambdas for delete using (auth.uid() = user_id);

-- lambda_trades: restrict reads to owner of the parent lambda
drop policy if exists "Auth users can read trades" on lambda_trades;

create policy "Users can read their own trades"
  on lambda_trades for select using (
    exists (
      select 1 from trading_lambdas
      where trading_lambdas.id = lambda_trades.lambda_id
        and trading_lambdas.user_id = auth.uid()
    )
  );

-- polls: add missing update/delete policies
create policy "Users can update their own polls"
  on polls for update using (auth.uid() = user_id);

create policy "Users can delete their own polls"
  on polls for delete using (auth.uid() = user_id);

-- poll_options: add missing update/delete policies
create policy "Users can update options for their polls"
  on poll_options for update using (
    exists (select 1 from polls where polls.id = poll_id and polls.user_id = auth.uid())
  );

create policy "Users can delete options for their polls"
  on poll_options for delete using (
    exists (select 1 from polls where polls.id = poll_id and polls.user_id = auth.uid())
  );

-- workout_logs: add missing update policy
create policy "Users can update their own logs"
  on workout_logs for update using (auth.uid() = user_id);
