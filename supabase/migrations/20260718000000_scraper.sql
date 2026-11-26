-- URLs to scrape
create table if not exists scraper_sources (
  id               uuid        primary key default gen_random_uuid(),
  name             text        not null,
  url              text        not null unique,
  enabled          boolean     not null default true,
  last_scraped_at  timestamptz,
  last_status      text,       -- 'success' | 'error'
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Raw scraped content (one row per scrape run per source)
create table if not exists scraper_results (
  id             uuid        primary key default gen_random_uuid(),
  source_id      uuid        not null references scraper_sources(id) on delete cascade,
  url            text        not null,
  html_content   text,
  status         text        not null, -- 'success' | 'error'
  error_message  text,
  scraped_at     timestamptz not null default now()
);

create index idx_scraper_results_source_id on scraper_results(source_id);
create index idx_scraper_results_scraped_at on scraper_results(scraped_at);

alter table scraper_sources enable row level security;
alter table scraper_results enable row level security;

-- No client-facing policies: all access goes through API routes using the
-- service role key (mirrors the admin-only, service-role-gated tables in
-- this project rather than exposing these tables to anon/authenticated roles).
