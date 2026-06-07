"use client";

import { useState, useMemo } from "react";
import {
  type ChordShape,
  sharpNotes,
  flatNotes,
  sharpToFlat,
  flatToSharp,
  chordShapes,
  buildChordKey,
  eShapeTemplates,
  aShapeTemplates,
  transposeShape,
  semitoneFromE,
  semitoneFromA,
} from "../lib/chordShapes";
import ChordDiagram from "../components/ChordDiagram";
import BentoPageLayout from "../components/BentoPageLayout";
import ScaleTool from "../components/ScaleTool";
import { useFavoriteChords } from "../lib/FavoriteChordsContext";

// ── Chord type groups ─────────────────────────────────────────────────────────

const TYPE_GROUPS = [
  { label: "Triads", types: ["Major", "Minor"] },
  { label: "7th Chords", types: ["Maj7", "7", "m7"] },
  { label: "Sus / Add", types: ["Sus2", "Sus4", "Add9"] },
  { label: "Extended", types: ["6", "9", "Maj9", "13", "Maj13"] },
] as const;

type ChordType = (typeof TYPE_GROUPS)[number]["types"][number];

// ── Format helpers ────────────────────────────────────────────────────────────

const formatChordLabel = (note: string, type: string) => {
  if (["6", "7", "m7", "9", "13"].includes(type)) return `${note}${type}`;
  return `${note} ${type}`;
};

// ── Voicings ─────────────────────────────────────────────────────────────────

interface LabeledShape {
  shape: ChordShape;
  label: string;
  position?: string;
}

const getVoicings = (note: string, type: string): LabeledShape[] => {
  const voicings: LabeledShape[] = [];
  const seen = new Set<string>();

  const add = (shape: ChordShape | null, label: string, position?: string) => {
    if (!shape) return;
    const key = shape.frets.join(",");
    if (seen.has(key)) return;
    seen.add(key);
    voicings.push({ shape, label, position });
  };

  const canonical = flatToSharp[note] ?? note;
  const enharmonic = sharpToFlat[canonical] ?? flatToSharp[note];

  for (const n of [note, canonical, enharmonic].filter(Boolean) as string[]) {
    const shapes = chordShapes[buildChordKey(n, type)];
    if (shapes?.length) {
      shapes.forEach((s, i) => add(s, i === 0 ? "Open / Standard" : `Open Alt ${i + 1}`));
      break;
    }
  }

  const eTemplate = eShapeTemplates[type];
  if (eTemplate) {
    const shift = semitoneFromE(note);
    add(transposeShape(eTemplate, shift), "E-Shape Barre", shift === 0 ? "Open" : `${shift}fr`);
  }

  const aTemplate = aShapeTemplates[type];
  if (aTemplate) {
    const shift = semitoneFromA(note);
    add(transposeShape(aTemplate, shift), "A-Shape Barre", shift === 0 ? "Open" : `${shift}fr`);
  }

  return voicings;
};

// ── Inversions ────────────────────────────────────────────────────────────────

type InvVoicing = "Major" | "Minor";

