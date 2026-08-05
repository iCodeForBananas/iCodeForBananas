"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import ChordDiagram from "./ChordDiagram";
import { parseChordName, resolveChordShape } from "../lib/chordShapes";

export default function ChordHoverPopover({ chord, children }: { chord: string; children: ReactNode }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);

  const parsed = parseChordName(chord);
  const shape = parsed ? resolveChordShape(parsed.note, parsed.type) : null;

  if (!shape) return <>{children}</>;

  return (
    <span
      ref={anchorRef}
      className="relative inline-block"
      onMouseEnter={() => setRect(anchorRef.current?.getBoundingClientRect() ?? null)}
      onMouseLeave={() => setRect(null)}
    >
      {children}
      {rect &&
        createPortal(
          <span
            className="fixed z-50 not-italic normal-case tracking-normal font-normal"
            style={{
              left: rect.left + rect.width / 2,
              top: rect.top,
              transform: "translate(-50%, calc(-100% - 8px))",
              width: "max-content",
            }}
          >
            <span
              className="block rounded-lg shadow-xl p-2"
              style={{ background: "var(--background)", border: "1px solid color-mix(in srgb, var(--chord-ink) 25%, transparent)" }}
            >
              <ChordDiagram shape={shape} label={chord} />
            </span>
          </span>,
          document.body
        )}
    </span>
  );
}
