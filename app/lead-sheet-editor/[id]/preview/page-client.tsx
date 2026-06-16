"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import {
  ArrowLeft,
  ArrowRight,
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
  Square,
} from "lucide-react";
import { type LeadSheet, type Section, migrateSection, ChordLyricLine, getPlainText } from "../../shared";

const FONT_SCALE_KEY = "lead-sheet-print-font-scale";
const MIN_SCALE = 70;
const MAX_SCALE = 160;
const SCALE_STEP = 10;

const AUTOSCROLL_SPEED_KEY = "leadSheetScrollSpeed";
const MIN_AUTOSCROLL_SPEED = 0.1;
const MAX_AUTOSCROLL_SPEED = 3.0;
const AUTOSCROLL_SPEED_STEP = 0.1;
const DEFAULT_AUTOSCROLL_SPEED = 0.5;

const MIN_BPM = 20;
const MAX_BPM = 300;
const DEFAULT_BPM = 120;
const BEAT_FLASH_DURATION_MS = 80;

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
    const parsed = saved ? parseFloat(saved) : NaN;
    if (!isNaN(parsed)) return Math.min(MAX_AUTOSCROLL_SPEED, Math.max(MIN_AUTOSCROLL_SPEED, parsed));
  } catch {}
  return DEFAULT_AUTOSCROLL_SPEED;
}


function FontScaleControl({ scale, onChange }: { scale: number; onChange: (next: number) => void }) {
  return (
    <div className='flex items-center gap-1 print:hidden'>
      <button
        type='button'
        onClick={() => onChange(scale - SCALE_STEP)}
        disabled={scale <= MIN_SCALE}
        className='h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-100'
        aria-label='Decrease text size'
      >
        <Minus className='w-4 h-4' />
      </button>
      <span className='text-sm font-medium w-12 text-center text-gray-700 select-none'>{scale}%</span>
      <button
        type='button'
        onClick={() => onChange(scale + SCALE_STEP)}
        disabled={scale >= MAX_SCALE}
        className='h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-100'
        aria-label='Increase text size'
      >
        <Plus className='w-4 h-4' />
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
    <div className='flex items-center flex-wrap gap-2 print:hidden'>
      <button
        type='button'
        onClick={onTogglePlay}
        onDoubleClick={onReset}
        className={`h-10 w-10 flex items-center justify-center rounded-lg font-medium transition-colors duration-150 ${
          isPlaying ? "bg-blue-100 hover:bg-blue-200 text-blue-700" : "bg-gray-100 hover:bg-gray-200 text-gray-700"
        }`}
        aria-label={isPlaying ? "Pause auto-scroll" : "Play auto-scroll"}
        title={isPlaying ? "Pause auto-scroll" : "Play auto-scroll"}
      >
        {isPlaying ? <Pause className='w-4 h-4' /> : <Play className='w-4 h-4' />}
      </button>
      <button
        type='button'
        onClick={onReset}
        className='h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors duration-150'
        aria-label='Reset auto-scroll to top'
        title='Reset to top'
      >
        <RotateCcw className='w-4 h-4' />
      </button>
      <div className='flex items-center gap-1'>
        <span className='text-sm font-medium text-gray-700 select-none'>Speed</span>
        <button
          type='button'
          onClick={() => onSpeedChange(speed - AUTOSCROLL_SPEED_STEP)}
          disabled={speed <= MIN_AUTOSCROLL_SPEED}
          className='h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-100'
          aria-label='Decrease auto-scroll speed'
        >
          <Minus className='w-4 h-4' />
        </button>
        <span className='text-sm font-medium w-12 text-center text-gray-700 select-none'>{speed.toFixed(1)}</span>
        <button
          type='button'
          onClick={() => onSpeedChange(speed + AUTOSCROLL_SPEED_STEP)}
          disabled={speed >= MAX_AUTOSCROLL_SPEED}
          className='h-10 w-10 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-100'
          aria-label='Increase auto-scroll speed'
        >
          <Plus className='w-4 h-4' />
        </button>
      </div>
    </div>
  );
}

function ToolbarDivider() {
  return <div className='hidden md:block h-6 w-px bg-[#373A40]/20 print:hidden' aria-hidden='true' />;
}

