"use client";

import { type ReactNode } from "react";
import { HoverCard } from "@radix-ui/themes";
import ChordDiagram from "./ChordDiagram";
import { parseChordName, resolveChordShape } from "../lib/chordShapes";

/** Hovering a chord name shows its diagram above it, in a Radix HoverCard. */
export default function ChordHoverPopover({ chord, children }: { chord: string; children: ReactNode }) {
  const parsed = parseChordName(chord);
  const shape = parsed ? resolveChordShape(parsed.note, parsed.type) : null;

  if (!shape) return <>{children}</>;

  return (
    <HoverCard.Root openDelay={120} closeDelay={60}>
      <HoverCard.Trigger>
        <span className="relative inline-block">{children}</span>
      </HoverCard.Trigger>
      <HoverCard.Content size="1" side="top" className="not-italic normal-case tracking-normal font-normal">
        <ChordDiagram shape={shape} label={chord} />
      </HoverCard.Content>
    </HoverCard.Root>
  );
}
