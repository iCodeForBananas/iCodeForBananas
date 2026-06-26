"use client";

import { useState, useEffect, useLayoutEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import { Save, ArrowLeft, Eye, WifiOff } from "lucide-react";
import { type LeadSheet, type Section, type SectionType, migrateSection } from "../../shared";

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

// ─── Offline cache ────────────────────────────────────────────────────────────

const offlineCacheKey = (songId: string) => `leadSheet:offlineCache:${songId}`;

function saveOfflineCache(songId: string, data: unknown) {
  try { localStorage.setItem(offlineCacheKey(songId), JSON.stringify(data)); } catch {}
}

function loadOfflineCache(songId: string): LeadSheet | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(offlineCacheKey(songId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

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
  const [isOfflineCopy, setIsOfflineCopy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
      const { data } = await getSb().from("lead_sheets").select("*").eq("id", id).single();
      if (data) {
        saveOfflineCache(id, data);
        setSheetId(data.id);
        const sheet: LeadSheet = { ...data, sections: data.sections.map(migrateSection) };
        setRawText(serializeSheet(sheet));
        setIsOfflineCopy(false);
      } else {
        const cached = loadOfflineCache(id);
        if (cached) {
          setSheetId(cached.id);
          setRawText(serializeSheet({ ...cached, sections: cached.sections.map(migrateSection) }));
          setIsOfflineCopy(true);
        }
      }
    } catch {
      const cached = loadOfflineCache(id);
      if (cached) {
        setSheetId(cached.id);
        setRawText(serializeSheet({ ...cached, sections: cached.sections.map(migrateSection) }));
        setIsOfflineCopy(true);
      }
    }
    setLoading(false);
  }

  async function saveSheet() {
    if (!sheetId) return;
    if (!navigator.onLine) {
      setSaveError(true);
      return;
    }
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
      setIsOfflineCopy(false);
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
          <div className="flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden bg-white dark:bg-neutral-900" style={{ border: "1px solid var(--border-color)" }}>
            <div className="flex-1 flex items-center justify-center text-[#373A40]/50 dark:text-white/50">Loading...</div>
          </div>
        </main>
      </div>
    );
  }

  if (!user || !sheetId) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <main className="flex flex-col flex-1 min-h-0 p-2 sm:p-4">
          <div className="flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden bg-white dark:bg-neutral-900" style={{ border: "1px solid var(--border-color)" }}>
            <div className="flex-1 flex items-center justify-center text-[#373A40]/50 dark:text-white/50">Sheet not found.</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <main className="flex flex-col flex-1 min-h-0 p-2 sm:p-4">
        <div className="flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden bg-white dark:bg-neutral-900" style={{ border: "1px solid var(--border-color)" }}>
          {/* Toolbar */}
          <div className="border-b shrink-0" style={{ borderColor: "var(--border-color)" }}>
            <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
              <button
                onClick={handleBack}
                className="flex items-center gap-2 text-[#373A40]/50 dark:text-white/50 hover:text-black dark:hover:text-white transition-colors text-sm font-medium"
              >
                <ArrowLeft className="w-4 h-4" />
                All Sheets
              </button>
              <div className="flex items-center gap-2">
                {saveError && (
                  <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                    <WifiOff className="w-3 h-3 shrink-0" />
                    Offline — changes won&apos;t be saved
                  </span>
                )}
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
          </div>

          {/* Offline notice */}
          {isOfflineCopy && (
            <div className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 shrink-0">
              <WifiOff className="w-3 h-3 shrink-0" />
              Offline — loaded from saved copy. Changes won&apos;t be saved until you&apos;re back online.
            </div>
          )}

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
