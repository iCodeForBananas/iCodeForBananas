"use client";

import { useState } from "react";
import ChordDiagram from "@/app/components/ChordDiagram";
import {
  sharpNotes,
  chordTypes,
  eShapeTemplates,
  aShapeTemplates,
  transposeShape,
  semitoneFromE,
  semitoneFromA,
  normalizeTypeForShape,
  resolveChordShape,
  flatToSharp,
  type ChordShape,
} from "@/app/lib/chordShapes";

// ── Inversion templates (anchored at C, transposed by semitonesFromC) ──────────

type InversionVoicing = "Major" | "Minor";

const INVERSION_TEMPLATES: Record<InversionVoicing, { root: ChordShape[]; first: ChordShape[]; second: ChordShape[] }> = {
  Major: {
    root: [
      { frets: [-1, 3, 2, 0, -1, -1], fingers: [0, 3, 2, 0, 0, 0] },
      { frets: [-1, -1, 10, 9, 8, -1], fingers: [0, 0, 3, 2, 1, 0] },
      { frets: [-1, -1, -1, 5, 5, 3], fingers: [0, 0, 0, 2, 3, 1] },
    ],
    first: [
      { frets: [-1, 7, 5, 5, -1, -1], fingers: [0, 3, 1, 2, 0, 0] },
      { frets: [-1, -1, 2, 0, 1, -1], fingers: [0, 0, 3, 0, 1, 0] },
      { frets: [-1, -1, -1, 9, 8, 8], fingers: [0, 0, 0, 3, 1, 2] },
    ],
    second: [
      { frets: [-1, 10, 10, 9, -1, -1], fingers: [0, 2, 3, 1, 0, 0] },
      { frets: [-1, -1, 5, 5, 5, -1], fingers: [0, 0, 1, 1, 1, 0] },
      { frets: [-1, -1, -1, 0, 1, 0], fingers: [0, 0, 0, 0, 1, 0] },
    ],
  },
  Minor: {
    root: [
      { frets: [-1, 3, 1, 0, -1, -1], fingers: [0, 3, 1, 0, 0, 0] },
      { frets: [-1, -1, 10, 8, 8, -1], fingers: [0, 0, 3, 1, 1, 0] },
      { frets: [-1, -1, -1, 5, 4, 3], fingers: [0, 0, 0, 3, 2, 1] },
    ],
    first: [
      { frets: [-1, 6, 5, 5, -1, -1], fingers: [0, 2, 1, 1, 0, 0] },
      { frets: [-1, -1, 1, 0, 1, -1], fingers: [0, 0, 2, 0, 3, 0] },
      { frets: [-1, -1, -1, 8, 8, 8], fingers: [0, 0, 0, 1, 1, 1] },
    ],
    second: [
      { frets: [-1, 10, 10, 8, -1, -1], fingers: [0, 3, 3, 1, 0, 0] },
      { frets: [-1, -1, 5, 5, 4, -1], fingers: [0, 0, 2, 3, 1, 0] },
      { frets: [-1, -1, -1, 12, 13, 11], fingers: [0, 0, 0, 2, 3, 1] },
    ],
  },
};

const STRING_SET_LABELS = ["Strings 5-4-3", "Strings 4-3-2", "Strings 3-2-1"];

const semitonesFromC = (note: string): number => {
  const canonical = flatToSharp[note] ?? note;
  return (sharpNotes.indexOf(canonical) - sharpNotes.indexOf("C") + 12) % 12;
};

const transposeInversion = (shape: ChordShape, semitones: number): ChordShape => ({
  frets: shape.frets.map((f) => (f === -1 ? -1 : f + semitones)),
  fingers: [...shape.fingers],
});

const getInversionShapes = (note: string, voicing: InversionVoicing, inv: "first" | "second"): ChordShape[] => {
  const shift = semitonesFromC(note);
  return INVERSION_TEMPLATES[voicing][inv]
    .map((t) => transposeInversion(t, shift))
    .filter((s) => {
      const active = s.frets.filter((f) => f !== -1);
      return active.length > 0 && Math.max(...active) <= 12;
    });
};

// ── Root positions ────────────────────────────────────────────────────────────

interface ChordColumn {
  id: string;
  note: string;
  type: string;
}

function getPositions(note: string, type: string): ChordShape[] {
  const positions: ChordShape[] = [];
  const seen = new Set<string>();

  const add = (shape: ChordShape | null | undefined) => {
    if (!shape) return;
    const active = shape.frets.filter((f) => f !== -1);
    if (!active.length) return;
    if (Math.max(...active) > 12) return;
    const key = shape.frets.join(",");
    if (seen.has(key)) return;
    seen.add(key);
    positions.push(shape);
  };

  add(resolveChordShape(note, type));

  const normalType = normalizeTypeForShape(type);
  const eTemplate = eShapeTemplates[normalType];
  if (eTemplate) add(transposeShape(eTemplate, semitoneFromE(note)));

  const aTemplate = aShapeTemplates[normalType];
  if (aTemplate) add(transposeShape(aTemplate, semitoneFromA(note)));

  positions.sort((a, b) => {
    const minA = Math.min(...a.frets.filter((f) => f !== -1));
    const minB = Math.min(...b.frets.filter((f) => f !== -1));
    return minA - minB;
  });

  return positions;
}

// ── Inversion section sub-component ─────────────────────────────────────────

