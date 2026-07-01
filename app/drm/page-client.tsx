"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import Link from "next/link";
import { Plus, X, Trash2 } from "lucide-react";

const BASE_RADIUS = 48;
const GROWTH_PER_BIT = 6;
const MAX_RADIUS = 120;

const bubbleRadius = (count: number) =>
  Math.min(BASE_RADIUS + count * GROWTH_PER_BIT, MAX_RADIUS);

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#6366f1", "#a855f7", "#ec4899",
  "#14b8a6", "#f43f5e",
];

interface PersonRow {
  id: string;
  user_id: string;
  name: string;
  color: string;
  pos_x: number;
  pos_y: number;
  created_at: string;
}

interface EvidenceRow {
  id: string;
  person_id: string;
  user_id: string;
  content: string;
  evidence_type: "pro" | "con" | "evidence";
  created_at: string;
}

interface PillarRow {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

type Person = PersonRow & { evidence_count: number };

export default function DrmClient() {
  const { user, loading: authLoading } = useAuth();

  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  // Add dialog
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[5]);
  const [adding, setAdding] = useState(false);

  // Side panel
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [panelEvidence, setPanelEvidence] = useState<EvidenceRow[]>([]);
  const [pillars, setPillars] = useState<PillarRow[]>([]);
  const [personPillarIds, setPersonPillarIds] = useState<Set<string>>(new Set());
  const [panelLoading, setPanelLoading] = useState(false);

  // New evidence form
  const [newEvidenceText, setNewEvidenceText] = useState("");
  const [newEvidenceType, setNewEvidenceType] = useState<"pro" | "con" | "evidence">("evidence");
  const [addingEvidence, setAddingEvidence] = useState(false);

  // New pillar form
  const [newPillarName, setNewPillarName] = useState("");
  const [addingPillar, setAddingPillar] = useState(false);

