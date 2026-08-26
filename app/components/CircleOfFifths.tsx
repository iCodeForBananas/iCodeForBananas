"use client";

import { useState } from "react";
import "./circleOfFifths.css";
import { flatToSharp } from "../lib/chordShapes";

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
  const [hoveredChord, setHoveredChord] = useState<string | null>(null);

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
    if (hoveredChord === chord) return true;
    const note = parseChordNote(chord, type);
    return (flatToSharp[note] ?? note) === canonicalActive;
  };

  // Hover and click behave the same on the circle and on its label, so both
  // carry the same handlers.
  const keyHandlers = (chord: string, type: "major" | "minor") => ({
    onMouseEnter: () => setHoveredChord(chord),
    onMouseLeave: () => setHoveredChord(null),
    onClick: () => onSelectNote(parseChordNote(chord, type)),
  });

  return (
    <div className='circle-of-fifths-container'>
      <div className='circle-column'>
        <svg viewBox='0 0 500 500' className='circle-svg'>
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
            const handlers = keyHandlers(data.major, "major");
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
            const handlers = keyHandlers(data.minor, "minor");
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
      </div>
    </div>
  );
}
