-- Public equity curves for the live trading Lambdas (/trading-equity).
--
-- Each Lambda reports its equity after every bar it processes. Anyone can read
-- the snapshots. Nobody can write them except through report_trading_equity,
-- which takes a token only the Lambdas hold (AWS Secrets Manager), so the
-- Lambdas never need the database's service-role key.

create table public.trading_equity_snapshots (
  deployment_id text not null,
  -- The close of the bar this equity is marked to.
  bar_time timestamptz not null,
  strategy_id text not null,
  symbol text not null,
  bar_interval text not null,
  equity double precision not null check (equity > 0),
  realized_pnl double precision not null,
  unrealized_pnl double precision not null,
  -- Positive long, negative short, zero flat.
  position_shares double precision not null,
  trades_closed integer not null,
  winning_trades integer not null,
  reported_at timestamptz not null default now(),
  primary key (deployment_id, bar_time)
);

alter table public.trading_equity_snapshots enable row level security;
create policy "Public read" on public.trading_equity_snapshots for select using (true);
revoke all on public.trading_equity_snapshots from anon, authenticated;
grant select on public.trading_equity_snapshots to anon, authenticated;

-- SHA-256 of each accepted token. RLS on with no policies: unreadable through
-- the API. To rotate, insert the new hash and delete the old one.
create table public.trading_equity_reporters (
  token_hash bytea primary key,
  label text not null,
  created_at timestamptz not null default now()
);

alter table public.trading_equity_reporters enable row level security;
revoke all on public.trading_equity_reporters from anon, authenticated;

-- The hash of a 256-bit random token: safe to commit, and useless without the
-- token, which lives only in the secret tradier-trading/equity-reporter.
insert into public.trading_equity_reporters (token_hash, label)
values ('\xeb2413ba9e45b3cf4abbb1701456f821d9da9a3dd2d746fbf5135dd1ca958a42', 'trading lambdas');

create function public.report_trading_equity(
  p_token text,
  p_deployment_id text,
  p_bar_time timestamptz,
  p_strategy_id text,
  p_symbol text,
  p_bar_interval text,
  p_equity double precision,
  p_realized_pnl double precision,
  p_unrealized_pnl double precision,
  p_position_shares double precision,
  p_trades_closed integer,
  p_winning_trades integer
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

  insert into public.trading_equity_snapshots (
    deployment_id, bar_time, strategy_id, symbol, bar_interval, equity,
    realized_pnl, unrealized_pnl, position_shares, trades_closed, winning_trades
  ) values (
    p_deployment_id, p_bar_time, p_strategy_id, p_symbol, p_bar_interval, p_equity,
    p_realized_pnl, p_unrealized_pnl, p_position_shares, p_trades_closed, p_winning_trades
  )
  on conflict (deployment_id, bar_time) do update set
    equity = excluded.equity,
    realized_pnl = excluded.realized_pnl,
    unrealized_pnl = excluded.unrealized_pnl,
    position_shares = excluded.position_shares,
    trades_closed = excluded.trades_closed,
    winning_trades = excluded.winning_trades,
    reported_at = now();
end;
$$;

revoke all on function public.report_trading_equity(text, text, timestamptz, text, text, text, double precision, double precision, double precision, double precision, integer, integer) from public;
grant execute on function public.report_trading_equity(text, text, timestamptz, text, text, text, double precision, double precision, double precision, double precision, integer, integer) to anon, authenticated;

-- One row per live deployment, with its whole curve as [[epoch ms, equity], ...].
-- Live means it reported in the last 7 days, which outlasts any market closure
-- and drops deployments that were removed or renamed.
--
-- A curve is one JSON value rather than one row per point so PostgREST's row
-- limit can't truncate it, and long histories thin out to keep it small: every
-- report for 3 weeks, the last of each hour to 6 months, then the last of each
-- day. The bins start at 07:00 UTC so a US session never spans two days.
create function public.trading_equity_curves()
returns table (
  deployment_id text,
  strategy_id text,
  symbol text,
  bar_interval text,
  starting_at timestamptz,
  starting_equity double precision,
  starting_trades_closed integer,
  starting_winning_trades integer,
  latest_at timestamptz,
  position_shares double precision,
  trades_closed integer,
  winning_trades integer,
  points jsonb
)
language sql
stable
set search_path = ''
as $$
  with live as (
    select s.deployment_id, min(s.bar_time) as first_at, max(s.bar_time) as last_at
    from public.trading_equity_snapshots s
    group by s.deployment_id
    having max(s.bar_time) > now() - interval '7 days'
  ),
  span as (
    select case
      when max(last_at) - min(first_at) <= interval '21 days' then null
      when max(last_at) - min(first_at) <= interval '180 days' then interval '1 hour'
      else interval '1 day'
    end as bucket
    from live
  ),
  sampled as (
    select distinct on (s.deployment_id, coalesce(date_bin(span.bucket, s.bar_time, timestamptz '2000-01-01 07:00+00'), s.bar_time))
      s.deployment_id, s.bar_time, s.equity
    from public.trading_equity_snapshots s
    join live on live.deployment_id = s.deployment_id
    cross join span
    order by s.deployment_id, coalesce(date_bin(span.bucket, s.bar_time, timestamptz '2000-01-01 07:00+00'), s.bar_time), s.bar_time desc
  ),
  curves as (
    select s.deployment_id,
      jsonb_agg(jsonb_build_array((extract(epoch from s.bar_time) * 1000)::bigint, s.equity) order by s.bar_time) as points
    from sampled s
    group by s.deployment_id
  )
  select l.deployment_id, z.strategy_id, z.symbol, z.bar_interval,
    l.first_at, f.equity, f.trades_closed, f.winning_trades,
    l.last_at, z.position_shares, z.trades_closed, z.winning_trades,
    c.points
  from live l
  join curves c on c.deployment_id = l.deployment_id
  join public.trading_equity_snapshots f on f.deployment_id = l.deployment_id and f.bar_time = l.first_at
  join public.trading_equity_snapshots z on z.deployment_id = l.deployment_id and z.bar_time = l.last_at
  order by l.deployment_id;
$$;

grant execute on function public.trading_equity_curves() to anon, authenticated;
