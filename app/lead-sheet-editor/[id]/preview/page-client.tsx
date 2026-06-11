"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import {
  ArrowLeft,
  Pencil,
  Maximize2,
  Minimize2,
  Printer,
  Minus,
  Plus,
  Copy,
  Check,
  Link2,
  Play,
  Pause,
  RotateCcw,
} from "lucide-react";
import { type LeadSheet, type Section, migrateSection, ChordLyricLine, getPlainText } from "../../shared";

const FONT_SCALE_KEY = "lead-sheet-print-font-scale";
const MIN_SCALE = 70;
const MAX_SCALE = 160;
const SCALE_STEP = 10;

const AUTOSCROLL_SPEED_KEY = "lead-sheet-autoscroll-speed";
const MIN_AUTOSCROLL_SPEED = 10;
const MAX_AUTOSCROLL_SPEED = 200;
const AUTOSCROLL_SPEED_STEP = 10;
const DEFAULT_AUTOSCROLL_SPEED = 40;

function loadFontScale(): number {
  if (typeof window === "undefined") return 100;
  try {
    const saved = localStorage.getItem(FONT_SCALE_KEY);
    const parsed = saved ? parseInt(saved) : NaN;
    if (!isNaN(parsed)) return Math.min(MAX_SCALE, Math.max(MIN_SCALE, parsed));
  } catch {}
  return 100;
}

function loadAutoScrollSpeed(): number {
  if (typeof window === "undefined") return DEFAULT_AUTOSCROLL_SPEED;
  try {
    const saved = localStorage.getItem(AUTOSCROLL_SPEED_KEY);
    const parsed = saved ? parseInt(saved) : NaN;
    if (!isNaN(parsed)) return Math.min(MAX_AUTOSCROLL_SPEED, Math.max(MIN_AUTOSCROLL_SPEED, parsed));
  } catch {}
  return DEFAULT_AUTOSCROLL_SPEED;
}


function FontScaleControl({ scale, onChange }: { scale: number; onChange: (next: number) => void }) {
  return (
    <div className='flex items-center gap-1 rounded border border-[#373A40]/30 print:hidden'>
      <button
        type='button'
        onClick={() => onChange(scale - SCALE_STEP)}
        disabled={scale <= MIN_SCALE}
        className='p-2 text-[#373A40]/60 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors'
        aria-label='Decrease text size'
      >
        <Minus className='w-3.5 h-3.5' />
      </button>
      <span className='text-xs font-medium w-10 text-center text-[#373A40]/60 select-none'>{scale}%</span>
      <button
        type='button'
        onClick={() => onChange(scale + SCALE_STEP)}
        disabled={scale >= MAX_SCALE}
        className='p-2 text-[#373A40]/60 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors'
        aria-label='Increase text size'
      >
        <Plus className='w-3.5 h-3.5' />
      </button>
    </div>
  );
}

