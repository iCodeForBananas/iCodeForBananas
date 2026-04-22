"use client";

import { useState, useEffect, useRef, use } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import {
  Save,
  Trash2,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Eye,
} from "lucide-react";
import {
  type LeadSheet,
  type Section,
  type SectionType,
  SECTION_TYPES,
  KEYS,
  makeSection,
  migrateSection,
} from "../../shared";

// ─── SectionBlock ─────────────────────────────────────────────────────────────

interface SectionBlockProps {
  section: Section;
  isFirst: boolean;
  isLast: boolean;
  onChange: (updates: Partial<Section>) => void;
  onMove: (dir: "up" | "down") => void;
  onDelete: () => void;
}

function SectionBlock({ section, isFirst, isLast, onChange, onMove, onDelete }: SectionBlockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="border border-[#373A40]/20 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-[#f8f9fa] border-b border-[#373A40]/20">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="text-[#373A40]/40 hover:text-black shrink-0"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <select
          value={section.type}
          onChange={(e) => onChange({ type: e.target.value as SectionType })}
          className="text-xs font-bold uppercase tracking-wider bg-transparent border-0 outline-none cursor-pointer shrink-0"
          style={{ color: "#ca8a04" }}
        >
          {SECTION_TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
        </select>
        <input
          type="text"
          value={section.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="flex-1 text-sm font-medium bg-transparent border-0 outline-none min-w-0"
          style={{ color: "#000" }}
          placeholder="Label (e.g. Verse 1)"
        />
        <div className="flex items-center gap-0.5 ml-auto shrink-0">
          <button disabled={isFirst} onClick={() => onMove("up")} className="p-1 text-[#373A40]/40 hover:text-black disabled:opacity-20 text-xs">▲</button>
          <button disabled={isLast} onClick={() => onMove("down")} className="p-1 text-[#373A40]/40 hover:text-black disabled:opacity-20 text-xs">▼</button>
          <button onClick={onDelete} className="p-1 text-[#373A40]/40 hover:text-red-500 ml-1">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="bg-white">
          <div className="p-3 pb-0">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-[#373A40]/50">
                Chords &amp; Lyrics
              </label>
              <button
                onClick={() => setShowHelp((v) => !v)}
                className="text-xs text-[#373A40]/40 hover:text-black transition-colors"
              >
                {showHelp ? "hide help" : "how to add chords?"}
              </button>
            </div>

            {showHelp && (
              <div className="mb-2 p-3 bg-[#fffbeb] border border-[#fde68a] rounded text-xs font-mono text-[#92400e] leading-relaxed">
                <p className="font-bold mb-1">Place a chord above any word using [Chord]word</p>
                <p className="mb-2 text-[#78350f]/70">Example input:</p>
                <p className="mb-1">[G]Here I [D]am Lord, [Em]is it [C]I Lord?</p>
                <p className="mb-2 text-[#78350f]/70">Renders as:</p>
                <div className="mb-1">
                  <div style={{ color: "#ca8a04" }}>G          D       Em      C</div>
                  <div>Here I am Lord, is it I Lord?</div>
                </div>
                <p className="text-[#78350f]/60 mt-2">Each line is independent. Blank lines create spacing.</p>
              </div>
            )}

            <TextareaAutosize
              value={section.content}
              onChange={(e) => onChange({ content: e.target.value })}
              placeholder={"[G]Here I [D]am, [Em]Lord, is it [C]I, Lord?\n[G]I have heard you [D]calling in the [Em]night"}
              minRows={4}
              spellCheck={false}
              className="w-full font-mono text-sm border border-[#373A40]/30 rounded px-3 py-2 outline-none resize-none bg-white leading-relaxed"
            />
          </div>

          <div className="px-3 pb-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#373A40]/50 mb-1">
              Notes
            </label>
            <TextareaAutosize
              value={section.notes}
              onChange={(e) => onChange({ notes: e.target.value })}
              placeholder="Strum pattern, dynamics, capo position for this section..."
              minRows={2}
              className="w-full text-sm border border-[#373A40]/30 rounded px-3 py-2 outline-none resize-none bg-white italic text-[#373A40]/70"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Edit page ────────────────────────────────────────────────────────────────

export default function EditLeadSheet({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [current, setCurrent] = useState<LeadSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getSb = () => {
    if (!sbRef.current) sbRef.current = createClient();
    return sbRef.current!;
  };

  useEffect(() => {
    if (user) loadSheet();
  }, [user, id]);

  // Autosave: debounce 1.5s after any dirty change
  useEffect(() => {
    if (!dirty || !current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(saveSheet, 1500);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [current, dirty]);

  async function loadSheet() {
    setLoading(true);
    const { data } = await getSb()
      .from("lead_sheets")
      .select("*")
      .eq("id", id)
      .single();
    if (data) {
      setCurrent({
        ...data,
        sections: data.sections.map(migrateSection),
      });
    }
    setLoading(false);
  }

  async function saveSheet() {
    if (!current) return;
    setSaving(true);
    const { data } = await getSb()
      .from("lead_sheets")
      .update({
        title: current.title,
        key: current.key,
        tempo: current.tempo,
        general_notes: current.general_notes,
        sections: current.sections,
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id)
      .select()
      .single();
    if (data) {
      setCurrent(data);
      setDirty(false);
    }
    setSaving(false);
  }

  function patch(updates: Partial<LeadSheet>) {
    setCurrent((prev) => (prev ? { ...prev, ...updates } : prev));
    setDirty(true);
  }

  function patchSection(sectionId: string, updates: Partial<Section>) {
    setCurrent((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === sectionId ? { ...s, ...updates } : s
        ),
      };
    });
    setDirty(true);
  }

  function addSection(type: SectionType) {
    setCurrent((prev) => {
      if (!prev) return prev;
      return { ...prev, sections: [...prev.sections, makeSection(type)] };
    });
    setDirty(true);
  }

  function removeSection(sectionId: string) {
    setCurrent((prev) => {
      if (!prev) return prev;
      return { ...prev, sections: prev.sections.filter((s) => s.id !== sectionId) };
    });
    setDirty(true);
  }

  function moveSection(sectionId: string, dir: "up" | "down") {
    setCurrent((prev) => {
      if (!prev) return prev;
      const idx = prev.sections.findIndex((s) => s.id === sectionId);
      const swapIdx = dir === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= prev.sections.length) return prev;
      const sections = [...prev.sections];
      [sections[idx], sections[swapIdx]] = [sections[swapIdx], sections[idx]];
      return { ...prev, sections };
    });
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
      <main className="px-4 py-6 flex-1">
        <div className="w-full lg:max-w-3xl lg:mx-auto">
          <div className="rounded-lg p-6 bg-white text-center text-[#373A40]/50">Loading...</div>
        </div>
      </main>
    );
  }

  if (!user || !current) {
    return (
      <main className="px-4 py-6 flex-1">
        <div className="w-full lg:max-w-3xl lg:mx-auto">
          <div className="rounded-lg p-6 bg-white text-center text-[#373A40]/50">Sheet not found.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="px-4 py-6 flex-1 metronome-static">
      <div className="w-full lg:max-w-3xl lg:mx-auto">
        <div className="rounded-lg p-6 bg-white">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-[#373A40]/50 hover:text-black transition-colors text-sm font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              All Sheets
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePreview}
                className="flex items-center gap-1.5 rounded border border-[#373A40]/30 px-3 py-2 text-sm font-medium hover:border-black hover:bg-black hover:text-[#facc15] transition-colors"
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
              <button
                onClick={saveSheet}
                disabled={!dirty || saving}
                className="flex items-center gap-2 rounded bg-black px-4 py-2 text-sm font-medium hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                style={{ color: "#facc15" }}
              >
                <Save className="w-4 h-4" />
                {saving ? "Saving..." : dirty ? "Save" : "Saved"}
              </button>
            </div>
          </div>

          {/* Title */}
          <input
            type="text"
            value={current.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Song Title"
            className="w-full text-3xl font-bold border-0 border-b-2 border-[#373A40]/20 focus:border-black outline-none pb-2 mb-6 bg-transparent"
            style={{ color: "#000" }}
          />

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#373A40]/50 mb-1">
                Key
              </label>
              <select
                value={current.key}
                onChange={(e) => patch({ key: e.target.value })}
                className="w-full border border-[#373A40]/30 rounded px-3 py-2 outline-none bg-white text-sm"
              >
                <option value="">Select key...</option>
                {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#373A40]/50 mb-1">
                Tempo (BPM)
              </label>
              <input
                type="number"
                value={current.tempo ?? ""}
                onChange={(e) => patch({ tempo: e.target.value ? Number(e.target.value) : null })}
                placeholder="120"
                min={20}
                max={300}
                className="w-full border border-[#373A40]/30 rounded px-3 py-2 outline-none bg-white text-sm"
              />
            </div>
          </div>

          {/* Performance Notes */}
          <div className="mb-8">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#373A40]/50 mb-1">
              Performance Notes
            </label>
            <TextareaAutosize
              value={current.general_notes}
              onChange={(e) => patch({ general_notes: e.target.value })}
              placeholder="Capo 3, fingerpicking pattern, dynamics, overall feel..."
              minRows={2}
              className="w-full border border-[#373A40]/30 rounded px-3 py-2 outline-none resize-none text-sm bg-white"
            />
          </div>

          {/* Sections */}
          <div className="space-y-3 mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#373A40]/50">
              Sections
            </h2>
            {current.sections.map((section, idx) => (
              <SectionBlock
                key={section.id}
                section={section}
                isFirst={idx === 0}
                isLast={idx === current.sections.length - 1}
                onChange={(updates) => patchSection(section.id, updates)}
                onMove={(dir) => moveSection(section.id, dir)}
                onDelete={() => removeSection(section.id)}
              />
            ))}
          </div>

          {/* Add Section */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#373A40]/50 mb-2">
              Add Section
            </p>
            <div className="flex flex-wrap gap-2">
              {SECTION_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => addSection(type)}
                  className="px-3 py-1.5 text-sm border border-[#373A40]/30 rounded hover:border-black hover:bg-black hover:text-[#facc15] transition-colors capitalize"
                >
                  + {type}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
