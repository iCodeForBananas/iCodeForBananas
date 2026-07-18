import { NextRequest, NextResponse } from "next/server";
import { requireUser, supabaseService } from "../../lib";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response: unauthorized } = await requireUser(req);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await params;
    const body = await req.json();
    const { name, url, enabled } = body;

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) update.name = name;
    if (url !== undefined) update.url = url;
    if (enabled !== undefined) update.enabled = enabled;

    const { data, error } = await supabaseService()
      .from("scraper_sources")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, source: data });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to update source" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response: unauthorized } = await requireUser(req);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await params;
    const { error } = await supabaseService().from("scraper_sources").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to delete source" },
      { status: 500 }
    );
  }
}