  // Delete confirm
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Drag state
  const canvasRef = useRef<HTMLDivElement>(null);
  const peopleRef = useRef<Person[]>([]);
  const userRef = useRef(user);
  const didDragRef = useRef(false);
  const [dragging, setDragging] = useState<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    peopleRef.current = people;
  }, [people]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    if (user) loadPeople();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadPeople() {
    if (!user) return;
    setLoading(true);
    const client = createClient()!;
    const [{ data: ppl }, { data: ev }] = await Promise.all([
      client.from("drm_people").select("*").eq("user_id", user.id).order("created_at"),
      client.from("drm_evidence").select("id, person_id").eq("user_id", user.id),
    ]);

    const counts = new Map<string, number>();
    ((ev as { id: string; person_id: string }[] | null) ?? []).forEach((e) =>
      counts.set(e.person_id, (counts.get(e.person_id) ?? 0) + 1)
    );

    setPeople(
      ((ppl as PersonRow[] | null) ?? []).map((p) => ({
        ...p,
        evidence_count: counts.get(p.id) ?? 0,
      }))
    );
    setLoading(false);
  }

  async function addPerson() {
    if (!newName.trim() || !user) return;
    setAdding(true);
    const pos_x = 0.2 + Math.random() * 0.6;
    const pos_y = 0.2 + Math.random() * 0.6;
    const { data } = await createClient()!
      .from("drm_people")
      .insert({ user_id: user.id, name: newName.trim(), color: newColor, pos_x, pos_y })
      .select()
      .single();
    if (data) setPeople((prev) => [...prev, { ...(data as PersonRow), evidence_count: 0 }]);
    setNewName("");
    setNewColor(PRESET_COLORS[5]);
    setShowAddDialog(false);
    setAdding(false);
  }

  const openPanel = useCallback(
    async (person: Person) => {
      setSelectedPerson(person);
      setPanelLoading(true);
      setShowDeleteConfirm(false);
      setNewEvidenceText("");
      setNewPillarName("");
      const client = createClient()!;
      const [{ data: ev }, { data: pil }, { data: pp }] = await Promise.all([
        client.from("drm_evidence").select("*").eq("person_id", person.id).order("created_at"),
        client.from("drm_pillars").select("*").eq("user_id", user!.id).order("created_at"),
        client.from("drm_person_pillars").select("pillar_id").eq("person_id", person.id),
      ]);
      setPanelEvidence((ev as EvidenceRow[] | null) ?? []);
      setPillars((pil as PillarRow[] | null) ?? []);
      setPersonPillarIds(
        new Set(((pp as { pillar_id: string }[] | null) ?? []).map((r) => r.pillar_id))
      );
      setPanelLoading(false);
    },
    [user]
  );

  const openPanelRef = useRef(openPanel);
  useEffect(() => {
    openPanelRef.current = openPanel;
  }, [openPanel]);

  async function addEvidence() {
    if (!newEvidenceText.trim() || !selectedPerson || !user) return;
    setAddingEvidence(true);
    const { data } = await createClient()!
      .from("drm_evidence")
      .insert({
        person_id: selectedPerson.id,
        user_id: user.id,
        content: newEvidenceText.trim(),
        evidence_type: newEvidenceType,
      })
      .select()
      .single();
    if (data) {
      setPanelEvidence((prev) => [...prev, data as EvidenceRow]);
      const bump = (p: Person) =>
        p.id === selectedPerson.id ? { ...p, evidence_count: p.evidence_count + 1 } : p;
      setPeople((prev) => prev.map(bump));
      setSelectedPerson((prev) => (prev ? bump(prev) : prev));
    }
    setNewEvidenceText("");
    setAddingEvidence(false);
  }

  async function deleteEvidence(id: string) {
    if (!selectedPerson) return;
    await createClient()!.from("drm_evidence").delete().eq("id", id);
    setPanelEvidence((prev) => prev.filter((e) => e.id !== id));
    const shrink = (p: Person) =>
      p.id === selectedPerson.id
        ? { ...p, evidence_count: Math.max(0, p.evidence_count - 1) }
        : p;
    setPeople((prev) => prev.map(shrink));
    setSelectedPerson((prev) => (prev ? shrink(prev) : prev));
  }

  async function addPillar() {
    if (!newPillarName.trim() || !user) return;
    setAddingPillar(true);
    const { data } = await createClient()!
      .from("drm_pillars")
      .insert({ user_id: user.id, name: newPillarName.trim() })
      .select()
      .single();
    if (data) setPillars((prev) => [...prev, data as PillarRow]);
    setNewPillarName("");
    setAddingPillar(false);
  }

  async function togglePillar(pillarId: string, checked: boolean) {
    if (!selectedPerson) return;
    if (checked) {
      await createClient()!
        .from("drm_person_pillars")
        .insert({ person_id: selectedPerson.id, pillar_id: pillarId });
      setPersonPillarIds((prev) => new Set([...prev, pillarId]));
    } else {
      await createClient()!
        .from("drm_person_pillars")
        .delete()
        .eq("person_id", selectedPerson.id)
        .eq("pillar_id", pillarId);
      setPersonPillarIds((prev) => {
        const next = new Set(prev);
        next.delete(pillarId);
        return next;
      });
    }
  }

  async function deletePerson() {
    if (!selectedPerson) return;
    await createClient()!.from("drm_people").delete().eq("id", selectedPerson.id);
    setPeople((prev) => prev.filter((p) => p.id !== selectedPerson.id));
    setSelectedPerson(null);
  }

  function handleBubbleMouseDown(e: React.MouseEvent, person: Person) {
    e.preventDefault();
    didDragRef.current = false;
    setDragging({
      id: person.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: person.pos_x,
      origY: person.pos_y,
    });
  }

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragging.startX;
      const dy = e.clientY - dragging.startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) didDragRef.current = true;
      if (!didDragRef.current || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const newX = Math.max(0.05, Math.min(0.95, dragging.origX + dx / rect.width));
      const newY = Math.max(0.05, Math.min(0.95, dragging.origY + dy / rect.height));
      setPeople((prev) =>
        prev.map((p) => (p.id === dragging.id ? { ...p, pos_x: newX, pos_y: newY } : p))
      );
    };

    const onUp = async (e: MouseEvent) => {
      if (!didDragRef.current) {
        const person = peopleRef.current.find((p) => p.id === dragging.id);
        if (person) openPanelRef.current(person);
      } else if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const dx = e.clientX - dragging.startX;
        const dy = e.clientY - dragging.startY;
        const newX = Math.max(0.05, Math.min(0.95, dragging.origX + dx / rect.width));
        const newY = Math.max(0.05, Math.min(0.95, dragging.origY + dy / rect.height));
        await createClient()!
          .from("drm_people")
          .update({ pos_x: newX, pos_y: newY })
          .eq("id", dragging.id);
      }
      setDragging(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  if (authLoading) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <main className="flex flex-col flex-1 min-h-0 p-2 sm:p-4">
          <div className="flex-1 flex items-center justify-center text-[#373A40]/50 dark:text-white/50">
            Loading...
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <main className="flex flex-col flex-1 min-h-0 p-2 sm:p-4">
          <div
            className="flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden bg-white dark:bg-neutral-900"
            style={{ border: "1px solid var(--border-color)" }}
          >
            <div className="border-b shrink-0" style={{ borderColor: "var(--border-color)" }}>
              <div className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-5">
                <h1 className="text-lg sm:text-xl font-bold leading-tight text-black dark:text-yellow-400">
                  DRM
                </h1>
              </div>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
              <p className="text-[#373A40]/60 dark:text-white/60 mb-6">
                Sign in to access your ecosystem.
              </p>
              <Link
                href="/login"
                className="inline-block rounded bg-black px-6 py-2 text-sm font-medium text-yellow-400"
              >
                Sign In
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <main className="flex flex-col flex-1 min-h-0 p-2 sm:p-4">
        <div
          className="flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden bg-white dark:bg-neutral-900"
          style={{ border: "1px solid var(--border-color)" }}
        >
          {/* Header */}
          <div className="border-b shrink-0" style={{ borderColor: "var(--border-color)" }}>
            <div className="flex items-center justify-between px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-5">
              <h1 className="text-lg sm:text-xl font-bold leading-tight text-black dark:text-yellow-400">
                Ecosystem
              </h1>
              <button
                onClick={() => setShowAddDialog(true)}
                className="flex items-center gap-2 rounded bg-black px-4 py-2 text-sm font-medium text-yellow-400 hover:bg-black/80 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Person
              </button>
            </div>
          </div>

          {/* Bubble canvas */}
          <div
            ref={canvasRef}
            className="flex-1 relative overflow-hidden bg-neutral-50 dark:bg-neutral-950"
            style={{ cursor: dragging ? "grabbing" : "default" }}
          >
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center text-[#373A40]/50 dark:text-white/50">
                Loading...
              </div>
            ) : people.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#373A40]/40 dark:text-white/40">
                <div className="text-5xl">🫧</div>
                <p className="text-sm">No one in your ecosystem yet.</p>
              </div>
            ) : (
              people.map((person) => {
                const r = bubbleRadius(person.evidence_count);
                return (
                  <div
                    key={person.id}
                    className="absolute flex items-center justify-center rounded-full select-none"
                    style={{
                      left: `calc(${person.pos_x * 100}% - ${r}px)`,
                      top: `calc(${person.pos_y * 100}% - ${r}px)`,
                      width: r * 2,
                      height: r * 2,
                      background: `${person.color}b3`,
                      boxShadow: `0 4px 24px ${person.color}55, 0 2px 8px rgba(0,0,0,0.18)`,
                      cursor: dragging?.id === person.id ? "grabbing" : "grab",
                      zIndex: dragging?.id === person.id ? 10 : 1,
                      transition:
                        dragging?.id === person.id
                          ? "none"
                          : "width 0.3s, height 0.3s, left 0.3s, top 0.3s, box-shadow 0.2s",
                    }}
                    onMouseDown={(e) => handleBubbleMouseDown(e, person)}
                  >
                    <span
                      className="font-semibold text-white text-center leading-tight px-2 drop-shadow"
                      style={{
                        fontSize: Math.max(10, Math.min(15, r / 3.5)),
                        maxWidth: r * 2 - 12,
                        wordBreak: "break-word",
                      }}
                    >
                      {person.name}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      {/* Add person dialog */}
      {showAddDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setShowAddDialog(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative z-10 bg-white dark:bg-neutral-900 rounded-2xl p-6 w-80 shadow-2xl"
            style={{ border: "1px solid var(--border-color)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold text-black dark:text-white mb-4">Add Person</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#373A40] dark:text-white/80 mb-1">
                  Name
                </label>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addPerson();
                  }}
                  className="w-full rounded border border-[#373A40]/30 dark:border-white/30 bg-transparent px-3 py-2 text-sm text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-white"
                  placeholder="Name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#373A40] dark:text-white/80 mb-2">
                  Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewColor(c)}
                      className="w-7 h-7 rounded-full transition-transform"
                      style={{
                        background: c,
                        transform: newColor === c ? "scale(1.25)" : "scale(1)",
                        outline: newColor === c ? "2px solid white" : "none",
                        outlineOffset: "2px",
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowAddDialog(false)}
                  className="flex-1 rounded border border-[#373A40]/30 dark:border-white/30 px-4 py-2 text-sm font-medium text-[#373A40] dark:text-white hover:border-black dark:hover:border-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={addPerson}
                  disabled={!newName.trim() || adding}
                  className="flex-1 rounded bg-black px-4 py-2 text-sm font-medium text-yellow-400 hover:bg-black/80 disabled:opacity-50 transition-colors"
                >
                  {adding ? "Adding…" : "Add"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Overlay — always rendered, fades in/out */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        style={{
          opacity: selectedPerson ? 1 : 0,
          pointerEvents: selectedPerson ? "auto" : "none",
          transition: "opacity 0.2s",
        }}
        onClick={() => setSelectedPerson(null)}
      />

      {/* Side panel — always rendered, slides in from right */}
      <div
        className="fixed top-0 right-0 z-50 h-full bg-white dark:bg-neutral-900 overflow-y-auto shadow-2xl"
        style={{
          width: "50%",
          borderLeft: "1px solid var(--border-color)",
          transform: selectedPerson ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.25s ease",
        }}
      >
        {selectedPerson && (
          <>
            {/* Panel header */}
            <div
              className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white dark:bg-neutral-900 z-10"
              style={{ borderColor: "var(--border-color)" }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-4 h-4 rounded-full shrink-0"
                  style={{ background: selectedPerson.color }}
                />
                <h2 className="text-base font-bold text-black dark:text-white truncate">
                  {selectedPerson.name}
                </h2>
                <span className="text-xs text-[#373A40]/50 dark:text-white/50 shrink-0">
                  {selectedPerson.evidence_count} bit
                  {selectedPerson.evidence_count !== 1 ? "s" : ""}
                </span>
              </div>
              <button
                onClick={() => setSelectedPerson(null)}
                className="text-[#373A40]/50 dark:text-white/50 hover:text-black dark:hover:text-white shrink-0 ml-3"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {panelLoading ? (
              <div className="flex items-center justify-center p-12 text-[#373A40]/50 dark:text-white/50">
                Loading…
              </div>
            ) : (
              <div className="p-6 space-y-8">
                {/* Evidence */}
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#373A40]/50 dark:text-white/50 mb-3">
                    Evidence
                  </h3>

                  {(["pro", "con", "evidence"] as const).map((type) => {
                    const items = panelEvidence.filter((e) => e.evidence_type === type);
                    if (items.length === 0) return null;
                    const label =
                      type === "pro" ? "Pros" : type === "con" ? "Cons" : "General";
                    const labelColor =
                      type === "pro"
                        ? "text-green-600 dark:text-green-400"
                        : type === "con"
                        ? "text-red-500 dark:text-red-400"
                        : "text-blue-500 dark:text-blue-400";
                    return (
                      <div key={type} className="mb-4">
                        <p
                          className={`text-xs font-semibold uppercase tracking-wide mb-2 ${labelColor}`}
                        >
                          {label}
                        </p>
                        <div className="space-y-1.5">
                          {items.map((e) => (
                            <div
                              key={e.id}
                              className="group flex items-start gap-2 text-sm text-[#373A40] dark:text-white/80"
                            >
                              <span className="flex-1">{e.content}</span>
                              <button
                                onClick={() => deleteEvidence(e.id)}
                                className="opacity-0 group-hover:opacity-100 text-[#373A40]/40 dark:text-white/40 hover:text-red-500 transition-all shrink-0 mt-0.5"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {panelEvidence.length === 0 && (
                    <p className="text-sm text-[#373A40]/40 dark:text-white/40 mb-3">
                      No evidence yet.
                    </p>
                  )}

                  {/* Add evidence form */}
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={newEvidenceText}
                      onChange={(e) => setNewEvidenceText(e.target.value)}
                      placeholder="Add evidence…"
                      rows={2}
                      className="w-full rounded border border-[#373A40]/30 dark:border-white/30 bg-transparent px-3 py-2 text-sm text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-white resize-none"
                    />
                    <div className="flex gap-2">
                      <select
                        value={newEvidenceType}
                        onChange={(e) =>
                          setNewEvidenceType(e.target.value as "pro" | "con" | "evidence")
                        }
                        className="rounded border border-[#373A40]/30 dark:border-white/30 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm text-black dark:text-white focus:outline-none"
                      >
                        <option value="evidence">General</option>
                        <option value="pro">Pro</option>
                        <option value="con">Con</option>
                      </select>
                      <button
                        onClick={addEvidence}
                        disabled={!newEvidenceText.trim() || addingEvidence}
                        className="flex-1 rounded bg-black px-3 py-1.5 text-sm font-medium text-yellow-400 hover:bg-black/80 disabled:opacity-50 transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </section>

                {/* Pillars */}
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#373A40]/50 dark:text-white/50 mb-3">
                    Pillars
                  </h3>

                  {pillars.length === 0 && (
                    <p className="text-sm text-[#373A40]/40 dark:text-white/40 mb-3">
                      No pillars yet.
                    </p>
                  )}

                  <div className="space-y-2 mb-3">
                    {pillars.map((pillar) => (
                      <label key={pillar.id} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={personPillarIds.has(pillar.id)}
                          onChange={(e) => togglePillar(pillar.id, e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-sm text-black dark:text-white">{pillar.name}</span>
                      </label>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      value={newPillarName}
                      onChange={(e) => setNewPillarName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addPillar();
                      }}
                      placeholder="New pillar…"
                      className="flex-1 rounded border border-[#373A40]/30 dark:border-white/30 bg-transparent px-3 py-1.5 text-sm text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-white"
                    />
                    <button
                      onClick={addPillar}
                      disabled={!newPillarName.trim() || addingPillar}
                      className="rounded bg-black px-3 py-1.5 text-sm font-medium text-yellow-400 hover:bg-black/80 disabled:opacity-50 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </section>

                {/* Delete */}
                <section className="pt-4 border-t border-[#373A40]/10 dark:border-white/10">
                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Pop the bubble
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-[#373A40] dark:text-white/80">
                        Delete <strong>{selectedPerson.name}</strong> and all their evidence? This
                        cannot be undone.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowDeleteConfirm(false)}
                          className="flex-1 rounded border border-[#373A40]/30 dark:border-white/30 px-3 py-1.5 text-sm text-[#373A40] dark:text-white hover:border-black dark:hover:border-white transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={deletePerson}
                          className="flex-1 rounded bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 transition-colors"
                        >
                          Pop it
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
