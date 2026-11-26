-- Arrangement tracks: per-song recorded audio tracks
-- Audio blobs live in Supabase storage bucket "arrangements"
-- Local IndexedDB is primary; this table is the cloud sync target

CREATE TABLE arrangement_tracks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id     uuid NOT NULL REFERENCES lead_sheets(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  type         text NOT NULL DEFAULT 'other',   -- 'guitar' | 'vocals' | 'other'
  mime_type    text NOT NULL DEFAULT 'audio/webm',
  storage_path text NOT NULL,
  duration_sec float NOT NULL DEFAULT 0,
  volume       float NOT NULL DEFAULT 0.8,
  muted        boolean NOT NULL DEFAULT false,
  offset_ms    int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE arrangement_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own arrangement tracks"
  ON arrangement_tracks FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Storage bucket for audio files
INSERT INTO storage.buckets (id, name, public)
VALUES ('arrangements', 'arrangements', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: files live at {userId}/{sheetId}/{trackId}.{ext}
CREATE POLICY "Users upload own arrangement audio"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'arrangements' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users read own arrangement audio"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'arrangements' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own arrangement audio"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'arrangements' AND auth.uid()::text = (storage.foldername(name))[1]);
