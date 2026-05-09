"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import Link from "next/link";
import { Plus, Trash2, Music, Eye } from "lucide-react";
import type { LeadSheet } from "./shared";
import { makeSection } from "./shared";

export default function LeadSheetList() {
  const { user, loading: authLoading } = useAuth();
  const [sheets, setSheets] = useState<LeadSheet[]>([]);
  const router = useRouter();

  const getSb = () => createClient()!;

  useEffect(() => {
    if (user) loadSheets();
  }, [user]);

  async function loadSheets() {
    const { data } = await getSb()
      .from("lead_sheets")
      .select("*")
      .order("updated_at", { ascending: false });
    setSheets(data ?? []);
  }

  async function createSheet() {
    if (!user) return;
    const { data } = await getSb()
      .from("lead_sheets")
      .insert({
        user_id: user.id,
        title: "Untitled",
        key: "",
        tempo: null,
        general_notes: "",
        sections: [makeSection("verse")],
      })
      .select()
      .single();
    if (data) router.push(`/lead-sheet-editor/${data.id}/edit`);
  }

  async function deleteSheet(id: string) {
    await getSb().from("lead_sheets").delete().eq("id", id);
    setSheets((prev) => prev.filter((s) => s.id !== id));
  }

  if (authLoading) {
    return (
      <main className="px-4 py-6 flex-1">
        <div className="w-full lg:max-w-3xl lg:mx-auto">
          <div className="rounded-lg p-6 bg-white text-center text-[#373A40]/50">
            Loading...
          </div>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="px-4 py-6 flex-1">
        <div className="w-full lg:max-w-3xl lg:mx-auto">
          <div className="rounded-lg p-6 bg-white text-center">
            <h1 className="text-4xl font-bold mb-3" style={{ color: "#000" }}>
              Lead Sheet Editor
            </h1>
            <p className="text-[#373A40]/60 mb-6">
              Sign in to create and manage your lead sheets.
            </p>
            <Link
              href="/login"
              className="inline-block rounded bg-black px-6 py-2 text-sm font-medium"
              style={{ color: "#facc15" }}
            >
              Sign In
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="px-4 py-6 flex-1 metronome-static">
      <div className="w-full lg:max-w-3xl lg:mx-auto">
        <div className="rounded-lg p-6 bg-white">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-4xl font-bold" style={{ color: "#000" }}>
              Lead Sheet Editor
            </h1>
            <button
              onClick={createSheet}
              className="flex items-center gap-2 rounded bg-black px-4 py-2 text-sm font-medium hover:bg-black/80 transition-colors"
              style={{ color: "#facc15" }}
            >
              <Plus className="w-4 h-4" />
              New Sheet
            </button>
          </div>

          {sheets.length === 0 ? (
            <div className="text-center py-16 text-[#373A40]/40">
              <Music className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No lead sheets yet. Create your first one!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sheets.map((sheet) => (
                <div
                  key={sheet.id}
                  className="flex items-center justify-between p-4 border border-[#373A40]/20 rounded-lg hover:border-black transition-colors group"
                >
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => router.push(`/lead-sheet-editor/${sheet.id}/edit`)}
                  >
                    <div className="font-semibold" style={{ color: "#000" }}>
                      {sheet.title || "Untitled"}
                    </div>
                    <div className="text-sm text-[#373A40]/50 flex flex-wrap gap-3 mt-0.5">
                      {sheet.key && <span>Key: {sheet.key}</span>}
                      {sheet.tempo && <span>{sheet.tempo} BPM</span>}
                      <span>{sheet.sections?.length ?? 0} sections</span>
                      <span>{new Date(sheet.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-3 shrink-0">
                    <button
                      onClick={() => router.push(`/lead-sheet-editor/${sheet.id}/preview`)}
                      className="flex items-center gap-1.5 rounded bg-black px-3 py-1.5 text-xs font-medium opacity-0 group-hover:opacity-100 transition-all"
                      style={{ color: "#facc15" }}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Preview
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${sheet.title}"?`)) deleteSheet(sheet.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-[#373A40]/40 hover:text-red-500 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
