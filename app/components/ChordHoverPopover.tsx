"use client";

import { useState, type ReactNode } from "react";
import ChordDiagram from "./ChordDiagram";
import { parseChordName, resolveChordShape } from "../lib/chordShapes";

export default function ChordHoverPopover({ chord, children }: { chord: string; children: ReactNode }) {
  const [hovered, setHovered] = useState(false);

  const parsed = parseChordName(chord);
  const shape = parsed ? resolveChordShape(parsed.note, parsed.type) : null;

  if (!shape) return <>{children}</>;

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
      {hovered && (
        <span
          className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 not-italic normal-case tracking-normal font-normal"
          style={{ width: "max-content" }}
        >
          <span
            className="block rounded-lg shadow-xl p-2"
            style={{ background: "var(--background)", border: "1px solid color-mix(in srgb, var(--chord-ink) 25%, transparent)" }}
          >
            <ChordDiagram shape={shape} label={chord} />
          </span>
        </span>
      )}
    </span>
  );
}
