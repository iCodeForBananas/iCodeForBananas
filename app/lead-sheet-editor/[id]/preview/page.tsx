"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import { ArrowLeft, Pencil, Maximize2, Minimize2 } from "lucide-react";
import { type LeadSheet, type Section, migrateSection, ChordLyricLine } from "../../shared";

function SheetContent({ sheet, fullscreen }: { sheet: LeadSheet; fullscreen: boolean }) {
  return (
    <div>
      <div className='mb-8 border-b-2 border-black pb-6'>
        <h1
          className={`font-bold leading-tight mb-3 ${fullscreen ? "text-5xl" : "text-4xl"}`}
          style={{ color: "#000" }}
        >
          {sheet.title || "Untitled"}
        </h1>
        <div className='flex flex-wrap gap-6 text-sm'>
          {sheet.key && (
            <span>
              <span className='uppercase tracking-wider text-xs text-[#373A40]/40 mr-1'>Key</span>
              <span className='font-bold text-black text-base'>{sheet.key}</span>
            </span>
          )}
          {sheet.tempo && (
            <span>
              <span className='uppercase tracking-wider text-xs text-[#373A40]/40 mr-1'>Tempo</span>
              <span className='font-bold text-black text-base'>{sheet.tempo} BPM</span>
            </span>
          )}
        </div>
        {sheet.general_notes && (
          <p className={`mt-3 italic text-[#373A40]/60 ${fullscreen ? "text-base" : "text-sm"}`}>
            {sheet.general_notes}
          </p>
        )}
      </div>

      <div className='space-y-10'>
        {sheet.sections.map((section: Section) => {
          const lines = (section.content ?? "").split("\n");
          return (
            <div key={section.id}>
              <div className='mb-4'>
                <span
                  className='text-xs font-bold uppercase tracking-widest px-2 py-1 rounded'
                  style={{ background: "#facc15", color: "#000" }}
                >
                  {section.label || section.type}
                </span>
              </div>
              <div className='space-y-3 overflow-x-auto'>
                {lines.map((line, i) =>
                  line.trim() === "" ? (
                    <div key={i} className='h-3' />
                  ) : (
                    <ChordLyricLine key={i} line={line} large={fullscreen} />
                  ),
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
  );
}

export default function PreviewLeadSheet({ params }: { params: Promise<{ id: string }> }) {
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
    const { data } = await createClient()!.from("lead_sheets").select("*").eq("id", id).single();
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
      <div className='flex flex-col flex-1 min-h-0'>
        <main className='flex flex-col flex-1 min-h-0 p-2 sm:p-4'>
          <div
            className='flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden'
            style={{ background: "#fff", border: "1px solid var(--border-color)" }}
          >
            <div className='flex-1 flex items-center justify-center text-[#373A40]/50'>Loading...</div>
          </div>
        </main>
      </div>
    );
  }

  if (!user || !sheet) {
    return (
      <div className='flex flex-col flex-1 min-h-0'>
        <main className='flex flex-col flex-1 min-h-0 p-2 sm:p-4'>
          <div
            className='flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden'
            style={{ background: "#fff", border: "1px solid var(--border-color)" }}
          >
            <div className='flex-1 flex items-center justify-center text-[#373A40]/50'>Sheet not found.</div>
          </div>
        </main>
      </div>
    );
  }

  if (fullscreen) {
    return (
      <div className='fixed inset-0 z-50 bg-white overflow-y-auto'>
        <div className='max-w-3xl mx-auto px-6 py-8'>
          {/* Toolbar */}
          <div className='flex items-center justify-between mb-8 print:hidden'>
            <button
              onClick={() => setFullscreen(false)}
              className='flex items-center gap-2 text-[#373A40]/50 hover:text-black transition-colors text-sm font-medium'
            >
              <ArrowLeft className='w-4 h-4' />
              Exit Fullscreen
            </button>
            <div className='flex items-center gap-2'>
              <button
                onClick={() => setFullscreen(false)}
                className='flex items-center gap-1.5 rounded border border-[#373A40]/30 px-3 py-2 text-sm font-medium hover:border-black hover:bg-black hover:text-[#facc15] transition-colors'
              >
                <Minimize2 className='w-4 h-4' /> Exit
              </button>
              <button
                onClick={() => router.push(`/lead-sheet-editor/${id}/edit`)}
                className='flex items-center gap-1.5 rounded bg-black px-4 py-2 text-sm font-medium hover:bg-black/80 transition-colors'
                style={{ color: "#facc15" }}
              >
                <Pencil className='w-4 h-4' />
                Edit
              </button>
            </div>
          </div>
          <SheetContent sheet={sheet} fullscreen />
        </div>
      </div>
    );
  }

  return (
    <div className='flex flex-col flex-1 min-h-0'>
      <main className='flex flex-col flex-1 min-h-0 p-2 sm:p-4'>
        <div
          className='flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden'
          style={{ background: "#fff", border: "1px solid var(--border-color)" }}
        >
          {/* Toolbar */}
          <div className='border-b shrink-0 print:hidden' style={{ borderColor: "var(--border-color)" }}>
            <div className='flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4'>
              <button
                onClick={() => router.push("/lead-sheet-editor")}
                className='flex items-center gap-2 text-[#373A40]/50 hover:text-black transition-colors text-sm font-medium'
              >
                <ArrowLeft className='w-4 h-4' />
                All Sheets
              </button>
              <div className='flex items-center gap-2'>
                <button
                  onClick={() => setFullscreen(true)}
                  className='flex items-center gap-1.5 rounded border border-[#373A40]/30 px-3 py-2 text-sm font-medium hover:border-black hover:bg-black hover:text-[#facc15] transition-colors'
                >
                  <Maximize2 className='w-4 h-4' /> Fullscreen
                </button>
                <button
                  onClick={() => router.push(`/lead-sheet-editor/${id}/edit`)}
                  className='flex items-center gap-1.5 rounded bg-black px-4 py-2 text-sm font-medium hover:bg-black/80 transition-colors'
                  style={{ color: "#facc15" }}
                >
                  <Pencil className='w-4 h-4' />
                  Edit
                </button>
              </div>
            </div>
          </div>

          {/* Scrollable content */}
          <div className='flex-1 overflow-auto'>
            <div className='max-w-3xl mx-auto px-6 py-8'>
              <SheetContent sheet={sheet} fullscreen={false} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
