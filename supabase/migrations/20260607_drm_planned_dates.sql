-- Allow planned (future) date ideas in drm_dates
alter table drm_dates add column if not exists is_planned boolean not null default false;
alter table drm_dates alter column date drop not null;
