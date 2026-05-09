-- Add Tradier credentials and execution config to trading_lambdas
alter table trading_lambdas
  add column if not exists tradier_api_key text,
  add column if not exists tradier_account_id text;

-- Policy to allow anon inserts (needed since no auth on the form)
drop policy if exists "Service role can insert lambdas" on trading_lambdas;
create policy "Anyone can insert lambdas"
  on trading_lambdas for insert with check (true);
