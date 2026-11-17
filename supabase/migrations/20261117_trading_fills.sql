-- Every fill the live trading Lambdas get from Tradier, one row per order,
-- for a historical recap of the trades taken and the equity they produced.
--
-- Append-only. Rows arrive through report_trading_fill, which takes the same
-- token as report_trading_equity (secret tradier-trading/equity-reporter), and
-- a second report of the same order is ignored, never merged. A trigger
-- refuses UPDATE and DELETE for every role, so a row, once written, is final.
--
-- The mark-to-market curve between fills is trading_equity_snapshots, one row
-- per processed bar. This table is the trade log that sits on top of it.

create table public.trading_fills (
  deployment_id text not null,
  -- Tradier's order id. One order fills once as far as the runtime is
  -- concerned: its total executed quantity at its average fill price.
  order_id text not null,
  strategy_id text not null,
  symbol text not null,
  bar_interval text not null,
  -- 'open' starts a position, 'close' reduces or ends one.
  action text not null check (action in ('open', 'close')),
  -- The side of the position opened or closed, not the order.
  position_side text not null check (position_side in ('long', 'short')),
  order_side text not null check (order_side in ('buy', 'sell', 'sell_short', 'buy_to_cover')),
  shares integer not null check (shares > 0),
  fill_price double precision not null check (fill_price > 0),
  fill_time timestamptz not null,
  -- When the order was sent. Null on backfilled rows where the log didn't say.
  placed_at timestamptz,
  -- The signal behind the order, e.g. 'IBS 0.12 < 0.25'.
  reason text,
  -- Close only: the entry price of the position it closed.
  entry_price double precision,
  -- Close only: this fill's P&L in the deployment's own dollars (see pnl_scale).
  realized_pnl double precision,
  -- Close only, on the fill that ends the position: the whole trade's P&L,
  -- partial exits included. Null on a partial exit and on opens.
  trade_pnl double precision,
  -- The deployment's state right after this fill:
  -- signed position (positive long, negative short, zero flat),
  position_shares_after integer not null,
  -- realized P&L since it started,
  realized_pnl_total double precision not null,
  -- starting equity + realized_pnl_total + open P&L marked at fill_price,
  equity_after double precision not null check (equity_after > 0),
  -- and its trade counters.
  trades_closed integer not null,
  winning_trades integer not null,
  -- Dollar P&L here is on the deployment's starting equity ($10,000). Fills
  -- from before a deployment was rebased onto it (it used to trade a share of
  -- the account) were sized on the old base, and their P&L is multiplied by
  -- this factor, new base / old base, as the runtime itself did. 1 otherwise.
  pnl_scale double precision not null default 1 check (pnl_scale > 0),
  -- 'live' from the Lambda as it happened, 'backfill' rebuilt afterwards from
  -- its logs and Tradier's order record.
  source text not null check (source in ('live', 'backfill')),
  recorded_at timestamptz not null default now(),
  primary key (deployment_id, order_id)
);

create index trading_fills_fill_time on public.trading_fills (deployment_id, fill_time);

alter table public.trading_fills enable row level security;
create policy "Public read" on public.trading_fills for select using (true);
revoke all on public.trading_fills from anon, authenticated;
grant select on public.trading_fills to anon, authenticated;

create function public.trading_fills_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'trading_fills is append-only: % refused', tg_op using errcode = '42501';
end;
$$;

create trigger trading_fills_append_only
  before update or delete on public.trading_fills
  for each row execute function public.trading_fills_append_only();

create function public.report_trading_fill(
  p_token text,
  p_deployment_id text,
  p_order_id text,
  p_strategy_id text,
  p_symbol text,
  p_bar_interval text,
  p_action text,
  p_position_side text,
  p_order_side text,
  p_shares integer,
  p_fill_price double precision,
  p_fill_time timestamptz,
  p_placed_at timestamptz,
  p_reason text,
  p_entry_price double precision,
  p_realized_pnl double precision,
  p_trade_pnl double precision,
  p_position_shares_after integer,
  p_realized_pnl_total double precision,
  p_equity_after double precision,
  p_trades_closed integer,
  p_winning_trades integer,
  p_pnl_scale double precision,
  p_source text
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

  insert into public.trading_fills (
    deployment_id, order_id, strategy_id, symbol, bar_interval, action,
    position_side, order_side, shares, fill_price, fill_time, placed_at, reason,
    entry_price, realized_pnl, trade_pnl, position_shares_after,
    realized_pnl_total, equity_after, trades_closed, winning_trades, pnl_scale, source
  ) values (
    p_deployment_id, p_order_id, p_strategy_id, p_symbol, p_bar_interval, p_action,
    p_position_side, p_order_side, p_shares, p_fill_price, p_fill_time, p_placed_at, p_reason,
    p_entry_price, p_realized_pnl, p_trade_pnl, p_position_shares_after,
    p_realized_pnl_total, p_equity_after, p_trades_closed, p_winning_trades, coalesce(p_pnl_scale, 1), p_source
  )
  -- The first report of an order stands.
  on conflict (deployment_id, order_id) do nothing;
end;
$$;

revoke all on function public.report_trading_fill(text, text, text, text, text, text, text, text, text, integer, double precision, timestamptz, timestamptz, text, double precision, double precision, double precision, integer, double precision, double precision, integer, integer, double precision, text) from public;
grant execute on function public.report_trading_fill(text, text, text, text, text, text, text, text, text, integer, double precision, timestamptz, timestamptz, text, double precision, double precision, double precision, integer, double precision, double precision, integer, integer, double precision, text) to anon, authenticated;
