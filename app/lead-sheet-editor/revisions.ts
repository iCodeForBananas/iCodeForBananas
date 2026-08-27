import type { createClient } from "@/utils/supabase/client";

type Client = NonNullable<ReturnType<typeof createClient>>;

/** How much history a song keeps. Older revisions are pruned on every write. */
const MAX_REVISIONS = 100;

/**
 * Store the song's text as a revision and trim the history back to the newest
 * hundred. Every path that writes a song — the editor's save, a line edited
 * from preview — goes through here so History shows the whole story.
 */
export async function snapshotRevision(
  sb: Client,
  sheetId: string,
  rawText: string
): Promise<void> {
  await sb.from("lead_sheet_revisions").insert({ lead_sheet_id: sheetId, raw_text: rawText });
  const { data: all } = await sb
    .from("lead_sheet_revisions")
    .select("id")
    .eq("lead_sheet_id", sheetId)
    .order("created_at", { ascending: false });
  if (all && all.length > MAX_REVISIONS) {
    const toDelete = all.slice(MAX_REVISIONS).map((r: { id: string }) => r.id);
    await sb.from("lead_sheet_revisions").delete().in("id", toDelete);
  }
}
