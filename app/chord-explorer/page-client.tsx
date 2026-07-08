"use client";

import { useState, useMemo } from "react";
import {
  type ChordShape,
  sharpNotes,
  flatNotes,
  sharpToFlat,
  flatToSharp,
  chordShapes,
  chordTypes,
  buildChordKey,
  eShapeTemplates,
  aShapeTemplates,
  transposeShape,
  semitoneFromE,
  semitoneFromA,
} from "../lib/chordShapes";
import ChordDiagram from "../components/ChordDiagram";
import BentoBoard, { type BentoPanel } from "../components/BentoBoard";
import ScaleTool from "../components/ScaleTool";
import CircleOfFifths from "../components/CircleOfFifths";
import { Shuffle } from "lucide-react";

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

// Uniform, touch-friendly control button (≥44px tap target for iPad use)
const TOUCH_BUTTON =
  "min-h-[44px] min-w-[44px] px-4 rounded-lg border text-sm font-medium inline-flex items-center justify-center transition-colors";

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

// ── Progression generator ─────────────────────────────────────────────────────

interface DiatonicChordDef {
  roman: string;
  degree: number; // semitones above the key root
  quality: "Major" | "Minor";
}

// Natural major/minor diatonic triads. vii°/ii° (diminished) are omitted — no
// diminished shapes exist in chordShapes, and pop-style progressions rarely lean on them.
const MAJOR_KEY_CHORDS: DiatonicChordDef[] = [
  { roman: "I", degree: 0, quality: "Major" },
  { roman: "ii", degree: 2, quality: "Minor" },
  { roman: "iii", degree: 4, quality: "Minor" },
  { roman: "IV", degree: 5, quality: "Major" },
  { roman: "V", degree: 7, quality: "Major" },
  { roman: "vi", degree: 9, quality: "Minor" },
];

const MINOR_KEY_CHORDS: DiatonicChordDef[] = [
  { roman: "i", degree: 0, quality: "Minor" },
  { roman: "III", degree: 3, quality: "Major" },
  { roman: "iv", degree: 5, quality: "Minor" },
  { roman: "v", degree: 7, quality: "Minor" },
  { roman: "VI", degree: 8, quality: "Major" },
  { roman: "VII", degree: 10, quality: "Major" },
];

const noteAtSemitone = (rootNote: string, semitones: number, useFlats: boolean) => {
  const canonical = flatToSharp[rootNote] ?? rootNote;
  const idx = (sharpNotes.indexOf(canonical) + semitones + 12) % 12;
  const sharpName = sharpNotes[idx];
  return useFlats ? sharpToFlat[sharpName] ?? sharpName : sharpName;
};

const pickWeighted = <T,>(options: { item: T; weight: number }[]): T => {
  const total = options.reduce((sum, o) => sum + o.weight, 0);
  let roll = Math.random() * total;
  for (const o of options) {
    if (roll < o.weight) return o.item;
    roll -= o.weight;
  }
  return options[options.length - 1].item;
};

interface GeneratedChord {
  roman: string;
  note: string;
  quality: "Major" | "Minor";
}