function AutoScrollControl({
  isPlaying,
  onTogglePlay,
  onReset,
  speed,
  onSpeedChange,
}: {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onReset: () => void;
  speed: number;
  onSpeedChange: (next: number) => void;
}) {
  return (
    <div className='flex items-center gap-2 rounded border border-[#373A40]/30 px-2 py-1.5 print:hidden'>
      <button
        type='button'
        onClick={onTogglePlay}
        onDoubleClick={onReset}
        className='p-1 text-[#373A40]/60 hover:text-black transition-colors'
        aria-label={isPlaying ? "Pause auto-scroll" : "Play auto-scroll"}
        title={isPlaying ? "Pause auto-scroll" : "Play auto-scroll"}
      >
        {isPlaying ? <Pause className='w-4 h-4' /> : <Play className='w-4 h-4' />}
      </button>
      <button
        type='button'
        onClick={onReset}
        className='p-1 text-[#373A40]/60 hover:text-black transition-colors'
        aria-label='Reset auto-scroll to top'
        title='Reset to top'
      >
        <RotateCcw className='w-4 h-4' />
      </button>
      <label className='flex items-center gap-1.5 text-xs font-medium text-[#373A40]/60 select-none'>
        Speed
        <input
          type='range'
          min={MIN_AUTOSCROLL_SPEED}
          max={MAX_AUTOSCROLL_SPEED}
          step={AUTOSCROLL_SPEED_STEP}
          value={speed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          className='w-20 accent-black'
          aria-label='Auto-scroll speed'
        />
      </label>
    </div>
  );
}

function SheetContent({ sheet, fullscreen }: { sheet: LeadSheet; fullscreen: boolean }) {
  return (
    <div>
      <div className='mb-8 border-b-2 border-black pb-6'>
        <h1
          className={`font-bold leading-tight mb-3 ${fullscreen ? "text-[3em]" : "text-[2.25em]"}`}
          style={{ color: "#000" }}
        >
          {sheet.title || "Untitled"}
        </h1>
        <div className='flex flex-wrap gap-6 text-[0.875em]'>
          {sheet.key && (
            <span>
              <span className='uppercase tracking-wider text-[0.75em] text-[#373A40]/40 mr-1'>Key</span>
              <span className='font-bold text-black text-[1em]'>{sheet.key}</span>
            </span>
          )}
          {sheet.tempo && (
            <span>
              <span className='uppercase tracking-wider text-[0.75em] text-[#373A40]/40 mr-1'>Tempo</span>
              <span className='font-bold text-black text-[1em]'>{sheet.tempo} BPM</span>
            </span>
          )}
        </div>
        {sheet.general_notes && (
          <p className={`mt-3 italic text-[#373A40]/60 ${fullscreen ? "text-[1em]" : "text-[0.875em]"}`}>
            {sheet.general_notes}
          </p>
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
                    <ChordLyricLine key={i} line={line} large={fullscreen} />
                  ),
                )}
              </div>
              {section.notes && (
                <p className={`mt-3 italic text-[#373A40]/50 ${fullscreen ? "text-[1em]" : "text-[0.875em]"}`}>
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
  const [fontScale, setFontScale] = useState(loadFontScale);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState(loadAutoScrollSpeed);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollSpeedRef = useRef(autoScrollSpeed);

  useEffect(() => {
    if (user) loadSheet();
  }, [user, id]);

  useEffect(() => {
    autoScrollSpeedRef.current = autoScrollSpeed;
  }, [autoScrollSpeed]);

  useEffect(() => {
    if (!isAutoScrolling) return;

    let lastTime: number | null = null;
    let rafId: number;

    const step = (timestamp: number) => {
      const container = scrollContainerRef.current;
      if (container) {
        if (lastTime !== null) {
          const delta = (timestamp - lastTime) / 1000;
          container.scrollTop += autoScrollSpeedRef.current * delta;
          if (container.scrollTop + container.clientHeight >= container.scrollHeight - 1) {
            setIsAutoScrolling(false);
            return;
          }
        }
        lastTime = timestamp;
      }
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [isAutoScrolling]);

  const handleCopy = async () => {
    if (!sheet) return;
    await navigator.clipboard.writeText(getPlainText(sheet));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/lead-sheet-editor/share/${id}`);
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  };

  const updateFontScale = (next: number) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    setFontScale(clamped);
    try {
      localStorage.setItem(FONT_SCALE_KEY, String(clamped));
    } catch {}
  };

  const updateAutoScrollSpeed = (next: number) => {
    const clamped = Math.min(MAX_AUTOSCROLL_SPEED, Math.max(MIN_AUTOSCROLL_SPEED, next));
    setAutoScrollSpeed(clamped);
    try {
      localStorage.setItem(AUTOSCROLL_SPEED_KEY, String(clamped));
    } catch {}
  };

  const toggleAutoScroll = () => setIsAutoScrolling((prev) => !prev);

  const resetAutoScroll = () => {
    setIsAutoScrolling(false);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  };

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

  return (
    <>
      {/* Print-only view: chrome-free layout that only renders when printing.
          The screen view below is hidden via print:hidden so only this prints. */}
      <div className='hidden print:block' style={{ background: "#fff", color: "#000" }}>
        <div className='max-w-3xl mx-auto px-2 py-4' style={{ fontSize: `${fontScale}%` }}>
          <SheetContent sheet={sheet} fullscreen={false} />
        </div>
      </div>

      {/* Screen view */}
      <div className='print:hidden flex flex-col flex-1 min-h-0'>
        {fullscreen ? (
          <div ref={scrollContainerRef} className='fixed inset-0 z-50 bg-white overflow-y-auto'>
            <div className='max-w-3xl mx-auto px-6 py-8'>
              {/* Toolbar */}
              <div className='flex flex-wrap items-center justify-between gap-3 mb-8'>
                <button
                  onClick={() => setFullscreen(false)}
                  className='flex items-center gap-2 text-[#373A40]/50 hover:text-black transition-colors text-sm font-medium'
                >
                  <ArrowLeft className='w-4 h-4' />
                  Exit Fullscreen
                </button>
                <div className='flex items-center gap-2'>
                  <FontScaleControl scale={fontScale} onChange={updateFontScale} />
                  <AutoScrollControl
                    isPlaying={isAutoScrolling}
                    onTogglePlay={toggleAutoScroll}
                    onReset={resetAutoScroll}
                    speed={autoScrollSpeed}
                    onSpeedChange={updateAutoScrollSpeed}
                  />
                  <button
                    onClick={handleCopy}
                    className='flex items-center gap-1.5 rounded border border-[#373A40]/30 px-3 py-2 text-sm font-medium hover:border-black hover:bg-black hover:text-[#facc15] transition-colors'
                  >
                    {copied ? <Check className='w-4 h-4' /> : <Copy className='w-4 h-4' />}
                    {copied ? "Copied!" : "Copy Text"}
                  </button>
                  <button
                    onClick={handleShare}
                    className='flex items-center gap-1.5 rounded border border-[#373A40]/30 px-3 py-2 text-sm font-medium hover:border-black hover:bg-black hover:text-[#facc15] transition-colors'
                  >
                    {shared ? <Check className='w-4 h-4' /> : <Link2 className='w-4 h-4' />}
                    {shared ? "Link Copied!" : "Share"}
                  </button>
                  <button
                    onClick={() => window.print()}
                    className='flex items-center gap-1.5 rounded border border-[#373A40]/30 px-3 py-2 text-sm font-medium hover:border-black hover:bg-black hover:text-[#facc15] transition-colors'
                  >
                    <Printer className='w-4 h-4' /> Print
                  </button>
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
              <div style={{ fontSize: `${fontScale}%` }}>
                <SheetContent sheet={sheet} fullscreen />
              </div>
            </div>
          </div>
        ) : (
          <main className='flex flex-col flex-1 min-h-0 p-2 sm:p-4'>
            <div
              className='flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden'
              style={{ background: "#fff", border: "1px solid var(--border-color)" }}
            >
              {/* Toolbar */}
              <div className='border-b shrink-0' style={{ borderColor: "var(--border-color)" }}>
                <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4'>
                  <button
                    onClick={() => router.push("/lead-sheet-editor")}
                    className='flex items-center gap-2 text-[#373A40]/50 hover:text-black transition-colors text-sm font-medium'
                  >
                    <ArrowLeft className='w-4 h-4' />
                    All Sheets
                  </button>
                  <div className='flex items-center gap-2'>
                    <FontScaleControl scale={fontScale} onChange={updateFontScale} />
                    <AutoScrollControl
                      isPlaying={isAutoScrolling}
                      onTogglePlay={toggleAutoScroll}
                      onReset={resetAutoScroll}
                      speed={autoScrollSpeed}
                      onSpeedChange={updateAutoScrollSpeed}
                    />
                    <button
                      onClick={handleCopy}
                      className='flex items-center gap-1.5 rounded border border-[#373A40]/30 px-3 py-2 text-sm font-medium hover:border-black hover:bg-black hover:text-[#facc15] transition-colors'
                    >
                      {copied ? <Check className='w-4 h-4' /> : <Copy className='w-4 h-4' />}
                      {copied ? "Copied!" : "Copy Text"}
                    </button>
                    <button
                      onClick={handleShare}
                      className='flex items-center gap-1.5 rounded border border-[#373A40]/30 px-3 py-2 text-sm font-medium hover:border-black hover:bg-black hover:text-[#facc15] transition-colors'
                    >
                      {shared ? <Check className='w-4 h-4' /> : <Link2 className='w-4 h-4' />}
                      {shared ? "Link Copied!" : "Share"}
                    </button>
                    <button
                      onClick={() => window.print()}
                      className='flex items-center gap-1.5 rounded border border-[#373A40]/30 px-3 py-2 text-sm font-medium hover:border-black hover:bg-black hover:text-[#facc15] transition-colors'
                    >
                      <Printer className='w-4 h-4' /> Print
                    </button>
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
              <div ref={scrollContainerRef} className='flex-1 overflow-auto'>
                <div className='max-w-3xl mx-auto px-6 py-8' style={{ fontSize: `${fontScale}%` }}>
                  <SheetContent sheet={sheet} fullscreen={false} />
                </div>
              </div>
            </div>
          </main>
        )}
      </div>
    </>
  );
}
