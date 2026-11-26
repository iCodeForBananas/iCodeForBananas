-- Strategies deployed straight from the backtester (/algo-backtest, "Deploy
-- strategy"). One row per deployment; the dispatcher Lambda in the
-- TradierTrading stack (trading/runtime/dispatch.ts) reads the enabled rows
-- every 5 minutes and paper-trades them on Tradier. Publishing, pausing or
-- deleting one is a row write here, never a CDK deploy.
--
-- Only operators can see or change rows: a deployment places real orders in
-- the Tradier account, so signing up must not be enough. The Lambda reads and
-- reports through security-definer functions that take the same token as
-- report_trading_equity (trading_equity_reporters).

create table public.trading_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.trading_operators enable row level security;
revoke all on public.trading_operators from anon, authenticated;

-- The project's one user (see OWNER_USER_ID in app/api/mcp/route.ts).
insert into public.trading_operators (user_id)
select id from auth.users where id = '9d9c360a-9c84-4afb-9fc8-fbbe3cd766ae'
on conflict do nothing;

create function public.is_trading_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.trading_operators where user_id = auth.uid());
$$;
revoke all on function public.is_trading_operator() from public;
grant execute on function public.is_trading_operator() to authenticated;

create table public.strategy_deployments (
  -- deploymentId() in trading/runtime/config.ts: built from the settings, so
  -- the same settings always name the same state row and leaderboard curve.
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(id) <= 200),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  strategy_id text not null,
  symbol text not null check (symbol ~ '^[A-Z][A-Z0-9.]{0,9}$'),
  bar_interval text not null check (bar_interval in ('5min', '15min', '30min', '1h', '1d')),
  params jsonb not null default '{}'::jsonb,
  enable_shorts boolean not null,
  starting_equity double precision not null check (starting_equity > 0),
  position_size_pct double precision not null check (position_size_pct > 0 and position_size_pct <= 100),
  max_daily_loss_pct double precision not null check (max_daily_loss_pct > 0 and max_daily_loss_pct <= 100),
  drawdown_limit_pct double precision not null check (drawdown_limit_pct > 0 and drawdown_limit_pct <= 100),
  drawdown_pause_bars integer not null check (drawdown_pause_bars >= 0),
  min_bars integer not null check (min_bars >= 1),
  history_days integer not null check (history_days >= 1 and history_days <= 3650),
  enabled boolean not null default true,
  -- The backtest it came from, for reference only: label, return, trades, ...
  backtest jsonb,
  -- Written by the dispatcher after each run.
  last_run_at timestamptz,
  last_action text,
  last_reason text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One Tradier account holds one net position per symbol.
create unique index strategy_deployments_one_enabled_per_symbol
  on public.strategy_deployments (symbol) where enabled;

alter table public.strategy_deployments enable row level security;
revoke all on public.strategy_deployments from anon, authenticated;
grant select, insert, update, delete on public.strategy_deployments to authenticated;

create policy "Operators read their deployments" on public.strategy_deployments
  for select using (user_id = auth.uid() and public.is_trading_operator());
create policy "Operators add deployments" on public.strategy_deployments
  for insert with check (user_id = auth.uid() and public.is_trading_operator());
create policy "Operators change their deployments" on public.strategy_deployments
  for update using (user_id = auth.uid() and public.is_trading_operator())
  with check (user_id = auth.uid() and public.is_trading_operator());
create policy "Operators remove their deployments" on public.strategy_deployments
  for delete using (user_id = auth.uid() and public.is_trading_operator());

create function public.strategy_deployments_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger strategy_deployments_touch before update on public.strategy_deployments
  for each row execute function public.strategy_deployments_touch();

-- The dispatcher's read: every enabled deployment whose owner is still an operator.
create function public.strategy_deployments_to_run(p_token text)
returns setof public.strategy_deployments
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.trading_equity_reporters
    where token_hash = sha256(convert_to(p_token, 'UTF8'))
  ) then
    raise exception 'invalid reporter token' using errcode = '42501';
  end if;

  return query
    select d.* from public.strategy_deployments d
    join public.trading_operators o on o.user_id = d.user_id
    where d.enabled
    order by d.created_at;
end;
$$;
revoke all on function public.strategy_deployments_to_run(text) from public;
grant execute on function public.strategy_deployments_to_run(text) to anon, authenticated;

-- The dispatcher's write: what the last run did, for the backtester's list.
create function public.report_strategy_deployment_run(
  p_token text,
  p_id text,
  p_at timestamptz,
  p_action text,
  p_reason text,
  p_error text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.trading_equity_reporters
    where token_hash = sha256(convert_to(p_token, 'UTF8'))
  ) then
    raise exception 'invalid reporter token' using errcode = '42501';
  end if;

  update public.strategy_deployments
  set last_run_at = p_at,
      last_action = left(p_action, 100),
      last_reason = left(p_reason, 1000),
      last_error = left(p_error, 1000)
  where id = p_id and (last_run_at is null or last_run_at <= p_at);
end;
$$;
revoke all on function public.report_strategy_deployment_run(text, text, timestamptz, text, text, text) from public;
grant execute on function public.report_strategy_deployment_run(text, text, timestamptz, text, text, text) to anon, authenticated;
