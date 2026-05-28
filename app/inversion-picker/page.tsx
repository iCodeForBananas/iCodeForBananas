"use client";

import { useState } from "react";
import ChordDiagram from "@/app/components/ChordDiagram";
import BentoPageLayout from "@/app/components/BentoPageLayout";
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

const getInversionShapes = (note: string, voicing: InversionVoicing, inv: "root" | "first" | "second"): ChordShape[] => {
  const shift = semitonesFromC(note);
  return INVERSION_TEMPLATES[voicing][inv]
    .map((t) => transposeInversion(t, shift))
    .filter((s) => {
      const active = s.frets.filter((f) => f !== -1);
      return active.length > 0 && Math.max(...active) <= 12;
    });
};

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

interface InversionGroupProps {
  heading: string;
  subheading?: string;
  shapes: ChordShape[];
  label: string;
  stringLabels?: string[];
}

function InversionGroup({ heading, subheading, shapes, label, stringLabels }: InversionGroupProps) {
  if (!shapes.length) return null;
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-0.5">{heading}</div>
      {subheading && <div className="text-xs text-gray-400 mb-3">{subheading}</div>}
      <div className="flex flex-wrap gap-6">
        {shapes.map((shape, i) => (
          <div key={i} className="flex flex-col items-center">
            {stringLabels && <div className="text-xs text-gray-400 mb-1">{stringLabels[i]}</div>}
            <ChordDiagram shape={shape} label={label} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function InversionPickerPage() {
  const [note, setNote] = useState("G");
  const [type, setType] = useState("Major");

  const label = `${note} ${type}`;
  const invVoicing: InversionVoicing | null = type === "Major" ? "Major" : type === "Minor" ? "Minor" : null;

  const rootPositions = invVoicing
    ? getInversionShapes(note, invVoicing, "root")
    : getPositions(note, type);
  const firstInv = invVoicing ? getInversionShapes(note, invVoicing, "first") : [];
  const secondInv = invVoicing ? getInversionShapes(note, invVoicing, "second") : [];

  return (
    <BentoPageLayout title="Inversion Picker">
      <div className="flex flex-wrap gap-6 mb-8">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">Note</div>
          <div className="flex flex-wrap gap-1">
            {sharpNotes.map((n) => (
              <button
                key={n}
                onClick={() => setNote(n)}
                className="text-xs px-2 py-1 rounded font-semibold transition-colors"
                style={{
                  background: note === n ? "#facc15" : "#e5e7eb",
                  color: note === n ? "#000" : "#374151",
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">Type</div>
          <div className="flex flex-wrap gap-1">
            {chordTypes.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className="text-xs px-2 py-1 rounded font-semibold transition-colors"
                style={{
                  background: type === t ? "#facc15" : "#e5e7eb",
                  color: type === t ? "#000" : "#374151",
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-8">
        <InversionGroup
          heading="Root Position"
          shapes={rootPositions}
          label={label}
          stringLabels={invVoicing ? STRING_SET_LABELS : undefined}
        />
        <InversionGroup
          heading="1st Inversion"
          subheading="3rd in the bass"
          shapes={firstInv}
          label={`${label} 1st inv`}
          stringLabels={STRING_SET_LABELS}
        />
        <InversionGroup
          heading="2nd Inversion"
          subheading="5th in the bass"
          shapes={secondInv}
          label={`${label} 2nd inv`}
          stringLabels={STRING_SET_LABELS}
        />
        {!rootPositions.length && !firstInv.length && !secondInv.length && (
          <div className="text-sm text-gray-400">No shapes found for {label}</div>
        )}
      </div>
    </BentoPageLayout>
  );
}
