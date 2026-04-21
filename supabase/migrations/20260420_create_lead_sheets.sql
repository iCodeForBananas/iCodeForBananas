CREATE TABLE lead_sheets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL DEFAULT 'Untitled',
  key text DEFAULT '',
  tempo integer,
  general_notes text DEFAULT '',
  sections jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE lead_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own lead sheets"
  ON lead_sheets FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
