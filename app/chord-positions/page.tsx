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

interface VoicingResult {
  shape: ChordShape;
  tag: string;
}

const LS_KEY = "fret-range-voicing";

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

  const eTemplate = eShapeTemplates[type];
  if (eTemplate) {
    for (const oct of [0, 12]) {
      add(transposeShape(eTemplate, semitoneFromE(note) + oct), "E-shape");
    }
  }

  const aTemplate = aShapeTemplates[type];
  if (aTemplate) {
    for (const oct of [0, 12]) {
      add(transposeShape(aTemplate, semitoneFromA(note) + oct), "A-shape");
    }
  }

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

const formatChordLabel = (note: string, type: string) => {
  if (type === "6" || type === "7" || type === "m7" || type === "9" || type === "13") {
    return `${note}${type}`;
  }
  return `${note} ${type}`;
};

export default function FretRangeProgressionPage() {
  const [note, setNote] = useState("A");
  const [type, setType] = useState("Minor");
  const [useFlats, setUseFlats] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.note) setNote(parsed.note);
        if (parsed.type) setType(parsed.type);
        if (parsed.useFlats != null) setUseFlats(parsed.useFlats);
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(LS_KEY, JSON.stringify({ note, type, useFlats }));
  }, [note, type, useFlats, hydrated]);

  const noteOptions = useFlats ? flatNotes : sharpNotes;

  const handleFlatsToggle = () => {
    const next = !useFlats;
    setUseFlats(next);
    setNote((prev) => (next ? (sharpToFlat[prev] ?? prev) : (flatToSharp[prev] ?? prev)));
  };

  const voicings = useMemo(() => getAllVoicings(note, type), [note, type]);
  const label = formatChordLabel(note, type);

  return (
    <BentoPageLayout title="Chord Positions">
      <div className="flex flex-wrap gap-3 items-center mb-8">
        <select
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="text-sm bg-transparent outline-none font-semibold rounded-lg border px-2 py-1.5"
          style={{ borderColor: "var(--border-color)" }}
          aria-label="Note"
        >
          {noteOptions.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="text-sm bg-transparent outline-none rounded-lg border px-2 py-1.5 text-[#1A1B1E]/60"
          style={{ borderColor: "var(--border-color)" }}
          aria-label="Chord type"
        >
          {chordTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
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

      {voicings.length > 0 ? (
        <div
          className="grid gap-8"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(130px, 1fr))` }}
        >
          {voicings.map((v, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <ChordDiagram shape={v.shape} label={label} useFlats={useFlats} />
              <span className="text-[10px] text-[#1A1B1E]/35 font-medium uppercase tracking-wider">
                {v.tag}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[#1A1B1E]/35 italic">No voicings available</p>
      )}
    </BentoPageLayout>
  );
}
