"use client";

import { useState } from "react";
import "./circleOfFifths.css";

interface ChordInfo {
  major: string;
  minor: string;
  majorFrets: (number | null)[];
  minorFrets: (number | null)[];
}

const circleData: ChordInfo[] = [
  // Major keys on outer circle, relative minors on inner circle
  { major: "C", minor: "Am", majorFrets: [null, 3, 2, 0, 1, 0], minorFrets: [null, 0, 2, 2, 1, 0] },
  { major: "G", minor: "Em", majorFrets: [3, 2, 0, 0, 0, 3], minorFrets: [0, 2, 2, 0, 0, 0] },
  { major: "D", minor: "Bm", majorFrets: [null, null, 0, 2, 3, 2], minorFrets: [null, 2, 4, 4, 3, 2] },
  { major: "A", minor: "F♯m", majorFrets: [null, 0, 2, 2, 2, 0], minorFrets: [2, 4, 4, 2, 2, 2] },
  { major: "E", minor: "C♯m", majorFrets: [0, 2, 2, 1, 0, 0], minorFrets: [null, 4, 6, 6, 5, 4] },
  { major: "B", minor: "G♯m", majorFrets: [null, 2, 4, 4, 4, 2], minorFrets: [4, 6, 6, 4, 4, 4] },
  { major: "F♯/G♭", minor: "D♯m/E♭m", majorFrets: [2, 4, 4, 3, 2, 2], minorFrets: [null, 6, 8, 8, 7, 6] },
  { major: "D♭", minor: "B♭m", majorFrets: [null, 4, 6, 6, 6, 4], minorFrets: [null, 1, 3, 3, 2, 1] },
  { major: "A♭", minor: "Fm", majorFrets: [4, 6, 6, 5, 4, 4], minorFrets: [1, 3, 3, 1, 1, 1] },
  { major: "E♭", minor: "Cm", majorFrets: [null, 6, 8, 8, 8, 6], minorFrets: [null, 3, 5, 5, 4, 3] },
  { major: "B♭", minor: "Gm", majorFrets: [null, 1, 3, 3, 3, 1], minorFrets: [3, 5, 5, 3, 3, 3] },
  { major: "F", minor: "Dm", majorFrets: [1, 3, 3, 2, 1, 1], minorFrets: [null, null, 0, 2, 3, 1] },
];

