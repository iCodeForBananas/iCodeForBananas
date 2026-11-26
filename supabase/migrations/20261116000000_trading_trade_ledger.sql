-- Closed trades and time in market for the live trading deployments, for the
-- go-live statistics on /trading-leaderboard (profit factor, expectancy,
-- streaks, exposure...). Read-only and additive: one function over the
-- existing public snapshots, nothing else changes.
--
-- A snapshot is written after every bar a Lambda processes, so a trade's P&L
-- is the change in realized_pnl on the bar where trades_closed goes up, and
-- the equity it was sized from is the realized equity (equity minus open
-- P&L) on the bar before, which is exactly what the runtime sizes from.
-- Done here rather than in the browser because the snapshots grow by
-- thousands of rows a week; the trades are a few dozen.

create function public.trading_trade_ledger()
returns table (
  deployment_id text,
  -- Snapshots since the deployment's first report, and how many of them held a position.
  bars integer,
  bars_in_position integer,
  -- [[epoch ms, trades closed, of them won, realized P&L, sizing equity], ...], oldest first.
  trades jsonb
)
language sql
stable
set search_path = ''
as $$
  with live as (
    select s.deployment_id
    from public.trading_equity_snapshots s
    group by s.deployment_id
    having max(s.bar_time) > now() - interval '7 days'
  ),
  steps as (
    select s.deployment_id, s.bar_time, s.position_shares,
      s.trades_closed - lag(s.trades_closed) over w as closed,
      s.winning_trades - lag(s.winning_trades) over w as won,
      s.realized_pnl - lag(s.realized_pnl) over w as pnl,
      lag(s.equity - s.unrealized_pnl) over w as base
    from public.trading_equity_snapshots s
    join live l on l.deployment_id = s.deployment_id
    window w as (partition by s.deployment_id order by s.bar_time)
  )
  select st.deployment_id,
    count(*)::integer as bars,
    (count(*) filter (where st.position_shares <> 0))::integer as bars_in_position,
    coalesce(
      jsonb_agg(
        jsonb_build_array((extract(epoch from st.bar_time) * 1000)::bigint, st.closed, st.won, round(st.pnl::numeric, 2), round(st.base::numeric, 2))
        order by st.bar_time
      ) filter (where st.closed > 0),
      '[]'::jsonb
    ) as trades
  from steps st
  group by st.deployment_id
  order by st.deployment_id;
$$;

grant execute on function public.trading_trade_ledger() to anon, authenticated;
