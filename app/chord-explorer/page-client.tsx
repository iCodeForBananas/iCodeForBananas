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

const CHORD_TYPE_TOOLTIPS: Record<string, string> = {
  Major: "Happy and bright — the most common chord type. A great starting point for any beginner",
  Minor: "Darker and more emotional — perfect for moody or dramatic songs",
  Maj7:  "A Major chord with an added major 7th — sounds rich and jazzy",
  "7":   "A dominant 7th — bluesy and slightly tense, like a chord that 'wants' to move somewhere",
  m7:    "A minor 7th — smooth and mellow, very common in jazz and R&B",
  Sus2:  "Suspended: replaces the middle note with the 2nd — creates an open, floating sound",
  Sus4:  "Suspended: replaces the middle note with the 4th — creates suspense that wants to resolve",
  Add9:  "A major chord with an added 9th — lush and colorful without being too complex",
  "6":   "A major chord with an added 6th — bright and sweet-sounding",
  "9":   "A dominant 9th — colorful and jazzy, very common in funk",
  Maj9:  "A major 7th with an added 9th — dreamy and lush",
  "13":  "A dominant chord stacked high — very jazzy and full of color",
  Maj13: "A major chord built all the way to the 13th — rich, complex jazz voicing",
};

const GROUP_TOOLTIPS: Record<string, string> = {
  Triads:        "Three-note chords — the foundation of all harmony. Major and Minor are the two you'll use most",
  "7th Chords":  "Four-note chords with an added 7th — common in jazz, blues, and R&B",
  "Sus / Add":   "Chords that swap or add one note for an open, unresolved, or colorful sound",
  Extended:      "Chords built by stacking more notes beyond the 7th — used in jazz for rich, sophisticated harmony",
};

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

