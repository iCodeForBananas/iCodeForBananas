"use client";

import { useState, useMemo } from "react";
import "../components/fretboard.css";
import { allNotes, getNoteAt, generateChordsAndScales, defaultTuning } from "../lib/music";
import BentoBoard, { type BentoPanel } from "../components/BentoBoard";

const SCALE_TYPES = [
  "Major",
  "Minor",
  "Pentatonic Major",
  "Pentatonic Minor",
  "Blues",
  "Phrygian",
  "Phrygian Dominant",
  "Harmonic Minor",
  "Melodic Minor",
];

const SCALE_TOOLTIPS: Record<string, string> = {
  "Major": "Bright and happy — the scale most melodies are built from",
  "Minor": "Darker and more serious — the natural minor scale",
  "Pentatonic Major": "Five notes, no sour ones — the easiest scale to solo with",
  "Pentatonic Minor": "Five notes with a bluesy edge — the rock and blues workhorse",
  "Blues": "The minor pentatonic plus the flat 5 'blue note'",
  "Phrygian": "A minor scale with a flat 2nd — Spanish and metal flavoured",
  "Phrygian Dominant": "Phrygian with a major 3rd — the exotic, Middle-Eastern sound",
  "Harmonic Minor": "Minor with a raised 7th — dramatic, classical tension",
  "Melodic Minor": "Minor with a raised 6th and 7th — smooth jazz-minor colour",
};

// Uniform, touch-friendly control button (≥44px tap target for iPad use)
const TOUCH_BUTTON =
  "min-h-[44px] min-w-[44px] px-4 rounded-lg border text-sm font-medium inline-flex items-center justify-center transition-colors";

const TOTAL_FRETS = 12;

