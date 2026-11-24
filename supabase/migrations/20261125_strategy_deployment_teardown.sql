-- Deleting a deployment closes its position first. The app can't reach
-- Tradier (the credentials live in AWS), so a delete only asks: it turns the
-- deployment off and sets teardown_requested_at. The dispatcher Lambda then
-- cancels its open order, closes its position at market during regular
-- hours, and deletes the row once it's flat.

alter table public.strategy_deployments add column teardown_requested_at timestamptz;

-- A deployment being torn down is never also running.
alter table public.strategy_deployments
  add constraint strategy_deployments_teardown_not_enabled
  check (teardown_requested_at is null or not enabled);

-- The dispatcher's read now also returns the ones to tear down. A dispatcher
-- built before this change keeps only the enabled rows, so it ignores them.
create or replace function public.strategy_deployments_to_run(p_token text)
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
    where d.enabled or d.teardown_requested_at is not null
    order by d.created_at;
end;
$$;

-- The dispatcher's last step of a teardown: the row goes once it's flat.
-- Only a row someone asked to tear down can be deleted this way.
create function public.finish_strategy_deployment_teardown(p_token text, p_id text)
returns void
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

  delete from public.strategy_deployments
  where id = p_id and teardown_requested_at is not null and not enabled;
end;
$$;
revoke all on function public.finish_strategy_deployment_teardown(text, text) from public;
grant execute on function public.finish_strategy_deployment_teardown(text, text) to anon, authenticated;

-- The leaderboard's config list gains whether each one is being torn down.
drop function public.strategy_deployment_configs();
create function public.strategy_deployment_configs()
returns table (
  id text,
  enabled boolean,
  enable_shorts boolean,
  starting_equity double precision,
  position_size_pct double precision,
  max_daily_loss_pct double precision,
  drawdown_limit_pct double precision,
  drawdown_pause_bars integer,
  teardown_requested_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.enabled, d.enable_shorts, d.starting_equity, d.position_size_pct,
         d.max_daily_loss_pct, d.drawdown_limit_pct, d.drawdown_pause_bars,
         d.teardown_requested_at
  from public.strategy_deployments d
  join public.trading_operators o on o.user_id = d.user_id;
$$;
revoke all on function public.strategy_deployment_configs() from public;
grant execute on function public.strategy_deployment_configs() to anon, authenticated;
