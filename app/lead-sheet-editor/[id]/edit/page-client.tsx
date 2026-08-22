"use client";

import { useState, useEffect, useMemo, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import { Save, ArrowLeft, Eye, Replace, X, Sparkles, Play, Timer, TimerOff, Clock, HelpCircle, SlidersHorizontal } from "lucide-react";
import { RevisionHistory } from "../../RevisionHistory";
import {
  type LeadSheet,
  type LeadSheetMetadata,
  type Section,
  type SectionType,
  migrateSection,
  OfflineBadge,
} from "../../shared";
import { asSectionHeader, isChordName } from "../../songText";
import { cacheSheet, getCachedSheet } from "../../offlineCache";
import { clearAllMarkers, parseTimeMarker } from "../../timing";
import {
  type DrumSettings,
  DEFAULT_DRUM_SETTINGS,
  formatDrumSettings,
  hasDrumSettingsLine,
  isDefaultDrumSettings,
  normalizeDrumSettings,
  parseDrumSettingsLine,
  stripDrumSettings,
} from "../../DrumMachine";
import TapTiming from "../../TapTiming";
import TrackEditor from "../../TrackEditor";
import SyntaxHelp from "../../SyntaxHelp";

// ─── Text ↔ LeadSheet ─────────────────────────────────────────────────────────

function inferSectionType(label: string): SectionType {
  const l = label.toLowerCase();
  if (l.includes("intro")) return "intro";
  if (l.includes("pre-chorus") || l.includes("prechorus") || l.includes("pre chorus")) return "pre-chorus";
  if (l.includes("chorus")) return "chorus";
  if (l.includes("verse")) return "verse";
  if (l.includes("bridge")) return "bridge";
  if (l.includes("outro")) return "outro";
  return "other";
}

// ─── Bulk chord replace ───────────────────────────────────────────────────────

// Every inline [X] that reads as a chord, with how often it appears. Section
// headers ([Chorus]) are skipped so they can never be renamed by a replace.
function collectChords(text: string): { chord: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const line of text.split("\n")) {
    if (asSectionHeader(line) !== null) continue;
    for (const m of line.matchAll(/\[([^\[\]]*)\]/g)) {
      const inner = m[1].trim();
      if (!isChordName(inner)) continue;
      counts.set(inner, (counts.get(inner) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([chord, count]) => ({ chord, count }))
    .sort((a, b) => a.chord.localeCompare(b.chord));
}

function replaceChord(text: string, from: string, to: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (asSectionHeader(line) !== null) return line;
      return line.replace(/\[([^\[\]]*)\]/g, (full, inner) =>
        inner.trim() === from ? `[${to}]` : full
      );
    })
    .join("\n");
}

function serializeSheet(sheet: LeadSheet): string {
  const parts: string[] = [sheet.title || ""];

  const meta: string[] = [];
  if (sheet.key) meta.push(`Key: ${sheet.key}`);
  if (sheet.tempo) meta.push(`Tempo: ${sheet.tempo}`);
  if (meta.length) parts.push(meta.join("  "));

  // A kit left at defaults isn't worth a line — songs you never touched the
  // drums on stay clean. Changing anything writes the line on the next open.
  const drums = normalizeDrumSettings(sheet.metadata?.drums);
  if (!isDefaultDrumSettings(drums)) parts.push(formatDrumSettings(drums));

  parts.push("");

  if (sheet.general_notes) {
    parts.push(sheet.general_notes);
    parts.push("");
  }

  for (const section of sheet.sections) {
    parts.push(`[${section.label || section.type}]`);
    if (section.content) parts.push(section.content);
    if (section.notes) {
      for (const line of section.notes.split("\n")) {
        parts.push(line.trim() ? `> ${line}` : "");
      }
    }
    parts.push("");
  }

  return parts.join("\n").trimEnd();
}

function parseText(text: string): Partial<LeadSheet> {
  const lines = text.split("\n");
  let i = 0;

  // Title: first non-empty line
  while (i < lines.length && !lines[i].trim()) i++;
  const title = i < lines.length ? lines[i++].trim() : "";

  let key = "";
  let tempo: number | null = null;
  let drums: DrumSettings | null = null;
  const preambleLines: string[] = [];

  // Preamble: lines before first section header
  while (i < lines.length && asSectionHeader(lines[i]) === null) {
    const line = lines[i++];
    const keyMatch = line.match(/Key:\s*([A-G][#b]?m?)\b/i);
    const tempoMatch = line.match(/\bTempo:\s*(\d+)\b/i);
    const drumMatch = hasDrumSettingsLine(line);
    if (keyMatch) key = keyMatch[1];
    if (tempoMatch) tempo = parseInt(tempoMatch[1]);
    if (drumMatch) drums = parseDrumSettingsLine(line);
    if (keyMatch || tempoMatch || drumMatch) {
      const stripped = stripDrumSettings(line)
        .replace(/Key:\s*[A-G][#b]?m?\b/gi, "")
        .replace(/\bTempo:\s*\d+\b/gi, "")
        .replace(/\|/g, "")
        .trim();
      if (stripped) preambleLines.push(stripped);
    } else {
      preambleLines.push(line);
    }
  }

  const general_notes = preambleLines.join("\n").trim();
  // No line means the kit is back to defaults — deleting it resets the song.
  const metadata: LeadSheetMetadata = { drums: drums ?? DEFAULT_DRUM_SETTINGS };

  // Sections
  const sections: Section[] = [];
  while (i < lines.length) {
    const label = asSectionHeader(lines[i]);
    if (label !== null) {
      i++;
      const contentLines: string[] = [];
      const notesLines: string[] = [];
      while (i < lines.length && asSectionHeader(lines[i]) === null) {
        const line = lines[i++];
        if (line.startsWith("> ")) {
          notesLines.push(line.slice(2));
        } else {
          contentLines.push(line);
        }
      }
      while (contentLines.length > 0 && !contentLines[contentLines.length - 1].trim()) {
        contentLines.pop();
      }
      sections.push({
        id: crypto.randomUUID(),
        type: inferSectionType(label),
        label,
        content: contentLines.join("\n"),
        notes: notesLines.join("\n").trim(),
      });
    } else {
      i++;
    }
  }

  return { title, key, tempo, general_notes, metadata, sections };
}

// ─── AI feedback ──────────────────────────────────────────────────────────────

const FEEDBACK_OPTIONS: { label: string; prompt: string }[] = [
  {
    label: "Rhyme check",
    prompt:
      "Review this song's rhyme scheme. Do the rhymes land naturally, or do any feel forced? Suggest specific improvements where the rhyming could be stronger.",
  },
  {
    label: "Lyric flow",
    prompt:
      "Analyze the lyric flow and rhythm of this song. Are there any lines that feel choppy, awkward, or hard to sing? Suggest smoother alternatives where needed.",
  },
  {
    label: "Chord progression",
    prompt:
      "Review the chord progression in this song. Is it well-suited to the genre and emotional feel? Suggest any alternate progressions that might work better or add more interest.",
  },
  {
    label: "Hook strength",
    prompt:
      "Evaluate the hook and chorus of this song. Is it memorable and earworm-worthy? What makes it stick (or not), and how could it be improved?",
  },
  {
    label: "Overall songwriting",
    prompt:
      "Give me comprehensive feedback on this song as a complete piece — lyrics, chord progression, structure, hook, and overall feel. I'm going for something catchy and memorable.",
  },
  {
    label: "Line rewrite suggestions",
    prompt:
      "Go through this song line by line and suggest at least 2–3 alternative versions for any lines that could be punchier, more vivid, or more singable.",
  },
];

const PLACEHOLDER = `Song Title
Key: G  Tempo: 120
Drums: Folk Stomp, folk kick, regular snare, 80%

Performance notes (capo, feel, strumming pattern)...

[Verse 1]
@0:00 [drum]
@0:12 [G]Driving down an [D]empty road, [Em]windows down and [C]radio on
@0:18 [G]Nothing but the [D]open sky as [Em]far as I can [C]see
> Use light fingerpicking

[Chorus]
@0:24 [G]Take me [D]somewhere [Em]new

Start a line with @m:ss to say when it comes in — hit Play to follow along, or
open Arrange to drag every line and drum hit around on tracks.
Mark a stamped line [drum] to start the drum machine there, [/drum] to stop it — Help
in the toolbar lists everything a song can carry.
Paste a YouTube link anywhere in the song and Play rides the recording instead of a
stopwatch. Add ?t=15 to the link if the song only starts 15 seconds into the video.`;

// ─── Edit page ────────────────────────────────────────────────────────────────

export default function EditLeadSheet({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [offline, setOffline] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [findChord, setFindChord] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [replaceResult, setReplaceResult] = useState("");
  const [tapOpen, setTapOpen] = useState(false);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  /** Timestamp of last revision snapshot, to throttle auto-save revisions */
  const lastRevisionAt = useRef<number>(0);
  /** Metadata as loaded, so a save can't drop keys the text doesn't carry. */
  const sheetMetadata = useRef<LeadSheetMetadata>({});

  const chordsInSheet = useMemo(
    () => (replaceOpen ? collectChords(rawText) : []),
    [replaceOpen, rawText]
  );
  const timingCount = useMemo(
    () => rawText.split("\n").filter((line) => parseTimeMarker(line) !== null).length,
    [rawText]
  );
  const hasTiming = timingCount > 0;
  const findCount = chordsInSheet.find((c) => c.chord === findChord)?.count ?? 0;
  const newChord = replaceWith.trim().replace(/^\[|\]$/g, "").trim();
  const canReplace =
    findCount > 0 && newChord.length > 0 && newChord !== findChord && !/[\[\]]/.test(newChord);

  const getSb = () => {
    if (!sbRef.current) sbRef.current = createClient();
    return sbRef.current!;
  };

  useEffect(() => {
    if (user) loadSheet();
  }, [user, id]);

  // Autosave: debounce 1.5s; rawText in deps gives a fresh closure on each change
  useEffect(() => {
    if (!dirty || !sheetId) return;
    const timer = setTimeout(saveSheet, 1500);
    return () => clearTimeout(timer);
  }, [rawText, dirty, sheetId]);

  async function loadSheet() {
    setLoading(true);
    try {
      const { data, error } = await getSb().from("lead_sheets").select("*").eq("id", id).single();
      if (error) throw error;
      if (data) {
        setSheetId(data.id);
        const sheet: LeadSheet = { ...data, sections: data.sections.map(migrateSection) };
        sheetMetadata.current = sheet.metadata ?? {};
        setRawText(serializeSheet(sheet));
        setOffline(false);
        await cacheSheet(data);
      }
    } catch {
      const cached = await getCachedSheet(id);
      if (cached) {
        setSheetId(cached.id);
        const sheet: LeadSheet = { ...cached, sections: cached.sections.map(migrateSection) };
        sheetMetadata.current = sheet.metadata ?? {};
        setRawText(serializeSheet(sheet));
        setOffline(true);
      }
    }
    setLoading(false);
  }

  async function saveSheet(manual = false) {
    if (!sheetId) return;
    setSaving(true);
    setSaveError(false);
    const parsed = parseText(rawText);
    try {
      const { error } = await getSb()
        .from("lead_sheets")
        .update({
          title: parsed.title ?? "",
          key: parsed.key ?? "",
          tempo: parsed.tempo ?? null,
          general_notes: parsed.general_notes ?? "",
          // Merge so keys this editor doesn't know about survive a save.
          metadata: { ...sheetMetadata.current, ...parsed.metadata },
          sections: parsed.sections ?? [],
          updated_at: new Date().toISOString(),
        })
        .eq("id", sheetId);
      if (error) throw error;
      setDirty(false);
      setSaveError(false);

      // Save a revision snapshot:
      //   • always on manual saves
      //   • on auto-saves, at most once every 5 minutes
      const now = Date.now();
      const shouldSnapshot = manual || (now - lastRevisionAt.current > 5 * 60 * 1000);
      if (shouldSnapshot) {
        lastRevisionAt.current = now;
        const sb = getSb();
        // Insert new revision
        await sb
          .from("lead_sheet_revisions")
          .insert({ lead_sheet_id: sheetId, raw_text: rawText });
        // Prune to 100 most recent
        const { data: all } = await sb
          .from("lead_sheet_revisions")
          .select("id")
          .eq("lead_sheet_id", sheetId)
          .order("created_at", { ascending: false });
        if (all && all.length > 100) {
          const toDelete = all.slice(100).map((r: { id: string }) => r.id);
          await sb.from("lead_sheet_revisions").delete().in("id", toDelete);
        }
      }
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  function handleChange(value: string) {
    setRawText(value);
    setDirty(true);
  }

  // Strips every @m:ss marker so the song can be re-timed from scratch later.
  // It lands as an ordinary text edit, so Save/History can walk it back.
  function handleClearTimings() {
    if (!hasTiming) return;
    const label = `${timingCount} time stamp${timingCount === 1 ? "" : "s"}`;
    if (!confirm(`Remove all ${label} from this song? The lyrics and chords stay put.`)) return;
    handleChange(clearAllMarkers(rawText));
  }

  function openReplace() {
    const chords = collectChords(rawText);
    setFindChord(chords[0]?.chord ?? "");
    setReplaceWith("");
    setReplaceResult("");
    setReplaceOpen(true);
    setTimeout(() => replaceInputRef.current?.focus(), 0);
  }

  function closeReplace() {
    setReplaceOpen(false);
    setReplaceResult("");
  }

  function applyReplace() {
    if (!canReplace) return;
    const count = findCount;
    const next = replaceChord(rawText, findChord, newChord);
    handleChange(next);
    setReplaceResult(
      `Replaced ${count} ${count === 1 ? "instance" : "instances"} of [${findChord}] with [${newChord}]`
    );
    // Keep the dropdown pointed at something real — an unrecognized chord name
    // won't come back from collectChords.
    const remaining = collectChords(next);
    setFindChord(
      remaining.some((c) => c.chord === newChord) ? newChord : remaining[0]?.chord ?? ""
    );
    setReplaceWith("");
    replaceInputRef.current?.focus();
  }

  function handleAiFeedback(e: React.ChangeEvent<HTMLSelectElement>) {
    const label = e.target.value;
    e.target.value = "";
    const option = FEEDBACK_OPTIONS.find((o) => o.label === label);
    if (!option) return;

    const parsed = parseText(rawText);
    const title = parsed.title || "Untitled";
    const key = parsed.key || "Unknown";
    const content = (parsed.sections ?? [])
      .map((s) => `[${s.label}]\n${s.content}`.trim())
      .join("\n\n");

    const fullPrompt = `${option.prompt}\n\n---\nSong: ${title}\nKey: ${key}\n\n${content}`;
    window.open(`https://claude.ai/new?q=${encodeURIComponent(fullPrompt)}`, "_blank");
  }

  async function handlePreview() {
    if (dirty) await saveSheet();
    router.push(`/lead-sheet-editor/${id}/preview`);
  }

  // Play always runs against the saved sheet, so timings typed a second ago count.
  async function handlePlay() {
    if (dirty) await saveSheet();
    router.push(`/lead-sheet-editor/${id}/preview?play=1`);
  }

  function handleBack() {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    router.push("/lead-sheet-editor");
  }

  if (authLoading || loading) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        {/* min-h-0! beats the global `main { min-height: 100vh }`, which would
            otherwise hold the editor at full height when a phone keyboard
            shrinks the viewport and push the text under the keyboard. */}
        <main className="flex flex-col flex-1 min-h-0! p-2 sm:p-4">
          <div className="flex flex-col flex-1 min-h-0 rounded-none border-none bg-black overflow-hidden">
            <div className="flex-1 flex items-center justify-center text-white/50">Loading...</div>
          </div>
        </main>
      </div>
    );
  }

  if (!user || !sheetId) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        {/* min-h-0! beats the global `main { min-height: 100vh }`, which would
            otherwise hold the editor at full height when a phone keyboard
            shrinks the viewport and push the text under the keyboard. */}
        <main className="flex flex-col flex-1 min-h-0! p-2 sm:p-4">
          <div className="flex flex-col flex-1 min-h-0 rounded-none border-none bg-black overflow-hidden">
            <div className="flex-1 flex items-center justify-center text-white/50">Sheet not found.</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <main className="flex flex-col flex-1 min-h-0 p-2 sm:p-4">
        <div className="flex flex-col flex-1 min-h-0 rounded-none border-none bg-black overflow-hidden">
          {/* Toolbar */}
          <div className="shrink-0">
            <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
              <button
                onClick={handleBack}
                className="flex items-center gap-2 text-white/50 hover:text-black dark:hover:text-white transition-colors text-sm font-medium"
              >
                <ArrowLeft className="w-4 h-4" />
                All Sheets
              </button>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {offline && <OfflineBadge />}
                {saveError && (
                  <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                    Save failed
                  </span>
                )}

                <button
                  onClick={() => setHelpOpen(true)}
                  title="What can I type into a song? Time stamps, drum triggers, chords…"
                  className="flex items-center gap-1.5 rounded border border-[#373A40]/30 dark:border-white/30 px-3 py-2 text-sm font-medium text-black dark:text-white/80 hover:border-black dark:hover:border-white hover:bg-black hover:text-yellow-400 transition-colors"
                >
                  <HelpCircle className="w-4 h-4" />
                  Help
                </button>
                <button
                  onClick={replaceOpen ? closeReplace : openReplace}
                  className={`flex items-center gap-1.5 rounded border px-3 py-2 text-sm font-medium transition-colors ${
                    replaceOpen
                      ? "border-black dark:border-white bg-black text-yellow-400"
                      : "border-[#373A40]/30 dark:border-white/30 text-black dark:text-white/80 hover:border-black dark:hover:border-white hover:bg-black hover:text-yellow-400"
                  }`}
                >
                  <Replace className="w-4 h-4" />
                  Replace Chord
                </button>
                <button
                  onClick={() => setArrangeOpen(true)}
                  title="Lay the song out on tracks — drag each line and each sound to where it belongs"
                  className="flex items-center gap-1.5 rounded border border-[#373A40]/30 dark:border-white/30 px-3 py-2 text-sm font-medium text-black dark:text-white/80 hover:border-black dark:hover:border-white hover:bg-black hover:text-yellow-400 transition-colors"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  Arrange
                </button>
                <button
                  onClick={() => setTapOpen(true)}
                  title="Tap along with the song to time each line"
                  className="flex items-center gap-1.5 rounded border border-[#373A40]/30 dark:border-white/30 px-3 py-2 text-sm font-medium text-black dark:text-white/80 hover:border-black dark:hover:border-white hover:bg-black hover:text-yellow-400 transition-colors"
                >
                  <Timer className="w-4 h-4" />
                  Tap Timing
                </button>
                <button
                  onClick={handleClearTimings}
                  disabled={!hasTiming}
                  title={
                    hasTiming
                      ? `Remove all ${timingCount} time stamp${timingCount === 1 ? "" : "s"} so you can re-time the song`
                      : "This song has no time stamps"
                  }
                  className="flex items-center gap-1.5 rounded border border-[#373A40]/30 dark:border-white/30 px-3 py-2 text-sm font-medium text-black dark:text-white/80 hover:border-black dark:hover:border-white hover:bg-black hover:text-yellow-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <TimerOff className="w-4 h-4" />
                  Clear Times
                </button>
                <button
                  onClick={handlePlay}
                  disabled={!hasTiming}
                  title={
                    hasTiming
                      ? "Play through the sheet, highlighting each line in time"
                      : "Time some lines first — use Tap Timing, or type @0:12 at the start of a line"
                  }
                  className="flex items-center gap-1.5 rounded border border-[#373A40]/30 dark:border-white/30 px-3 py-2 text-sm font-medium text-black dark:text-white/80 hover:border-black dark:hover:border-white hover:bg-black hover:text-yellow-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Play className="w-4 h-4" />
                  Play
                </button>
                <button
                  onClick={handlePreview}
                  className="flex items-center gap-1.5 rounded border border-[#373A40]/30 dark:border-white/30 px-3 py-2 text-sm font-medium text-black dark:text-white/80 hover:border-black dark:hover:border-white hover:bg-black hover:text-yellow-400 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  Preview
                </button>
                <button
                  onClick={() => setHistoryOpen(true)}
                  className="flex items-center gap-1.5 rounded border border-[#373A40]/30 dark:border-white/30 px-3 py-2 text-sm font-medium text-black dark:text-white/80 hover:border-black dark:hover:border-white hover:bg-black hover:text-yellow-400 transition-colors"
                  title="View revision history"
                >
                  <Clock className="w-4 h-4" />
                  History
                </button>

                <div className="w-px self-stretch bg-black/20 dark:bg-white/20" />

                <button
                  onClick={() => saveSheet(true)}
                  disabled={!dirty || saving}
                  className="flex items-center gap-2 rounded bg-black px-4 py-2 text-sm font-medium text-yellow-400 hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {saving ? "Saving..." : dirty ? "Save" : "Saved"}
                </button>

                <div className="w-px self-stretch bg-black/20 dark:bg-white/20" />

                <div className="relative flex items-center gap-1.5 rounded border border-[#373A40]/30 dark:border-white/30 px-3 py-2 text-sm font-medium text-black dark:text-white/80 hover:border-black dark:hover:border-white hover:bg-black hover:text-yellow-400 transition-colors">
                  <Sparkles className="w-4 h-4" />
                  Get Feedback
                  <select
                    value=""
                    onChange={handleAiFeedback}
                    aria-label="Get AI Feedback"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  >
                    <option value="" disabled>
                      Get AI Feedback
                    </option>
                    {FEEDBACK_OPTIONS.map((o) => (
                      <option key={o.label} value={o.label}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {replaceOpen && (
              <div className="border-t border-white/10 px-4 py-3 sm:px-6">
                <div className="max-w-3xl mx-auto flex flex-wrap items-center gap-2">
                  {chordsInSheet.length === 0 ? (
                    <span className="text-sm text-white/50">No chords in this sheet yet.</span>
                  ) : (
                    <>
                      <select
                        value={findChord}
                        onChange={(e) => {
                          setFindChord(e.target.value);
                          setReplaceResult("");
                        }}
                        className="rounded border border-white/30 bg-black px-2 py-2 text-sm font-mono text-white outline-none focus:border-white"
                      >
                        {chordsInSheet.map(({ chord, count }) => (
                          <option key={chord} value={chord}>
                            [{chord}] — {count}
                          </option>
                        ))}
                      </select>
                      <span className="text-white/40 text-sm">→</span>
                      <input
                        ref={replaceInputRef}
                        value={replaceWith}
                        onChange={(e) => {
                          setReplaceWith(e.target.value);
                          setReplaceResult("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            applyReplace();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            closeReplace();
                          }
                        }}
                        placeholder="New chord"
                        spellCheck={false}
                        className="w-32 rounded border border-white/30 bg-black px-2 py-2 text-sm font-mono text-white placeholder:text-white/30 outline-none focus:border-white"
                      />
                      <button
                        onClick={applyReplace}
                        disabled={!canReplace}
                        className="rounded bg-black border border-white/30 px-3 py-2 text-sm font-medium text-yellow-400 hover:border-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        Replace All
                      </button>
                      {replaceResult && (
                        <span className="text-xs text-white/50">{replaceResult}</span>
                      )}
                    </>
                  )}
                  <button
                    onClick={closeReplace}
                    className="ml-auto text-white/50 hover:text-white transition-colors"
                    aria-label="Close replace"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Editor — the textarea is its own scroll box, so dragging a selection or
              swiping on a phone scrolls the song instead of hitting a dead end. */}
          <div className="flex flex-1 min-h-0 justify-center px-6 py-8">
            <textarea
              value={rawText}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={PLACEHOLDER}
              spellCheck={false}
              className="w-full max-w-3xl h-full overflow-auto outline-none resize-none font-mono text-base leading-relaxed bg-transparent text-black dark:text-white placeholder:text-[#373A40]/30 dark:placeholder:text-white/30"
            />
          </div>
        </div>
      </main>

      {helpOpen && <SyntaxHelp onClose={() => setHelpOpen(false)} />}

      {tapOpen && (
        <TapTiming rawText={rawText} onApply={handleChange} onClose={() => setTapOpen(false)} />
      )}

      {arrangeOpen && (
        <TrackEditor
          rawText={rawText}
          onApply={handleChange}
          onClose={() => setArrangeOpen(false)}
        />
      )}

      {historyOpen && sheetId && (
        <RevisionHistory
          sheetId={sheetId}
          currentRawText={rawText}
          onRestore={(text) => { handleChange(text); }}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}
