"use client";

import { useState, useEffect, useMemo, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import { Save, Replace, X, Sparkles, Play, Timer, TimerOff, Clock, HelpCircle, SlidersHorizontal, ChevronDown } from "lucide-react";
import { Button, DropdownMenu, IconButton, Select, Text, TextField } from "@radix-ui/themes";
import TopBar from "../../TopBar";
import styles from "../../lead-sheet-editor.module.css";
import { RevisionHistory } from "../../RevisionHistory";
import {
  type LeadSheet,
  type LeadSheetMetadata,
  type Section,
  inferSectionType,
  migrateSection,
  OfflineBadge,
} from "../../shared";
import {
  asSectionHeader,
  hasRetiredSettings,
  isChordName,
  stripRetiredSettings,
} from "../../songText";
import { serializeSheet } from "../../serialize";
import { snapshotRevision } from "../../revisions";
import {
  cacheSheet,
  getCachedSheet,
  getPendingEdit,
  queuePendingEdit,
  clearPendingEdit,
  type PendingEdit,
} from "../../offlineCache";
import { goTo } from "../../offlineNav";
import { clearAllMarkers, parseTimeMarker } from "../../timing";
import {
  type DrumSettings,
  DEFAULT_DRUM_SETTINGS,
  hasDrumSettingsLine,
  parseDrumSettingsLine,
  stripDrumSettings,
} from "../../DrumMachine";
import TapTiming from "../../TapTiming";
import TrackEditor from "../../TrackEditor";
import SyntaxHelp from "../../SyntaxHelp";
import { useSongbookPortal } from "../../portal";

// ─── Text ↔ LeadSheet ─────────────────────────────────────────────────────────

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
    const retired = hasRetiredSettings(line);
    if (keyMatch) key = keyMatch[1];
    if (tempoMatch) tempo = parseInt(tempoMatch[1]);
    if (drumMatch) drums = parseDrumSettingsLine(line);
    if (keyMatch || tempoMatch || drumMatch || retired) {
      const stripped = stripRetiredSettings(stripDrumSettings(line))
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
  const metadata: LeadSheetMetadata = {
    drums: drums ?? DEFAULT_DRUM_SETTINGS,
  };

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
  const portal = useSongbookPortal();
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
  // ?arrange=1 opens straight into the arranger — where Preview's Arrange
  // button lands, so recording and laying out a song are the same door.
  const [arrangeOpen, setArrangeOpen] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("arrange")) setArrangeOpen(true);
  }, []);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // The reference's Capo field — a structured value, unlike Title/Key/Tempo
  // which all live as text in the song itself. There was no editor for this
  // anywhere in the app before; the reference's free-meta row is the one.
  const [capo, setCapo] = useState<number | null>(null);
  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  /** Timestamp of last revision snapshot, to throttle auto-save revisions */
  const lastRevisionAt = useRef<number>(0);
  /** Metadata as loaded, so a save can't drop keys the text doesn't carry. */
  const sheetMetadata = useRef<LeadSheetMetadata>({});
  /**
   * The server's `updated_at` this editing session is building on. A save
   * only lands when the row still carries this exact value — see saveSheet.
   * Null until the first successful load or save.
   */
  const baseUpdatedAt = useRef<string | null>(null);
  // Set every render so the `online` listener (attached once, below) always
  // calls the current saveSheet/dirty rather than whatever closed over them
  // the one time the listener was attached.
  const dirtyRef = useRef(false);
  const saveSheetRef = useRef<(manual?: boolean) => Promise<void>>(async () => {});
  /** A save that hit someone else's newer write — the local edit is still
   *  queued (never discarded), but writing it now would clobber theirs. */
  const [saveConflict, setSaveConflict] = useState(false);
  /** An edit queued from a previous, disconnected session that turned out to
   *  no longer match the server by the time this one loaded. Shown so it can
   *  be restored or dropped, rather than silently applied or silently lost. */
  const [staleEdit, setStaleEdit] = useState<PendingEdit | null>(null);
  /** Whether the last save attempt actually reached Supabase. */
  const [queued, setQueued] = useState(false);

  const chordsInSheet = useMemo(
    () => (replaceOpen ? collectChords(rawText) : []),
    [replaceOpen, rawText]
  );
  const timingCount = useMemo(
    () => rawText.split("\n").filter((line) => parseTimeMarker(line) !== null).length,
    [rawText]
  );
  const hasTiming = timingCount > 0;
  // Read straight from the text being edited, so the breadcrumb tracks a
  // title change on the very keystroke that makes it — same source `saveSheet`
  // reads from, just not waiting for the debounce.
  const songTitle = useMemo(() => parseText(rawText).title || "Untitled", [rawText]);
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

  // Autosave: debounce 1.5s; rawText/capo in deps gives a fresh closure on each change
  useEffect(() => {
    if (!dirty || !sheetId) return;
    const timer = setTimeout(saveSheet, 1500);
    return () => clearTimeout(timer);
  }, [rawText, capo, dirty, sheetId]);

  /**
   * Loading has to reckon with three things that might each be the most
   * current copy of this song: the server, the last full snapshot cached
   * for offline reading, and an edit queued locally that never made it to
   * Supabase. A queued edit only gets put back in front of you automatically
   * when it's provably safe — its base still matches what the server (or,
   * offline, the cache) actually has. Otherwise it's surfaced as `staleEdit`
   * rather than picked for you; see the conflict banner below.
   */
  async function loadSheet() {
    setLoading(true);
    const pending = await getPendingEdit(id);
    try {
      const { data, error } = await getSb().from("lead_sheets").select("*").eq("id", id).single();
      if (error) throw error;
      if (data) {
        setSheetId(data.id);
        const sheet: LeadSheet = { ...data, sections: data.sections.map(migrateSection) };
        sheetMetadata.current = sheet.metadata ?? {};
        baseUpdatedAt.current = data.updated_at;
        setOffline(false);
        await cacheSheet(data);

        if (pending && pending.baseUpdatedAt === data.updated_at) {
          // Nothing's moved since this edit was queued — safe to resume it.
          setRawText(pending.rawText);
          setCapo(pending.capo);
          setDirty(true);
        } else {
          setRawText(serializeSheet(sheet));
          setCapo(sheet.capo ?? null);
          if (pending) setStaleEdit(pending);
        }
      }
    } catch {
      const cached = await getCachedSheet(id);
      if (cached) {
        setSheetId(cached.id);
        const sheet: LeadSheet = { ...cached, sections: cached.sections.map(migrateSection) };
        sheetMetadata.current = sheet.metadata ?? {};
        baseUpdatedAt.current = cached.updated_at;
        setOffline(true);
        if (pending && pending.baseUpdatedAt === cached.updated_at) {
          setRawText(pending.rawText);
          setCapo(pending.capo);
          setDirty(true);
        } else {
          setRawText(serializeSheet(sheet));
          setCapo(sheet.capo ?? null);
          if (pending) setStaleEdit(pending);
        }
      } else if (pending) {
        // No server reach and no full snapshot either, but there is a queued
        // edit for this id — it's the only copy of this song this device
        // has, so it's what opens, offline-flagged, still unsynced.
        setSheetId(id);
        baseUpdatedAt.current = pending.baseUpdatedAt;
        setOffline(true);
        setRawText(pending.rawText);
        setCapo(pending.capo);
        setDirty(true);
      }
    }
    setLoading(false);
  }

  /**
   * Every save queues the edit locally first — before the network is even
   * attempted — so a dropped connection or a closed tab never loses it; see
   * offlineCache.ts. The write itself is conditioned on the row's
   * `updated_at` still matching `baseUpdatedAt`: if it doesn't, something
   * else wrote to this sheet since this session last synced, and landing
   * this write would silently clobber it. That's surfaced as `saveConflict`
   * instead — the local edit stays queued either way, so nothing is lost by
   * stopping to ask.
   */
  /**
   * `text`/`cp` default to the live state, but take an explicit value too —
   * restoring a stale queued edit has to save *that* text, and by the time
   * the call after `setRawText` runs, `rawText` in this closure is still the
   * old value; state updates aren't visible until the next render.
   */
  async function saveSheet(manual = false, text = rawText, cp = capo) {
    if (!sheetId) return;
    setSaving(true);
    setSaveError(false);
    const parsed = parseText(text);
    await queuePendingEdit(sheetId, text, cp, baseUpdatedAt.current);
    try {
      const nextUpdatedAt = new Date().toISOString();
      let query = getSb()
        .from("lead_sheets")
        .update({
          title: parsed.title ?? "",
          key: parsed.key ?? "",
          tempo: parsed.tempo ?? null,
          capo: cp,
          general_notes: parsed.general_notes ?? "",
          // Merge so keys this editor doesn't know about survive a save. The
          // drum line doesn't carry swing or per-track levels, so those come
          // from what was stored rather than being reset by the text.
          metadata: {
            ...sheetMetadata.current,
            ...parsed.metadata,
            drums: {
              ...parsed.metadata?.drums,
              swing: sheetMetadata.current.drums?.swing ?? 0,
              levels: sheetMetadata.current.drums?.levels ?? {},
            },
          },
          sections: parsed.sections ?? [],
          updated_at: nextUpdatedAt,
        })
        .eq("id", sheetId);
      // No known baseline (e.g. this session opened entirely from an old
      // cache and never reached the server) — nothing to compare against,
      // so write through rather than refuse to ever save at all.
      if (baseUpdatedAt.current) query = query.eq("updated_at", baseUpdatedAt.current);
      const { data, error } = await query.select("updated_at");
      if (error) throw error;
      if (!data || data.length === 0) {
        // The filter matched nothing: the row's updated_at had already moved
        // past what this session knew. The edit is still queued above.
        setSaveConflict(true);
        setQueued(true);
        return;
      }

      baseUpdatedAt.current = data[0].updated_at;
      await clearPendingEdit(sheetId);
      setDirty(false);
      setSaveError(false);
      setQueued(false);
      setSaveConflict(false);

      // Save a revision snapshot:
      //   • always on manual saves
      //   • on auto-saves, at most once every 5 minutes
      const now = Date.now();
      const shouldSnapshot = manual || (now - lastRevisionAt.current > 5 * 60 * 1000);
      if (shouldSnapshot) {
        lastRevisionAt.current = now;
        await snapshotRevision(getSb(), sheetId, text);
      }
    } catch {
      // Offline, most likely — the edit is already queued locally above, so
      // it isn't lost; the online listener below retries it on reconnect.
      setSaveError(true);
      setQueued(true);
    } finally {
      setSaving(false);
    }
  }

  // Keeps the online-retry listener (attached once, further down) calling
  // the current saveSheet/dirty rather than whichever ones existed the one
  // time the listener was attached.
  dirtyRef.current = dirty;
  saveSheetRef.current = saveSheet;

  useEffect(() => {
    function retry() {
      if (dirtyRef.current) void saveSheetRef.current(true);
    }
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);

  // ── Mid-session conflict: this editor's own in-progress text already is
  // "mine", so these just decide whose write stands. ──────────────────────

  /** Adopt the server's current timestamp as the new baseline, then land
   *  this session's edit on top of it — a deliberate overwrite, not a blind one. */
  async function keepMineAfterConflict() {
    try {
      const { data } = await getSb().from("lead_sheets").select("updated_at").eq("id", sheetId!).single();
      if (data) baseUpdatedAt.current = data.updated_at;
    } catch {
      // Still offline — the existing baseline stands; saveSheet will queue
      // again below and this banner can reappear once it reaches Supabase.
    }
    setSaveConflict(false);
    await saveSheet(true);
  }

  /** Drop this session's edit and reload cleanly from whatever's actually there. */
  async function discardMineAfterConflict() {
    if (sheetId) await clearPendingEdit(sheetId);
    setSaveConflict(false);
    setDirty(false);
    setQueued(false);
    await loadSheet();
  }

  // ── Stale queued edit found at load time: the editor is currently
  // showing the server's version, and "mine" is still sitting in
  // IndexedDB, not yet applied to anything on screen. ─────────────────────

  /** Bring the queued edit into the editor and save it on the server's
   *  current baseline, same overwrite-on-purpose as the mid-session case. */
  async function restoreStaleEdit() {
    if (!staleEdit) return;
    const edit = staleEdit;
    setStaleEdit(null);
    setRawText(edit.rawText);
    setCapo(edit.capo);
    setDirty(true);
    try {
      const { data } = await getSb().from("lead_sheets").select("updated_at").eq("id", sheetId!).single();
      if (data) baseUpdatedAt.current = data.updated_at;
    } catch {
      // Offline again already — saveSheet below will simply queue it once more.
    }
    await saveSheet(true, edit.rawText, edit.capo);
  }

  /** The editor's already showing the server's version — just drop the queued one. */
  async function discardStaleEdit() {
    if (sheetId) await clearPendingEdit(sheetId);
    setStaleEdit(null);
  }

  function handleChange(value: string) {
    setRawText(value);
    setDirty(true);
  }

  // The reference's Title field edits the song's own first line directly —
  // there's no second, separate title to drift out of sync with it.
  function handleTitleChange(value: string) {
    const lines = rawText.split("\n");
    lines[0] = value;
    handleChange(lines.join("\n"));
  }

  function handleCapoChange(value: string) {
    const parsed = value.trim() === "" ? null : parseInt(value, 10);
    setCapo(Number.isNaN(parsed as number) ? null : parsed);
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

  function handleAiFeedback(label: string) {
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
    goTo(router, `/lead-sheet-editor/${id}/preview`);
  }

  // The reference's Save: commit, then back to the song. Unlike the
  // reference there's no separate draft to commit from — autosave already
  // keeps this song's row current — so this really just forces one last
  // save (picking up anything still inside the 1.5s debounce) before
  // leaving, same as the "Preview" action always did.
  async function handleSaveAndView() {
    if (dirty) await saveSheet(true);
    goTo(router, `/lead-sheet-editor/${id}/preview`);
  }

  // The reference's Cancel discards the whole draft. This architecture
  // autosaves continuously rather than editing a draft, so there's nothing
  // left to discard by the time a click lands — the closest honest
  // approximation is leaving without forcing a network save first, unlike
  // Save/Preview, which both do. It still queues locally (instant, no
  // network needed) so the keystrokes from inside the current 1.5s debounce
  // window aren't the one gap in an otherwise edit-loses-nothing editor.
  function handleCancel() {
    if (dirty && sheetId) void queuePendingEdit(sheetId, rawText, capo, baseUpdatedAt.current);
    goTo(router, `/lead-sheet-editor/${id}/preview`);
  }

  // Where the topbar's "Edit lines" segment lands — same door the old
  // sidebar toggle used, reached from this page instead of that one.
  async function handleEditLines() {
    if (dirty) await saveSheet();
    goTo(router, `/lead-sheet-editor/${id}/preview?mode=lines`);
  }

  // "Discard" here only ever meant "stop looking at this song" — the edit
  // still queues locally first, so answering the confirm can't actually lose
  // anything; it'll sync next time this song is open with a connection.
  function handleLibraryClick() {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    if (dirty && sheetId) void queuePendingEdit(sheetId, rawText, capo, baseUpdatedAt.current);
    goTo(router, "/lead-sheet-editor");
  }

  // Play always runs against the saved sheet, so timings typed a second ago count.
  async function handlePlay() {
    if (dirty) await saveSheet();
    goTo(router, `/lead-sheet-editor/${id}/preview?play=1`);
  }

  if (authLoading || loading) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        {/* min-h-0! beats the global `main { min-height: 100vh }`, which would
            otherwise hold the editor at full height when a phone keyboard
            shrinks the viewport and push the text under the keyboard. */}
        <main className="flex flex-col flex-1 min-h-0! p-2 sm:p-4">
          <div className="flex flex-col flex-1 min-h-0 rounded-none border-none bg-surface-base overflow-hidden">
            <div className="flex-1 flex items-center justify-center text-ink-muted">Loading...</div>
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
          <div className="flex flex-col flex-1 min-h-0 rounded-none border-none bg-surface-base overflow-hidden">
            <div className="flex-1 flex items-center justify-center text-ink-muted">Sheet not found.</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <main className="flex flex-col flex-1 min-h-0 p-2 sm:p-4">
        <div className="flex flex-col flex-1 min-h-0 rounded-none border-none bg-surface-base overflow-hidden">
          <TopBar
            onLibraryClick={handleLibraryClick}
            title={songTitle}
            mode="free"
            onModeChange={(next) => {
              if (next === "play") void handlePreview();
              else if (next === "lines") void handleEditLines();
            }}
          />
          {/* The reference's `.free-meta` row: Title, Capo, Cancel, Save —
              matched exactly as the primary bar instead of the app's own
              ten-button toolbar, which the reference has no room for at all.
              Everything that toolbar did is still reachable, just folded into
              the More menu beside Save rather than occupying permanent space
              the reference's layout doesn't allocate for it. */}
          <div className="shrink-0">
            <div className="flex items-center gap-3 flex-wrap px-4 py-3 sm:px-6 sm:py-4">
              <label className={`${styles.field} flex-1`} style={{ minWidth: 260 }}>
                Title
                <input
                  className={styles.tinput}
                  type="text"
                  value={songTitle === "Untitled" && !rawText.split("\n")[0] ? "" : (rawText.split("\n")[0] ?? "")}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Untitled"
                />
              </label>
              <label className={styles.field} style={{ width: 110 }}>
                Capo
                <input
                  className={styles.tinput}
                  type="number"
                  min={0}
                  max={12}
                  value={capo ?? ""}
                  onChange={(e) => handleCapoChange(e.target.value)}
                />
              </label>

              {offline && <OfflineBadge />}
              {/* One line, whichever of these is true — saving, a clean save,
                  queued-but-unsynced, or a conflict that needs a decision.
                  The old version just said "Save failed" and nothing else,
                  which looked the same whether the next keystroke would fix
                  it or the edit was sitting unsynced for an hour. */}
              {saving ? (
                <Text size="1" color="gray">
                  Saving…
                </Text>
              ) : saveConflict ? (
                <Text size="1" weight="medium" color="red">
                  Changed elsewhere — see below
                </Text>
              ) : queued || saveError ? (
                <Text size="1" weight="medium" color="amber">
                  Saved on this device — will sync when back online
                </Text>
              ) : dirty ? (
                <Text size="1" color="gray">
                  Unsaved changes
                </Text>
              ) : null}

              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  <button type="button" className={styles.ibtn}>
                    More
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content container={portal} align="end">
                  <DropdownMenu.Item onSelect={() => setHelpOpen(true)}>
                    <HelpCircle className="w-4 h-4" /> Help
                  </DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={() => (replaceOpen ? closeReplace() : openReplace())}>
                    <Replace className="w-4 h-4" /> Replace Chord
                  </DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={() => setArrangeOpen(true)}>
                    <SlidersHorizontal className="w-4 h-4" /> Arrange
                  </DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={() => setTapOpen(true)}>
                    <Timer className="w-4 h-4" /> Tap Timing
                  </DropdownMenu.Item>
                  <DropdownMenu.Item disabled={!hasTiming} onSelect={handleClearTimings}>
                    <TimerOff className="w-4 h-4" /> Clear Times
                  </DropdownMenu.Item>
                  <DropdownMenu.Item disabled={!hasTiming} onSelect={handlePlay}>
                    <Play className="w-4 h-4" /> Play
                  </DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={() => setHistoryOpen(true)}>
                    <Clock className="w-4 h-4" /> History
                  </DropdownMenu.Item>
                  <DropdownMenu.Sub>
                    <DropdownMenu.SubTrigger>
                      <Sparkles className="w-4 h-4" /> Get Feedback
                    </DropdownMenu.SubTrigger>
                    <DropdownMenu.SubContent>
                      {FEEDBACK_OPTIONS.map((o) => (
                        <DropdownMenu.Item key={o.label} onSelect={() => handleAiFeedback(o.label)}>
                          {o.label}
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Sub>
                </DropdownMenu.Content>
              </DropdownMenu.Root>

              <button type="button" className={styles.ibtn} onClick={handleCancel}>
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.ibtn} ${styles.ibtnAccent}`}
                onClick={() => void handleSaveAndView()}
                disabled={saving}
              >
                <Save className="w-4 h-4" />
                {saving ? "Saving..." : "Save song"}
              </button>
            </div>

            {saveConflict && (
              <div className="border-t border-line-subtle bg-danger/10 px-4 py-3 sm:px-6">
                <div className="max-w-3xl mx-auto flex flex-wrap items-center gap-3">
                  <Text size="2" weight="medium" color="red" className="flex-1">
                    This song changed somewhere else while this save was pending. Your edit is still
                    saved on this device — pick which version should stand.
                  </Text>
                  <Button variant="soft" color="gray" onClick={() => void discardMineAfterConflict()}>
                    Use the other version
                  </Button>
                  <Button onClick={() => void keepMineAfterConflict()}>Keep my changes</Button>
                </div>
              </div>
            )}

            {staleEdit && (
              <div className="border-t border-line-subtle bg-danger/10 px-4 py-3 sm:px-6">
                <div className="max-w-3xl mx-auto flex flex-wrap items-center gap-3">
                  <Text size="2" weight="medium" color="red" className="flex-1">
                    This device has an edit to this song from {" "}
                    {new Date(staleEdit.queuedAt).toLocaleString()} that never made it online, and the
                    song&rsquo;s changed since. Restore it, or leave what&rsquo;s showing now.
                  </Text>
                  <Button variant="soft" color="gray" onClick={() => void discardStaleEdit()}>
                    Discard it
                  </Button>
                  <Button onClick={() => void restoreStaleEdit()}>Restore my edit</Button>
                </div>
              </div>
            )}

            {replaceOpen && (
              <div className="border-t border-line-subtle px-4 py-3 sm:px-6">
                <div className="max-w-3xl mx-auto flex flex-wrap items-center gap-2">
                  {chordsInSheet.length === 0 ? (
                    <Text size="2" color="gray">
                      No chords in this sheet yet.
                    </Text>
                  ) : (
                    <>
                      <Select.Root
                        value={findChord || undefined}
                        onValueChange={(v) => {
                          setFindChord(v);
                          setReplaceResult("");
                        }}
                      >
                        <Select.Trigger aria-label="Chord to replace" className="font-mono" />
                        <Select.Content container={portal}>
                          {chordsInSheet.map(({ chord, count }) => (
                            <Select.Item key={chord} value={chord} className="font-mono">
                              [{chord}] — {count}
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select.Root>
                      <Text size="2" color="gray">
                        →
                      </Text>
                      <TextField.Root
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
                        aria-label="Replace with"
                        spellCheck={false}
                        className="w-32 font-mono"
                      />
                      <Button variant="soft" onClick={applyReplace} disabled={!canReplace}>
                        Replace All
                      </Button>
                      {replaceResult && (
                        <Text size="1" color="gray">
                          {replaceResult}
                        </Text>
                      )}
                    </>
                  )}
                  <IconButton variant="ghost" color="gray" onClick={closeReplace} aria-label="Close replace" className="ml-auto">
                    <X className="w-4 h-4" />
                  </IconButton>
                </div>
              </div>
            )}
          </div>

          {/* The reference's `.free` body: a labelled field wrapping the
              textarea, the label itself doubling as the syntax hint — not
              placeholder text nobody sees once the song has a first line. */}
          <div className="flex flex-col flex-1 min-h-0 gap-3 px-6 py-4 sm:px-8">
            <label className={`${styles.field} flex flex-col flex-1 min-h-0`}>
              Chords in [brackets] · sections like [CHORUS] · notes start with ↳ or #
              <textarea
                value={rawText}
                onChange={(e) => handleChange(e.target.value)}
                placeholder={PLACEHOLDER}
                spellCheck={false}
                className={styles.freeTa}
              />
            </label>
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
          sheetId={sheetId}
          userId={user?.id ?? null}
          songTitle={parseText(rawText).title || "arrangement"}
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
