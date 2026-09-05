-- Visibility, forking and comments.

-- ── Visibility ───────────────────────────────────────────────────────────────
--
-- Until now a single policy made every song in the table readable by anyone
-- who had its id:
--
--   CREATE POLICY "Public read" ON lead_sheets FOR SELECT USING (true);
--
-- That is dropped here and replaced. Existing songs default to private, which
-- is the safe direction to be wrong in: a song that should have been shared is
-- a complaint, and one that should not have been is not recoverable.

ALTER TABLE lead_sheets
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'unlisted', 'public'));

DROP POLICY IF EXISTS "Public read" ON lead_sheets;

-- Unlisted and public are both readable by id; the difference is that only
-- public songs are listed anywhere, which is a query concern rather than a
-- policy one.
DROP POLICY IF EXISTS "Anyone may read a shared song" ON lead_sheets;
CREATE POLICY "Anyone may read a shared song"
  ON lead_sheets FOR SELECT
  USING (visibility IN ('unlisted', 'public'));

CREATE INDEX IF NOT EXISTS lead_sheets_public_idx
  ON lead_sheets (visibility, updated_at DESC)
  WHERE visibility = 'public';

-- ── Forking ──────────────────────────────────────────────────────────────────
--
-- One direction only. A fork records where it came from and renders that as
-- visible attribution; nothing merges back.
--
-- The provenance is copied rather than joined. The original may be deleted or
-- made private later, and the credit on the copy should outlive that.

ALTER TABLE lead_sheets
  ADD COLUMN IF NOT EXISTS forked_from_id uuid REFERENCES lead_sheets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forked_from_title text,
  ADD COLUMN IF NOT EXISTS forked_from_author text;

-- ── Comments ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS song_comments (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_sheet_id uuid        NOT NULL REFERENCES lead_sheets(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name   text,
  body          text        NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE song_comments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS song_comments_sheet_idx
  ON song_comments (lead_sheet_id, created_at);

-- Readable wherever the song is readable, so a private song's comments are as
-- private as it is.
DROP POLICY IF EXISTS "Comments follow the song's visibility" ON song_comments;
CREATE POLICY "Comments follow the song's visibility"
  ON song_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lead_sheets s
      WHERE s.id = song_comments.lead_sheet_id
        AND (s.user_id = auth.uid() OR s.visibility IN ('unlisted', 'public'))
    )
  );

-- Anyone who can read a shared song may comment on it.
DROP POLICY IF EXISTS "Signed-in readers may comment" ON song_comments;
CREATE POLICY "Signed-in readers may comment"
  ON song_comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM lead_sheets s
      WHERE s.id = song_comments.lead_sheet_id
        AND (s.user_id = auth.uid() OR s.visibility IN ('unlisted', 'public'))
    )
  );

-- Your own comment is yours; the song's owner can also remove one from their
-- song, which is the minimum a person needs to look after their own page.
DROP POLICY IF EXISTS "Authors and the song owner may delete a comment" ON song_comments;
CREATE POLICY "Authors and the song owner may delete a comment"
  ON song_comments FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM lead_sheets s
      WHERE s.id = song_comments.lead_sheet_id AND s.user_id = auth.uid()
    )
  );
