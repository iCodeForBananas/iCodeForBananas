-- Applied to the database by hand on 2026-11-24 and captured here so the repo
-- matches the migration history.
create function public.strategy_deployment_list()
returns table (
  id text,
  strategy_id text,
  symbol text,
  bar_interval text,
  params jsonb,
  enabled boolean,
  enable_shorts boolean,
  starting_equity double precision,
  position_size_pct double precision,
  max_daily_loss_pct double precision,
  drawdown_limit_pct double precision,
  drawdown_pause_bars integer,
  min_bars integer,
  history_days integer,
  backtest jsonb,
  created_at timestamptz,
  last_run_at timestamptz,
  last_action text
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.strategy_id, d.symbol, d.bar_interval, d.params, d.enabled, d.enable_shorts,
         d.starting_equity, d.position_size_pct, d.max_daily_loss_pct, d.drawdown_limit_pct,
         d.drawdown_pause_bars, d.min_bars, d.history_days, d.backtest, d.created_at,
         d.last_run_at, d.last_action
  from public.strategy_deployments d
  join public.trading_operators o on o.user_id = d.user_id
  order by d.created_at;
$$;
revoke all on function public.strategy_deployment_list() from public;
grant execute on function public.strategy_deployment_list() to anon, authenticated;
