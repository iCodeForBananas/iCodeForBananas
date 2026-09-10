"use client";

import { useMemo, useRef, useState } from "react";
import BentoPageLayout from "../components/BentoPageLayout";
import CircleOfFifths from "../components/CircleOfFifths";
import ChordDiagram from "../components/ChordDiagram";
import ChordTypeCard from "../components/ChordTypeCard";
import { TYPE_GROUPS, GROUP_TOOLTIPS, getVoicings, formatChordLabel } from "../lib/chordVoicings";

interface ProgressionChord {
  /** Stable identity for this slot — two slots can share the same root note. */
  id: string;
  note: string;
}

/**
 * One chord in the progression: the basic (open/standard Major) voicing up
 * top, then every other chord type it could be — grouped the same way
 * chord-explorer groups them — each with its own shape/neck-position picker.
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
  const { note } = chord;
  const useFlats = note.includes("b");
  const label = formatChordLabel(note, "Major");

  const basicVoicing = useMemo(() => {
    const options = getVoicings(note, "Major");
    return options.find((v) => v.label === "Open / Standard") ?? options[0] ?? null;
  }, [note]);

  return (
    <div className="flex w-[340px] shrink-0 flex-col gap-4 rounded-2xl border border-line-subtle bg-surface-raised p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-10 font-semibold uppercase tracking-wider text-ink-muted">
          Chord {index + 1}
        </span>
        <button
          onClick={onRemove}
          title={`Remove ${note} from the progression`}
          className="min-h-[32px] min-w-[32px] rounded-full text-sm text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col items-center gap-1 rounded-xl border border-primary-solid/30 bg-primary-solid/5 p-3">
        <span className="text-24 font-semibold text-ink-primary">{note}</span>
        {basicVoicing ? (
          <ChordDiagram shape={basicVoicing.shape} label={label} useFlats={useFlats} />
        ) : (
          <p className="text-xs text-ink-muted">No voicing available.</p>
        )}
        <span className="text-10 text-ink-muted">Basic voicing</span>
      </div>

      <div className="flex flex-col gap-4">
        {TYPE_GROUPS.map((group) => (
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
      </div>
    </div>
  );
}

export default function ProgressionBuilderPage() {
  const [progression, setProgression] = useState<ProgressionChord[]>([]);
  const nextId = useRef(0);

  const addChord = (note: string) => {
    setProgression((prev) => [...prev, { id: `${note}-${nextId.current++}`, note }]);
  };

  const removeChord = (id: string) => {
    setProgression((prev) => prev.filter((c) => c.id !== id));
  };

  const clearProgression = () => setProgression([]);

  const lastNote = progression[progression.length - 1]?.note ?? "";

  return (
    <BentoPageLayout title="Progression Builder">
      <div className="flex flex-1 min-h-0 flex-col gap-6">
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
                      {chord.note}
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

            <div className="flex flex-1 min-h-0 gap-4 overflow-x-auto pb-4">
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