function InversionSection({
  title,
  subtitle,
  shapes,
  label,
}: {
  title: string;
  subtitle: string;
  shapes: ChordShape[];
  label: string;
}) {
  if (!shapes.length) return null;
  return (
    <div>
      <div className='border-t border-gray-200 my-2' />
      <div className='text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1'>{title}</div>
      <div className='text-xs text-gray-400 mb-2'>{subtitle}</div>
      {shapes.map((shape, i) => (
        <div key={i} className='mb-3'>
          <div className='text-xs text-gray-400 mb-1'>{STRING_SET_LABELS[i]}</div>
          <ChordDiagram shape={shape} label={`${label} ${title}`} />
        </div>
      ))}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProgressionBuilderPage() {
  const [columns, setColumns] = useState<ChordColumn[]>([
    { id: "1", note: "G", type: "Major" },
    { id: "2", note: "C", type: "Major" },
    { id: "3", note: "D", type: "Major" },
  ]);

  const addColumn = () => {
    setColumns((prev) => [
      ...prev,
      { id: Date.now().toString(), note: "A", type: "Major" },
    ]);
  };

  const removeColumn = (id: string) => {
    setColumns((prev) => prev.filter((c) => c.id !== id));
  };

  const updateColumn = (id: string, field: "note" | "type", value: string) => {
    setColumns((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  return (
    <div className='flex flex-col flex-1'>
      <main className='px-4 py-6 flex-1'>
        <div className='w-full'>
          <div className='rounded-lg p-6 bg-white'>
            <div className='text-center mb-8'>
              <h1 className='text-5xl font-bold drop-shadow-lg' style={{ color: "#000" }}>
                Progression Builder
              </h1>
              <p className='text-lg mt-3' style={{ color: "#000" }}>
                Build a chord progression and explore positions and inversions for each chord
              </p>
            </div>

            <div className='flex gap-4 overflow-x-auto pb-4 items-start'>
              {columns.map((col) => {
                const positions = getPositions(col.note, col.type);
                const invVoicing = col.type === "Minor" ? "Minor" : col.type === "Major" ? "Major" : null;
                const firstInv = invVoicing ? getInversionShapes(col.note, invVoicing, "first") : [];
                const secondInv = invVoicing ? getInversionShapes(col.note, invVoicing, "second") : [];

                return (
                  <div
                    key={col.id}
                    className='flex-shrink-0 w-52 flex flex-col gap-3 rounded-lg p-3 border border-gray-200'
                    style={{ background: "#f9fafb" }}
                  >
                    {/* Header */}
                    <div className='flex items-center justify-between'>
                      <span className='font-bold text-sm text-black'>
                        {col.note} {col.type}
                      </span>
                      {columns.length > 1 && (
                        <button
                          onClick={() => removeColumn(col.id)}
                          className='text-gray-400 hover:text-red-500 text-xl font-bold leading-none'
                          aria-label='Remove chord'
                        >
                          ×
                        </button>
                      )}
                    </div>

                    {/* Note selector */}
                    <div>
                      <div className='text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1'>
                        Note
                      </div>
                      <div className='grid grid-cols-4 gap-1'>
                        {sharpNotes.map((note) => (
                          <button
                            key={note}
                            onClick={() => updateColumn(col.id, "note", note)}
                            className='text-xs py-1 rounded font-semibold transition-colors'
                            style={{
                              background: col.note === note ? "#facc15" : "#e5e7eb",
                              color: col.note === note ? "#000" : "#374151",
                            }}
                          >
                            {note}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Type selector */}
                    <div>
                      <div className='text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1'>
                        Voicing
                      </div>
                      <div className='flex flex-wrap gap-1'>
                        {chordTypes.map((type) => (
                          <button
                            key={type}
                            onClick={() => updateColumn(col.id, "type", type)}
                            className='text-xs px-2 py-1 rounded font-semibold transition-colors'
                            style={{
                              background: col.type === type ? "#facc15" : "#e5e7eb",
                              color: col.type === type ? "#000" : "#374151",
                            }}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className='border-t border-gray-200' />

                    {/* Root positions */}
                    <div className='text-xs font-semibold uppercase tracking-widest text-gray-500'>
                      Root Position{positions.length !== 1 ? "s" : ""} ({positions.length})
                    </div>
                    {positions.length === 0 ? (
                      <div className='text-sm text-gray-400 text-center py-4'>No shapes found</div>
                    ) : (
                      positions.map((shape, i) => (
                        <ChordDiagram
                          key={i}
                          shape={shape}
                          label={`${col.note} ${col.type}`}
                        />
                      ))
                    )}

                    {/* Inversions (Major / Minor only) */}
                    <InversionSection
                      title='1st Inversion'
                      subtitle='3rd in the bass'
                      shapes={firstInv}
                      label={`${col.note} ${col.type}`}
                    />
                    <InversionSection
                      title='2nd Inversion'
                      subtitle='5th in the bass'
                      shapes={secondInv}
                      label={`${col.note} ${col.type}`}
                    />
                  </div>
                );
              })}

              {/* Add chord button */}
              <button
                onClick={addColumn}
                className='flex-shrink-0 w-52 h-32 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400 hover:border-yellow-400 hover:text-yellow-500 transition-colors font-semibold text-sm gap-2 self-start'
              >
                <span className='text-3xl font-light'>+</span>
                Add Chord
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