function MetronomeControl({
  playing,
  onTogglePlay,
  bpm,
  onBpmChange,
  beatFlash,
}: {
  playing: boolean;
  onTogglePlay: () => void;
  bpm: number;
  onBpmChange: (next: number) => void;
  beatFlash: boolean;
}) {
  return (
    <div className='flex items-center flex-wrap gap-2 print:hidden'>
      <button
        type='button'
        onClick={onTogglePlay}
        className={`h-10 w-10 flex items-center justify-center rounded-lg font-medium transition-colors duration-150 ${
          playing ? "bg-blue-100 hover:bg-blue-200 text-blue-700" : "bg-gray-100 hover:bg-gray-200 text-gray-700"
        }`}
        aria-label={playing ? "Stop metronome" : "Start metronome"}
        title={playing ? "Stop metronome" : "Start metronome"}
      >
        {playing ? <Square className='w-4 h-4' /> : <Play className='w-4 h-4' />}
      </button>
      <div
        className={`w-10 h-10 rounded-full transition-colors duration-75 ${
          playing && beatFlash ? "bg-blue-500" : "bg-blue-200"
        }`}
        aria-hidden='true'
      />
      <label className='flex items-center gap-2 h-10 px-3 rounded-lg bg-gray-100 text-sm font-medium text-gray-700 select-none'>
        BPM
        <input
          type='number'
          min={MIN_BPM}
          max={MAX_BPM}
          value={bpm}
          onChange={(e) => onBpmChange(Number(e.target.value))}
          className='w-16 h-8 rounded border border-gray-300 px-1.5 text-sm text-gray-900 bg-white'
          aria-label='Metronome BPM'
        />
      </label>
    </div>
  );
}

