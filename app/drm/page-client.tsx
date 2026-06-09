"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/app/hooks/useAuth";
import { differenceInDays, parseISO, format } from "date-fns";

// ── Types ──────────────────────────────────────────────────────────────────────

type Stage =
  | "Matched"
  | "Talking"
  | "First Date"
  | "Dating (Non-Exclusive)"
  | "Seeing Each Other (Exclusive-ish)"
  | "Exclusive"
  | "Relationship"
  | "Partnership"
  | "Unmatched";

interface Person {
  id: string;
  user_id: string;
  name: string;
  avatar: string | null;
  stage: Stage;
  status_note: string | null;
  last_contact: string | null;
  next_action: string | null;
  profile_notes: string | null;
  reflection_notes: string | null;
  stage_entered_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DateEntry {
  id: string;
  person_id: string;
  date: string | null;
  location: string | null;
  notes: string | null;
  rating: number | null;
  is_planned: boolean;
  created_at: string;
}

interface Flag {
  id: string;
  person_id: string;
  label: string;
  checked: boolean;
}

interface PillarEntry {
  id: string;
  pillar_id: string;
  text: string;
  polarity: "positive" | "negative";
  created_at: string;
}

interface Pillar {
  id: string;
  person_id: string;
  key: "directed_curiosity" | "reciprocal_investment" | "emotional_range";
  rating: "strong" | "emerging" | "weak" | "absent" | null;
  entries: PillarEntry[];
}

interface PersonData extends Person {
  dates: DateEntry[];
  pillars: Pillar[];
  red_flags: Flag[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STAGES: Stage[] = [
  "Matched",
  "Talking",
  "First Date",
  "Dating (Non-Exclusive)",
  "Seeing Each Other (Exclusive-ish)",
  "Exclusive",
  "Relationship",
  "Partnership",
  "Unmatched",
];

const STAGE_DESCRIPTIONS: Record<Stage, string> = {
  "Matched": "You matched. The connection hasn't started yet.",
  "Talking": "This is the early stage where two people are getting to know each other, typically through texting, messaging apps, or casual phone calls. Conversations are exploratory—light topics, jokes, shared interests, and light flirting. There is no commitment at this point, but there is mutual interest. Frequency and depth of communication are still low, and it's common for multiple people to be in this stage at once.",
  "First Date": "The first in-person meeting. Both parties are evaluating chemistry, attraction, and compatibility. Conversations can be deeper, and there is more physical presence, but it's still exploratory. A first date doesn't imply exclusivity or strong commitment—it's a chance to see if the interest translates into real connection. Nerves, performance, and first impressions dominate this stage.",
  "Dating (Non-Exclusive)": "You are actively going on dates and building a connection, but there is no exclusivity agreement. Both people may still be seeing others. There's growing emotional investment, physical intimacy may develop, and the relationship starts to take on more structure—making plans in advance, regular communication, and increased time together. The goal of this stage is to determine if you want to pursue something exclusive.",
  "Seeing Each Other (Exclusive-ish)": "This is the grey zone between dating and official exclusivity. You may have had a conversation about not seeing other people, or it may just feel implied. You're spending significant time together, meeting friends, and integrating into each other's lives. However, the relationship hasn't been formally defined. There's higher emotional vulnerability here and the need for a DTR (Define The Relationship) conversation often arises.",
  "Exclusive": "You have explicitly agreed to only see each other. This stage represents a clear mutual commitment to building a relationship. You are no longer exploring other options, and expectations for communication, time, and emotional investment increase significantly. There's a growing sense of partnership, but you may not yet consider yourselves in a full relationship—labels like 'boyfriend/girlfriend' may or may not have been established.",
  "Relationship": "This is a fully committed, labeled romantic partnership. Both people identify as being in a relationship. There's deeper integration into each other's lives—families may be introduced, long-term plans may come up, and conflict resolution becomes more important. Emotional depth, trust, and consistency define this stage. You rely on each other in a real way and have established a shared identity as a couple.",
  "Partnership": "This is the deepest stage of committed romantic connection. It goes beyond the typical 'relationship' label and implies a life-oriented bond. This could mean cohabitation, shared finances, engagement, marriage, or simply a deeply intentional long-term commitment. There is a high level of trust, interdependence, and shared vision for the future. Communication, values alignment, and intentional effort are key.",
  "Unmatched": "It ended.",
};

const PILLAR_DEFS: { key: Pillar["key"]; title: string; description: string }[] = [
  {
    key: "directed_curiosity",
    title: "Directed Curiosity",
    description: "Does she build a real model of me, or stay on the surface?",
  },
  {
    key: "reciprocal_investment",
    title: "Reciprocal Investment",
    description: "Does she generate, or only respond?",
  },
  {
    key: "emotional_range",
    title: "Emotional Range Without Volatility",
    description: "Is there depth to connect to, and can she hold it?",
  },
];

const RATING_OPTIONS: { value: NonNullable<Pillar["rating"]>; label: string }[] = [
  { value: "strong", label: "Strong" },
  { value: "emerging", label: "Emerging" },
  { value: "weak", label: "Weak" },
  { value: "absent", label: "Absent" },
];

const PILLAR_RATING_SCORES: Record<NonNullable<Pillar["rating"]>, number> = {
  strong: 100,
  emerging: 66,
  weak: 33,
  absent: 0,
};

const DEFAULT_RED_FLAGS = [
  "I feel more obligated than excited",
  'I\'m avoiding the "this isn\'t working" conversation',
  "I'm primarily attracted to the attention, not the person",
  "I'm rationalizing incompatibilities instead of acknowledging them",
  "I haven't been honest with her about my level of interest",
  "Things haven't progressed in 3+ weeks and I haven't addressed it",
  "I'm keeping her around as a backup",
];

const REFLECTION_QUESTIONS = [
  "Would I be excited to introduce her to a close friend?",
  "Does being around her add energy or drain it?",
  "Am I attracted to who she actually is, or just who I want her to be?",
  "If she asked where this was going, could I answer honestly?",
];

const AVATARS = ["🌸", "💐", "🌺", "🌻", "🌹", "🌷", "✨", "💫", "🦋", "🌙", "⭐", "🎵", "🎭", "🌊", "🍃", "🎀"];

const today = () => new Date().toISOString().split("T")[0];

// ── Theme ──────────────────────────────────────────────────────────────────────

const C = {
  bg: "#f9fafb",
  surface: "#ffffff",
  card: "#f3f4f6",
  border: "#e5e7eb",
  accent: "#e11d48",
  text: "#111827",
  muted: "#6b7280",
  dim: "#9ca3af",
  green: "#16a34a",
  yellow: "#d97706",
  red: "#dc2626",
} as const;

const inputBase: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  color: C.text,
  fontSize: 13,
  padding: "7px 10px",
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  colorScheme: "light",
};

const btnBase: React.CSSProperties = {
  background: "none",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  padding: "5px 12px",
  fontFamily: "inherit",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: C.muted,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 8,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function calcCompatibility(p: PersonData): number {
  const rated = p.pillars.filter((pl) => pl.rating !== null);
  const pillarScore =
    rated.length === 0
      ? 0
      : rated.reduce((sum, pl) => sum + PILLAR_RATING_SCORES[pl.rating!], 0) / rated.length;
  const totalRed = p.red_flags.length || 1;
  const r = p.red_flags.filter((f) => f.checked).length;
  return Math.max(0, Math.min(100, Math.round(pillarScore - (r / totalRed) * 30)));
}

// [greenMax, redMin] thresholds in days
// Sources: Teichmann et al. 2026 (n=500+, JSPR); Hinge Follow-Through Formula data
const MOMENTUM_THRESHOLDS: Record<Stage, [number, number]> = {
  "Matched":                           [1,   3],   // Hinge: 75% expect same-day or next-day contact; matches fade fast
  "Talking":                           [2,   4],   // daily/every-other-day keeps attraction building
  "First Date":                        [1,   3],   // Teichmann 2026: next-morning text peaks interest; 2-day delay causes sharp drop
  "Dating (Non-Exclusive)":            [4,   7],   // 1 date/week cadence; 7+ days without contact is a documented red flag
  "Seeing Each Other (Exclusive-ish)": [5,  10],   // more established — weekly contact still important, up to 10 days before it reads cold
  "Exclusive":                         [5,  10],   // committed but still needs consistent contact
  "Relationship":                      [7,  14],   // deeper bond; 2-week silence starts to register
  "Partnership":                       [7,  14],   // life-partner level; cadence is more flexible but presence still matters
  "Unmatched":                         [999, 999], // terminal stage — momentum not applicable
};

function getMomentum(last: string | null, stage: Stage): "green" | "yellow" | "red" {
  if (stage === "Unmatched") return "green";
  if (!last) return "red";
  const d = differenceInDays(new Date(), parseISO(last));
  const [greenMax, redMin] = MOMENTUM_THRESHOLDS[stage];
  return d < greenMax ? "green" : d < redMin ? "yellow" : "red";
}

function isStagnant(p: Person): boolean {
  if (!p.stage_entered_at) return false;
  return differenceInDays(new Date(), parseISO(p.stage_entered_at)) > 21;
}

function stageIndex(s: Stage): number {
  return STAGES.indexOf(s);
}

function showReflection(s: Stage): boolean {
  return stageIndex(s) >= stageIndex("First Date");
}

function readinessScore(p: PersonData): number {
  const sp = (stageIndex(p.stage) / (STAGES.length - 1)) * 50;
  const cp = calcCompatibility(p) * 0.5;
  return Math.round(sp + cp);
}

// ── Small UI atoms ─────────────────────────────────────────────────────────────

function Dot({ color }: { color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

function CompatBar({ score }: { score: number }) {
  const color = score >= 70 ? C.green : score >= 40 ? C.yellow : C.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 3, background: C.border, borderRadius: 2, overflow: "hidden" }}>
        <div
          style={{
            width: `${score}%`,
            height: "100%",
            background: color,
            borderRadius: 2,
            transition: "width 0.3s",
          }}
        />
      </div>
      <span style={{ fontSize: 10, color: C.muted, minWidth: 26, textAlign: "right" }}>{score}%</span>
    </div>
  );
}

function CompatRing({ score }: { score: number }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = score >= 70 ? C.green : score >= 40 ? C.yellow : C.red;
  return (
    <div
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 56,
        height: 56,
        flexShrink: 0,
      }}
    >
      <svg width="56" height="56" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="28" cy="28" r={r} fill="none" stroke={C.border} strokeWidth="3" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.5s ease" }}
        />
      </svg>
      <span style={{ position: "absolute", fontSize: 10, fontWeight: 700, color }}>{score}%</span>
    </div>
  );
}

