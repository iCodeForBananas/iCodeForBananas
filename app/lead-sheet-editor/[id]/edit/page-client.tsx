"use client";

import { useState, useEffect, useLayoutEffect, useMemo, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import { Save, ArrowLeft, Eye, Replace, X, ArrowUp, ArrowDown } from "lucide-react";
import { type LeadSheet, type Section, type SectionType, migrateSection, OfflineBadge } from "../../shared";
import { cacheSheet, getCachedSheet } from "../../offlineCache";
import { transposeText, transposeKey } from "../../../lib/transpose";

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

// A standalone [text] line is a section header unless the text looks like a chord
const CHORD_RE = /^[A-G][b#]?(m|maj|min|dim|aug|sus|add|dom)?(\d+)?(\/[A-G][b#]?)?$/;
function asSectionHeader(line: string): string | null {
  const m = line.match(/^\[([^\[\]]+)\]$/);
  if (!m) return null;
  const inner = m[1].trim();
  return CHORD_RE.test(inner) ? null : inner;
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
      if (!CHORD_RE.test(inner)) continue;
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
  const preambleLines: string[] = [];

  // Preamble: lines before first section header
  while (i < lines.length && asSectionHeader(lines[i]) === null) {
    const line = lines[i++];
    const keyMatch = line.match(/Key:\s*([A-G][#b]?m?)\b/i);
    const tempoMatch = line.match(/\bTempo:\s*(\d+)\b/i);
    if (keyMatch) key = keyMatch[1];
    if (tempoMatch) tempo = parseInt(tempoMatch[1]);
    if (keyMatch || tempoMatch) {
      const stripped = line
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

  return { title, key, tempo, general_notes, sections };
}

const PLACEHOLDER = `Song Title
Key: G  Tempo: 120

Performance notes (capo, feel, strumming pattern)...

[Verse 1]
[G]Driving down an [D]empty road, [Em]windows down and [C]radio on
[G]Nothing but the [D]open sky as [Em]far as I can [C]see
> Use light fingerpicking

[Chorus]
[G]Take me [D]somewhere [Em]new`;

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
  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const chordsInSheet = useMemo(
    () => (replaceOpen ? collectChords(rawText) : []),
    [replaceOpen, rawText]
  );
  const findCount = chordsInSheet.find((c) => c.chord === findChord)?.count ?? 0;
  const newChord = replaceWith.trim().replace(/^\[|\]$/g, "").trim();
  const canReplace =
    findCount > 0 && newChord.length > 0 && newChord !== findChord && !/[\[\]]/.test(newChord);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    const container = scrollContainerRef.current;
    if (!el) return;
    const savedScroll = container?.scrollTop ?? 0;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
    if (container) container.scrollTop = savedScroll;
  }, [rawText]);

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
        setRawText(serializeSheet(sheet));
        setOffline(false);
        await cacheSheet(data);
      }
    } catch {
      const cached = await getCachedSheet(id);
      if (cached) {
        setSheetId(cached.id);
        const sheet: LeadSheet = { ...cached, sections: cached.sections.map(migrateSection) };
        setRawText(serializeSheet(sheet));
        setOffline(true);
      }
    }
    setLoading(false);
  }

  async function saveSheet() {
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
          sections: parsed.sections ?? [],
          updated_at: new Date().toISOString(),
        })
        .eq("id", sheetId);
      if (error) throw error;
      setDirty(false);
      setSaveError(false);
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

  function applyTranspose(semitones: number) {
    const next = rawText
      .split("\n")
      .map((line) => {
        if (asSectionHeader(line) !== null) return line;
        const keyMatch = line.match(/Key:\s*([A-G][#b]?m?)\b/i);
        if (keyMatch) {
          return line.replace(keyMatch[1], transposeKey(keyMatch[1], semitones));
        }
        return transposeText(line, semitones);
      })
      .join("\n");
    handleChange(next);
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

  async function handlePreview() {
    if (dirty) await saveSheet();
    router.push(`/lead-sheet-editor/${id}/preview`);
  }

  function handleBack() {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    router.push("/lead-sheet-editor");
  }

  if (authLoading || loading) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <main className="flex flex-col flex-1 min-h-0 p-2 sm:p-4">
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
        <main className="flex flex-col flex-1 min-h-0 p-2 sm:p-4">
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
              <div className="flex items-center gap-2">
                {offline && <OfflineBadge />}
                {saveError && (
                  <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                    Save failed
                  </span>
                )}
                <button
                  onClick={() => applyTranspose(1)}
                  title="Transpose up one semitone"
                  className="flex items-center gap-1.5 rounded border border-[#373A40]/30 dark:border-white/30 px-3 py-2 text-sm font-medium text-black dark:text-white/80 hover:border-black dark:hover:border-white hover:bg-black hover:text-yellow-400 transition-colors"
                >
                  <ArrowUp className="w-4 h-4" />
                  Transpose Up
                </button>
                <button
                  onClick={() => applyTranspose(-1)}
                  title="Transpose down one semitone"
                  className="flex items-center gap-1.5 rounded border border-[#373A40]/30 dark:border-white/30 px-3 py-2 text-sm font-medium text-black dark:text-white/80 hover:border-black dark:hover:border-white hover:bg-black hover:text-yellow-400 transition-colors"
                >
                  <ArrowDown className="w-4 h-4" />
                  Transpose Down
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
                  onClick={handlePreview}
                  className="flex items-center gap-1.5 rounded border border-[#373A40]/30 dark:border-white/30 px-3 py-2 text-sm font-medium text-black dark:text-white/80 hover:border-black dark:hover:border-white hover:bg-black hover:text-yellow-400 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  Preview
                </button>
                <button
                  onClick={saveSheet}
                  disabled={!dirty || saving}
                  className="flex items-center gap-2 rounded bg-black px-4 py-2 text-sm font-medium text-yellow-400 hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {saving ? "Saving..." : dirty ? "Save" : "Saved"}
                </button>
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

          {/* Editor */}
          <div ref={scrollContainerRef} className="flex-1 overflow-auto">
            <div className="max-w-3xl mx-auto px-6 py-8">
              <textarea
                ref={textareaRef}
                value={rawText}
                onChange={(e) => handleChange(e.target.value)}
                placeholder={PLACEHOLDER}
                spellCheck={false}
                className="w-full outline-none resize-none font-mono text-base leading-relaxed bg-transparent text-black dark:text-white placeholder:text-[#373A40]/30 dark:placeholder:text-white/30"
                style={{ minHeight: "calc(100vh - 160px)", overflow: "hidden" }}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