export default function CircleOfFifths() {
  const [hoveredKey, setHoveredKey] = useState<{
    chord: string;
    frets: (number | null)[];
    type: "major" | "minor";
  } | null>(null);
  const [selectedKey, setSelectedKey] = useState<{
    chord: string;
    frets: (number | null)[];
    type: "major" | "minor";
  } | null>(null);

  const centerX = 300;
  const centerY = 300;
  const outerRadius = 200;
  const innerRadius = 130;
  const angleStep = (2 * Math.PI) / 12;
  const startAngle = -Math.PI / 2; // Start at top

  const getPosition = (index: number, radius: number) => {
    const angle = startAngle + index * angleStep;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  };

  return (
    <div className='circle-of-fifths-container'>
      {" "}
      <div className='circle-column'>
        {" "}
        <svg width='600' height='600' className='circle-svg'>
          {/* Outer circle background */}
          <circle
            cx={centerX}
            cy={centerY}
            r={outerRadius + 30}
            fill='none'
            stroke='currentColor'
            strokeWidth='1'
            opacity='0.2'
          />

          {/* Inner circle background */}
          <circle
            cx={centerX}
            cy={centerY}
            r={innerRadius - 10}
            fill='none'
            stroke='currentColor'
            strokeWidth='1'
            opacity='0.2'
          />

          {/* Major keys (outer circle) */}
          {circleData.map((data, index) => {
            const pos = getPosition(index, outerRadius);
            return (
              <g key={`major-${index}`}>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r='35'
                  className='key-circle major-key'
                  onMouseEnter={() => setHoveredKey({ chord: data.major, frets: data.majorFrets, type: "major" })}
                  onMouseLeave={() => setHoveredKey(null)}
                  onClick={() => setSelectedKey({ chord: data.major, frets: data.majorFrets, type: "major" })}
                />
                <text
                  x={pos.x}
                  y={pos.y}
                  textAnchor='middle'
                  dominantBaseline='middle'
                  className='key-text'
                  onMouseEnter={() => setHoveredKey({ chord: data.major, frets: data.majorFrets, type: "major" })}
                  onMouseLeave={() => setHoveredKey(null)}
                  onClick={() => setSelectedKey({ chord: data.major, frets: data.majorFrets, type: "major" })}
                >
                  {data.major}
                </text>
              </g>
            );
          })}

          {/* Minor keys (inner circle) */}
          {circleData.map((data, index) => {
            const pos = getPosition(index, innerRadius);
            return (
              <g key={`minor-${index}`}>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r='30'
                  className='key-circle minor-key'
                  onMouseEnter={() => setHoveredKey({ chord: data.minor, frets: data.minorFrets, type: "minor" })}
                  onMouseLeave={() => setHoveredKey(null)}
                  onClick={() => setSelectedKey({ chord: data.minor, frets: data.minorFrets, type: "minor" })}
                />
                <text
                  x={pos.x}
                  y={pos.y}
                  textAnchor='middle'
                  dominantBaseline='middle'
                  className='key-text minor-text'
                  onMouseEnter={() => setHoveredKey({ chord: data.minor, frets: data.minorFrets, type: "minor" })}
                  onMouseLeave={() => setHoveredKey(null)}
                  onClick={() => setSelectedKey({ chord: data.minor, frets: data.minorFrets, type: "minor" })}
                >
                  {data.minor}
                </text>
              </g>
            );
          })}

          {/* Center label */}
          <text x={centerX} y={centerY} textAnchor='middle' dominantBaseline='middle' className='center-text'>
            Circle of
          </text>
          <text x={centerX} y={centerY + 20} textAnchor='middle' dominantBaseline='middle' className='center-text'>
            Fifths
          </text>
        </svg>
      </div>
      {/* Chord diagram display */}
      <div className='chord-column'>
        {hoveredKey || selectedKey ? (
          <div className='chord-display'>
            <h3 className='text-2xl font-bold mb-4'>{(hoveredKey || selectedKey)!.chord}</h3>
            <div className='chord-diagram'>
              <svg width='150' height='200' viewBox='0 0 150 200'>
                {/* Fret lines */}
                {[0, 1, 2, 3, 4].map((fret) => (
                  <line
                    key={`fret-${fret}`}
                    x1='20'
                    y1={30 + fret * 35}
                    x2='130'
                    y2={30 + fret * 35}
                    stroke='currentColor'
                    strokeWidth={fret === 0 ? "3" : "1"}
                  />
                ))}

                {/* String lines */}
                {[0, 1, 2, 3, 4, 5].map((string) => (
                  <line
                    key={`string-${string}`}
                    x1={30 + string * 20}
                    y1='30'
                    x2={30 + string * 20}
                    y2='170'
                    stroke='currentColor'
                    strokeWidth='1'
                  />
                ))}

                {/* Finger positions and muted strings */}
                {(hoveredKey || selectedKey)!.frets.map((fret, stringIndex) => {
                  const x = 30 + stringIndex * 20;
                  if (fret === null) {
                    // Muted string (X)
                    return (
                      <text
                        key={`muted-${stringIndex}`}
                        x={x}
                        y='20'
                        textAnchor='middle'
                        fontSize='16'
                        fontWeight='bold'
                      >
                        ×
                      </text>
                    );
                  } else if (fret === 0) {
                    // Open string (O)
                    return (
                      <circle
                        key={`open-${stringIndex}`}
                        cx={x}
                        cy='15'
                        r='6'
                        fill='none'
                        stroke='currentColor'
                        strokeWidth='2'
                      />
                    );
                  } else {
                    // Fingered note
                    const y = 30 + (fret - 0.5) * 35;
                    return <circle key={`finger-${stringIndex}`} cx={x} cy={y} r='8' fill='currentColor' />;
                  }
                })}
              </svg>
              <p className='text-sm mt-2 text-center'>First Position</p>
            </div>
          </div>
        ) : (
          <div className='chord-placeholder'>
            <p className='text-lg text-center opacity-60'>Hover over a key to see its guitar chord</p>
          </div>
        )}
      </div>
    </div>
  );
}
