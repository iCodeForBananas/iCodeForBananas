"use client";

import { useRef, useState, type ReactNode } from "react";
import { HoverCard } from "@radix-ui/themes";
import ChordDiagram from "./ChordDiagram";
import { parseChordName, resolveChordShape } from "../lib/chordShapes";
import { useGuitarSettings } from "../lib/guitarSettings";
import { retuneShape } from "../lib/tunings";

/**
 * Hovering a chord name shows its diagram above it, in a Radix HoverCard.
 *
 * HoverCard ignores touch entirely, so on an iPad or phone a tap opens it
 * instead. Tapping anywhere outside closes it (the card's own dismiss layer
 * does that on pointer-down), which is also what lets a tap on another chord
 * close this one and open that one. The tap doesn't reach the line under the
 * chord, so it doesn't also seek playback or open the line editor.
 */
export default function ChordHoverPopover({ chord, children }: { chord: string; children: ReactNode }) {
  const { tuning } = useGuitarSettings();
  const [open, setOpen] = useState(false);
  const lastPointer = useRef<string | null>(null);
  const parsed = parseChordName(chord);
  const standardShape = parsed ? resolveChordShape(parsed.note, parsed.type) : null;
  const shape = standardShape && retuneShape(standardShape, tuning);

  if (!shape) return <>{children}</>;

  return (
    <HoverCard.Root open={open} onOpenChange={setOpen} openDelay={120} closeDelay={60}>
      <HoverCard.Trigger>
        <span
          className="relative inline-block"
          onPointerDown={(e) => {
            lastPointer.current = e.pointerType;
          }}
          // Pointer-up rather than click: the trigger cancels touchstart, which
          // can swallow the click. A touch that turns into a scroll ends in
          // pointercancel instead, so scrolling past a chord doesn't open it.
          onPointerUp={(e) => {
            if (e.pointerType === "touch") setOpen(true);
          }}
          onClick={(e) => {
            if (lastPointer.current === "touch") e.stopPropagation();
          }}
        >
          {children}
        </span>
      </HoverCard.Trigger>
      <HoverCard.Content size="1" side="top" className="not-italic normal-case tracking-normal font-normal">
        <ChordDiagram shape={shape} label={chord} tuning={tuning} />
      </HoverCard.Content>
    </HoverCard.Root>
  );
}
