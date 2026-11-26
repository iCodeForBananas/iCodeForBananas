-- Trading Lambdas: registry of deployed strategy instances
create table if not exists trading_lambdas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  strategy_id text not null,
  strategy_name text not null,
  symbol text not null default 'SPY',
  params jsonb not null default '{}',
  status text not null default 'active', -- active | paused | stopped
  position_size integer not null default 100,
  initial_capital numeric(12,2) not null default 10000,
  is_sandbox boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Lambda Trades: every trade executed by a lambda
create table if not exists lambda_trades (
  id uuid primary key default gen_random_uuid(),
  lambda_id uuid references trading_lambdas(id) on delete cascade,
  symbol text not null,
  side text not null,          -- LONG | SHORT
  entry_price numeric(12,4) not null,
  exit_price numeric(12,4),
  quantity integer not null,
  entry_time timestamptz not null,
  exit_time timestamptz,
  pnl numeric(12,2),
  pnl_percent numeric(10,4),
  status text not null default 'open',  -- open | closed
  exit_reason text,
  order_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Row Level Security
alter table trading_lambdas enable row level security;
alter table lambda_trades enable row level security;

-- Leaderboard is public-read
create policy "Public can read lambdas" on trading_lambdas
  for select using (true);

create policy "Public can read trades" on lambda_trades
  for select using (true);

-- Only service role (Lambda) can write
create policy "Service role can insert lambdas" on trading_lambdas
  for insert with check (true);

create policy "Service role can update lambdas" on trading_lambdas
  for update using (true);

create policy "Service role can insert trades" on lambda_trades
  for insert with check (true);

create policy "Service role can update trades" on lambda_trades
  for update using (true);