// Picks 4 diatonic chords, weighting each next chord toward strong
// circle-of-fifths root motion (down a fifth / up a fourth from the previous chord).
const generateProgression = (rootNote: string, isMinorKey: boolean, useFlats: boolean): GeneratedChord[] => {
  const keyChords = isMinorKey ? MINOR_KEY_CHORDS : MAJOR_KEY_CHORDS;
  const progression: GeneratedChord[] = [];
  let prevDegree: number | null = null;

  for (let i = 0; i < 4; i++) {
    const next: DiatonicChordDef =
      prevDegree === null
        ? keyChords[Math.floor(Math.random() * keyChords.length)]
        : pickWeighted(
            keyChords.map((c) => {
              const interval = (c.degree - prevDegree! + 12) % 12;
              const weight = interval === 5 ? 6 : interval === 7 ? 2 : 1;
              return { item: c, weight };
            })
          );
    progression.push({
      roman: next.roman,
      note: noteAtSemitone(rootNote, next.degree, useFlats),
      quality: next.quality,
    });
    prevDegree = next.degree;
  }

  return progression;
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

const VOICING_OPTION_ORDER = ["Open / Standard", "E-Shape Barre", "A-Shape Barre"];

function ChordTypeCard({
  note,
  type,
  useFlats,
}: {
  note: string;
  type: string;
  useFlats: boolean;
}) {
  const [voicingIndex, setVoicingIndex] = useState(0);

  const options = useMemo(() => {
    const all = getVoicings(note, type);
    return VOICING_OPTION_ORDER.map((label) => all.find((v) => v.label === label)).filter(
      (v): v is LabeledShape => Boolean(v)
    );
  }, [note, type]);

  const clampedIndex = Math.min(voicingIndex, Math.max(0, options.length - 1));
  const selected = options[clampedIndex];
  const chordLabel = formatChordLabel(note, type);

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
      <span
        className="text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50"
        title={CHORD_TYPE_TOOLTIPS[type] ?? type}
      >
        {type}
      </span>
      {selected ? (
        <ChordDiagram shape={selected.shape} label={chordLabel} useFlats={useFlats} />
      ) : (
        <p className="text-xs text-black/40 dark:text-neutral-500">No voicing available.</p>
      )}
      {options.length > 0 && (
        <select
          value={clampedIndex}
          onChange={(e) => setVoicingIndex(Number(e.target.value))}
          title="Swap the voicing or chord shape used for this chord"
          className="w-full max-w-[150px] rounded-lg border border-border bg-transparent px-2 py-1.5 text-xs dark:border-neutral-600 dark:bg-neutral-900"
        >
          {options.map((v, i) => (
            <option key={i} value={i}>
              {v.label}
              {v.position ? ` (${v.position})` : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function ProgressionChordCard({
  roman,
  note,
  quality,
  voicingIndex,
  useFlats,
  onVoicingChange,
}: {
  roman: string;
  note: string;
  quality: "Major" | "Minor";
  voicingIndex: number;
  useFlats: boolean;
  onVoicingChange: (voicingIndex: number) => void;
}) {
  const voicings = useMemo(() => getVoicings(note, quality), [note, quality]);
  const clampedIndex = Math.min(voicingIndex, Math.max(0, voicings.length - 1));
  const shape = voicings[clampedIndex]?.shape ?? null;
  const label = formatChordLabel(note, quality);

  return (
    <div
      className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-800"
    >
      <span
        className="text-xs font-semibold uppercase tracking-wider text-black/40 dark:text-white/40"
        title="Scale degree of this chord within the key"
      >
        {roman}
      </span>
      {shape ? (
        <ChordDiagram shape={shape} label={label} useFlats={useFlats} />
      ) : (
        <p className="text-xs text-black/40 dark:text-neutral-500">No voicing available.</p>
      )}
      {voicings.length > 0 && (
        <select
          value={clampedIndex}
          onChange={(e) => onVoicingChange(Number(e.target.value))}
          title="Swap the voicing or chord shape used for this chord"
          className="w-full max-w-[150px] rounded-lg border border-border bg-transparent px-2 py-1.5 text-xs dark:border-neutral-600 dark:bg-neutral-900"
        >
          {voicings.map((v, i) => (
            <option key={i} value={i}>
              {v.label}
              {v.position ? ` (${v.position})` : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ChordExplorerPage() {
  const [selectedNote, setSelectedNote] = useState("C");
  const [selectedType, setSelectedType] = useState<ChordType>("Major");
  const [useFlats, setUseFlats] = useState(false);

  const displayNotes = useFlats ? flatNotes : sharpNotes;
  const chordLabel = formatChordLabel(selectedNote, selectedType);

  const invVoicing: InvVoicing | null = selectedType === "Major" ? "Major" : selectedType === "Minor" ? "Minor" : null;
  const inversions = useMemo(
    () => (invVoicing ? getInversions(selectedNote, invVoicing) : null),
    [selectedNote, invVoicing]
  );

  const isMinorKey = selectedType === "Minor" || selectedType === "m7";
  const [progression, setProgression] = useState<(GeneratedChord & { voicingIndex: number })[] | null>(null);

  const handleGenerateProgression = () => {
    const chords = generateProgression(selectedNote, isMinorKey, useFlats).map((c) => {
      const chordVoicings = getVoicings(c.note, c.quality);
      const voicingIndex = chordVoicings.length > 0 ? Math.floor(Math.random() * chordVoicings.length) : 0;
      return { ...c, voicingIndex };
    });
    setProgression(chords);
  };

  const handleProgressionVoicingChange = (index: number, voicingIndex: number) => {
    setProgression((prev) => (prev ? prev.map((c, i) => (i === index ? { ...c, voicingIndex } : c)) : prev));
  };

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

  // ── Panel contents ──────────────────────────────────────────────────────────

  const chordTypeCardsContent = (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
      {chordTypes.map((type) => (
        <ChordTypeCard key={type} note={selectedNote} type={type} useFlats={useFlats} />
      ))}
    </div>
  );

  const inversionsContent = inversions ? (
    <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-200 dark:divide-neutral-700">
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
          <span className="text-sm font-semibold text-black dark:text-white" title={inv.tooltip}>
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
  );

  const progressionContent = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-black/50 dark:text-white/50">
          Random 4-chord ideas in {selectedNote} {isMinorKey ? "minor" : "major"}, biased toward strong
          circle-of-fifths root motion.
        </p>
        <button
          onClick={handleGenerateProgression}
          title="Generate a random 4-chord progression diatonic to the selected key"
          className={`${TOUCH_BUTTON} gap-2 border-accent bg-accent/20 hover:bg-accent/30`}
        >
          <Shuffle size={16} />
          Generate
        </button>
      </div>

      {progression ? (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          {progression.map((c, i) => (
            <ProgressionChordCard
              key={i}
              roman={c.roman}
              note={c.note}
              quality={c.quality}
              voicingIndex={c.voicingIndex}
              useFlats={useFlats}
              onVoicingChange={(voicingIndex) => handleProgressionVoicingChange(i, voicingIndex)}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-black/40 dark:text-neutral-500">
          Click Generate to create a 4-chord progression idea for the current key.
        </p>
      )}
    </div>
  );

  const panels: BentoPanel[] = [
    {
      id: "voicings",
      title: "Chord Types",
      tooltip:
        "Every chord type available for this root note — each card shows a fretboard diagram, and its dropdown lets you switch between Open/Standard, E-Shape Barre, and A-Shape Barre voicings.",
      defaultColSpan: 7,
      defaultRowSpan: 4,
      content: chordTypeCardsContent,
    },
    {
      id: "circle",
      title: "Circle of Fifths",
      tooltip:
        "The Circle of Fifths — keys close together on the wheel share the most notes and sound natural played in sequence. Hover a key to preview it.",
      defaultColSpan: 5,
      defaultRowSpan: 4,
      content: <CircleOfFifths showChordPanel={false} />,
    },
    {
      id: "inversions",
      title: "Inversions",
      tooltip:
        "The same chord notes rearranged so a different note is on the bottom — inversions give the same chord a subtly different sound and feel. Shown as tight three-note voicings on adjacent string sets.",
      defaultColSpan: 12,
      defaultRowSpan: 4,
      content: inversionsContent,
    },
    {
      id: "scale",
      title: "Scale Tool",
      tooltip:
        "See every note of a scale laid out across all six strings and every fret — great for understanding where you can solo or add a melody over your chord progression.",
      defaultColSpan: 12,
      defaultRowSpan: 5,
      content: <ScaleTool />,
    },
    {
      id: "progression-generator",
      title: "Progression Generator",
      tooltip:
        "Generates a random 4-chord progression diatonic to the selected key, weighted toward strong circle-of-fifths root motion (e.g. V→I). Use each card's dropdown to swap in a different voicing.",
      defaultColSpan: 12,
      defaultRowSpan: 4,
      content: progressionContent,
    },
  ];

  return (
    <div className="flex flex-1 min-h-0 flex-col p-4 sm:p-6">

      {/* ── Controls — two rows in a bento card, pinned at top ───────────────── */}
      <div
        className="mb-4 flex flex-col gap-4 rounded-2xl bg-white dark:bg-neutral-900 p-4 sm:p-5"
        style={{ border: "1px solid var(--border-color)" }}
      >

        {/* Row 1: Root note */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p
            className="text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider shrink-0"
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
                  className={`${TOUCH_BUTTON} ${
                    active ? "bg-accent/20 border-accent" : "border-border hover:bg-foreground/10"
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
              className={`${TOUCH_BUTTON} ${
                useFlats ? "bg-accent/20 border-accent" : "border-border hover:bg-foreground/10"
              }`}
            >
              ♭ Flats
            </button>
          </div>
        </div>

        {/* Row 2: Chord type */}
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <p
            className="text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider shrink-0 pt-1"
            title="The flavor of the chord — different types have very different sounds. Major sounds happy, Minor sounds darker, and the rest add color and complexity"
          >
            Chord Type
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {TYPE_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-xs text-black/40 dark:text-white/40 mb-1.5" title={GROUP_TOOLTIPS[group.label]}>
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.types.map((type) => (
                    <button
                      key={type}
                      onClick={() => setSelectedType(type)}
                      title={CHORD_TYPE_TOOLTIPS[type] ?? type}
                      className={`${TOUCH_BUTTON} ${
                        selectedType === type
                          ? "bg-accent/20 border-accent"
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

      {/* ── Bento board — drag to rearrange, drag a corner to resize ──────────── */}
      <BentoBoard storageKey="chord-explorer-bento-v1" panels={panels} />

    </div>
  );
}
