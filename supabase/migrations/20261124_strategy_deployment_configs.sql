-- How each deployment is set to run, for the public /trading-leaderboard
-- page: whether it's on, its sides, sizing and limits. These are the same
-- fields the page used to read from trading/deployments.ts at build time;
-- nothing here is secret. Owners, run results and backtests stay private.

create function public.strategy_deployment_configs()
returns table (
  id text,
  enabled boolean,
  enable_shorts boolean,
  starting_equity double precision,
  position_size_pct double precision,
  max_daily_loss_pct double precision,
  drawdown_limit_pct double precision,
  drawdown_pause_bars integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.enabled, d.enable_shorts, d.starting_equity, d.position_size_pct,
         d.max_daily_loss_pct, d.drawdown_limit_pct, d.drawdown_pause_bars
  from public.strategy_deployments d
  join public.trading_operators o on o.user_id = d.user_id;
$$;
revoke all on function public.strategy_deployment_configs() from public;
grant execute on function public.strategy_deployment_configs() to anon, authenticated;
