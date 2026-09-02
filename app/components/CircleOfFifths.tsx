"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./circleOfFifths.css";
import ChordDiagram from "./ChordDiagram";
import { flatToSharp, resolveChordShape } from "../lib/chordShapes";

interface ChordInfo {
  major: string;
  minor: string;
}

const circleData: ChordInfo[] = [
  { major: "C",      minor: "Am" },
  { major: "G",      minor: "Em" },
  { major: "D",      minor: "Bm" },
  { major: "A",      minor: "F♯m" },
  { major: "E",      minor: "C♯m" },
  { major: "B",      minor: "G♯m" },
  { major: "F♯/G♭",  minor: "D♯m/E♭m" },
  { major: "D♭",     minor: "B♭m" },
  { major: "A♭",     minor: "Fm" },
  { major: "E♭",     minor: "Cm" },
  { major: "B♭",     minor: "Gm" },
  { major: "F",      minor: "Dm" },
];

/** Roughly how tall the chord diagram renders, for deciding which side of a key it fits on. */
const PREVIEW_HEIGHT = 200;

/** The plain note a wheel label names: "F♯/G♭" → "F#", "B♭m" → "Bb". */
const parseChordNote = (chord: string, type: "major" | "minor"): string => {
  const primary = chord.split("/")[0];
  const ascii = primary.replace(/♯/g, "#").replace(/♭/g, "b");
  return type === "minor" ? ascii.replace(/m$/, "") : ascii;
};

/**
 * A wheel the page drives. `activeNote` is the page's root note, marked wherever
 * it appears — as a major key and as the minor key of the same name — and a
 * click reports the key upward rather than being remembered here, so the page's
 * root note stays the single source of truth.
 */
export default function CircleOfFifths({
  activeNote,
  onSelectNote,
}: {
  activeNote: string;
  onSelectNote: (note: string) => void;
}) {
  // The key under the cursor, carrying where its circle sits on screen so the
  // chord diagram can be pinned beside it.
  const [hovered, setHovered] = useState<{
    chord: string;
    note: string;
    type: "major" | "minor";
    x: number;
    y: number;
    radius: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const centerX = 250;
  const centerY = 250;
  const outerRadius = 185;
  const innerRadius = 125;
  const angleStep = (2 * Math.PI) / 12;
  const startAngle = -Math.PI / 2;

  const getPosition = (index: number, radius: number) => {
    const angle = startAngle + index * angleStep;
    return {
      x: Math.round((centerX + radius * Math.cos(angle)) * 100) / 100,
      y: Math.round((centerY + radius * Math.sin(angle)) * 100) / 100,
    };
  };

  // Compare as sharps so a page showing flats still lights the right key.
  const canonicalActive = flatToSharp[activeNote] ?? activeNote;
  const isActive = (chord: string, type: "major" | "minor") => {
    if (hovered?.chord === chord) return true;
    const note = parseChordNote(chord, type);
    return (flatToSharp[note] ?? note) === canonicalActive;
  };

  // Hover and click behave the same on the circle and on its label, so both
  // carry the same handlers.
  const keyHandlers = (
    chord: string,
    type: "major" | "minor",
    index: number,
    ringRadius: number,
    keyRadius: number,
  ) => ({
    onMouseEnter: () => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      // The wheel scales with its container, so read the key's screen position
      // off the rendered svg rather than the viewBox.
      const pos = getPosition(index, ringRadius);
      const scale = rect.width / 500;
      setHovered({
        chord,
        note: parseChordNote(chord, type),
        type,
        x: rect.left + pos.x * scale,
        y: rect.top + pos.y * scale,
        radius: keyRadius * scale,
      });
    },
    onMouseLeave: () => setHovered(null),
    onClick: () => onSelectNote(parseChordNote(chord, type)),
  });

  // A hovered key names one plain chord — "F♯/G♭" is F♯ major, "B♭m" is B♭ minor —
  // and its grip appears next to the key, so practising the circle never means
  // looking something up somewhere else.
  const previewName = hovered ? hovered.chord.split("/")[0] : null;
  const previewShape = hovered ? resolveChordShape(hovered.note, hovered.type === "minor" ? "Minor" : "Major") : null;
  const previewBelow = hovered ? hovered.y - hovered.radius < PREVIEW_HEIGHT : false;

  return (
    <div className='circle-of-fifths-container'>
      <div className='circle-column'>
        <svg ref={svgRef} viewBox='0 0 500 500' className='circle-svg'>
          <circle cx={centerX} cy={centerY} r={outerRadius} className='outer-ring' />
          <circle cx={centerX} cy={centerY} r={innerRadius} className='inner-ring' />

          {circleData.map((_, index) => {
            const outerPos = getPosition(index, outerRadius + 30);
            const innerPos = getPosition(index, innerRadius - 25);
            return (
              <line
                key={`line-${index}`}
                x1={outerPos.x} y1={outerPos.y}
                x2={innerPos.x} y2={innerPos.y}
                stroke='rgba(250,204,21,0.15)' strokeWidth='1'
              />
            );
          })}

          {circleData.map((data, index) => {
            const pos = getPosition(index, outerRadius);
            const active = isActive(data.major, "major");
            const handlers = keyHandlers(data.major, "major", index, outerRadius, active ? 30 : 27);
            return (
              <g key={`major-${index}`}>
                <title>{`${data.major} major — click to make it your root note`}</title>
                <circle
                  cx={pos.x} cy={pos.y} r={active ? 30 : 27}
                  className={`key-circle major-key${active ? " active" : ""}`}
                  {...handlers}
                />
                <text
                  x={pos.x} y={pos.y} textAnchor='middle' dominantBaseline='middle'
                  className={`key-text${active ? " active" : ""}`}
                  {...handlers}
                >
                  {data.major}
                </text>
              </g>
            );
          })}

          {circleData.map((data, index) => {
            const pos = getPosition(index, innerRadius);
            const active = isActive(data.minor, "minor");
            const handlers = keyHandlers(data.minor, "minor", index, innerRadius, active ? 25 : 22);
            return (
              <g key={`minor-${index}`}>
                <title>{`${data.minor} — the relative minor of ${data.major}, click to make its root note yours`}</title>
                <circle
                  cx={pos.x} cy={pos.y} r={active ? 25 : 22}
                  className={`key-circle minor-key${active ? " active" : ""}`}
                  {...handlers}
                />
                <text
                  x={pos.x} y={pos.y} textAnchor='middle' dominantBaseline='middle'
                  className={`key-text minor-text${active ? " active" : ""}`}
                  {...handlers}
                >
                  {data.minor}
                </text>
              </g>
            );
          })}

          <text x={centerX} y={centerY - 8} textAnchor='middle' dominantBaseline='middle' className='center-text'>
            Circle of
          </text>
          <text x={centerX} y={centerY + 12} textAnchor='middle' dominantBaseline='middle' className='center-text'>
            Fifths
          </text>
        </svg>

        {hovered &&
          previewShape &&
          previewName &&
          createPortal(
            <div
              className='chord-preview'
              style={{
                left: hovered.x,
                top: previewBelow ? hovered.y + hovered.radius + 10 : hovered.y - hovered.radius - 10,
                transform: previewBelow ? "translate(-50%, 0)" : "translate(-50%, -100%)",
              }}
            >
              <ChordDiagram shape={previewShape} label={previewName} useFlats={previewName.includes("♭")} />
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}
