-- Songs move to ChordPro. Additive on purpose: `sections` stays, and the app
-- reads `chordpro` when it is there and falls back to `sections` when it is
-- not, so a conversion bug shows up as a visible diff rather than lost work.
-- See docs/chordpro-migration.md.

ALTER TABLE lead_sheets
  ADD COLUMN IF NOT EXISTS chordpro text,
  -- Kept as columns as well as directives: the library lists and searches on
  -- these, and parsing every song to draw a list would be absurd.
  ADD COLUMN IF NOT EXISTS artist text,
  ADD COLUMN IF NOT EXISTS capo integer,
  ADD COLUMN IF NOT EXISTS time_signature text;

-- Search by title and artist, case-insensitively, without a sequential scan
-- once a library gets big.
CREATE INDEX IF NOT EXISTS lead_sheets_title_idx ON lead_sheets (user_id, lower(title));
CREATE INDEX IF NOT EXISTS lead_sheets_artist_idx ON lead_sheets (user_id, lower(artist));