function NextSongControl({
  setIds,
  pos,
  onNext,
}: {
  setIds: string[];
  pos: number;
  onNext: (nextId: string, nextPos: number) => void;
}) {
  const isLast = pos >= setIds.length - 1;
  return (
    <button
      type='button'
      onClick={() => !isLast && onNext(setIds[pos + 1], pos + 1)}
      disabled={isLast}
      className='h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-100 print:hidden'
    >
      {isLast ? "End of Set" : "Next"}
      {!isLast && <ArrowRight className='w-4 h-4' />}
    </button>
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
  const [setIds, setSetIds] = useState<string[] | null>(null);
  const [setPos, setSetPos] = useState(0);
  const [metronomePlaying, setMetronomePlaying] = useState(false);
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const [beatFlash, setBeatFlash] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollSpeedRef = useRef(autoScrollSpeed);

  useEffect(() => {
    if (user) loadSheet();
  }, [user, id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const set = params.get("set");
    const pos = params.get("pos");
    setSetIds(set ? set.split(",").filter(Boolean) : null);
    setSetPos(pos ? parseInt(pos) || 0 : 0);
  }, [id]);

  const goToNextSong = (nextId: string, nextPos: number) => {
    if (!setIds) return;
    router.push(`/lead-sheet-editor/${nextId}/preview?set=${setIds.join(",")}&pos=${nextPos}`);
  };

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
          // autoScrollSpeedRef is px/frame at a 60fps reference rate
          container.scrollTop += autoScrollSpeedRef.current * 60 * delta;
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

  useEffect(() => {
    if (!metronomePlaying) {
      setBeatFlash(false);
      return;
    }

    let flashTimeout: ReturnType<typeof setTimeout>;
    const tick = () => {
      setBeatFlash(true);
      flashTimeout = setTimeout(() => setBeatFlash(false), BEAT_FLASH_DURATION_MS);
    };

    tick();
    const intervalId = setInterval(tick, (60 / bpm) * 1000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(flashTimeout);
    };
  }, [metronomePlaying, bpm]);

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
    const rounded = Math.round(next * 10) / 10;
    const clamped = Math.min(MAX_AUTOSCROLL_SPEED, Math.max(MIN_AUTOSCROLL_SPEED, rounded));
    setAutoScrollSpeed(clamped);
    try {
      localStorage.setItem(AUTOSCROLL_SPEED_KEY, String(clamped));
    } catch {}
  };

  const toggleAutoScroll = () => setIsAutoScrolling((prev) => !prev);

  const toggleMetronome = () => setMetronomePlaying((prev) => !prev);

  const updateBpm = (next: number) => {
    if (isNaN(next)) return;
    setBpm(Math.min(MAX_BPM, Math.max(MIN_BPM, next)));
  };

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
          <div ref={scrollContainerRef} className='fixed inset-0 z-50 bg-white overflow-y-auto overscroll-y-contain'>
            <div className='max-w-3xl mx-auto px-6 py-8'>
              {/* Toolbar */}
              <div className='flex flex-wrap items-center justify-between gap-3 mb-8'>
                <button
                  onClick={() => setFullscreen(false)}
                  className='h-10 flex items-center gap-2 px-3 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors duration-150 text-sm font-medium'
                >
                  <ArrowLeft className='w-4 h-4' />
                  Exit Fullscreen
                </button>
                <div className='flex flex-wrap items-center gap-2'>
                  <FontScaleControl scale={fontScale} onChange={updateFontScale} />
                  <div className='flex flex-col gap-2 md:flex-row md:items-center'>
                    <AutoScrollControl
                      isPlaying={isAutoScrolling}
                      onTogglePlay={toggleAutoScroll}
                      onReset={resetAutoScroll}
                      speed={autoScrollSpeed}
                      onSpeedChange={updateAutoScrollSpeed}
                    />
                    <div className='flex flex-wrap items-center gap-2'>
                      <ToolbarDivider />
                      <MetronomeControl
                        playing={metronomePlaying}
                        onTogglePlay={toggleMetronome}
                        bpm={bpm}
                        onBpmChange={updateBpm}
                        beatFlash={beatFlash}
                      />
                      {setIds && <NextSongControl setIds={setIds} pos={setPos} onNext={goToNextSong} />}
                    </div>
                  </div>
                  <button
                    onClick={handleCopy}
                    className={`h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium transition-colors duration-150 ${
                      copied ? "bg-blue-100 hover:bg-blue-200 text-blue-700" : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                    }`}
                  >
                    {copied ? <Check className='w-4 h-4' /> : <Copy className='w-4 h-4' />}
                    {copied ? "Copied!" : "Copy Text"}
                  </button>
                  <button
                    onClick={handleShare}
                    className={`h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium transition-colors duration-150 ${
                      shared ? "bg-blue-100 hover:bg-blue-200 text-blue-700" : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                    }`}
                  >
                    {shared ? <Check className='w-4 h-4' /> : <Link2 className='w-4 h-4' />}
                    {shared ? "Link Copied!" : "Share"}
                  </button>
                  <button
                    onClick={() => window.print()}
                    className='h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors duration-150'
                  >
                    <Printer className='w-4 h-4' /> Print
                  </button>
                  <button
                    onClick={() => setFullscreen(false)}
                    className='h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors duration-150'
                  >
                    <Minimize2 className='w-4 h-4' /> Exit
                  </button>
                  <button
                    onClick={() => router.push(`/lead-sheet-editor/${id}/edit`)}
                    className='h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium bg-black hover:bg-black/80 transition-colors duration-150'
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
                <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-4'>
                  <button
                    onClick={() => router.push("/lead-sheet-editor")}
                    className='h-10 flex items-center gap-2 px-3 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors duration-150 text-sm font-medium'
                  >
                    <ArrowLeft className='w-4 h-4' />
                    All Sheets
                  </button>
                  <div className='flex flex-wrap items-center gap-2'>
                    <FontScaleControl scale={fontScale} onChange={updateFontScale} />
                    <div className='flex flex-col gap-2 md:flex-row md:items-center'>
                      <AutoScrollControl
                        isPlaying={isAutoScrolling}
                        onTogglePlay={toggleAutoScroll}
                        onReset={resetAutoScroll}
                        speed={autoScrollSpeed}
                        onSpeedChange={updateAutoScrollSpeed}
                      />
                      <div className='flex flex-wrap items-center gap-2'>
                        <ToolbarDivider />
                        <MetronomeControl
                          playing={metronomePlaying}
                          onTogglePlay={toggleMetronome}
                          bpm={bpm}
                          onBpmChange={updateBpm}
                          beatFlash={beatFlash}
                        />
                        {setIds && <NextSongControl setIds={setIds} pos={setPos} onNext={goToNextSong} />}
                      </div>
                    </div>
                    <button
                      onClick={handleCopy}
                      className={`h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium transition-colors duration-150 ${
                        copied ? "bg-blue-100 hover:bg-blue-200 text-blue-700" : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                      }`}
                    >
                      {copied ? <Check className='w-4 h-4' /> : <Copy className='w-4 h-4' />}
                      {copied ? "Copied!" : "Copy Text"}
                    </button>
                    <button
                      onClick={handleShare}
                      className={`h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium transition-colors duration-150 ${
                        shared ? "bg-blue-100 hover:bg-blue-200 text-blue-700" : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                      }`}
                    >
                      {shared ? <Check className='w-4 h-4' /> : <Link2 className='w-4 h-4' />}
                      {shared ? "Link Copied!" : "Share"}
                    </button>
                    <button
                      onClick={() => window.print()}
                      className='h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors duration-150'
                    >
                      <Printer className='w-4 h-4' /> Print
                    </button>
                    <button
                      onClick={() => setFullscreen(true)}
                      className='h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors duration-150'
                    >
                      <Maximize2 className='w-4 h-4' /> Fullscreen
                    </button>
                    <button
                      onClick={() => router.push(`/lead-sheet-editor/${id}/edit`)}
                      className='h-10 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium bg-black hover:bg-black/80 transition-colors duration-150'
                      style={{ color: "#facc15" }}
                    >
                      <Pencil className='w-4 h-4' />
                      Edit
                    </button>
                  </div>
                </div>
              </div>

              {/* Scrollable content */}
              <div ref={scrollContainerRef} className='flex-1 overflow-auto overscroll-y-contain'>
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
