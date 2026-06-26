"use client";

import { useState, useEffect, use } from "react";
import { Minus, Plus, Printer } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { type LeadSheet, type Section, migrateSection, ChordLyricLine } from "../../shared";

const FONT_SCALE_KEY = "lead-sheet-print-font-scale";
const MIN_SCALE = 70;
const MAX_SCALE = 160;
const SCALE_STEP = 10;

function loadFontScale(): number {
  if (typeof window === "undefined") return 100;
  try {
    const saved = localStorage.getItem(FONT_SCALE_KEY);
    const parsed = saved ? parseInt(saved) : NaN;
    if (!isNaN(parsed)) return Math.min(MAX_SCALE, Math.max(MIN_SCALE, parsed));
  } catch {}
  return 100;
}

function SheetContent({ sheet }: { sheet: LeadSheet }) {
  return (
    <div>
      <div className='mb-8 border-b-2 border-black dark:border-white/30 pb-6'>
        <h1 className='font-bold leading-tight mb-3 text-[2.25em] text-black dark:text-white'>
          {sheet.title || "Untitled"}
        </h1>
        <div className='flex flex-wrap gap-6 text-[0.875em]'>
          {sheet.key && (
            <span>
              <span className='uppercase tracking-wider text-[0.75em] text-[#373A40]/40 dark:text-white/40 mr-1'>Key</span>
              <span className='font-bold text-black dark:text-white text-[1em]'>{sheet.key}</span>
            </span>
          )}
          {sheet.tempo && (
            <span>
              <span className='uppercase tracking-wider text-[0.75em] text-[#373A40]/40 dark:text-white/40 mr-1'>Tempo</span>
              <span className='font-bold text-black dark:text-white text-[1em]'>{sheet.tempo} BPM</span>
            </span>
          )}
        </div>
        {sheet.general_notes && (
          <p className='mt-3 italic text-[#373A40]/60 dark:text-white/60 text-[0.875em]'>{sheet.general_notes}</p>
        )}
      </div>

      <div className='space-y-10'>
        {sheet.sections.map((section: Section) => {
          const lines = (section.content ?? "").split("\n");
          return (
            <div key={section.id} style={{ breakInside: "avoid" }}>
              <div className='mb-4'>
                <span
                  className='text-[0.75em] font-bold uppercase tracking-widest px-2 py-1 rounded'
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
                    <ChordLyricLine key={i} line={line} />
                  ),
                )}
              </div>
              {section.notes && (
                <p className='mt-3 italic text-[#373A40]/50 dark:text-white/50 text-[0.875em]'>↳ {section.notes}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ShareLeadSheet({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [sheet, setSheet] = useState<LeadSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [fontScale, setFontScale] = useState(loadFontScale);

  useEffect(() => {
    async function loadSheet() {
      const { data } = await createClient()!.from("lead_sheets").select("*").eq("id", id).single();
      if (data) {
        setSheet({ ...data, sections: data.sections.map(migrateSection) });
      }
      setLoading(false);
    }
    loadSheet();
  }, [id]);

  const updateFontScale = (next: number) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    setFontScale(clamped);
    try {
      localStorage.setItem(FONT_SCALE_KEY, String(clamped));
    } catch {}
  };

  if (loading) {
    return (
      <div className='min-h-screen bg-white dark:bg-neutral-900 flex items-center justify-center'>
        <span className='text-[#373A40]/50 dark:text-white/50 text-sm'>Loading...</span>
      </div>
    );
  }

  if (!sheet) {
    return (
      <div className='min-h-screen bg-white dark:bg-neutral-900 flex items-center justify-center'>
        <span className='text-[#373A40]/50 dark:text-white/50 text-sm'>Sheet not found.</span>
      </div>
    );
  }

  return (
    <>
      {/* Print-only view */}
      <div className='hidden print:block' style={{ background: "#fff", color: "#000" }}>
        <div className='max-w-3xl mx-auto px-6 py-8' style={{ fontSize: `${fontScale}%` }}>
          <SheetContent sheet={sheet} />
        </div>
      </div>

      {/* Screen view */}
      <div className='print:hidden min-h-screen bg-white dark:bg-neutral-900'>
        <div className='max-w-3xl mx-auto px-6 pt-8'>
          <div className='flex items-center justify-between mb-8'>
            <span className='text-xs text-[#373A40]/40 dark:text-white/40 font-medium tracking-wider uppercase'>
              iCodeForBananas
            </span>
            <div className='flex items-center gap-2'>
              <div className='flex items-center gap-1 rounded border border-[#373A40]/20 dark:border-white/20'>
                <button
                  type='button'
                  onClick={() => updateFontScale(fontScale - SCALE_STEP)}
                  disabled={fontScale <= MIN_SCALE}
                  className='p-2 text-[#373A40]/50 dark:text-white/50 hover:text-black dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors'
                  aria-label='Decrease text size'
                >
                  <Minus className='w-3.5 h-3.5' />
                </button>
                <span className='text-xs font-medium w-10 text-center text-[#373A40]/50 dark:text-white/50 select-none'>
                  {fontScale}%
                </span>
                <button
                  type='button'
                  onClick={() => updateFontScale(fontScale + SCALE_STEP)}
                  disabled={fontScale >= MAX_SCALE}
                  className='p-2 text-[#373A40]/50 dark:text-white/50 hover:text-black dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors'
                  aria-label='Increase text size'
                >
                  <Plus className='w-3.5 h-3.5' />
                </button>
              </div>
              <button
                onClick={() => window.print()}
                className='flex items-center gap-1.5 rounded border border-[#373A40]/20 dark:border-white/20 px-3 py-2 text-sm font-medium text-[#373A40]/60 dark:text-white/60 hover:border-black dark:hover:border-white hover:bg-black hover:text-yellow-400 transition-colors'
              >
                <Printer className='w-4 h-4' /> Print
              </button>
            </div>
          </div>
        </div>
        <div className='max-w-3xl mx-auto px-6 pb-16' style={{ fontSize: `${fontScale}%` }}>
          <SheetContent sheet={sheet} />
        </div>
      </div>
    </>
  );
}
