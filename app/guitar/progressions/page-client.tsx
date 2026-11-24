"use client";

import { useMemo, useState } from "react";
import { Select } from "@radix-ui/themes";
import {
  PROGRESSION_GROUPS,
  filterGroupsByKeyMode,
  keyModeForChordType,
  noteAtDegree,
  progressionChordType,
  parseRomanPattern,
} from "@/app/lib/chordProgressions";
import { TYPE_GROUPS, formatChordLabel, getNeckVoicings, type NeckVoicing } from "@/app/lib/chordVoicings";
import { useGuitarSettings } from "@/app/lib/guitarSettings";
import type { GuitarTuning } from "@/app/lib/tunings";
import { Bento } from "@/app/components/ui/bento";
import { Button } from "@/app/components/ui/button";
import ChordDiagram from "@/app/components/ChordDiagram";
import GuitarToolView from "../GuitarToolView";
import { ordinal } from "../GuitarSettingsPanel";

/**
 * How a shape reads in the Position dropdown: open position when it rings open
 * strings down by the nut, otherwise the fret the hand sits at, then the shape.
 */
const positionLabel = (v: NeckVoicing): string => {
  const open = v.startFret <= 3 && v.shape.frets.includes(0);
  const where = open ? "Open position" : `${ordinal(Math.max(v.startFret, 1))} position`;
  const shape = v.label === "Open / Standard" ? "" : ` · ${v.label}`;
  return `${where}${shape}`;
};

/** Diminished chords have no shapes of their own here, but stay pickable on the ° chords. */
const typeOptionsFor = (quality: string): string[] => {
  const all: string[] = TYPE_GROUPS.flatMap((g) => [...g.types]);
  return quality === "Diminished" ? ["Diminished", ...all] : all;
};

/** What one chord of the progression has been changed to, by hand. */
interface ChordPick {
  type?: string;
  /** The exact shape picked. */
  voicingId?: string;
  /** Where the hand was, so changing the type keeps the chord near it. */
  fret?: number | null;
}

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

