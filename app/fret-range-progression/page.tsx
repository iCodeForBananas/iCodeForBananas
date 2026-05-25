"use client";

import { useState, useMemo, useEffect } from "react";
import {
  type ChordShape,
  sharpNotes,
  flatNotes,
  chordTypes,
  sharpToFlat,
  flatToSharp,
  chordShapes,
  eShapeTemplates,
  aShapeTemplates,
  buildChordKey,
  transposeShape,
  semitoneFromE,
  semitoneFromA,
} from "../lib/chordShapes";
import ChordDiagram from "../components/ChordDiagram";
import BentoPageLayout from "../components/BentoPageLayout";

interface ChordSlot {
  note: string;
  type: string;
}

interface VoicingResult {
  shape: ChordShape;
  tag: string;
}

const LS_KEY = "fret-range-progression";

const DEFAULT_SLOTS: ChordSlot[] = [
  { note: "A", type: "Minor" },
  { note: "F", type: "Major" },
  { note: "C", type: "Major" },
  { note: "G", type: "Major" },
];

const formatChordLabel = (note: string, type: string) => {
  if (type === "6" || type === "7" || type === "m7" || type === "9" || type === "13") {
    return `${note}${type}`;
  }
  return `${note} ${type}`;
};

const getAllVoicings = (note: string, type: string): VoicingResult[] => {
  const seen = new Set<string>();
  const results: VoicingResult[] = [];

  const add = (shape: ChordShape | null, tag: string) => {
    if (!shape) return;
    const key = shape.frets.join(",");
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ shape, tag });
  };

  // E-shape CAGED — two positions across the neck
  const eTemplate = eShapeTemplates[type];
  if (eTemplate) {
    for (const oct of [0, 12]) {
      add(transposeShape(eTemplate, semitoneFromE(note) + oct), "E-shape");
    }
  }

  // A-shape CAGED — two positions across the neck
  const aTemplate = aShapeTemplates[type];
  if (aTemplate) {
    for (const oct of [0, 12]) {
      add(transposeShape(aTemplate, semitoneFromA(note) + oct), "A-shape");
    }
  }

  // Direct shapes from the database (handle enharmonic equivalents)
  const canonical = flatToSharp[note] ?? note;
  const enharmonic = sharpToFlat[canonical] ?? flatToSharp[note];
  for (const n of ([note, canonical, enharmonic].filter(Boolean) as string[])) {
    const k = buildChordKey(n, type);
    const shapes = chordShapes[k];
    if (shapes && shapes.length > 0) {
      shapes.forEach((s) => add(s, "open"));
      break;
    }
  }

  return results;
};

export default function FretRangeProgressionPage() {
  const [slots, setSlots] = useState<ChordSlot[]>(DEFAULT_SLOTS);
  const [useFlats, setUseFlats] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.slots) && parsed.slots.length > 0) setSlots(parsed.slots);
        if (parsed.useFlats != null) setUseFlats(parsed.useFlats);
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(LS_KEY, JSON.stringify({ slots, useFlats }));
  }, [slots, useFlats, hydrated]);

  const noteOptions = useFlats ? flatNotes : sharpNotes;

  const handleFlatsToggle = () => {
    const next = !useFlats;
    setUseFlats(next);
    setSlots((prev) =>
      prev.map((s) => ({
        ...s,
        note: next ? (sharpToFlat[s.note] ?? s.note) : (flatToSharp[s.note] ?? s.note),
      }))
    );
  };

  const updateSlot = (i: number, field: "note" | "type", value: string) => {
    setSlots((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };

  const addSlot = () => {
    if (slots.length < 8) {
      setSlots((prev) => [...prev, { note: "C", type: "Major" }]);
    }
  };

  const removeSlot = (i: number) => {
    setSlots((prev) => prev.filter((_, idx) => idx !== i));
  };

  const results = useMemo(
    () => slots.map((s) => getAllVoicings(s.note, s.type)),
    [slots]
  );

  return (
    <BentoPageLayout title="Fret Range Progression">
      <div className="flex flex-col gap-5 mb-6">
        <div>
          <p className="text-xs font-semibold text-[#1A1B1E]/50 uppercase tracking-wider mb-2">Chords</p>
          <div className="flex flex-wrap gap-3 items-center">
            {slots.map((slot, i) => (
              <div
                key={i}
                className="flex items-center gap-1 rounded-lg border px-2 py-1.5"
                style={{ borderColor: "var(--border-color)" }}
              >
                <span className="text-xs text-[#1A1B1E]/30 mr-0.5 font-mono select-none">{i + 1}</span>
                <select
                  value={slot.note}
                  onChange={(e) => updateSlot(i, "note", e.target.value)}
                  className="text-sm bg-transparent outline-none font-semibold"
                  aria-label={`Chord ${i + 1} note`}
                >
                  {noteOptions.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <select
                  value={slot.type}
                  onChange={(e) => updateSlot(i, "type", e.target.value)}
                  className="text-sm bg-transparent outline-none text-[#1A1B1E]/60"
                  aria-label={`Chord ${i + 1} type`}
                >
                  {chordTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {slots.length > 1 && (
                  <button
                    onClick={() => removeSlot(i)}
                    className="ml-1 text-[#1A1B1E]/25 hover:text-red-400 text-base leading-none transition-colors"
                    title="Remove chord"
                    aria-label={`Remove chord ${i + 1}`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {slots.length < 8 && (
              <button
                onClick={addSlot}
                className="px-3 py-1.5 rounded-lg border text-sm transition-colors border-border hover:bg-foreground/10"
              >
                + Add
              </button>
            )}
            <span className="text-[#1A1B1E]/20 select-none">|</span>
            <button
              type="button"
              onClick={handleFlatsToggle}
              className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                useFlats ? "bg-accent/20 border-accent font-medium" : "border-border hover:bg-foreground/10"
              }`}
            >
              ♭ Flats
            </button>
          </div>
        </div>
      </div>

      <div
        className="grid gap-8"
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(130px, 1fr))` }}
      >
        {slots.map((slot, i) => {
          const label = formatChordLabel(slot.note, slot.type);
          const voicings = results[i];
          return (
            <div key={i} className="flex flex-col items-center gap-5">
              <h3 className="font-bold text-base tracking-tight">{label}</h3>
              {voicings.length > 0 ? (
                voicings.map((v, vi) => (
                  <div key={vi} className="flex flex-col items-center gap-1">
                    <ChordDiagram shape={v.shape} label={label} useFlats={useFlats} />
                    <span className="text-[10px] text-[#1A1B1E]/35 font-medium uppercase tracking-wider">
                      {v.tag}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#1A1B1E]/35 italic text-center leading-relaxed">
                  No voicings available
                </p>
              )}
            </div>
          );
        })}
      </div>
    </BentoPageLayout>
  );
}
