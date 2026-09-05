/**
 * Converts stored songs to ChordPro, and refuses any it cannot convert safely.
 *
 * Run with:  npm run backfill:chordpro -- --dry-run
 *            npm run backfill:chordpro -- --commit
 *
 * Nothing is destroyed. The script only ever writes the new `chordpro` column;
 * `sections` is left exactly as it was, and the app reads it as a fallback, so
 * a bad conversion shows up as a visible diff rather than as lost work.
 *
 * The output worth reading is the list of rows it refused. Every row is
 * converted, parsed back, and compared line by line against the original; a row
 * whose content does not survive that is skipped and printed. See
 * docs/chordpro-migration.md for what "survived" means.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import { legacyToChordPro, verifyConversion, type LegacySheet } from "../app/lead-sheet-editor/legacy";

const commit = process.argv.includes("--commit");
if (!commit && !process.argv.includes("--dry-run")) {
  console.error("Pass --dry-run to report, or --commit to write.");
  process.exit(2);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(2);
}

type Row = LegacySheet & { id: string; chordpro: string | null };

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data, error } = await db
  .from("lead_sheets")
  .select("id, title, key, tempo, general_notes, sections, chordpro")
  .is("chordpro", null)
  .order("created_at");

if (error) {
  console.error("Could not read songs:", error.message);
  process.exit(1);
}

const rows = (data ?? []) as Row[];
console.log(`${rows.length} song${rows.length === 1 ? "" : "s"} still in the old shape.\n`);

const refused: { id: string; title: string; differences: string[] }[] = [];
let converted = 0;

for (const row of rows) {
  const verdict = verifyConversion(row);
  if (!verdict.ok) {
    refused.push({ id: row.id, title: row.title ?? "Untitled", differences: verdict.differences });
    continue;
  }

  if (commit) {
    const { error: writeError } = await db
      .from("lead_sheets")
      .update({ chordpro: legacyToChordPro(row) })
      .eq("id", row.id);
    if (writeError) {
      refused.push({ id: row.id, title: row.title ?? "Untitled", differences: [writeError.message] });
      continue;
    }
  }
  converted++;
}

console.log(`${commit ? "Converted" : "Would convert"}: ${converted}`);
console.log(`Refused: ${refused.length}\n`);

for (const row of refused) {
  console.log(`  ${row.id}  ${row.title}`);
  for (const line of row.differences) console.log(`      ${line}`);
}

if (!commit) console.log("\nDry run. Nothing was written.");
process.exit(refused.length > 0 ? 1 : 0);
