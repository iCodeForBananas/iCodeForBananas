-- Revision history for lead sheets.
-- Stores up to 100 snapshots of rawText per song (pruned in app code).

CREATE TABLE lead_sheet_revisions (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_sheet_id  uuid        NOT NULL REFERENCES lead_sheets(id) ON DELETE CASCADE,
  raw_text       text        NOT NULL,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE lead_sheet_revisions ENABLE ROW LEVEL SECURITY;

-- Users can only see / write revisions for sheets they own
CREATE POLICY "Users manage their own revisions"
  ON lead_sheet_revisions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM lead_sheets
      WHERE lead_sheets.id = lead_sheet_revisions.lead_sheet_id
        AND lead_sheets.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lead_sheets
      WHERE lead_sheets.id = lead_sheet_revisions.lead_sheet_id
        AND lead_sheets.user_id = auth.uid()
    )
  );

CREATE INDEX ON lead_sheet_revisions (lead_sheet_id, created_at DESC);