const VOICING_LABEL_TOOLTIPS: Record<string, string> = {
  "Open / Standard": "A standard open chord — uses open (unfretted) strings, typically the easiest to play",
  "E-Shape Barre":   "A moveable barre chord using the E chord template — press all strings with your index finger and slide this shape up the neck to change the key",
  "A-Shape Barre":   "A moveable barre chord using the A chord template — very common moveable shape for guitar",
};

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
  const sublabelTitle =
    VOICING_LABEL_TOOLTIPS[sublabel] ??
    (sublabel.startsWith("Open Alt")
      ? "An alternate open chord shape — a different fingering for the same chord near the nut"
      : sublabel.startsWith("Strings ")
      ? `A three-note voicing on ${sublabel.replace("Strings ", "strings ")} of the guitar`
      : undefined);

  const positionTitle = !position
    ? undefined
    : position === "Open"
    ? "This shape starts at the open position, near the headstock of the guitar"
    : `This shape starts at fret ${position.replace("fr", "")} — slide your fretting hand up the neck to this position`;

  return (
    <div className="flex flex-col items-center gap-1">
      <ChordDiagram shape={shape} label={chordLabel} useFlats={useFlats} />
      <span className="text-xs font-medium text-black/60 dark:text-neutral-400 text-center" title={sublabelTitle}>
        {sublabel}
      </span>
      {position && (
        <span className="text-xs text-black/35 dark:text-neutral-500 text-center" title={positionTitle}>
          {position}
        </span>
      )}
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHeading({ children, tooltip }: { children: React.ReactNode; tooltip?: string }) {
  return (
    <h3
      className={`text-sm font-bold text-black/70 dark:text-yellow-400/70 uppercase tracking-wide mb-4${tooltip ? " cursor-help" : ""}`}
      title={tooltip}
    >
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

      {/* ── Controls card ──────────────────────────────────────────────────── */}
      <div className="bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl p-5 mb-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Root note */}
          <div>
            <p
              className="text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider mb-2"
              title="The starting note of your chord — this is what gives the chord its name (e.g. choosing C builds a C Major chord)"
            >
              Root Note
            </p>
            <div className="flex flex-wrap gap-2">
              {displayNotes.map((note) => {
                const active =
                  selectedNote === note ||
                  (flatToSharp[selectedNote] ?? selectedNote) === (flatToSharp[note] ?? note);
                return (
                  <button
                    key={note}
                    onClick={() => handleNoteClick(note)}
                    title={`Select ${note} as your root note — builds a ${formatChordLabel(note, selectedType)} chord`}
                    className={`px-3 py-1 rounded border text-sm transition-colors ${
                      active ? "bg-accent/20 border-accent font-medium" : "border-border hover:bg-foreground/10"
                    }`}
                  >
                    {note}
                  </button>
                );
              })}
              <span className="mx-1 text-black/30 dark:text-white/30 self-center">|</span>
              <button
                onClick={handleFlatsToggle}
                title="Toggle between sharp (♯) and flat (♭) note names — these are the same pitches written two different ways (e.g. F♯ and G♭ are the exact same note)"
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
            <p
              className="text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider mb-2"
              title="The flavor of the chord — different types have very different sounds. Major sounds happy, Minor sounds darker, and the rest add color and complexity"
            >
              Chord Type
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {TYPE_GROUPS.map((group) => (
                <div key={group.label}>
                  <p
                    className="text-xs text-black/40 dark:text-white/40 mb-1.5"
                    title={GROUP_TOOLTIPS[group.label]}
                  >
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {group.types.map((type) => (
                      <button
                        key={type}
                        onClick={() => setSelectedType(type)}
                        title={CHORD_TYPE_TOOLTIPS[type] ?? type}
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
      </div>

      {/* ── Chord name ──────────────────────────────────────────────────────── */}
      <h2 className="text-2xl font-bold mb-5 mt-1 text-black dark:text-yellow-400">
        {chordLabel}
      </h2>

      {/* ── Voicings & Positions ─────────────────────────────────────────────── */}
      <section className="bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl p-5 mb-6 shadow-sm">
        <SectionHeading tooltip="Different ways to play this chord on the fretboard — each voicing has its own character and suits different musical situations. Click any diagram to add it to your progression.">
          Voicings &amp; Positions
        </SectionHeading>
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
          <p className="text-sm text-black/40 dark:text-neutral-500">No voicings available for this chord.</p>
        )}
      </section>

      {/* ── Inversions ───────────────────────────────────────────────────────── */}
      <section className="bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl p-5 mb-6 shadow-sm">
        <SectionHeading tooltip="The same chord notes rearranged so a different note is on the bottom — inversions give the same chord a subtly different sound and feel. Shown as tight three-note voicings on adjacent string sets.">
          Inversions
        </SectionHeading>
        {inversions ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-200 dark:divide-neutral-700 -mx-5 px-5">
            {[
              {
                key: "root",
                title: "Root Position",
                subtitle: "1 – 3 – 5",
                tooltip: "The chord in its natural order — the root note (the note that names the chord) is the lowest note played",
                items: inversions.root,
              },
              {
                key: "first",
                title: "1st Inversion",
                subtitle: "3 – 5 – 1",
                tooltip: "The 3rd of the chord is now the lowest note — gives the chord a slightly lighter, softer feel",
                items: inversions.first,
              },
              {
                key: "second",
                title: "2nd Inversion",
                subtitle: "5 – 1 – 3",
                tooltip: "The 5th of the chord is the lowest note — creates a more open, floating sound that works great as a passing chord",
                items: inversions.second,
              },
            ].map((inv, idx) => (
              <div key={inv.key} className={`flex flex-col gap-1 pt-6 sm:pt-0${idx === 0 ? "" : " sm:pl-6"}${idx === 2 ? "" : " sm:pr-6"}`}>
                <span
                  className="text-sm font-semibold text-black dark:text-white"
                  title={inv.tooltip}
                >
                  {inv.title}
                </span>
                <span
                  className="text-xs text-black/40 dark:text-neutral-500 mb-4"
                  title="The scale degrees played from lowest to highest string — 1 is the root, 3 is the third, 5 is the fifth"
                >
                  {inv.subtitle}
                </span>
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
        ) : (
          <p className="text-sm text-black/40 dark:text-neutral-500">
            Inversion voicings are available for Major and Minor chords. Select one to explore.
          </p>
        )}
      </section>

      {/* ── My Progression ───────────────────────────────────────────────────── */}
      <section className="bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl p-5 mb-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <SectionHeading tooltip="A sequence of chords played one after another — the backbone of most songs. Click any chord diagram above to add it here, then try playing through them in order.">
            My Progression
          </SectionHeading>
          {favorites.length > 0 && (
            <button
              onClick={clear}
              title="Remove all chords from your progression and start fresh"
              className="text-xs text-black/35 dark:text-neutral-500 hover:text-red-700 dark:hover:text-red-400 transition-colors -mt-4"
            >
              Clear all
            </button>
          )}
        </div>
        {favorites.length === 0 ? (
          <p className="text-sm text-black/40 dark:text-neutral-500">
            Click any chord diagram above to add it here and build your progression.
          </p>
        ) : (
          <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
            {favorites.map((fav, i) => (
              <div key={fav.id} className="flex flex-col items-center gap-1">
                <span
                  className="text-xs font-mono text-black/30 dark:text-neutral-600"
                  title={`Chord ${i + 1} in your progression`}
                >
                  {i + 1}
                </span>
                <ChordDiagram shape={fav.shape} label={fav.label} useFlats={useFlats} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Scale Tool ───────────────────────────────────────────────────────── */}
      <section className="bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl p-5 shadow-sm">
        <SectionHeading tooltip="See every note of a scale laid out across all six strings and every fret — great for understanding where you can solo or add a melody over your chord progression.">
          Scale Tool
        </SectionHeading>
        <ScaleTool />
      </section>

    </BentoPageLayout>
  );
}
