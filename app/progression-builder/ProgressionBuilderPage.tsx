"use client";

import { useMemo, useRef, useState } from "react";
import BentoPageLayout from "../components/BentoPageLayout";
import CircleOfFifths from "../components/CircleOfFifths";
import ChordDiagram from "../components/ChordDiagram";
import ChordTypeCard from "../components/ChordTypeCard";
import {
  MAJOR_TYPE_GROUPS,
  MINOR_TYPE_GROUPS,
  GROUP_TOOLTIPS,
  getVoicings,
  getNeckVoicings,
  formatChordLabel,
} from "../lib/chordVoicings";
import {
  TRIAD_STRING_SETS,
  TRIAD_INVERSIONS,
  triadSpecFor,
  neckTriadVoicings,
} from "../lib/triads";

const STRING_SET_LABEL = Object.fromEntries(TRIAD_STRING_SETS.map((s) => [s.key, s.label]));
const INVERSION_LABEL = Object.fromEntries(TRIAD_INVERSIONS.map((i) => [i.key, i.label]));

/** Below this fret, a moveable shape is close enough to the nut that it's
 *  really just a variation on the open/first-position chord already shown
 *  as the basic voicing, not a distinct "up the neck" position. */
const FIRST_POSITION_FRET = 3;
/** How far up the neck the "up the neck" section goes. */
const MAX_NECK_SECTION_FRET = 12;

interface ProgressionChord {
  /** Stable identity for this slot — two slots can share the same root note. */
  id: string;
  note: string;
  /** Which ring of the circle this came from — the outer major key or the inner minor one. */
  quality: "major" | "minor";
}

/**
 * One chord in the progression: its basic voicing (open/standard, in
 * whichever quality it was picked as) up top, then every other chord type it
 * could be — grouped the same way chord-explorer groups them — each with its
 * own shape/neck-position picker.
 */