function ProgressionChordCard({
  roman,
  note,
  type,
  typeOptions,
  voicings,
  selected,
  useFlats,
  tuning,
  onTypeChange,
  onPositionChange,
}: {
  roman: string;
  note: string;
  /** The chord type shown: picked on this card, or the Chord Type setting fitted to the key. */
  type: string;
  typeOptions: string[];
  /** This chord's shapes up the neck, lowest-sounding first. */
  voicings: NeckVoicing[];
  selected: NeckVoicing | undefined;
  useFlats: boolean;
  tuning: GuitarTuning;
  onTypeChange: (type: string) => void;
  onPositionChange: (voicing: NeckVoicing) => void;
}) {
  const shape = selected?.shape ?? null;
  const label = formatChordLabel(note, type);

  return (
    <Bento className="flex flex-col items-center gap-2">
      <span
        className="text-xs font-semibold tracking-wider text-ink-muted"
        title="Scale degree of this chord within the key — case shows major/minor (e.g. vi vs VI), ° shows diminished"
      >
        {roman}
      </span>
      {shape ? (
        <ChordDiagram shape={shape} label={label} useFlats={useFlats} tuning={tuning} />
      ) : (
        <div className="flex flex-col items-center gap-1 py-4">
          <span className="text-sm font-semibold text-ink-primary">{label}</span>
          <p className="text-xs text-ink-muted">No voicing available.</p>
        </div>
      )}
      <div className="flex w-full max-w-[180px] flex-col gap-2">
        <Select.Root size="1" value={type} onValueChange={onTypeChange}>
          <Select.Trigger aria-label="Chord type" title="Chord type for this chord" className="w-full" />
          <Select.Content position="popper">
            {typeOptions.map((t) => (
              <Select.Item key={t} value={t}>
                {formatChordLabel(note, t)}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        {voicings.length > 0 && (
          <Select.Root
            size="1"
            value={selected?.id}
            onValueChange={(id) => {
              const v = voicings.find((x) => x.id === id);
              if (v) onPositionChange(v);
            }}
          >
            <Select.Trigger aria-label="Position" title="Where on the neck to play this chord" className="w-full" />
            <Select.Content position="popper">
              {voicings.map((v) => (
                <Select.Item key={v.id} value={v.id}>
                  {positionLabel(v)}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        )}
      </div>
    </Bento>
  );
}

export default function ProgressionsTool() {
  const {
    rootNote: selectedNote,
    chordType,
    useFlats,
    tuning,
    // Only the starting point: each chord card picks its own position.
    position: defaultFret,
  } = useGuitarSettings();

  // A minor chord type means a minor key: only progressions whose tonic is a
  // minor i, so picking A + Minor lists A minor progressions and nothing else.
  const keyMode = keyModeForChordType(chordType);
  const groups = useMemo(() => filterGroupsByKeyMode(PROGRESSION_GROUPS, keyMode), [keyMode]);

  const [chosenProgressionName, setSelectedProgressionName] = useState(PROGRESSION_GROUPS[0].items[0].name);

  // Switching key mode can hide the chosen progression; fall back to the first
  // one that fits rather than showing a progression in the wrong mode.
  const selectedProgressionDef = useMemo(
    () => groups.flatMap((g) => g.items).find((p) => p.name === chosenProgressionName) ?? groups[0].items[0],
    [groups, chosenProgressionName]
  );
  const selectedProgressionName = selectedProgressionDef.name;

  // Per-chord type and position, scoped to the progression they were made on,
  // so picking another progression starts fresh without a reset effect.
  const [custom, setCustom] = useState<{ progression: string; byIndex: Record<number, ChordPick> }>({
    progression: selectedProgressionName,
    byIndex: {},
  });
  const picks = useMemo<Record<number, ChordPick>>(
    () => (custom.progression === selectedProgressionName ? custom.byIndex : {}),
    [custom, selectedProgressionName]
  );

  const chords = useMemo(
    () =>
      parseRomanPattern(selectedProgressionDef.pattern).map((c, i) => {
        const note = noteAtDegree(selectedNote, c.degree, useFlats);
        const pick = picks[i] ?? {};
        // Until a card says otherwise, the Chord Type setting fitted to the key:
        // Maj7 makes the major chords Maj7 and the minor ones m7.
        const type = pick.type ?? progressionChordType(c.quality, chordType);
        const voicings = getNeckVoicings(note, type, tuning);
        const selected =
          voicings.find((v) => v.id === pick.voicingId) ??
          voicings[anchorIndex(voicings, pick.fret !== undefined ? pick.fret : defaultFret)];
        return { ...c, note, type, voicings, selected, typeOptions: typeOptionsFor(c.quality) };
      }),
    [selectedProgressionDef, selectedNote, useFlats, chordType, tuning, defaultFret, picks]
  );

  const setPick = (index: number, pick: ChordPick) =>
    setCustom({ progression: selectedProgressionName, byIndex: { ...picks, [index]: pick } });

  // A new type keeps the hand where it was: the old shape's fret becomes the
  // target, and the new type's nearest shape is shown.
  const changeType = (index: number, type: string) =>
    setPick(index, { type, fret: chords[index].selected?.startFret ?? picks[index]?.fret });

  const changePosition = (index: number, v: NeckVoicing) =>
    setPick(index, { type: chords[index].type, voicingId: v.id, fret: v.startFret });

  const hasPicks = Object.keys(picks).length > 0;

  // Sidebar rather than a dropdown: the whole point is scanning the feelings
  // and clicking through them quickly, which a closed <select> can't do.
  const progressionContent = (
    <div className="flex h-full min-h-0 flex-col gap-4 md:flex-row">
      <div
        className="flex max-h-64 min-h-0 shrink-0 flex-col overflow-y-auto rounded-lg border border-line-subtle md:max-h-none md:w-72"
        role="listbox"
        aria-label="Chord progressions by genre and feeling"
      >
        <p className="border-b border-line-subtle px-3 py-2 text-xs text-ink-muted">
          {keyMode === "minor" ? "Minor" : "Major"}-key progressions in{" "}
          <span className="font-semibold text-ink-primary">
            {selectedNote} {keyMode}
          </span>
          . Change Chord Type in settings to switch.
        </p>
        {groups.map((group) => (
          <div key={group.label}>
            <p className="sticky top-0 z-10 border-b border-line-subtle bg-surface-sunken px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
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
                  className={`flex w-full items-start gap-2 border-l-2 px-3 py-2 text-left transition-colors ${
                    active
                      ? "border-primary-solid bg-primary-solid/20"
                      : "border-transparent hover:bg-surface-overlay"
                  }`}
                >
                  {/* Chords first, name second: the pattern is what the list is
                      scanned for, so it gets the fixed column and the left
                      edge. Long ones wrap inside it rather than truncating —
                      half a progression is worse than a taller row. */}
                  <span className="w-24 shrink-0 pt-px font-mono text-[11px] leading-snug text-ink-muted">
                    {p.pattern}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-primary">{p.name}</span>
                    {/* Short-form songwriting themes this progression suits —
                        craft judgment, not research; see THEME_TAGS. Only the
                        "Most Popular" shortlist carries these. */}
                    {p.themes && p.themes.length > 0 && (
                      <span className="block text-[10px] leading-snug text-ink-muted">
                        {p.themes.join(" · ")}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 md:overflow-y-auto">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-ink-primary">{selectedProgressionDef.name}</p>
            <p className="text-sm text-ink-muted">{selectedProgressionDef.description}</p>
            {/* Genre + song examples — only the "Most Popular" shortlist
                carries these; see the sourcing note above PROGRESSION_GROUPS. */}
            {selectedProgressionDef.genre && (
              <p className="text-xs text-ink-muted">
                {selectedProgressionDef.genre}
                {selectedProgressionDef.songs && selectedProgressionDef.songs.length > 0 && (
                  <> — {selectedProgressionDef.songs.map((s) => `"${s}"`).join(", ")}</>
                )}
              </p>
            )}
            <p
              className="text-xs font-mono text-ink-muted"
              title="The Roman numeral pattern — each numeral represents a scale degree relative to the selected root note"
            >
              {selectedProgressionDef.pattern}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-2">
            <p className="max-w-[260px] text-xs text-ink-muted">
              Pick a type and position on each chord to build your own version. They start from Chord Type and
              Position in settings.
            </p>
            {hasPicks && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCustom({ progression: selectedProgressionName, byIndex: {} })}
              >
                Reset chords
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          {chords.map((c, i) => (
            <ProgressionChordCard
              key={i}
              roman={c.roman}
              note={c.note}
              type={c.type}
              typeOptions={c.typeOptions}
              voicings={c.voicings}
              selected={c.selected}
              useFlats={useFlats}
              tuning={tuning}
              onTypeChange={(t) => changeType(i, t)}
              onPositionChange={(v) => changePosition(i, v)}
            />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <GuitarToolView
      title="Chord Progressions"
      tooltip="Progressions grouped by genre and by feeling, in your key. A minor Chord Type shows minor-key progressions and a major one shows major-key progressions. Each chord card has its own Chord Type and Position dropdowns, so you can build the progression chord by chord; they start from the settings."
    >
      {/* A fixed height so the list and the chords scroll side by side. */}
      <div className="md:h-[calc(100dvh-9rem)]">{progressionContent}</div>
    </GuitarToolView>
  );
}
