"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import { ArrowLeft, Pencil, Maximize2, Minimize2 } from "lucide-react";
import { type LeadSheet, migrateSection, ChordLyricLine } from "../../shared";

export default function PreviewLeadSheet({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [sheet, setSheet] = useState<LeadSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (user) loadSheet();
  }, [user, id]);

  async function loadSheet() {
    setLoading(true);
    const { data } = await createClient()!
      .from("lead_sheets")
      .select("*")
      .eq("id", id)
      .single();
    if (data) {
      setSheet({
        ...data,
        sections: data.sections.map(migrateSection),
      });
    }
    setLoading(false);
  }

  if (authLoading || loading) {
    return (
      <main className="px-4 py-6 flex-1">
        <div className="w-full lg:max-w-3xl lg:mx-auto">
          <div className="rounded-lg p-6 bg-white text-center text-[#373A40]/50">Loading...</div>
        </div>
      </main>
    );
  }

  if (!user || !sheet) {
    return (
      <main className="px-4 py-6 flex-1">
        <div className="w-full lg:max-w-3xl lg:mx-auto">
          <div className="rounded-lg p-6 bg-white text-center text-[#373A40]/50">Sheet not found.</div>
        </div>
      </main>
    );
  }

  return (
    <main
      className={
        fullscreen
          ? "fixed inset-0 z-50 bg-white overflow-y-auto"
          : "px-4 py-6 flex-1 metronome-static"
      }
    >
      <div className={fullscreen ? "max-w-3xl mx-auto px-6 py-8" : "w-full lg:max-w-3xl lg:mx-auto"}>
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-8 print:hidden">
          <button
            onClick={
              fullscreen
                ? () => setFullscreen(false)
                : () => router.push("/lead-sheet-editor")
            }
            className="flex items-center gap-2 text-[#373A40]/50 hover:text-black transition-colors text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            {fullscreen ? "Exit Fullscreen" : "All Sheets"}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFullscreen((v) => !v)}
              className="flex items-center gap-1.5 rounded border border-[#373A40]/30 px-3 py-2 text-sm font-medium hover:border-black hover:bg-black hover:text-[#facc15] transition-colors"
            >
              {fullscreen ? (
                <><Minimize2 className="w-4 h-4" /> Exit</>
              ) : (
                <><Maximize2 className="w-4 h-4" /> Fullscreen</>
              )}
            </button>
            <button
              onClick={() => router.push(`/lead-sheet-editor/${id}/edit`)}
              className="flex items-center gap-1.5 rounded bg-black px-4 py-2 text-sm font-medium hover:bg-black/80 transition-colors"
              style={{ color: "#facc15" }}
            >
              <Pencil className="w-4 h-4" />
              Edit
            </button>
          </div>
        </div>

        {/* Sheet */}
        <div className={fullscreen ? "" : "rounded-lg bg-white p-8 border border-[#373A40]/10"}>
          <div className="mb-8 border-b-2 border-black pb-6">
            <h1
              className={`font-bold leading-tight mb-3 ${fullscreen ? "text-5xl" : "text-4xl"}`}
              style={{ color: "#000" }}
            >
              {sheet.title || "Untitled"}
            </h1>
            <div className="flex flex-wrap gap-6 text-sm">
              {sheet.key && (
                <span>
                  <span className="uppercase tracking-wider text-xs text-[#373A40]/40 mr-1">Key</span>
                  <span className="font-bold text-black text-base">{sheet.key}</span>
                </span>
              )}
              {sheet.tempo && (
                <span>
                  <span className="uppercase tracking-wider text-xs text-[#373A40]/40 mr-1">Tempo</span>
                  <span className="font-bold text-black text-base">{sheet.tempo} BPM</span>
                </span>
              )}
            </div>
            {sheet.general_notes && (
              <p className={`mt-3 italic text-[#373A40]/60 ${fullscreen ? "text-base" : "text-sm"}`}>
                {sheet.general_notes}
              </p>
            )}
          </div>

          <div className="space-y-10">
            {sheet.sections.map((section) => {
              const lines = (section.content ?? "").split("\n");
              return (
                <div key={section.id}>
                  <div className="mb-4">
                    <span
                      className="text-xs font-bold uppercase tracking-widest px-2 py-1 rounded"
                      style={{ background: "#facc15", color: "#000" }}
                    >
                      {section.label || section.type}
                    </span>
                  </div>
                  <div className="space-y-3 overflow-x-auto">
                    {lines.map((line, i) =>
                      line.trim() === "" ? (
                        <div key={i} className="h-3" />
                      ) : (
                        <ChordLyricLine key={i} line={line} large={fullscreen} />
                      )
                    )}
                  </div>
                  {section.notes && (
                    <p className={`mt-3 italic text-[#373A40]/50 ${fullscreen ? "text-base" : "text-sm"}`}>
                      ↳ {section.notes}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