function ProgressionColumn({
  chord,
  index,
  onRemove,
}: {
  chord: ProgressionChord;
  index: number;
  onRemove: () => void;
}) {
  const { note, quality } = chord;
  const useFlats = note.includes("b");
  const basicType = quality === "minor" ? "Minor" : "Major";
  const label = formatChordLabel(note, basicType);
  // Only the chord types that fit the quality this root was picked as — no
  // major-family types show up under a minor root, and vice versa.
  const typeGroups = quality === "minor" ? MINOR_TYPE_GROUPS : MAJOR_TYPE_GROUPS;

  const basicVoicing = useMemo(() => {
    const options = getVoicings(note, basicType);
    return options.find((v) => v.label === "Open / Standard") ?? options[0] ?? null;
  }, [note, basicType]);

  // Every other place this same triad can be played higher up the neck —
  // the open/first-position shape above already covers the first few frets,
  // so this is deliberately everything past that, up to the 12th fret.
  const neckPositions = useMemo(
    () =>
      getNeckVoicings(note, basicType).filter(
        (v) => !v.label.startsWith("Open") && v.startFret > FIRST_POSITION_FRET && v.startFret <= MAX_NECK_SECTION_FRET
      ),
    [note, basicType]
  );

  // The small three-note grips up the neck — same quality-match and fret
  // window as the full barre positions above, just the triad inside them.
  const neckTriads = useMemo(() => {
    const spec = triadSpecFor(basicType);
    if (!spec) return [];
    return neckTriadVoicings(note, spec.intervals).filter(
      (v) => v.startFret > FIRST_POSITION_FRET && v.startFret <= MAX_NECK_SECTION_FRET
    );
  }, [note, basicType]);

  return (
    <div className="flex w-[340px] shrink-0 flex-col gap-4 rounded-2xl border border-line-subtle bg-surface-raised p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-10 font-semibold uppercase tracking-wider text-ink-muted">
          Chord {index + 1}
        </span>
        <button
          onClick={onRemove}
          title={`Remove ${label} from the progression`}
          className="min-h-[32px] min-w-[32px] rounded-full text-sm text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col items-center gap-1 rounded-xl border border-primary-solid/30 bg-primary-solid/5 p-3">
        <span className="text-24 font-semibold text-ink-primary">{quality === "minor" ? `${note}m` : note}</span>
        {basicVoicing ? (
          <ChordDiagram shape={basicVoicing.shape} label={label} useFlats={useFlats} />
        ) : (
          <p className="text-xs text-ink-muted">No voicing available.</p>
        )}
        <span className="text-10 text-ink-muted">Basic voicing</span>
      </div>

      <div className="flex flex-col gap-4">
        {typeGroups.map((group) => (
          <div key={group.label}>
            <p
              className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted"
              title={GROUP_TOOLTIPS[group.label]}
            >
              {group.label}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {group.types.map((type) => (
                <ChordTypeCard key={type} note={note} type={type} useFlats={useFlats} />
              ))}
            </div>
          </div>
        ))}

        <div>
          <p
            className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted"
            title={`Every other place to play ${label} up to the 12th fret — the open/first-position shape is already shown above as the basic voicing.`}
          >
            {basicType} Positions Up the Neck
          </p>
          {neckPositions.length === 0 ? (
            <p className="text-xs text-ink-muted">No other positions within the first 12 frets.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {neckPositions.map((v) => (
                <div
                  key={v.id}
                  className="flex flex-col items-center gap-1 rounded-xl border border-line-subtle bg-surface-raised p-3 shadow-sm"
                >
                  <ChordDiagram shape={v.shape} label={label} useFlats={useFlats} />
                  <span className="text-10 text-ink-muted">
                    {v.label}
                    {v.position ? ` (${v.position})` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p
            className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted"
            title={`Just the ${basicType.toLowerCase()} triad inside ${label} — three-note grips on three adjacent strings, up to the 12th fret.`}
          >
            {basicType} Triads Up the Neck
          </p>
          {neckTriads.length === 0 ? (
            <p className="text-xs text-ink-muted">No other triad shapes within the first 12 frets.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {neckTriads.map((v) => (
                <div
                  key={v.id}
                  className="flex flex-col items-center gap-1 rounded-xl border border-line-subtle bg-surface-raised p-3 shadow-sm"
                >
                  <ChordDiagram shape={v.shape} label={label} useFlats={useFlats} />
                  <span className="text-10 text-ink-muted">
                    {INVERSION_LABEL[v.inversion]} · {STRING_SET_LABEL[v.stringSet]} ({v.startFret}fr)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProgressionBuilderPage() {
  const [progression, setProgression] = useState<ProgressionChord[]>([]);
  const nextId = useRef(0);

  const addChord = (note: string, quality: "major" | "minor") => {
    setProgression((prev) => [...prev, { id: `${note}-${nextId.current++}`, note, quality }]);
  };

  const removeChord = (id: string) => {
    setProgression((prev) => prev.filter((c) => c.id !== id));
  };

  const clearProgression = () => setProgression([]);

  const lastNote = progression[progression.length - 1]?.note ?? "";

  return (
    <BentoPageLayout title="Progression Builder">
      <div className="flex flex-col gap-6">
        <p className="text-sm text-ink-muted">
          Click a note on the Circle of Fifths to add it to your progression — each click appends a chord.
          Every chord you pick gets its own column below, basic voicing first, then every chord type, shape,
          and neck position you could play it with.
        </p>

        <div className="mx-auto w-full max-w-[520px] shrink-0">
          <CircleOfFifths activeNote={lastNote} onSelectNote={addChord} />
        </div>

        {progression.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-subtle p-8 text-center text-ink-muted">
            No chords yet — click a note on the wheel above to start your progression.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {progression.map((chord, i) => (
                  <span key={chord.id} className="flex items-center gap-1.5 text-sm text-ink-muted">
                    {i > 0 && <span className="text-line-strong">→</span>}
                    <span className="rounded-full bg-primary-solid px-3 py-1 font-medium text-ink-on-primary">
                      {chord.quality === "minor" ? `${chord.note}m` : chord.note}
                    </span>
                  </span>
                ))}
              </div>
              <button
                onClick={clearProgression}
                className="min-h-[44px] rounded-lg border border-line-subtle px-4 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-overlay hover:text-ink-primary"
              >
                Clear progression
              </button>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-4">
              {progression.map((chord, i) => (
                <ProgressionColumn
                  key={chord.id}
                  chord={chord}
                  index={i}
                  onRemove={() => removeChord(chord.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </BentoPageLayout>
  );
}