const INV_TEMPLATES: Record<InvVoicing, { root: ChordShape[]; first: ChordShape[]; second: ChordShape[] }> = {
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

const STRING_SETS = ["Strings 5-4-3", "Strings 4-3-2", "Strings 3-2-1"];

const semitonesFromC = (note: string) => {
  const canonical = flatToSharp[note] ?? note;
  return (sharpNotes.indexOf(canonical) - sharpNotes.indexOf("C") + 12) % 12;
};

const shiftShape = (shape: ChordShape, n: number): ChordShape => ({
  frets: shape.frets.map((f) => (f === -1 ? -1 : f + n)),
  fingers: [...shape.fingers],
});

const getInversions = (note: string, voicing: InvVoicing) => {
  const shift = semitonesFromC(note);
  const t = INV_TEMPLATES[voicing];
  const map = (arr: ChordShape[]) => arr.map((s, i) => ({ shape: shiftShape(s, shift), strings: STRING_SETS[i] }));
  return { root: map(t.root), first: map(t.first), second: map(t.second) };
};

// ── Chord diagram card ────────────────────────────────────────────────────────

function VoicingCard({
  shape,
  chordLabel,
  sublabel,
  position,
  useFlats,
}: {
  shape: ChordShape;
  chordLabel: string;
  sublabel: string;
  position?: string;
  useFlats: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <ChordDiagram shape={shape} label={chordLabel} useFlats={useFlats} />
      <span className="text-xs font-medium text-[#1A1B1E]/60 text-center">{sublabel}</span>
      {position && <span className="text-xs text-[#1A1B1E]/35 text-center">{position}</span>}
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-[#1A1B1E]/50 uppercase tracking-wider mb-4">
      {children}
    </h3>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ChordExplorerPage() {
  const [selectedNote, setSelectedNote] = useState("C");
  const [selectedType, setSelectedType] = useState<ChordType>("Major");
  const [useFlats, setUseFlats] = useState(false);
  const { favorites, clear } = useFavoriteChords();

  const displayNotes = useFlats ? flatNotes : sharpNotes;
  const chordLabel = formatChordLabel(selectedNote, selectedType);

  const voicings = useMemo(() => getVoicings(selectedNote, selectedType), [selectedNote, selectedType]);

  const invVoicing: InvVoicing | null = selectedType === "Major" ? "Major" : selectedType === "Minor" ? "Minor" : null;
  const inversions = useMemo(
    () => (invVoicing ? getInversions(selectedNote, invVoicing) : null),
    [selectedNote, invVoicing]
  );

  const handleNoteClick = (note: string) => setSelectedNote(note);

  const handleFlatsToggle = () => {
    const next = !useFlats;
    setUseFlats(next);
    if (next) {
      const asFlat = sharpToFlat[selectedNote];
      if (asFlat) setSelectedNote(asFlat);
    } else {
      const asSharp = flatToSharp[selectedNote];
      if (asSharp) setSelectedNote(asSharp);
    }
  };

  return (
    <BentoPageLayout title="Chord Explorer">

      {/* ── Controls ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">

        {/* Root note */}
        <div>
          <p className="text-xs font-semibold text-[#1A1B1E]/50 uppercase tracking-wider mb-2">Root Note</p>
          <div className="flex flex-wrap gap-2">
            {displayNotes.map((note) => {
              const active =
                selectedNote === note ||
                (flatToSharp[selectedNote] ?? selectedNote) === (flatToSharp[note] ?? note);
              return (
                <button
                  key={note}
                  onClick={() => handleNoteClick(note)}
                  className={`px-3 py-1 rounded border text-sm transition-colors ${
                    active ? "bg-accent/20 border-accent font-medium" : "border-border hover:bg-foreground/10"
                  }`}
                >
                  {note}
                </button>
              );
            })}
            <span className="mx-1 text-[#1A1B1E]/30 self-center">|</span>
            <button
              onClick={handleFlatsToggle}
              className={`px-3 py-1 rounded border text-sm transition-colors ${
                useFlats ? "bg-accent/20 border-accent font-medium" : "border-border hover:bg-foreground/10"
              }`}
            >
              ♭ Flats
            </button>
          </div>
        </div>

        {/* Chord type */}
        <div>
          <p className="text-xs font-semibold text-[#1A1B1E]/50 uppercase tracking-wider mb-2">Chord Type</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {TYPE_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-xs text-[#1A1B1E]/40 mb-1.5">{group.label}</p>
                <div className="flex flex-wrap gap-1">
                  {group.types.map((type) => (
                    <button
                      key={type}
                      onClick={() => setSelectedType(type)}
                      className={`px-2.5 py-0.5 rounded border text-xs transition-colors ${
                        selectedType === type
                          ? "bg-accent/20 border-accent font-medium"
                          : "border-border hover:bg-foreground/10"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Chord name ──────────────────────────────────────────────────────── */}
      <h2 className="text-2xl font-bold mb-6" style={{ color: "#000" }}>
        {chordLabel}
      </h2>

      {/* ── Voicings & Positions ─────────────────────────────────────────────── */}
      <section className="mb-10">
        <SectionHeading>Voicings &amp; Positions</SectionHeading>
        <p className="text-sm text-[#1A1B1E]/40 mb-5 -mt-2">Click a diagram to add it to your progression</p>
        {voicings.length > 0 ? (
          <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
            {voicings.map((v, i) => (
              <VoicingCard
                key={i}
                shape={v.shape}
                chordLabel={chordLabel}
                sublabel={v.label}
                position={v.position}
                useFlats={useFlats}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#1A1B1E]/40">No voicings available for this chord.</p>
        )}
      </section>

      {/* ── Inversions ───────────────────────────────────────────────────────── */}
      <section className="mb-10">
        <SectionHeading>Inversions</SectionHeading>
        {inversions ? (
          <>
            <p className="text-sm text-[#1A1B1E]/40 mb-5 -mt-2">
              Triad voicings on three-string sets — click any to favorite
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              {[
                { key: "root", title: "Root Position", subtitle: "1 – 3 – 5", items: inversions.root },
                { key: "first", title: "1st Inversion", subtitle: "3 – 5 – 1", items: inversions.first },
                { key: "second", title: "2nd Inversion", subtitle: "5 – 1 – 3", items: inversions.second },
              ].map((inv) => (
                <div key={inv.key} className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-[#1A1B1E]">{inv.title}</span>
                  <span className="text-xs text-[#1A1B1E]/40 mb-4">{inv.subtitle}</span>
                  <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
                    {inv.items.map((item, i) => (
                      <VoicingCard
                        key={i}
                        shape={item.shape}
                        chordLabel={`${chordLabel} ${inv.title}`}
                        sublabel={item.strings}
                        useFlats={useFlats}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-[#1A1B1E]/40 -mt-2">
            Inversion voicings are available for Major and Minor chords. Select one to explore.
          </p>
        )}
      </section>

      {/* ── My Progression ───────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <SectionHeading>My Progression</SectionHeading>
          {favorites.length > 0 && (
            <button
              onClick={clear}
              className="text-xs text-[#1A1B1E]/35 hover:text-red-400 transition-colors -mt-4"
            >
              Clear all
            </button>
          )}
        </div>
        {favorites.length === 0 ? (
          <p className="text-sm text-[#1A1B1E]/40">
            Click any chord diagram above to add it here and build your progression.
          </p>
        ) : (
          <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
            {favorites.map((fav, i) => (
              <div key={fav.id} className="flex flex-col items-center gap-1">
                <span className="text-xs font-mono text-[#1A1B1E]/30">{i + 1}</span>
                <ChordDiagram shape={fav.shape} label={fav.label} useFlats={useFlats} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Scale Tool ───────────────────────────────────────────────────────── */}
      <section className="mt-10">
        <div className="border-t border-[#1A1B1E]/10 pt-10">
          <SectionHeading>Scale Tool</SectionHeading>
          <ScaleTool />
        </div>
      </section>

    </BentoPageLayout>
  );
}
