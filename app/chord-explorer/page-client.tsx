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
import {
  PROGRESSION_GROUPS,
  parseRomanPattern,
  noteAtDegree,
  type ChordQuality,
} from "../lib/chordProgressions";
import {
  TRIAD_STRING_SETS,
  TRIAD_INVERSIONS,
  triadSpecFor,
  triadVoicings,
  degreeFormula,
} from "../lib/triads";
import ChordDiagram from "../components/ChordDiagram";
import BentoBoard, { type BentoPanel } from "../components/BentoBoard";
import ScaleTool from "../components/ScaleTool";
import CircleOfFifths from "../components/CircleOfFifths";
import ChordFinder from "../components/ChordFinder";

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
  if (type === "Diminished") return `${note}°`;
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

/** Highest fret a finger is asked to reach — past this the shape is off the neck. */
const MAX_FRET = 17;

/** Standard tuning, as MIDI note numbers: E2 A2 D3 G3 B3 E4. */
const STRING_MIDI = [40, 45, 50, 55, 59, 64];

/** The notes a shape actually sounds, in MIDI numbers, lowest string first. */
const shapePitches = (shape: ChordShape): number[] =>
  shape.frets
    .map((fret, i) => (fret < 0 ? null : STRING_MIDI[i] + fret))
    .filter((pitch): pitch is number => pitch !== null);

/**
 * How high a voicing sits. The average of the notes it sounds is what the ear
 * calls "higher up the neck": the bass note alone can't separate an open C from
 * a C barre that shares that bass but sits above it on every other string. The
 * bass breaks ties, so two voicings centred alike order by their bottom end.
 */
const voicingHeight = (shape: ChordShape): { center: number; bass: number } => {
  const pitches = shapePitches(shape);
  if (!pitches.length) return { center: 0, bass: 0 };
  return {
    center: pitches.reduce((sum, pitch) => sum + pitch, 0) / pitches.length,
    bass: Math.min(...pitches),
  };
};

/** Where on the neck the hand sits for a shape — 0 when nothing is fretted. */
const shapeStartFret = (shape: ChordShape): number => {
  const fretted = shape.frets.filter((fret) => fret > 0);
  return fretted.length ? Math.min(...fretted) : 0;
};

/** One rung of a chord's ladder up the neck. */
interface NeckVoicing extends LabeledShape {
  /** Identity of this rung, so a chord pinned to it survives a re-render. */
  id: string;
  center: number;
  bass: number;
  /** Lowest fret the shape asks for — what "around fret N" is measured against. */
  startFret: number;
}

/**
 * Every playable way to sound this chord, ordered from the lowest-sounding to
 * the highest. Moveable barre shapes repeat every 12 frets, so each one is
 * offered at every octave that still fits on the neck — that repetition is what
 * lets a chord be found near whichever fret the progression is anchored at.
 */
const getNeckVoicings = (note: string, type: string): NeckVoicing[] => {
  const voicings: NeckVoicing[] = [];
  const seen = new Set<string>();

  const add = (shape: ChordShape | null, id: string, label: string, position?: string) => {
    if (!shape) return;
    if (shape.frets.some((fret) => fret > MAX_FRET)) return;
    const key = shape.frets.join(",");
    if (seen.has(key)) return;
    seen.add(key);
    voicings.push({
      shape,
      id,
      label,
      position,
      startFret: shapeStartFret(shape),
      ...voicingHeight(shape),
    });
  };

  const canonical = flatToSharp[note] ?? note;
  const enharmonic = sharpToFlat[canonical] ?? flatToSharp[note];

  for (const n of [note, canonical, enharmonic].filter(Boolean) as string[]) {
    const shapes = chordShapes[buildChordKey(n, type)];
    if (shapes?.length) {
      shapes.forEach((s, i) => add(s, `open-${i}`, i === 0 ? "Open / Standard" : `Open Alt ${i + 1}`));
      break;
    }
  }

  const addBarre = (template: ChordShape | undefined, key: string, label: string, baseShift: number) => {
    if (!template) return;
    for (let shift = baseShift; shift <= MAX_FRET; shift += 12) {
      add(transposeShape(template, shift), `${key}-${shift}`, label, shift === 0 ? "Open" : `${shift}fr`);
    }
  };

  addBarre(eShapeTemplates[type], "e", "E-Shape Barre", semitoneFromE(note));
  addBarre(aShapeTemplates[type], "a", "A-Shape Barre", semitoneFromA(note));

  return voicings.sort((a, b) => a.center - b.center || a.bass - b.bass);
};

