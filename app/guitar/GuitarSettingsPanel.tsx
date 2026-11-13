"use client";

import { flatNotes, flatToSharp, sharpNotes, sharpToFlat } from "@/app/lib/chordShapes";
import {
  CHORD_TYPE_TOOLTIPS,
  formatChordLabel,
  GROUP_TOOLTIPS,
  TYPE_GROUPS,
} from "@/app/lib/chordVoicings";
import { updateGuitarSettings, useGuitarSettings } from "@/app/lib/guitarSettings";
import { TUNINGS } from "@/app/lib/tunings";
import { Bento } from "@/app/components/ui/bento";
import { ToggleButton } from "@/app/components/ui/toggle-button";

// Uniform, touch-friendly control button (≥44px tap target for iPad use)
/** A 44px touch target for the note and chord-type pickers; `on` is the picked one. */
function PickButton({ on, ...props }: Omit<React.ComponentProps<typeof ToggleButton>, "pressed"> & { on: boolean }) {
  return <ToggleButton size='xl' {...props} pressed={on} />;
}

/**
 * Root note, chord type and tuning: the settings every Guitar tool follows.
 * Shown at the top of each tool and on the Settings page.
 */
export default function GuitarSettingsPanel() {
  const { rootNote: selectedNote, chordType: selectedType, useFlats, tuning } = useGuitarSettings();
  const displayNotes = useFlats ? flatNotes : sharpNotes;

  const handleFlatsToggle = () => {
    const next = !useFlats;
    updateGuitarSettings({
      useFlats: next,
      rootNote: (next ? sharpToFlat[selectedNote] : flatToSharp[selectedNote]) ?? selectedNote,
    });
  };

  return (
  <Bento className="flex flex-col gap-4">
    {/* Row 1: Root note */}
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <p
        className="text-xs font-semibold text-ink-muted uppercase tracking-wider shrink-0"
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
            <PickButton
              key={note}
              on={active}
              onClick={() => updateGuitarSettings({ rootNote: note })}
              title={`Select ${note} as your root note — builds a ${formatChordLabel(note, selectedType)} chord`}
            >
              {note}
            </PickButton>
          );
        })}
        <span className="mx-1 text-ink-muted self-center">|</span>
        <PickButton
          on={useFlats}
          onClick={handleFlatsToggle}
          title="Toggle between sharp (♯) and flat (♭) note names — these are the same pitches written two different ways (e.g. F♯ and G♭ are the exact same note)"
        >
          ♭ Flats
        </PickButton>
      </div>
    </div>

    {/* Row 2: Chord type */}
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
      <p
        className="text-xs font-semibold text-ink-muted uppercase tracking-wider shrink-0 pt-1"
        title="The flavor of the chord — different types have very different sounds. Major sounds happy, Minor sounds darker, and the rest add color and complexity"
      >
        Chord Type
      </p>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {TYPE_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-xs text-ink-muted mb-2" title={GROUP_TOOLTIPS[group.label]}>
              {group.label}
            </p>
            <div className="flex flex-wrap gap-2">
              {group.types.map((type) => (
                <PickButton
                  key={type}
                  on={selectedType === type}
                  onClick={() => updateGuitarSettings({ chordType: type })}
                  title={CHORD_TYPE_TOOLTIPS[type] ?? type}
                >
                  {type}
                </PickButton>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Row 3: Tuning */}
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <p
        className="text-xs font-semibold text-ink-muted uppercase tracking-wider shrink-0"
        title="What your strings are tuned to — every chord, scale and fretboard in the Guitar tools is drawn for it"
      >
        Tuning
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {TUNINGS.map((t) => (
          <PickButton
            key={t.id}
            on={tuning.id === t.id}
            onClick={() => updateGuitarSettings({ tuningId: t.id })}
            title={t.description}
          >
            {t.name}
          </PickButton>
        ))}
        <span className="ml-1 text-xs text-ink-muted tabular-nums">{tuning.notes.join(" ")}</span>
      </div>
    </div>
  </Bento>
  );
}
