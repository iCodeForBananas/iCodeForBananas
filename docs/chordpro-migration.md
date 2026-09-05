# Migrating songs to ChordPro

The parser, renderer and transforms are in place (`app/lib/chordPro.ts`,
`app/lib/harmony.ts`, `app/lead-sheet-editor/ChordProSong.tsx`). What is left is
moving existing rows, and that part touches live data, so it is written down
before it is written.

## What exists now

```
lead_sheets(title, key, tempo, general_notes, sections jsonb, metadata jsonb)
```

`sections` is an array of `{ id, type, label, content, notes }`. `content` is
free text that already uses inline `[chord]` brackets, so the line-level format
is nearly ChordPro already. What is not ChordPro is the structure around it.

## The conversion, field by field

| From | To |
|---|---|
| `title` | `{title: …}` |
| `key` | `{key: …}` |
| `tempo` | `{tempo: …}` |
| `general_notes` | `{comment: …}` per line, before the first section |
| section `type` + `label` | `{start_of_<type>: <label>}` … `{end_of_<type>}` |
| section `content` | lines, unchanged |
| section `notes` | `{comment: …}` per line |
| `metadata` | stays a column; it is playback state, not song text |

Nothing gains an artist or a capo. Neither exists in the current data and
guessing one from free text would be worse than leaving it unset.

## The four things that can go wrong

**A `[Chorus]` line inside `content`.** The legacy format writes section headers
as bracketed lines, and ChordPro reads every bracket as a chord. Any such line
has to become an environment during conversion. `asSectionHeader` already
decides this correctly, and now decides it with the corrected grammar, so
`[C7sus4]` is a chord rather than a section called C7sus4.

**Time markers.** Lines carry `@1:24` cues that `parseTimeMarker` reads. They
stay inline as lyric text; the parser does not touch them and the timing code
keeps working. They are not directives and should not become directives.

**Drum and sub-bass settings lines.** These are serialized into the song text
today and also live in `metadata`. `metadata` is the source of truth; the text
lines are regenerated. They should not survive into the ChordPro body.

**Anything unrecognised.** The parser carries unknown directives through rather
than dropping them, and the formatter writes them back, so a round trip cannot
quietly lose content. That property is tested.

## The plan

1. **Add a column, drop nothing.** `ALTER TABLE lead_sheets ADD COLUMN chordpro
   text` — nullable. No existing read path changes.

2. **Backfill with a verifier, not a converter.** For each row: convert, then
   parse the result back and compare the rendered plain text against the plain
   text of the original. A row whose text does not match byte for byte is left
   unconverted and reported. The migration's output is a list of rows it
   refused, which is the interesting part.

3. **Dual read.** The app reads `chordpro` when present and falls back to
   `sections`. Saves write both. This is the period where a conversion bug
   shows up as a visible diff rather than as lost work.

4. **Drop `sections` only after the fallback stops being used**, and only once
   the refused list from step 2 is empty or each entry has been dealt with by
   hand.

Revision history needs nothing: `lead_sheet_revisions` is already append-only,
a row per save, and it stores raw text, so it keeps working across the change.

## What I need from you

Step 2 is the one to look at. It is the only step that reads every song you
have, and its verifier decides what counts as "the same song". I would rather
you agree with that definition before it runs than after.
