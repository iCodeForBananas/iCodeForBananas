CREATE TABLE setlists (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE setlist_songs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  setlist_id uuid REFERENCES setlists(id) ON DELETE CASCADE NOT NULL,
  lead_sheet_id uuid REFERENCES lead_sheets(id) ON DELETE CASCADE NOT NULL,
  position integer NOT NULL DEFAULT 0,
  UNIQUE (setlist_id, lead_sheet_id)
);

ALTER TABLE setlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE setlist_songs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own setlists" ON setlists
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage own setlist songs" ON setlist_songs
  USING (setlist_id IN (SELECT id FROM setlists WHERE user_id = auth.uid()))
  WITH CHECK (setlist_id IN (SELECT id FROM setlists WHERE user_id = auth.uid()));
