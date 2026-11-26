-- Add scheduling fields and user ownership to trading_lambdas
alter table trading_lambdas
  add column if not exists timeframe text not null default 'daily',
  add column if not exists last_run_at timestamptz,
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Remove open-door insert policy
drop policy if exists "Anyone can insert lambdas" on trading_lambdas;
drop policy if exists "Service role can insert lambdas" on trading_lambdas;
drop policy if exists "Public can read lambdas" on trading_lambdas;
drop policy if exists "Public can read trades" on lambda_trades;

-- trading_lambdas: authenticated users only
create policy "Auth users can read lambdas"
  on trading_lambdas for select using (auth.uid() is not null);

create policy "Auth users can insert lambdas"
  on trading_lambdas for insert with check (auth.uid() is not null);

create policy "Auth users can update their own lambdas"
  on trading_lambdas for update using (auth.uid() = user_id);

-- lambda_trades: readable by auth users; writable by service role (cron/executor)
create policy "Auth users can read trades"
  on lambda_trades for select using (auth.uid() is not null);

create policy "Service role can write trades"
  on lambda_trades for all using (auth.role() = 'service_role');

create policy "Service role can write lambdas"
  on trading_lambdas for all using (auth.role() = 'service_role');
