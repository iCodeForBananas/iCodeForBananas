-- Drop DRM bubble ecosystem tables (added in 20260701_drm_bubbles.sql)
-- Run this manually in the Supabase dashboard to clean up the schema.
DROP TABLE IF EXISTS drm_person_pillars CASCADE;
DROP TABLE IF EXISTS drm_evidence CASCADE;
DROP TABLE IF EXISTS drm_pillars CASCADE;
DROP TABLE IF EXISTS drm_people CASCADE;

-- Drop legacy DRM tables from the original pipeline feature (20260607_*)
-- (These may or may not exist depending on whether prior migrations were run.)
DROP TABLE IF EXISTS drm_pillar_entries CASCADE;
DROP TABLE IF EXISTS drm_pillars CASCADE;
DROP TABLE IF EXISTS drm_dates CASCADE;
DROP TABLE IF EXISTS drm_red_flags CASCADE;
DROP TABLE IF EXISTS drm_people CASCADE;