export default function FretboardQuizPage() {
  const [selectedKey, setSelectedKey] = useState("G");
  const [selectedScaleType, setSelectedScaleType] = useState("Major");
  const [guessedNotes, setGuessedNotes] = useState<Set<string>>(new Set());
  const [incorrectGuesses, setIncorrectGuesses] = useState<Set<string>>(new Set());
  const [incorrectCount, setIncorrectCount] = useState(0);

  const tuning = defaultTuning;

  const { scales } = useMemo(() => generateChordsAndScales(), []);

  const scaleKey = `${selectedKey} ${selectedScaleType}`;
  const scaleNotes = useMemo(
    () => (scales[scaleKey] || []).map((n) => n.toUpperCase()),
    [scales, scaleKey]
  );

  // Every fretboard position that belongs to the scale — the full set to find.
  const scalePositions = useMemo(() => {
    const positions = new Set<string>();
    for (let fret = 0; fret <= TOTAL_FRETS; fret++) {
      tuning.forEach((baseNote, stringIndex) => {
        const note = getNoteAt(baseNote, fret).toUpperCase();
        if (scaleNotes.includes(note)) positions.add(`${stringIndex}-${fret}`);
      });
    }
    return positions;
  }, [scaleNotes, tuning]);

  const totalNotesToFind = scalePositions.size;
  const foundCount = guessedNotes.size;
  const isComplete = totalNotesToFind > 0 && foundCount === totalNotesToFind;
  const totalAttempts = foundCount + incorrectCount;
  const scorePercent = totalAttempts > 0 ? Math.round((foundCount / totalAttempts) * 100) : 0;
  const foundPercent = totalNotesToFind > 0 ? Math.round((foundCount / totalNotesToFind) * 100) : 0;

  const resetRound = () => {
    setGuessedNotes(new Set());
    setIncorrectGuesses(new Set());
    setIncorrectCount(0);
  };

  const handleNoteClick = (stringIndex: number, fret: number) => {
    const positionKey = `${stringIndex}-${fret}`;
    if (guessedNotes.has(positionKey)) return;

    const note = getNoteAt(tuning[stringIndex], fret).toUpperCase();

    if (scaleNotes.includes(note)) {
      setGuessedNotes((prev) => new Set(prev).add(positionKey));
      return;
    }

    setIncorrectCount((prev) => prev + 1);
    setIncorrectGuesses((prev) => new Set(prev).add(positionKey));
    // The red flash is feedback, not state worth keeping.
    setTimeout(() => {
      setIncorrectGuesses((prev) => {
        const updated = new Set(prev);
        updated.delete(positionKey);
        return updated;
      });
    }, 500);
  };

  const handleKeyChange = (newKey: string) => {
    setSelectedKey(newKey);
    resetRound();
  };

  const handleScaleTypeChange = (newType: string) => {
    setSelectedScaleType(newType);
    resetRound();
  };

  // ── Panel contents ──────────────────────────────────────────────────────────

  const fretboardContent = (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-black/50 dark:text-white/50">
        Find every{" "}
        <span className="font-semibold text-black dark:text-white">
          {selectedKey} {selectedScaleType}
        </span>{" "}
        note. Click a fret to guess whether that note is in the scale.
      </p>

      <div className="fretboard-wrapper overflow-auto">
        <div className="flex mb-1" style={{ minWidth: 800 }}>
          {[...Array(TOTAL_FRETS + 1).keys()].map((fret) => (
            <div
              key={fret}
              className="fret-number text-center flex-1 text-xs text-black/40 dark:text-neutral-500"
            >
              {fret}
            </div>
          ))}
        </div>

        <div className="fretboard flex" style={{ minWidth: 800 }}>
          {[...Array(TOTAL_FRETS + 1).keys()].map((fret) => (
            <div key={fret} className="fret flex flex-col flex-1 gap-1">
              {tuning
                .slice()
                .reverse()
                .map((baseNote, reversedIndex) => {
                  const stringIndex = tuning.length - 1 - reversedIndex;
                  const note = getNoteAt(baseNote, fret).toUpperCase();
                  const positionKey = `${stringIndex}-${fret}`;
                  const isGuessed = guessedNotes.has(positionKey);
                  const isIncorrect = incorrectGuesses.has(positionKey);

                  const stateClass = isGuessed
                    ? "bg-green-300"
                    : isIncorrect
                    ? "bg-red-300"
                    : "";

                  return (
                    <div
                      key={reversedIndex}
                      onClick={() => handleNoteClick(stringIndex, fret)}
                      className={`note cursor-pointer select-none transition-colors hover:bg-[#facc15] ${
                        fret === 0 ? "open" : ""
                      } ${stateClass}`}
                      title={
                        isGuessed
                          ? `${note} — string ${stringIndex + 1}, fret ${fret} (found)`
                          : `String ${stringIndex + 1}, fret ${fret} — click to guess`
                      }
                    >
                      {isGuessed ? note : "?"}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const scoreContent = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-1 min-w-[110px] flex-col gap-0.5 rounded-xl border border-gray-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-800">
          <span
            className="text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50"
            title="How many of the scale's fretboard positions you have found so far"
          >
            Found
          </span>
          <span className="text-2xl font-bold tabular-nums text-black dark:text-white">
            {foundCount}
            <span className="text-base font-medium text-black/40 dark:text-neutral-500">
              /{totalNotesToFind}
            </span>
          </span>
        </div>

        <div className="flex flex-1 min-w-[110px] flex-col gap-0.5 rounded-xl border border-gray-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-800">
          <span
            className="text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50"
            title="Correct guesses as a share of every guess you have made this round"
          >
            Accuracy
          </span>
          <span className="text-2xl font-bold tabular-nums text-black dark:text-white">
            {totalAttempts > 0 ? `${scorePercent}%` : "—"}
          </span>
        </div>

        <div className="flex flex-1 min-w-[110px] flex-col gap-0.5 rounded-xl border border-gray-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-800">
          <span
            className="text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50"
            title="Guesses on notes that are not in this scale"
          >
            Misses
          </span>
          <span className="text-2xl font-bold tabular-nums text-black dark:text-white">
            {incorrectCount}
          </span>
        </div>
      </div>

      <div
        className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
        title={`${foundPercent}% of this scale found`}
      >
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${foundPercent}%`, background: "#facc15" }}
        />
      </div>

      {isComplete && (
        <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm font-medium text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
          🎉 Every {selectedKey} {selectedScaleType} note found — {scorePercent}% accuracy.
        </div>
      )}
    </div>
  );

  const legendContent = (
    <div className="flex flex-col gap-3">
      {[
        { swatch: "bg-green-300", label: "Correct — the note is in the scale", border: "" },
        { swatch: "bg-red-300", label: "Wrong — that note is outside the scale", border: "" },
        { swatch: "bg-white", label: "Not guessed yet", border: "border border-gray-300" },
      ].map((row) => (
        <div key={row.label} className="flex items-center gap-3">
          <div className={`h-5 w-5 shrink-0 rounded ${row.swatch} ${row.border}`} />
          <span className="text-sm text-black/60 dark:text-neutral-400">{row.label}</span>
        </div>
      ))}
      <p className="mt-1 text-xs text-black/40 dark:text-neutral-500">
        Every position is its own guess, so the same note has to be found on each string it
        appears on. Changing the key or the scale starts a fresh round.
      </p>
    </div>
  );

  const panels: BentoPanel[] = [
    {
      id: "fretboard",
      title: "Fretboard",
      tooltip:
        "The first twelve frets in standard tuning, with every note hidden. Click a position to guess whether it belongs to the selected scale — correct guesses reveal the note.",
      defaultColSpan: 12,
      defaultRowSpan: 3,
      content: fretboardContent,
    },
    {
      id: "score",
      title: "Score",
      tooltip:
        "How far through the scale you are, how accurate your guesses have been, and how many notes you have missed this round.",
      defaultColSpan: 7,
      defaultRowSpan: 2,
      content: scoreContent,
    },
    {
      id: "legend",
      title: "Legend",
      tooltip: "What each colour on the fretboard means.",
      defaultColSpan: 5,
      defaultRowSpan: 2,
      content: legendContent,
    },
  ];

  return (
    <div className="flex flex-1 min-h-0 flex-col p-4 sm:p-6">

      {/* ── Controls — two rows in a bento card, pinned at top ───────────────── */}
      <div
        className="mb-4 flex flex-col gap-4 rounded-2xl bg-white dark:bg-neutral-900 p-4 sm:p-5"
        style={{ border: "1px solid var(--border-color)" }}
      >

        {/* Row 1: Key */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p
            className="text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider shrink-0"
            title="The root note of the scale you are being quizzed on"
          >
            Key
          </p>
          <div className="flex flex-wrap gap-2">
            {allNotes.map((note) => (
              <button
                key={note}
                onClick={() => handleKeyChange(note)}
                title={`Quiz the ${note} ${selectedScaleType} scale — starts a fresh round`}
                className={`${TOUCH_BUTTON} ${
                  selectedKey === note
                    ? "bg-accent/20 border-accent"
                    : "border-border hover:bg-foreground/10"
                }`}
              >
                {note}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Scale, and a way to start over */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p
            className="text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider shrink-0"
            title="Which scale's notes you are hunting for — each has its own pattern and mood"
          >
            Scale
          </p>
          <div className="flex flex-wrap gap-2">
            {SCALE_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => handleScaleTypeChange(type)}
                title={SCALE_TOOLTIPS[type] ?? type}
                className={`${TOUCH_BUTTON} ${
                  selectedScaleType === type
                    ? "bg-accent/20 border-accent"
                    : "border-border hover:bg-foreground/10"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
          <button
            onClick={resetRound}
            title="Clear every guess and start this scale again"
            className={`${TOUCH_BUTTON} ml-auto border-border hover:bg-foreground/10`}
          >
            Restart
          </button>
        </div>
      </div>

      {/* ── Bento board — drag to rearrange, drag a corner to resize ──────────── */}
      <BentoBoard storageKey="fretboard-quiz-bento-v1" panels={panels} />

    </div>
  );
}
