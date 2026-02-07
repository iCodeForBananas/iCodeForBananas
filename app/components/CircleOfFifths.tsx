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

  const centerX = 250;
  const centerY = 250;
  const outerRadius = 185;
  const innerRadius = 125;
  const angleStep = (2 * Math.PI) / 12;
  const startAngle = -Math.PI / 2; // Start at top

  const getPosition = (index: number, radius: number) => {
    const angle = startAngle + index * angleStep;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  };

  const activeKey = hoveredKey || selectedKey;

  return (
    <div className='circle-of-fifths-container'>
      <div className='circle-column'>
        <svg width='500' height='500' viewBox='0 0 500 500' className='circle-svg'>
          {/* Outer decorative ring */}
          <circle cx={centerX} cy={centerY} r={outerRadius} className='outer-ring' />

          {/* Inner decorative ring */}
          <circle cx={centerX} cy={centerY} r={innerRadius} className='inner-ring' />

          {/* Connecting lines between rings */}
          {circleData.map((_, index) => {
            const outerPos = getPosition(index, outerRadius + 30);
            const innerPos = getPosition(index, innerRadius - 25);
            return (
              <line
                key={`line-${index}`}
                x1={outerPos.x}
                y1={outerPos.y}
                x2={innerPos.x}
                y2={innerPos.y}
                stroke='rgba(255,255,255,0.08)'
                strokeWidth='1'
              />
            );
          })}

          {/* Major keys (outer circle) */}
          {circleData.map((data, index) => {
            const pos = getPosition(index, outerRadius);
            const isActive = activeKey?.chord === data.major;
            return (
              <g key={`major-${index}`}>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isActive ? 30 : 27}
                  className='key-circle major-key'
                  style={isActive ? { fill: "#ffffff", stroke: "#ffffff", strokeWidth: 3, filter: "drop-shadow(0 0 12px rgba(255,255,255,0.5))" } : undefined}
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
                  style={isActive ? { fontWeight: 800 } : undefined}
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
            const isActive = activeKey?.chord === data.minor;
            return (
              <g key={`minor-${index}`}>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isActive ? 25 : 22}
                  className='key-circle minor-key'
                  style={isActive ? { fill: "rgba(255,255,255,0.4)", stroke: "rgba(255,255,255,0.8)", strokeWidth: 3, filter: "drop-shadow(0 0 10px rgba(255,255,255,0.4))" } : undefined}
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
                  style={isActive ? { fontWeight: 800 } : undefined}
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
          <text x={centerX} y={centerY - 8} textAnchor='middle' dominantBaseline='middle' className='center-text'>
            Circle of
          </text>
          <text x={centerX} y={centerY + 12} textAnchor='middle' dominantBaseline='middle' className='center-text'>
            Fifths
          </text>
        </svg>
      </div>

      {/* Chord diagram display */}
      <div className='chord-column'>
        {activeKey ? (
          <div className='chord-display'>
            <h3 className='text-2xl font-bold mb-1 text-center'>{activeKey.chord}</h3>
            <p className='text-sm text-center opacity-50 mb-3'>
              {activeKey.type === "major" ? "Major" : "Minor"}
            </p>
            <div className='chord-diagram'>
              <svg width='150' height='200' viewBox='0 0 150 200'>
                {/* Nut (top thick line) */}
                <rect x='18' y='28' width='114' height='4' rx='2' fill='currentColor' />

                {/* Fret lines */}
                {[1, 2, 3, 4].map((fret) => (
                  <line
                    key={`fret-${fret}`}
                    x1='20'
                    y1={30 + fret * 35}
                    x2='130'
                    y2={30 + fret * 35}
                    stroke='currentColor'
                    strokeWidth='1'
                    opacity='0.3'
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
                    opacity='0.4'
                  />
                ))}

                {/* Finger positions and muted strings */}
                {activeKey.frets.map((fret, stringIndex) => {
                  const x = 30 + stringIndex * 20;
                  if (fret === null) {
                    // Muted string (X)
                    return (
                      <text
                        key={`muted-${stringIndex}`}
                        x={x}
                        y='20'
                        textAnchor='middle'
                        fontSize='14'
                        fontWeight='bold'
                        opacity='0.5'
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
                        cy='16'
                        r='6'
                        fill='none'
                        stroke='currentColor'
                        strokeWidth='2'
                        opacity='0.5'
                      />
                    );
                  } else {
                    // Fingered note
                    const y = 30 + (fret - 0.5) * 35;
                    return (
                      <circle
                        key={`finger-${stringIndex}`}
                        cx={x}
                        cy={y}
                        r='8'
                        fill='var(--accent, #ff2f8a)'
                      />
                    );
                  }
                })}
              </svg>
              <p className='text-xs mt-2 text-center opacity-40 uppercase tracking-wider'>First Position</p>
            </div>
          </div>
        ) : (
          <div className='chord-placeholder'>
            <p className='text-base text-center'>Hover over a key to see its guitar chord</p>
          </div>
        )}
      </div>
    </div>
  );
}
