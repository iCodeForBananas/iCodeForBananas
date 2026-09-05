-- A song can be played in a different key, at a different tempo, or with a
-- capo, for one setlist only.
--
-- These live on the join row and never on the song. A set that wants a song
-- down a tone is a fact about that set, and writing it back to the song would
-- change every other set that uses it. Null means "as written".

ALTER TABLE setlist_songs
  ADD COLUMN IF NOT EXISTS transpose_override integer,
  ADD COLUMN IF NOT EXISTS capo_override integer,
  ADD COLUMN IF NOT EXISTS tempo_override integer;

COMMENT ON COLUMN setlist_songs.transpose_override IS
  'Semitones, for this set only. The song''s own key is never rewritten.';
COMMENT ON COLUMN setlist_songs.capo_override IS
  'Capo fret, for this set only. Does not change what key the song is in.';
