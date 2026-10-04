-- Space Math progress used to save under a numeric "stage_id" that several
-- topics in the game shared (e.g. four skip-counting topics all posted
-- under stage 23). The game and the API each kept their own hardcoded
-- mirror of which topics map to which stage, and the two drifted. Both now
-- read a single shared list (app/lib/spaceMathSkills.ts) and the game saves
-- one row per topic under that topic's own string key, so this column
-- becomes the key itself rather than a shared numeric id.
--
-- Existing rows keep their old numeric stage ids (cast to text) and are no
-- longer matched by the new per-skill lookups — they stay in the table as
-- history but the per-skill/per-subject breakdown starts fresh from here.
ALTER TABLE space_math_progress RENAME COLUMN stage_id TO skill_id;
ALTER TABLE space_math_progress ALTER COLUMN skill_id TYPE text USING skill_id::text;
ALTER TABLE space_math_progress RENAME COLUMN stage_label TO skill_label;
