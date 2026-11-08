"use client";

import type { ChordShape } from "@/app/lib/chordShapes";
import type { GuitarTuning } from "@/app/lib/tunings";
import ChordDiagram from "@/app/components/ChordDiagram";

const VOICING_LABEL_TOOLTIPS: Record<string, string> = {
  "Open / Standard": "A standard open chord — uses open (unfretted) strings, typically the easiest to play",
  "E-Shape Barre":   "A moveable barre chord using the E chord template — press all strings with your index finger and slide this shape up the neck to change the key",
  "A-Shape Barre":   "A moveable barre chord using the A chord template — very common moveable shape for guitar",
  "Root Position":   "The note that names the chord is the lowest of the three",
  "1st Inversion":   "The middle note of the chord is on the bottom — lighter, less settled",
  "2nd Inversion":   "The fifth is on the bottom — open and floating, a good passing shape",
};

export default function VoicingCard({
  shape,
  chordLabel,
  sublabel,
  position,
  useFlats,
  tuning,
}: {
  shape: ChordShape;
  chordLabel: string;
  sublabel: string;
  position?: string;
  useFlats: boolean;
  tuning: GuitarTuning;
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
      <ChordDiagram shape={shape} label={chordLabel} useFlats={useFlats} tuning={tuning} />
      <span className="text-xs font-medium text-ink-muted text-center" title={sublabelTitle}>
        {sublabel}
      </span>
      {position && (
        <span className="text-xs text-ink-muted text-center" title={positionTitle}>
          {position}
        </span>
      )}
    </div>
  );
}