/** Highest fret the Around-fret dropdown will aim a progression at. */
const MAX_TARGET_FRET = 12;

// `null` anchors the progression at each chord's lowest-sounding voicing, which
// is the open shape wherever one exists.
const POSITION_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Open / lowest position" },
  ...Array.from({ length: MAX_TARGET_FRET }, (_, i) => ({
    value: i + 1,
    label: `Around fret ${i + 1}`,
  })),
];

/**
 * The rung this chord is played on. With no fret asked for that is the bottom of
 * the ladder; with one, it is whichever rung puts the hand nearest that fret.
 */
const anchorIndex = (voicings: NeckVoicing[], targetFret: number | null): number => {
  if (targetFret === null || voicings.length === 0) return 0;
  let best = 0;
  for (let i = 1; i < voicings.length; i++) {
    if (
      Math.abs(voicings[i].startFret - targetFret) <
      Math.abs(voicings[best].startFret - targetFret)
    ) {
      best = i;
    }
  }
  return best;
};

/** The Chord Types cards want each shape once, where it naturally falls. */
const getVoicings = (note: string, type: string): LabeledShape[] => {
  const seen = new Set<string>();
  return getNeckVoicings(note, type).filter((v) => {
    if (seen.has(v.label)) return false;
    seen.add(v.label);
    return true;
  });
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
  "Root Position":   "The note that names the chord is the lowest of the three",
  "1st Inversion":   "The middle note of the chord is on the bottom — lighter, less settled",
  "2nd Inversion":   "The fifth is on the bottom — open and floating, a good passing shape",
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
  voicings,
  index,
  pinnedId,
  useFlats,
  onPick,
}: {
  roman: string;
  note: string;
  quality: ChordQuality;
  /** This chord's rungs, lowest-sounding first. */
  voicings: NeckVoicing[];
  /** Which rung the fret anchor landed this chord on. */
  index: number;
  /** Set when this one chord was picked by hand, overriding the fret anchor. */
  pinnedId?: string;
  useFlats: boolean;
  onPick: (voicingId: string) => void;
}) {
  const pinnedIndex = pinnedId ? voicings.findIndex((v) => v.id === pinnedId) : -1;
  const selectedIndex = pinnedIndex >= 0 ? pinnedIndex : index;
  const selected = voicings[selectedIndex];
  const shape = selected?.shape ?? null;
  const label = formatChordLabel(note, quality);

  return (
    <div
      className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-800"
    >
      <span
        className="text-xs font-semibold tracking-wider text-black/40 dark:text-white/40"
        title="Scale degree of this chord within the key — case shows major/minor (e.g. vi vs VI), ° shows diminished"
      >
        {roman}
      </span>
      {shape ? (
        <ChordDiagram shape={shape} label={label} useFlats={useFlats} />
      ) : (
        <div className="flex flex-col items-center gap-1 py-4">
          <span className="text-sm font-semibold text-black dark:text-white">{label}</span>
          <p className="text-xs text-black/40 dark:text-neutral-500">No voicing available.</p>
        </div>
      )}
      {voicings.length > 0 && (
        <select
          value={selected?.id ?? ""}
          onChange={(e) => onPick(e.target.value)}
          title="Pin this one chord to a shape, wherever the rest of the progression sits"
          className="w-full max-w-[150px] rounded-lg border border-border bg-transparent px-2 py-1.5 text-xs dark:border-neutral-600 dark:bg-neutral-900"
        >
          {voicings.map((v) => (
            <option key={v.id} value={v.id}>
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
  // Panels that think in sharps only — the scale and the fretboard — need the
  // root spelled their way, whichever way the page is showing it.
  const canonicalNote = flatToSharp[selectedNote] ?? selectedNote;

  const invVoicing: InvVoicing | null = selectedType === "Major" ? "Major" : selectedType === "Minor" ? "Minor" : null;
  const inversions = useMemo(
    () => (invVoicing ? getInversions(selectedNote, invVoicing) : null),
    [selectedNote, invVoicing]
  );

  // Every chord type on this page is either a triad or a triad with more piled
  // on top, so the panel always has something to show — for a Maj9 it is the
  // major triad underneath it, which is the part worth moving around the neck.
  const triadSpec = useMemo(() => triadSpecFor(selectedType), [selectedType]);
  const triadShapes = useMemo(
    () => (triadSpec ? triadVoicings(selectedNote, triadSpec.intervals) : []),
    [selectedNote, triadSpec]
  );
  const triadLabel = triadSpec ? formatChordLabel(selectedNote, triadSpec.quality) : "";

  const [selectedProgressionName, setSelectedProgressionName] = useState(PROGRESSION_GROUPS[0].items[0].name);
  // Per-chord voicing picks, scoped to the progression they were made on so
  // switching progressions starts fresh without a reset effect.
  const [progressionVoicings, setProgressionVoicings] = useState<{
    progression: string;
    byIndex: Record<number, string>;
  }>({ progression: selectedProgressionName, byIndex: {} });
  // Where the progression sits on the neck: every chord takes the voicing that
  // puts the hand nearest this fret.
  const [progressionFret, setProgressionFret] = useState<number | null>(null);

  const selectedProgressionDef = useMemo(
    () =>
      PROGRESSION_GROUPS.flatMap((g) => g.items).find((p) => p.name === selectedProgressionName) ??
      PROGRESSION_GROUPS[0].items[0],
    [selectedProgressionName]
  );

  const progressionChords = useMemo(
    () =>
      parseRomanPattern(selectedProgressionDef.pattern).map((c) => ({
        ...c,
        note: noteAtDegree(selectedNote, c.degree, useFlats),
      })),
    [selectedProgressionDef, selectedNote, useFlats]
  );

  // Each chord's rungs up the neck, lowest-sounding first.
  const progressionVoicingSets = useMemo(
    () => progressionChords.map((c) => getNeckVoicings(c.note, c.quality)),
    [progressionChords]
  );

  // Which rung of each chord the chosen fret lands on.
  const selectedIndices = useMemo(
    () => progressionVoicingSets.map((v) => anchorIndex(v, progressionFret)),
    [progressionVoicingSets, progressionFret]
  );

  // Pinned chords survive a key change, but not a switch to another progression.
  const pinnedVoicings =
    progressionVoicings.progression === selectedProgressionName ? progressionVoicings.byIndex : {};

  const handleProgressionVoicingChange = (index: number, voicingId: string) => {
    setProgressionVoicings((prev) => ({
      progression: selectedProgressionName,
      byIndex:
        prev.progression === selectedProgressionName
          ? { ...prev.byIndex, [index]: voicingId }
          : { [index]: voicingId },
    }));
  };

  // Moving the progression is a statement about all of it, so it releases the
  // chords that were pinned by hand rather than leaving some behind.
  const anchorProgression = (fret: number | null) => {
    setProgressionFret(fret);
    setProgressionVoicings({ progression: selectedProgressionName, byIndex: {} });
  };

  const handleNoteClick = (note: string) => setSelectedNote(note);

  // A key clicked on the wheel comes back spelled however the wheel spells it,
  // so re-spell it the way the page is currently showing notes.
  const handleCircleSelect = (note: string) => {
    const asSharp = flatToSharp[note] ?? note;
    setSelectedNote(useFlats ? sharpToFlat[asSharp] ?? asSharp : asSharp);
  };

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

  // Grouped by string set rather than by inversion: the exercise is to stay on
  // three strings and walk the shapes up the neck, so the column you are working
  // in is the thing to hold still.
  const triadsContent = !triadSpec ? (
    <p className="text-sm text-black/40 dark:text-neutral-500">
      This chord type isn&apos;t built on a triad. Pick a Major, Minor or Sus chord to see its shapes.
    </p>
  ) : (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-black/50 dark:text-neutral-400">
        {triadSpec.exact ? (
          <>
            Every way to play <span className="font-semibold text-black dark:text-white">{triadLabel}</span> as
            three notes on three adjacent strings.
          </>
        ) : (
          <>
            The <span className="font-semibold text-black dark:text-white">{triadLabel}</span> triad inside{" "}
            <span className="font-semibold text-black dark:text-white">{chordLabel}</span> — the three notes at its
            core, without the extensions stacked on top.
          </>
        )}{" "}
        <span
          className="text-black/35 dark:text-neutral-500"
          title="A pitch repeats every twelve frets, so these are all the shapes there are — past fret 12 the same ones come round again an octave higher"
        >
          These are all of them; above fret 12 they repeat an octave up.
        </span>
      </p>

      <div className="grid grid-cols-1 gap-y-6 sm:grid-cols-3 sm:gap-y-0 divide-y sm:divide-y-0 sm:divide-x divide-gray-200 dark:divide-neutral-700">
        {TRIAD_STRING_SETS.map((set, idx) => {
          const shapes = triadShapes
            .filter((v) => v.stringSet === set.key)
            .sort((a, b) => a.startFret - b.startFret);
          return (
            <div
              key={set.key}
              className={`flex flex-col gap-1 pt-6 sm:pt-0${idx === 0 ? "" : " sm:pl-6"}${idx === TRIAD_STRING_SETS.length - 1 ? "" : " sm:pr-6"}`}
            >
              <span
                className="text-sm font-semibold text-black dark:text-white"
                title={`Three-note shapes played on ${set.label.replace("Strings ", "strings ")} — string 6 is the thickest, string 1 the thinnest`}
              >
                {set.label}
              </span>
              <span
                className="text-xs text-black/40 dark:text-neutral-500 mb-4"
                title="How many shapes there are on this string set — one for each inversion"
              >
                {shapes.length} shape{shapes.length === 1 ? "" : "s"}
              </span>
              <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
                {shapes.map((v) => {
                  const inv = TRIAD_INVERSIONS.find((i) => i.key === v.inversion)!;
                  return (
                    <div key={v.id} className="flex flex-col items-center gap-1">
                      <VoicingCard
                        shape={v.shape}
                        chordLabel={triadLabel}
                        sublabel={inv.label}
                        useFlats={useFlats}
                      />
                      <span
                        className="text-xs text-black/35 dark:text-neutral-500 text-center tabular-nums"
                        title={`${
                          v.startFret === 0
                            ? "Played at the open position, near the headstock"
                            : `Start your fretting hand around fret ${v.startFret}`
                        } — then the notes of the chord in the order this shape stacks them, lowest string first`}
                      >
                        {v.startFret === 0 ? "Open" : `${v.startFret}fr`} · {degreeFormula(triadSpec.intervals, v.inversion)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // Sidebar rather than a dropdown: the whole point is scanning the feelings
  // and clicking through them quickly, which a closed <select> can't do.
  const progressionContent = (
    <div className="flex h-full min-h-0 flex-col gap-4 md:flex-row">
      <div
        className="flex max-h-64 min-h-0 shrink-0 flex-col overflow-y-auto rounded-lg border border-border md:max-h-none md:w-60 dark:border-neutral-700"
        role="listbox"
        aria-label="Chord progressions by feeling"
      >
        {PROGRESSION_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="sticky top-0 z-10 border-b border-border bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-black/50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white/50">
              {group.label}
            </p>
            {group.items.map((p) => {
              const active = p.name === selectedProgressionName;
              return (
                <button
                  key={p.name}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => setSelectedProgressionName(p.name)}
                  title={p.description}
                  className={`flex w-full flex-col items-start gap-0.5 border-l-2 px-3 py-2 text-left transition-colors ${
                    active
                      ? "border-accent bg-accent/20"
                      : "border-transparent hover:bg-foreground/10"
                  }`}
                >
                  <span className="text-sm font-medium text-black dark:text-white">{p.name}</span>
                  <span className="font-mono text-[11px] text-black/40 dark:text-neutral-500">{p.pattern}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 md:overflow-y-auto">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-black dark:text-white">{selectedProgressionDef.name}</p>
            <p className="text-sm text-black/50 dark:text-white/50">{selectedProgressionDef.description}</p>
            <p
              className="text-xs font-mono text-black/40 dark:text-neutral-500"
              title="The Roman numeral pattern — each numeral represents a scale degree relative to the selected root note"
            >
              {selectedProgressionDef.pattern}
            </p>
          </div>

          {/* Place the whole progression on the neck */}
          <div className="flex shrink-0 flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="progression-fret-position"
                className="text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50"
                title="Anchor the progression at a spot on the fretboard — every chord takes the voicing that puts your hand nearest that fret"
              >
                Fretboard Position
              </label>
              <select
                id="progression-fret-position"
                value={progressionFret ?? ""}
                onChange={(e) =>
                  anchorProgression(e.target.value === "" ? null : Number(e.target.value))
                }
                title="Anchor the progression at a spot on the fretboard"
                className="min-h-[44px] w-full min-w-[200px] rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-900"
              >
                {POSITION_OPTIONS.map((option) => (
                  <option key={option.label} value={option.value ?? ""}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <p className="max-w-[240px] text-xs text-black/40 dark:text-neutral-500">
              {progressionFret === null
                ? "The lowest way to play it — open chords wherever they exist."
                : `Every chord in the shape that sits closest to fret ${progressionFret}.`}
            </p>
          </div>
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          {progressionChords.map((c, i) => (
            <ProgressionChordCard
              key={i}
              roman={c.roman}
              note={c.note}
              quality={c.quality}
              voicings={progressionVoicingSets[i] ?? []}
              index={selectedIndices[i] ?? 0}
              pinnedId={pinnedVoicings[i]}
              useFlats={useFlats}
              onPick={(voicingId) => handleProgressionVoicingChange(i, voicingId)}
            />
          ))}
        </div>
      </div>
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
        "The Circle of Fifths — keys close together on the wheel share the most notes and sound natural played in sequence. Your Root Note is marked wherever it appears, and clicking any key makes it the new root for the whole page.",
      defaultColSpan: 5,
      defaultRowSpan: 4,
      content: <CircleOfFifths activeNote={selectedNote} onSelectNote={handleCircleSelect} />,
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
      id: "triads",
      title: "Triad Shapes",
      tooltip:
        "Every way to play this chord as just three notes on three adjacent strings — each inversion, on each string set, at the place on the neck where it sits. Small shapes like these are how you play a progression without moving your hand far, and how you comp behind a singer without covering them up. For a 7th or extended chord you get the triad at its core.",
      defaultColSpan: 12,
      defaultRowSpan: 7,
      content: triadsContent,
    },
    {
      id: "scale",
      title: "Scale Tool",
      tooltip:
        "See every note of a scale laid out across all six strings and every fret — great for understanding where you can solo or add a melody over your chord progression. Pick a CAGED shape to narrow it to one position: the stretch of neck around one of the five chord shapes, with that chord ringed inside it. The scale is built on the Root Note you picked at the top of the page.",
      defaultColSpan: 12,
      defaultRowSpan: 5,
      content: <ScaleTool rootKey={canonicalNote} />,
    },
    {
      id: "finder",
      title: "Chord Finder",
      tooltip:
        "Work the other way round: click notes on the fretboard and this names every chord they spell. Positions of your Root Note are outlined so you can see where it sits on the neck.",
      defaultColSpan: 12,
      defaultRowSpan: 6,
      content: <ChordFinder rootNote={canonicalNote} />,
    },
    {
      id: "progression-generator",
      title: "Chord Progressions",
      tooltip:
        "Click through the sidebar to hear progressions grouped by the feeling they create — the chords render in your selected key, and the Roman numeral pattern stays fixed while the actual chords follow your root note. Fretboard Position puts the whole progression near a fret of your choosing, and each card's dropdown pins one chord to a shape of your own. Drag the panel's corner to make the list taller.",
      defaultColSpan: 12,
      defaultRowSpan: 6,
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
