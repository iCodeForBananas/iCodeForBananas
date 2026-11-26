-- Policy to allow anon inserts (needed since no auth on the form)
drop policy if exists "Service role can insert lambdas" on trading_lambdas;
create policy "Anyone can insert lambdas"
  on trading_lambdas for insert with check (true);
