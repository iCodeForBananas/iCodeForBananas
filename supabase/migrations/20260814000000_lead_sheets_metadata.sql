-- Per-song playback settings that belong to the song rather than the device.
-- First use: the drum machine's pattern, kick/snare voice, and volume, kept
-- under metadata.drums so future preferences can share the column.

ALTER TABLE lead_sheets
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