function Stars({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 18,
            color: value && n <= value ? C.yellow : C.dim,
            padding: "0 1px",
            lineHeight: 1,
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

// ── PersonCard ─────────────────────────────────────────────────────────────────

function PersonCard({
  person,
  onOpen,
  onUpdateNote,
  onUpdateNextAction,
  ghost,
}: {
  person: PersonData;
  onOpen: () => void;
  onUpdateNote: (v: string) => void;
  onUpdateNextAction: (v: string) => void;
  ghost?: boolean;
}) {
  const compat = calcCompatibility(person);
  const momentum = getMomentum(person.last_contact, person.stage);
  const rChecked = person.red_flags.filter((f) => f.checked).length;
  const stagnant = isStagnant(person);
  const mColor = { green: C.green, yellow: C.yellow, red: C.red }[momentum];

  const [editNote, setEditNote] = useState(false);
  const [noteVal, setNoteVal] = useState(person.status_note ?? "");
  const [editAction, setEditAction] = useState(false);
  const [actionVal, setActionVal] = useState(person.next_action ?? "");

  useEffect(() => {
    if (!editNote) setNoteVal(person.status_note ?? "");
  }, [person.status_note, editNote]);

  useEffect(() => {
    if (!editAction) setActionVal(person.next_action ?? "");
  }, [person.next_action, editAction]);

  return (
    <div
      onClick={onOpen}
      style={{
        background: ghost ? "transparent" : C.card,
        border: `1px solid ${ghost ? "transparent" : C.border}`,
        borderRadius: 10,
        padding: "12px 14px",
        cursor: "pointer",
        opacity: ghost ? 0.25 : 1,
        userSelect: "none",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {/* Name row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: 20, lineHeight: 1, paddingTop: 2, flexShrink: 0 }}>
          {person.avatar || "👤"}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontWeight: 700,
                fontSize: 14,
                color: C.text,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {person.name}
            </span>
            <Dot color={mColor} />
          </div>

          {/* Status note inline edit */}
          {editNote ? (
            <input
              autoFocus
              value={noteVal}
              onChange={(e) => setNoteVal(e.target.value)}
              onBlur={() => {
                onUpdateNote(noteVal);
                setEditNote(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") {
                  onUpdateNote(noteVal);
                  setEditNote(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              placeholder="Status note…"
              style={{
                background: "transparent",
                border: "none",
                borderBottom: `1px solid ${C.accent}`,
                color: C.muted,
                fontSize: 11,
                width: "100%",
                outline: "none",
                padding: "1px 0",
                fontFamily: "inherit",
                marginTop: 2,
              }}
            />
          ) : (
            <p
              onClick={(e) => {
                e.stopPropagation();
                setEditNote(true);
              }}
              style={{
                fontSize: 11,
                color: person.status_note ? C.muted : C.dim,
                margin: 0,
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontStyle: person.status_note ? "normal" : "italic",
                cursor: "text",
              }}
            >
              {person.status_note || "Add note…"}
            </p>
          )}
        </div>
      </div>

      {/* Compatibility bar */}
      <CompatBar score={compat} />

      {/* Last contact */}
      {person.last_contact && (
        <p style={{ fontSize: 10, color: C.dim, margin: 0 }}>
          Last: {format(parseISO(person.last_contact), "MMM d")}
        </p>
      )}

      {/* Next action inline edit */}
      {editAction ? (
        <input
          autoFocus
          value={actionVal}
          onChange={(e) => setActionVal(e.target.value)}
          onBlur={() => {
            onUpdateNextAction(actionVal);
            setEditAction(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              onUpdateNextAction(actionVal);
              setEditAction(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          placeholder="Next action…"
          style={{
            background: "transparent",
            border: "none",
            borderBottom: `1px solid ${C.accent}`,
            color: C.text,
            fontSize: 11,
            width: "100%",
            outline: "none",
            padding: "1px 0",
            fontFamily: "inherit",
          }}
        />
      ) : (
        <p
          onClick={(e) => {
            e.stopPropagation();
            setEditAction(true);
          }}
          style={{
            fontSize: 11,
            color: person.next_action ? C.accent : C.dim,
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            cursor: "text",
            fontStyle: person.next_action ? "normal" : "italic",
          }}
        >
          → {person.next_action || "Set next action…"}
        </p>
      )}

      {/* Planned date idea */}
      {(() => {
        const planned = person.dates.find((d) => d.is_planned);
        return planned ? (
          <p style={{ fontSize: 10, color: C.accent, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            ◈ {planned.location}{planned.date ? ` · ${format(parseISO(planned.date), "MMM d")}` : ""}
          </p>
        ) : null;
      })()}

      {/* Accountability prompts */}
      {stagnant && (
        <p style={{ fontSize: 10, color: C.yellow, margin: 0, fontStyle: "italic" }}>
          ⚠ 3+ weeks in this stage
        </p>
      )}
      {rChecked >= 2 && (
        <p style={{ fontSize: 10, color: C.red, margin: 0 }}>⚑ {rChecked} red flags</p>
      )}
    </div>
  );
}

function DraggableCard({
  person,
  onOpen,
  onUpdateNote,
  onUpdateNextAction,
}: {
  person: PersonData;
  onOpen: () => void;
  onUpdateNote: (v: string) => void;
  onUpdateNextAction: (v: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: person.id,
    data: { stage: person.stage },
  });

  return (
    <div ref={setNodeRef} style={{ touchAction: "none" }} {...attributes} {...listeners}>
      <PersonCard
        person={person}
        onOpen={onOpen}
        onUpdateNote={onUpdateNote}
        onUpdateNextAction={onUpdateNextAction}
        ghost={isDragging}
      />
    </div>
  );
}

// ── StageColumn ────────────────────────────────────────────────────────────────

function StageColumn({
  stage,
  people,
  onCardOpen,
  onUpdateNote,
  onUpdateNextAction,
  isOver,
}: {
  stage: Stage;
  people: PersonData[];
  onCardOpen: (id: string) => void;
  onUpdateNote: (id: string, v: string) => void;
  onUpdateNextAction: (id: string, v: string) => void;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: stage });

  const sorted = useMemo(
    () =>
      [...people].sort((a, b) => {
        if (!a.last_contact) return 1;
        if (!b.last_contact) return -1;
        return new Date(b.last_contact).getTime() - new Date(a.last_contact).getTime();
      }),
    [people],
  );

  return (
    <div
      ref={setNodeRef}
      style={{ width: 220, minWidth: 220, display: "flex", flexDirection: "column" }}
    >
      {/* Column header */}
      <div
        style={{
          marginBottom: 12,
          paddingBottom: 8,
          borderBottom: `2px solid ${isOver ? C.accent : C.border}`,
          transition: "border-color 0.15s",
        }}
      >
        <h3
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: isOver ? C.accent : C.muted,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            margin: 0,
            transition: "color 0.15s",
          }}
        >
          {stage}
        </h3>
        <span style={{ fontSize: 11, color: C.dim }}>{people.length}</span>
      </div>

      {/* Cards */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          minHeight: 100,
          borderRadius: 8,
          padding: isOver ? "6px" : "0",
          background: isOver ? "rgba(225,29,72,0.04)" : "transparent",
          transition: "all 0.15s",
        }}
      >
        {sorted.map((p) => (
          <DraggableCard
            key={p.id}
            person={p}
            onOpen={() => onCardOpen(p.id)}
            onUpdateNote={(v) => onUpdateNote(p.id, v)}
            onUpdateNextAction={(v) => onUpdateNextAction(p.id, v)}
          />
        ))}
        {people.length === 0 && (
          <div
            style={{
              height: 80,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: `1px dashed ${C.border}`,
              borderRadius: 8,
              color: C.dim,
              fontSize: 12,
            }}
          >
            empty
          </div>
        )}
      </div>
    </div>
  );
}

// ── PillarCard ─────────────────────────────────────────────────────────────────

function PillarCard({
  pillar,
  def,
  onSetRating,
  onAddEntry,
}: {
  pillar: Pillar;
  def: { key: Pillar["key"]; title: string; description: string };
  onSetRating: (rating: Pillar["rating"]) => Promise<void>;
  onAddEntry: (text: string, polarity: "positive" | "negative") => Promise<void>;
}) {
  const [entryText, setEntryText] = useState("");
  const [polarity, setPolarity] = useState<"positive" | "negative">("positive");
  const [saving, setSaving] = useState(false);

  const sortedEntries = useMemo(
    () => [...pillar.entries].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [pillar.entries],
  );

  async function submit() {
    if (!entryText.trim() || saving) return;
    setSaving(true);
    await onAddEntry(entryText.trim(), polarity);
    setEntryText("");
    setSaving(false);
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
      <div style={{ marginBottom: 10 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: 0 }}>{def.title}</p>
        <p style={{ fontSize: 11, color: C.muted, margin: "2px 0 0", lineHeight: 1.5 }}>{def.description}</p>
      </div>

      {/* Rating selector */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {RATING_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onSetRating(pillar.rating === opt.value ? null : opt.value)}
            style={{
              fontSize: 11,
              padding: "4px 10px",
              borderRadius: 20,
              border: `1px solid ${pillar.rating === opt.value ? C.accent : C.border}`,
              background: pillar.rating === opt.value ? "rgba(225,29,72,0.12)" : "transparent",
              color: pillar.rating === opt.value ? C.accent : C.muted,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Evidence log */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
        {sortedEntries.map((e) => (
          <div key={e.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ marginTop: 5 }}>
              <Dot color={e.polarity === "positive" ? C.green : C.red} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, color: C.text, margin: 0, lineHeight: 1.5 }}>{e.text}</p>
              <p style={{ fontSize: 10, color: C.dim, margin: 0 }}>
                {format(parseISO(e.created_at), "MMM d, yyyy")}
              </p>
            </div>
          </div>
        ))}
        {sortedEntries.length === 0 && (
          <p style={{ fontSize: 12, color: C.dim, fontStyle: "italic", margin: 0 }}>No entries yet.</p>
        )}
      </div>

      {/* Add entry */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          value={entryText}
          onChange={(e) => setEntryText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="What happened?"
          style={{ ...inputBase, flex: 1 }}
        />
        <button
          onClick={() => setPolarity((p) => (p === "positive" ? "negative" : "positive"))}
          title="Toggle positive / negative"
          style={{
            ...btnBase,
            border: `1px solid ${polarity === "positive" ? C.green : C.red}`,
            color: polarity === "positive" ? C.green : C.red,
            fontSize: 11,
            padding: "6px 10px",
            flexShrink: 0,
          }}
        >
          {polarity === "positive" ? "Positive" : "Negative"}
        </button>
        <button
          onClick={submit}
          disabled={!entryText.trim() || saving}
          style={{
            ...btnBase,
            background: entryText.trim() ? C.accent : C.border,
            color: entryText.trim() ? "#fff" : C.dim,
            fontWeight: 600,
            fontSize: 11,
            padding: "6px 12px",
            flexShrink: 0,
          }}
        >
          {saving ? "…" : "Add"}
        </button>
      </div>
    </div>
  );
}

// ── DetailDrawer ───────────────────────────────────────────────────────────────

function DetailDrawer({
  person,
  onClose,
  onUpdate,
  onUpdateRedFlag,
  onSetPillarRating,
  onAddPillarEntry,
  onAddDate,
  onCompleteDate,
  onDeleteDate,
  onDeletePerson,
  dateIdeas,
}: {
  person: PersonData;
  onClose: () => void;
  onUpdate: (id: string, fields: Partial<Person>) => Promise<void>;
  onUpdateRedFlag: (flagId: string, checked: boolean) => Promise<void>;
  onSetPillarRating: (personId: string, key: Pillar["key"], rating: Pillar["rating"]) => Promise<void>;
  onAddPillarEntry: (personId: string, key: Pillar["key"], text: string, polarity: "positive" | "negative") => Promise<void>;
  onAddDate: (entry: Omit<DateEntry, "id" | "person_id" | "created_at">) => Promise<void>;
  onCompleteDate: (dateId: string, rating: number | null) => Promise<void>;
  onDeleteDate: (dateId: string) => Promise<void>;
  onDeletePerson: (id: string) => Promise<void>;
  dateIdeas: string[];
}) {
  const compat = calcCompatibility(person);
  const momentum = getMomentum(person.last_contact, person.stage);
  const rChecked = person.red_flags.filter((f) => f.checked).length;
  const stagnant = isStagnant(person);
  const mColor = { green: C.green, yellow: C.yellow, red: C.red }[momentum];

  const [profileNotes, setProfileNotes] = useState(person.profile_notes ?? "");
  const [reflNotes, setReflNotes] = useState(person.reflection_notes ?? "");
  const [nextAction, setNextAction] = useState(person.next_action ?? "");
  const [lastContact, setLastContact] = useState(person.last_contact ?? "");

  const [showDateForm, setShowDateForm] = useState(false);
  const [dDate, setDDate] = useState(today());
  const [dLoc, setDLoc] = useState("");
  const [dNotes, setDNotes] = useState("");
  const [dRating, setDRating] = useState<number | null>(null);
  const [savingDate, setSavingDate] = useState(false);

  const [showPlanForm, setShowPlanForm] = useState(false);
  const [planIdea, setPlanIdea] = useState("");
  const [planDate, setPlanDate] = useState("");
  const [planNotes, setPlanNotes] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [completeRating, setCompleteRating] = useState<number | null>(null);

  useEffect(() => {
    setProfileNotes(person.profile_notes ?? "");
    setReflNotes(person.reflection_notes ?? "");
    setNextAction(person.next_action ?? "");
    setLastContact(person.last_contact ?? "");
  }, [person.id]);

  async function submitDate() {
    if (!dDate || savingDate) return;
    setSavingDate(true);
    await onAddDate({ date: dDate, location: dLoc || null, notes: dNotes || null, rating: dRating, is_planned: false });
    setDDate(today());
    setDLoc("");
    setDNotes("");
    setDRating(null);
    setShowDateForm(false);
    setSavingDate(false);
  }

  async function submitPlan() {
    if (!planIdea.trim() || savingPlan) return;
    setSavingPlan(true);
    await onAddDate({
      date: planDate || null,
      location: planIdea.trim(),
      notes: planNotes || null,
      rating: null,
      is_planned: true,
    });
    setPlanIdea("");
    setPlanDate("");
    setPlanNotes("");
    setShowPlanForm(false);
    setSavingPlan(false);
  }

  const sortedDates = useMemo(
    () => [...person.dates].sort((a, b) => {
      if (a.is_planned !== b.is_planned) return a.is_planned ? -1 : 1;
      if (!a.date) return -1;
      if (!b.date) return 1;
      return b.date.localeCompare(a.date);
    }),
    [person.dates],
  );

  const filteredSuggestions = useMemo(
    () => planIdea.length > 0
      ? dateIdeas.filter((s) => s.toLowerCase().includes(planIdea.toLowerCase()) && s.toLowerCase() !== planIdea.toLowerCase())
      : dateIdeas,
    [planIdea, dateIdeas],
  );

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 40 }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: 420,
          height: "100dvh",
          background: C.surface,
          borderLeft: `1px solid ${C.border}`,
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            gap: 14,
            position: "sticky",
            top: 0,
            background: C.surface,
            zIndex: 1,
          }}
        >
          <span style={{ fontSize: 36, lineHeight: 1, flexShrink: 0 }}>{person.avatar || "👤"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ color: C.text, fontSize: 18, fontWeight: 800, margin: 0, letterSpacing: "-0.01em" }}>
              {person.name}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              <Dot color={mColor} />
              <span style={{ color: C.muted, fontSize: 11 }}>{person.stage}</span>
            </div>
          </div>
          <CompatRing score={compat} />
          <button
            onClick={onClose}
            style={{ ...btnBase, color: C.muted, fontSize: 18, padding: 6, flexShrink: 0 }}
          >
            ✕
          </button>
        </div>

        {/* Warnings */}
        {(stagnant || rChecked >= 2) && (
          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
            {stagnant && (
              <div
                style={{
                  background: "rgba(234,179,8,0.07)",
                  border: `1px solid rgba(234,179,8,0.2)`,
                  borderRadius: 8,
                  padding: "9px 12px",
                  fontSize: 12,
                  color: C.yellow,
                  lineHeight: 1.5,
                }}
              >
                You've been here a while. Is something being avoided?
              </div>
            )}
            {rChecked >= 2 && (
              <div
                style={{
                  background: "rgba(239,68,68,0.07)",
                  border: `1px solid rgba(239,68,68,0.2)`,
                  borderRadius: 8,
                  padding: "9px 12px",
                  fontSize: 12,
                  color: C.red,
                  lineHeight: 1.5,
                }}
              >
                Some patterns here worth paying attention to. What's the honest read?
              </div>
            )}
          </div>
        )}

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 28,
          }}
        >
          {/* Stage selector */}
          <section>
            <span style={sectionLabel}>Stage</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {STAGES.map((s) => (
                <button
                  key={s}
                  title={STAGE_DESCRIPTIONS[s]}
                  onClick={() => {
                    if (s !== person.stage) {
                      onUpdate(person.id, { stage: s, stage_entered_at: today() });
                    }
                  }}
                  style={{
                    fontSize: 10,
                    padding: "4px 9px",
                    borderRadius: 20,
                    border: `1px solid ${person.stage === s ? C.accent : C.border}`,
                    background: person.stage === s ? "rgba(225,29,72,0.12)" : "transparent",
                    color: person.stage === s ? C.accent : C.muted,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 0.15s",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </section>

          {/* Last contact */}
          <section>
            <label style={sectionLabel}>Last Contact</label>
            <input
              type="date"
              value={lastContact}
              onChange={(e) => setLastContact(e.target.value)}
              onBlur={() => onUpdate(person.id, { last_contact: lastContact || null })}
              style={{ ...inputBase, width: "auto" }}
            />
          </section>

          {/* Profile notes */}
          <section>
            <label style={sectionLabel}>Profile Notes</label>
            <textarea
              value={profileNotes}
              onChange={(e) => setProfileNotes(e.target.value)}
              onBlur={() => onUpdate(person.id, { profile_notes: profileNotes || null })}
              placeholder="How you met, vibe, what they respond to, things they've mentioned…"
              rows={4}
              style={{
                ...inputBase,
                resize: "vertical",
                lineHeight: 1.6,
                padding: "10px 12px",
              }}
            />
          </section>

          {/* Dates */}
          <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ ...sectionLabel, marginBottom: 0 }}>
                Dates ({person.dates.length})
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => { setShowPlanForm((p) => !p); setShowDateForm(false); }}
                  style={{ ...btnBase, border: `1px solid ${C.border}`, color: C.muted, fontSize: 11, padding: "3px 9px" }}
                >
                  {showPlanForm ? "Cancel" : "Plan date"}
                </button>
                <button
                  onClick={() => { setShowDateForm((p) => !p); setShowPlanForm(false); }}
                  style={{ ...btnBase, border: `1px solid ${C.border}`, color: C.muted, fontSize: 11, padding: "3px 9px" }}
                >
                  {showDateForm ? "Cancel" : "+ Log date"}
                </button>
              </div>
            </div>

            {/* Plan date form */}
            {showPlanForm && (
              <div style={{ background: C.card, border: `1px solid ${C.accent}`, borderRadius: 10, padding: 14, marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                <p style={{ fontSize: 11, color: C.accent, margin: 0, fontWeight: 600 }}>Plan a date idea</p>
                <div style={{ position: "relative" }}>
                  <input
                    value={planIdea}
                    onChange={(e) => { setPlanIdea(e.target.value); setShowSuggestions(true); }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    placeholder="What's the idea? (e.g. jazz bar, hiking, cooking class)"
                    style={{ ...inputBase }}
                    autoFocus
                  />
                  {showSuggestions && filteredSuggestions.length > 0 && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, zIndex: 10, maxHeight: 140, overflowY: "auto", marginTop: 2 }}>
                      {filteredSuggestions.map((s) => (
                        <button
                          key={s}
                          onMouseDown={() => { setPlanIdea(s); setShowSuggestions(false); }}
                          style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", color: C.text, fontSize: 12, padding: "7px 10px", cursor: "pointer", fontFamily: "inherit" }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="date"
                    value={planDate}
                    onChange={(e) => setPlanDate(e.target.value)}
                    style={{ ...inputBase, flex: "0 0 auto", width: "auto" }}
                  />
                  <input
                    value={planNotes}
                    onChange={(e) => setPlanNotes(e.target.value)}
                    placeholder="Any details…"
                    style={{ ...inputBase }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={submitPlan}
                    disabled={!planIdea.trim() || savingPlan}
                    style={{ ...btnBase, background: planIdea.trim() ? C.accent : C.border, color: planIdea.trim() ? "#fff" : C.dim, fontWeight: 600, padding: "7px 16px" }}
                  >
                    {savingPlan ? "Saving…" : "Save plan"}
                  </button>
                </div>
              </div>
            )}

            {/* Log date form */}
            {showDateForm && (
              <div style={{ background: C.card, border: `1px solid ${C.accent}`, borderRadius: 10, padding: 14, marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="date"
                    value={dDate}
                    onChange={(e) => setDDate(e.target.value)}
                    style={{ ...inputBase, flex: "0 0 auto", width: "auto" }}
                  />
                  <input
                    value={dLoc}
                    onChange={(e) => setDLoc(e.target.value)}
                    placeholder="Where / what"
                    style={{ ...inputBase }}
                  />
                </div>
                <textarea
                  value={dNotes}
                  onChange={(e) => setDNotes(e.target.value)}
                  placeholder="Brief notes…"
                  rows={2}
                  style={{ ...inputBase, resize: "vertical", lineHeight: 1.5 }}
                />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <p style={{ fontSize: 10, color: C.dim, margin: "0 0 4px" }}>How did it feel?</p>
                    <Stars value={dRating} onChange={setDRating} />
                  </div>
                  <button
                    onClick={submitDate}
                    disabled={!dDate || savingDate}
                    style={{ ...btnBase, background: dDate ? C.accent : C.border, color: dDate ? "#fff" : C.dim, fontWeight: 600, padding: "7px 16px" }}
                  >
                    {savingDate ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sortedDates.map((d) => (
                <div
                  key={d.id}
                  style={{
                    background: C.card,
                    border: d.is_planned ? `1px dashed ${C.accent}` : `1px solid ${C.border}`,
                    borderRadius: 8,
                    padding: "10px 12px",
                  }}
                >
                  {d.is_planned ? (
                    <>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 10, color: C.accent, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>Planned</span>
                          {d.date && <span style={{ fontSize: 11, color: C.muted }}>· {format(parseISO(d.date), "MMM d")}</span>}
                        </div>
                        <button onClick={() => onDeleteDate(d.id)} style={{ ...btnBase, color: C.dim, padding: "1px 4px", fontSize: 13 }}>✕</button>
                      </div>
                      <p style={{ fontSize: 13, color: C.text, margin: "0 0 6px", fontWeight: 600 }}>{d.location}</p>
                      {d.notes && <p style={{ fontSize: 12, color: C.muted, margin: "0 0 8px", lineHeight: 1.5 }}>{d.notes}</p>}
                      {completingId === d.id ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Stars value={completeRating} onChange={setCompleteRating} />
                          <button
                            onClick={async () => { await onCompleteDate(d.id, completeRating); setCompletingId(null); setCompleteRating(null); }}
                            style={{ ...btnBase, background: C.green, color: "#fff", fontWeight: 600, fontSize: 11, padding: "4px 10px" }}
                          >
                            Confirm
                          </button>
                          <button onClick={() => { setCompletingId(null); setCompleteRating(null); }} style={{ ...btnBase, color: C.dim, fontSize: 11 }}>Cancel</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setCompletingId(d.id)}
                          style={{ ...btnBase, border: `1px solid ${C.green}`, color: C.green, fontSize: 11, padding: "4px 10px" }}
                        >
                          ✓ Mark done
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: d.notes ? 4 : 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                          {d.date ? format(parseISO(d.date), "MMM d, yyyy") : "Date TBD"}
                          {d.location && <span style={{ fontWeight: 400, color: C.muted }}> · {d.location}</span>}
                        </span>
                        {d.rating && <span style={{ color: C.yellow, fontSize: 12 }}>{"★".repeat(d.rating)}</span>}
                      </div>
                      {d.notes && <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.5 }}>{d.notes}</p>}
                    </>
                  )}
                </div>
              ))}
              {person.dates.length === 0 && (
                <p style={{ fontSize: 12, color: C.dim, fontStyle: "italic", margin: 0 }}>No dates yet. Plan one above.</p>
              )}
            </div>
          </section>

          {/* Evidence pillars */}
          <section>
            <span style={sectionLabel}>Evidence Pillars</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {PILLAR_DEFS.map((def) => {
                const pillar = person.pillars.find((pl) => pl.key === def.key)!;
                return (
                  <PillarCard
                    key={def.key}
                    pillar={pillar}
                    def={def}
                    onSetRating={(rating) => onSetPillarRating(person.id, def.key, rating)}
                    onAddEntry={(text, polarity) => onAddPillarEntry(person.id, def.key, text, polarity)}
                  />
                );
              })}
            </div>
          </section>

          {/* Red flags */}
          <section>
            <span style={{ ...sectionLabel, color: C.red }}>
              Red Flag / Pattern Check ({person.red_flags.filter((f) => f.checked).length}/{person.red_flags.length})
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {person.red_flags.map((flag) => (
                <label
                  key={flag.id}
                  style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={flag.checked}
                    onChange={() => onUpdateRedFlag(flag.id, !flag.checked)}
                    style={{ marginTop: 2, accentColor: C.red, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 13, color: flag.checked ? C.red : C.muted, lineHeight: 1.5 }}>
                    {flag.label}
                  </span>
                </label>
              ))}
            </div>
          </section>

          {/* Compatibility prompts — First Date Done and beyond */}
          {showReflection(person.stage) && (
            <section>
              <span style={sectionLabel}>Compatibility Prompts</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                {REFLECTION_QUESTIONS.map((q, i) => (
                  <p
                    key={i}
                    style={{
                      fontSize: 13,
                      color: C.muted,
                      margin: 0,
                      padding: "9px 12px",
                      background: C.card,
                      borderRadius: 6,
                      borderLeft: `2px solid ${C.border}`,
                      lineHeight: 1.6,
                    }}
                  >
                    {q}
                  </p>
                ))}
              </div>
              <textarea
                value={reflNotes}
                onChange={(e) => setReflNotes(e.target.value)}
                onBlur={() => onUpdate(person.id, { reflection_notes: reflNotes || null })}
                placeholder="Sit with these. Write anything that comes up…"
                rows={3}
                style={{ ...inputBase, resize: "vertical", lineHeight: 1.6, padding: "10px 12px" }}
              />
            </section>
          )}

          {/* Next action */}
          <section style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
            <label style={{ ...sectionLabel, color: C.accent }}>→ Next Action</label>
            <input
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              onBlur={() => onUpdate(person.id, { next_action: nextAction || null })}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              placeholder="One specific thing to do next…"
              style={{
                ...inputBase,
                fontSize: 14,
                fontWeight: 600,
                padding: "10px 12px",
              }}
            />
          </section>

          {/* Delete */}
          <section>
            <button
              onClick={() => {
                if (confirm(`Remove ${person.name} from the pipeline?`)) onDeletePerson(person.id);
              }}
              style={{
                ...btnBase,
                border: `1px solid rgba(239,68,68,0.25)`,
                color: "rgba(239,68,68,0.5)",
                fontSize: 12,
                padding: "6px 14px",
              }}
            >
              Remove from pipeline
            </button>
          </section>

          <div style={{ height: 40 }} />
        </div>
      </div>
    </>
  );
}

// ── StatusReport ───────────────────────────────────────────────────────────────

function StatusReport({
  people,
  onSwitch,
}: {
  people: PersonData[];
  onSwitch: () => void;
}) {
  const allPeople = STAGES.flatMap((s) => people.filter((p) => p.stage === s));

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h2 style={{ color: C.text, fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
            Weekly Review
          </h2>
          <p style={{ color: C.dim, fontSize: 11, margin: "4px 0 0", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {people.length} in pipeline
          </p>
        </div>
        <button
          onClick={onSwitch}
          style={{ ...btnBase, border: `1px solid ${C.border}`, color: C.muted, fontSize: 12, padding: "7px 16px" }}
        >
          ← Pipeline
        </button>
      </div>

      {people.length === 0 && (
        <p style={{ color: C.dim, fontStyle: "italic", fontSize: 14 }}>No one in the pipeline yet.</p>
      )}

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
          <thead>
            <tr>
              {["Name", "Stage", "Mom.", "Compat.", "Readiness", "Last Contact", "Next Action", "Red Flags"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    fontSize: 10,
                    fontWeight: 700,
                    color: C.dim,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    padding: "0 12px 10px 0",
                    borderBottom: `1px solid ${C.border}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allPeople.map((p) => {
              const compat = calcCompatibility(p);
              const momentum = getMomentum(p.last_contact, p.stage);
              const mColor = { green: C.green, yellow: C.yellow, red: C.red }[momentum];
              const rFlags = p.red_flags.filter((f) => f.checked);
              const stagnant = isStagnant(p);
              const readiness = readinessScore(p);

              return (
                <tr
                  key={p.id}
                  style={{
                    background: stagnant ? "rgba(234,179,8,0.025)" : "transparent",
                  }}
                >
                  <td style={{ padding: "12px 12px 12px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{p.avatar || "👤"}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>
                        {p.name}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 12px 12px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap" }}>{p.stage}</span>
                  </td>
                  <td style={{ padding: "12px 12px 12px 0", borderBottom: `1px solid ${C.border}` }}>
                    <Dot color={mColor} />
                  </td>
                  <td style={{ padding: "12px 12px 12px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: compat >= 70 ? C.green : compat >= 40 ? C.yellow : C.red,
                      }}
                    >
                      {compat}%
                    </span>
                  </td>
                  <td style={{ padding: "12px 12px 12px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 80 }}>
                      <div style={{ flex: 1, height: 3, background: C.border, borderRadius: 2, overflow: "hidden", minWidth: 50 }}>
                        <div
                          style={{
                            width: `${readiness}%`,
                            height: "100%",
                            background: C.accent,
                            borderRadius: 2,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 10, color: C.muted }}>{readiness}%</span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 12px 12px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>
                      {p.last_contact ? format(parseISO(p.last_contact), "MMM d") : "—"}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "12px 12px 12px 0",
                      borderBottom: `1px solid ${C.border}`,
                      maxWidth: 200,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        color: p.next_action ? C.accent : C.dim,
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.next_action || "—"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 0 12px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {rFlags.map((f) => (
                        <span key={f.id} style={{ fontSize: 10, color: C.red, whiteSpace: "nowrap" }}>
                          ⚑ {f.label}
                        </span>
                      ))}
                      {stagnant && (
                        <span style={{ fontSize: 10, color: C.yellow, whiteSpace: "nowrap" }}>
                          ⚠ Stagnant
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── AddPersonModal ─────────────────────────────────────────────────────────────

function AddPersonModal({
  onAdd,
  onClose,
}: {
  onAdd: (name: string, avatar: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!name.trim() || saving) return;
    setSaving(true);
    await onAdd(name.trim(), avatar);
    setSaving(false);
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 60 }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: "28px 32px",
          width: 360,
          zIndex: 70,
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <h2 style={{ color: C.text, fontSize: 18, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
          Add to Pipeline
        </h2>

        <div>
          <label style={{ ...sectionLabel }}>Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") onClose();
            }}
            placeholder="Her name…"
            style={{ ...inputBase, fontSize: 15, padding: "10px 12px" }}
          />
        </div>

        <div>
          <label style={{ ...sectionLabel }}>Avatar</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {AVATARS.map((em) => (
              <button
                key={em}
                onClick={() => setAvatar(em)}
                style={{
                  fontSize: 20,
                  padding: 7,
                  borderRadius: 8,
                  border: `2px solid ${avatar === em ? C.accent : "transparent"}`,
                  background: avatar === em ? "rgba(225,29,72,0.12)" : C.card,
                  cursor: "pointer",
                  lineHeight: 1,
                  transition: "all 0.15s",
                }}
              >
                {em}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ ...btnBase, border: `1px solid ${C.border}`, color: C.muted, padding: "8px 16px" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || saving}
            style={{
              ...btnBase,
              background: name.trim() ? C.accent : C.border,
              color: name.trim() ? "#fff" : C.dim,
              fontWeight: 700,
              padding: "8px 22px",
              transition: "all 0.15s",
            }}
          >
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function DRMPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user, loading: authLoading } = useAuth();

  const [people, setPeople] = useState<PersonData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [view, setView] = useState<"pipeline" | "report">("pipeline");
  const [showAdd, setShowAdd] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // ── Fetch ─────────────────────────────────────────────────

  useEffect(() => {
    if (!supabase || !user) return;
    setLoading(true);
    setError(null);

    (async () => {
      const { data: rawPeople, error: pErr } = await supabase
        .from("drm_people")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (pErr) {
        setError(pErr.message);
        setLoading(false);
        return;
      }

      if (!rawPeople || rawPeople.length === 0) {
        setPeople([]);
        setLoading(false);
        return;
      }

      const ids = (rawPeople as Person[]).map((p) => p.id);

      const [datesRes, redRes, pillarsRes] = await Promise.all([
        supabase.from("drm_dates").select("*").in("person_id", ids).order("date", { ascending: false }),
        supabase.from("drm_red_flags").select("*").in("person_id", ids),
        supabase.from("drm_pillars").select("*").in("person_id", ids),
      ]);

      const dates: DateEntry[] = (datesRes.data as DateEntry[]) || [];
      const reds: Flag[] = (redRes.data as Flag[]) || [];
      const pillarRows: Omit<Pillar, "entries">[] = (pillarsRes.data as Omit<Pillar, "entries">[]) || [];

      const pillarIds = pillarRows.map((pl) => pl.id);
      let entries: PillarEntry[] = [];
      if (pillarIds.length > 0) {
        const { data: entryRows } = await supabase
          .from("drm_pillar_entries")
          .select("*")
          .in("pillar_id", pillarIds);
        entries = (entryRows as PillarEntry[]) || [];
      }

      const merged: PersonData[] = (rawPeople as Person[]).map((p) => {
        const personPillars = pillarRows.filter((pl) => pl.person_id === p.id);
        const pillars: Pillar[] = PILLAR_DEFS.map((def) => {
          const existing = personPillars.find((pl) => pl.key === def.key);
          if (existing) {
            return { ...existing, entries: entries.filter((e) => e.pillar_id === existing.id) };
          }
          return { id: "", person_id: p.id, key: def.key, rating: null, entries: [] };
        });
        return {
          ...p,
          dates: dates.filter((d) => d.person_id === p.id),
          pillars,
          red_flags: reds.filter((f) => f.person_id === p.id),
        };
      });

      setPeople(merged);
      setLoading(false);
    })();
  }, [supabase, user]);

  // ── CRUD ──────────────────────────────────────────────────

  const updatePerson = useCallback(
    async (id: string, fields: Partial<Person>) => {
      setPeople((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, ...fields, updated_at: new Date().toISOString() } : p,
        ),
      );
      if (!supabase) return;
      await supabase
        .from("drm_people")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id);
    },
    [supabase],
  );

  const updateRedFlag = useCallback(
    async (flagId: string, checked: boolean) => {
      setPeople((prev) =>
        prev.map((p) => ({
          ...p,
          red_flags: p.red_flags.map((f) => (f.id === flagId ? { ...f, checked } : f)),
        })),
      );
      if (!supabase) return;
      await supabase.from("drm_red_flags").update({ checked }).eq("id", flagId);
    },
    [supabase],
  );

  const setPillarRating = useCallback(
    async (personId: string, key: Pillar["key"], rating: Pillar["rating"]) => {
      if (!supabase) return;
      const person = people.find((p) => p.id === personId);
      const pillar = person?.pillars.find((pl) => pl.key === key);
      if (!pillar) return;

      if (pillar.id) {
        setPeople((prev) =>
          prev.map((p) =>
            p.id === personId
              ? { ...p, pillars: p.pillars.map((pl) => (pl.key === key ? { ...pl, rating } : pl)) }
              : p,
          ),
        );
        await supabase.from("drm_pillars").update({ rating }).eq("id", pillar.id);
      } else {
        const { data, error: err } = await supabase
          .from("drm_pillars")
          .insert({ person_id: personId, key, rating })
          .select()
          .single();
        if (!err && data) {
          setPeople((prev) =>
            prev.map((p) =>
              p.id === personId
                ? {
                    ...p,
                    pillars: p.pillars.map((pl) =>
                      pl.key === key ? { ...pl, id: data.id, rating: data.rating } : pl,
                    ),
                  }
                : p,
            ),
          );
        }
      }
    },
    [supabase, people],
  );

  const addPillarEntry = useCallback(
    async (personId: string, key: Pillar["key"], text: string, polarity: "positive" | "negative") => {
      if (!supabase) return;
      const person = people.find((p) => p.id === personId);
      const pillar = person?.pillars.find((pl) => pl.key === key);
      if (!pillar) return;

      let pillarId = pillar.id;
      if (!pillarId) {
        const { data, error: err } = await supabase
          .from("drm_pillars")
          .insert({ person_id: personId, key, rating: null })
          .select()
          .single();
        if (err || !data) return;
        pillarId = data.id;
        setPeople((prev) =>
          prev.map((p) =>
            p.id === personId
              ? { ...p, pillars: p.pillars.map((pl) => (pl.key === key ? { ...pl, id: pillarId } : pl)) }
              : p,
          ),
        );
      }

      const { data: entryData, error: entryErr } = await supabase
        .from("drm_pillar_entries")
        .insert({ pillar_id: pillarId, text, polarity })
        .select()
        .single();
      if (!entryErr && entryData) {
        setPeople((prev) =>
          prev.map((p) =>
            p.id === personId
              ? {
                  ...p,
                  pillars: p.pillars.map((pl) =>
                    pl.key === key ? { ...pl, entries: [...pl.entries, entryData as PillarEntry] } : pl,
                  ),
                }
              : p,
          ),
        );
      }
    },
    [supabase, people],
  );

  const addDate = useCallback(
    async (personId: string, entry: Omit<DateEntry, "id" | "person_id" | "created_at">) => {
      if (!supabase) return;
      const { data, error: err } = await supabase
        .from("drm_dates")
        .insert({ ...entry, person_id: personId })
        .select()
        .single();
      if (!err && data) {
        setPeople((prev) =>
          prev.map((p) =>
            p.id === personId ? { ...p, dates: [data as DateEntry, ...p.dates] } : p,
          ),
        );
      }
    },
    [supabase],
  );

  const completeDate = useCallback(
    async (dateId: string, personId: string, rating: number | null) => {
      if (!supabase) return;
      const { data, error: err } = await supabase
        .from("drm_dates")
        .update({ is_planned: false, date: today(), rating })
        .eq("id", dateId)
        .select()
        .single();
      if (!err && data) {
        setPeople((prev) =>
          prev.map((p) =>
            p.id === personId
              ? { ...p, dates: p.dates.map((d) => (d.id === dateId ? (data as DateEntry) : d)) }
              : p,
          ),
        );
      }
    },
    [supabase],
  );

  const deleteDate = useCallback(
    async (dateId: string, personId: string) => {
      if (!supabase) return;
      await supabase.from("drm_dates").delete().eq("id", dateId);
      setPeople((prev) =>
        prev.map((p) =>
          p.id === personId ? { ...p, dates: p.dates.filter((d) => d.id !== dateId) } : p,
        ),
      );
    },
    [supabase],
  );

  const addPerson = useCallback(
    async (name: string, avatar: string) => {
      if (!supabase || !user) return;

      const { data: newPerson, error: pErr } = await supabase
        .from("drm_people")
        .insert({
          name,
          avatar,
          stage: "Matched",
          user_id: user.id,
          stage_entered_at: today(),
        })
        .select()
        .single();

      if (pErr || !newPerson) return;

      const redRes = await supabase
        .from("drm_red_flags")
        .insert(DEFAULT_RED_FLAGS.map((label) => ({ person_id: newPerson.id, label, checked: false })))
        .select();

      const pd: PersonData = {
        ...(newPerson as Person),
        dates: [],
        pillars: PILLAR_DEFS.map((def) => ({
          id: "",
          person_id: newPerson.id,
          key: def.key,
          rating: null,
          entries: [],
        })),
        red_flags: (redRes.data as Flag[]) || [],
      };

      setPeople((prev) => [...prev, pd]);
      setShowAdd(false);
      setSelectedPersonId(newPerson.id);
    },
    [supabase, user],
  );

  const deletePerson = useCallback(
    async (id: string) => {
      setPeople((prev) => prev.filter((p) => p.id !== id));
      setSelectedPersonId(null);
      if (!supabase) return;
      await supabase.from("drm_people").delete().eq("id", id);
    },
    [supabase],
  );

  // ── DnD ───────────────────────────────────────────────────

  function handleDragStart({ active }: DragStartEvent) {
    setActiveDragId(active.id as string);
  }

  function handleDragOver({ over }: DragOverEvent) {
    if (!over) {
      setOverStage(null);
      return;
    }
    const id = over.id as string;
    setOverStage(STAGES.includes(id as Stage) ? (id as Stage) : null);
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveDragId(null);
    setOverStage(null);
    if (!over) return;

    const personId = active.id as string;
    const overId = over.id as string;

    let targetStage: Stage | null = null;
    if (STAGES.includes(overId as Stage)) {
      targetStage = overId as Stage;
    } else {
      const overPerson = people.find((p) => p.id === overId);
      if (overPerson) targetStage = overPerson.stage;
    }

    if (!targetStage) return;
    const person = people.find((p) => p.id === personId);
    if (!person || person.stage === targetStage) return;

    await updatePerson(personId, { stage: targetStage, stage_entered_at: today() });
  }

  // ── Derived ───────────────────────────────────────────────

  const selectedPerson = people.find((p) => p.id === selectedPersonId) ?? null;
  const activePerson = people.find((p) => p.id === activeDragId) ?? null;

  // ── Render ────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col flex-1 min-h-0"
      style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
    >
      <main className="flex flex-col flex-1 min-h-0 p-2 sm:p-4">
        <div
          className="flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden"
          style={{ background: "#fff", border: "1px solid var(--border-color)" }}
        >
          {/* Header */}
          <div
            className="shrink-0 flex items-center justify-between"
            style={{ borderBottom: "1px solid var(--border-color)" }}
          >
            <div className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-5">
              <h1 className="text-2xl sm:text-3xl font-bold leading-tight" style={{ color: "#000" }}>
                DRM
              </h1>
              <p style={{ color: C.dim, fontSize: 10, margin: 0, marginTop: 2, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                Dating Relationship Management
              </p>
            </div>
            <div className="px-4 sm:px-6 flex gap-2 items-center">
              {error && (
                <span style={{ color: C.red, fontSize: 12, maxWidth: 200 }}>{error}</span>
              )}
              {user && (
                <>
                  <button
                    onClick={() => setView(view === "pipeline" ? "report" : "pipeline")}
                    style={{ ...btnBase, border: `1px solid ${C.border}`, color: view === "report" ? C.accent : C.muted, padding: "7px 14px" }}
                  >
                    {view === "pipeline" ? "Review Mode" : "Pipeline"}
                  </button>
                  <button
                    onClick={() => setShowAdd(true)}
                    style={{ ...btnBase, background: C.accent, color: "#fff", fontWeight: 700, fontSize: 13, padding: "7px 18px" }}
                  >
                    + Add
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden", background: C.bg }}>
            {authLoading ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: C.muted, fontSize: 14 }}>Loading…</span>
              </div>
            ) : !user ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
                <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>Sign in to use the DRM tool.</p>
                <a
                  href="/login"
                  style={{ fontSize: 14, fontWeight: 700, padding: "9px 22px", borderRadius: 8, background: C.accent, color: "#fff", textDecoration: "none" }}
                >
                  Sign In
                </a>
              </div>
            ) : loading ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: C.muted, fontSize: 14 }}>Loading pipeline…</span>
              </div>
            ) : view === "report" ? (
              <StatusReport people={people} onSwitch={() => setView("pipeline")} />
            ) : (
              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
                <div style={{ flex: 1, overflowX: "auto", overflowY: "auto", padding: "20px 24px 40px" }}>
                  <div style={{ display: "flex", gap: 20, minWidth: "max-content", alignItems: "flex-start" }}>
                    {STAGES.map((stage) => (
                      <StageColumn
                        key={stage}
                        stage={stage}
                        people={people.filter((p) => p.stage === stage)}
                        onCardOpen={setSelectedPersonId}
                        onUpdateNote={(id, v) => updatePerson(id, { status_note: v || null })}
                        onUpdateNextAction={(id, v) => updatePerson(id, { next_action: v || null })}
                        isOver={overStage === stage}
                      />
                    ))}
                  </div>
                </div>

                <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
                  {activePerson && (
                    <div style={{ opacity: 0.92, transform: "scale(1.03) rotate(1.5deg)", pointerEvents: "none", width: 220 }}>
                      <PersonCard
                        person={activePerson}
                        onOpen={() => {}}
                        onUpdateNote={() => {}}
                        onUpdateNextAction={() => {}}
                      />
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        </div>
      </main>

      {/* Fixed overlays — outside the card so z-index stacks correctly */}
      {selectedPerson && (
        <DetailDrawer
          person={selectedPerson}
          onClose={() => setSelectedPersonId(null)}
          onUpdate={updatePerson}
          onUpdateRedFlag={updateRedFlag}
          onSetPillarRating={setPillarRating}
          onAddPillarEntry={addPillarEntry}
          onAddDate={(entry) => addDate(selectedPerson.id, entry)}
          onCompleteDate={(dateId, rating) => completeDate(dateId, selectedPerson.id, rating)}
          onDeleteDate={(dateId) => deleteDate(dateId, selectedPerson.id)}
          onDeletePerson={deletePerson}
          dateIdeas={Array.from(new Set(people.flatMap((p) => p.dates.map((d) => d.location).filter(Boolean) as string[])))}
        />
      )}
      {showAdd && (
        <AddPersonModal onAdd={addPerson} onClose={() => setShowAdd(false)} />
      )}
    </div>
  );
}
