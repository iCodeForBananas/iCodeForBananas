"use client";

import { useState, useMemo } from "react";
import "./circleOfFifths.css";
import ChordDiagram from "./ChordDiagram";
import {
  type ChordShape,
  chordTypes,
  chordShapes,
  eShapeTemplates,
  aShapeTemplates,
  buildChordKey,
  transposeShape,
  semitoneFromE,
  semitoneFromA,
  sharpToFlat,
  flatToSharp,
} from "../lib/chordShapes";

interface ChordInfo {
  major: string;
  minor: string;
  majorFrets: (number | null)[];
  minorFrets: (number | null)[];
}

interface LabeledShape {
  shape: ChordShape;
  label: string;
}

const circleData: ChordInfo[] = [
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

const getAllVoicings = (note: string, type: string): LabeledShape[] => {
  const voicings: LabeledShape[] = [];
  const seenFrets = new Set<string>();

  const addIfNew = (shape: ChordShape | null | undefined, label: string) => {
    if (!shape) return;
    const key = shape.frets.join(",");
    if (seenFrets.has(key)) return;
    seenFrets.add(key);
    voicings.push({ shape, label });
  };

  const canonicalNote = flatToSharp[note] ?? note;
  const enharmonic = sharpToFlat[canonicalNote] ?? flatToSharp[note];

  for (const n of [note, canonicalNote, enharmonic].filter(Boolean) as string[]) {
    const key = buildChordKey(n, type);
    const shapes = chordShapes[key];
    if (shapes && shapes.length > 0) {
      shapes.forEach((s, i) => addIfNew(s, i === 0 ? "Standard" : `Standard (${i + 1})`));
      break;
    }
  }

  const aTemplate = aShapeTemplates[type];
  if (aTemplate) {
    const shift = semitoneFromA(note);
    const aShape = transposeShape(aTemplate, shift);
    if (aShape) addIfNew(aShape, shift === 0 ? "A-Shape (Open)" : `A-Shape (${shift}fr)`);
  }

  const eTemplate = eShapeTemplates[type];
  if (eTemplate) {
    const shift = semitoneFromE(note);
    const eShape = transposeShape(eTemplate, shift);
    if (eShape) addIfNew(eShape, shift === 0 ? "E-Shape (Open)" : `E-Shape (${shift}fr)`);
  }

  return voicings;
};

const parseChordNote = (chord: string, type: "major" | "minor"): string => {
  const primary = chord.split("/")[0];
  const ascii = primary.replace(/♯/g, "#").replace(/♭/g, "b");
  return type === "minor" ? ascii.replace(/m$/, "") : ascii;
};

const formatChordLabel = (note: string, type: string) => {
  if (["6", "7", "m7", "9", "13"].includes(type)) return `${note}${type}`;
  return `${note} ${type}`;
};

export default function CircleOfFifths({ showChordPanel = true }: { showChordPanel?: boolean } = {}) {
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
  const [majorChordType, setMajorChordType] = useState("Major");
  const [minorChordType, setMinorChordType] = useState("Minor");
  const [voicingIndex, setVoicingIndex] = useState(0);

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

  const majorTypes = chordTypes.filter((t) => t !== "Minor" && t !== "m7");
  const minorTypes = chordTypes.filter((t) => t === "Minor" || t === "m7");

  const activeKey = hoveredKey || selectedKey;
  const rootNote = activeKey ? parseChordNote(activeKey.chord, activeKey.type) : null;
  const isMinorContext = activeKey?.type === "minor";
  const chordType = isMinorContext ? minorChordType : majorChordType;
  const activeTypes = isMinorContext ? minorTypes : majorTypes;

  const setChordType = (t: string) => {
    if (isMinorContext) setMinorChordType(t);
    else setMajorChordType(t);
  };

  const voicings = useMemo(() => {
    if (!rootNote) return [];
    return getAllVoicings(rootNote, chordType);
  }, [rootNote, chordType]);

  const clampedIndex = Math.min(voicingIndex, Math.max(0, voicings.length - 1));
  const currentShape = voicings[clampedIndex]?.shape ?? null;

  const selectKey = (chord: string, frets: (number | null)[], type: "major" | "minor") => {
    setSelectedKey({ chord, frets, type });
    setVoicingIndex(0);
  };

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
            const isActive = activeKey?.chord === data.major;
            return (
              <g key={`major-${index}`}>
                <circle
                  cx={pos.x} cy={pos.y} r={isActive ? 30 : 27}
                  className={`key-circle major-key${isActive ? " active" : ""}`}
                  onMouseEnter={() => setHoveredKey({ chord: data.major, frets: data.majorFrets, type: "major" })}
                  onMouseLeave={() => setHoveredKey(null)}
                  onClick={() => selectKey(data.major, data.majorFrets, "major")}
                />
                <text
                  x={pos.x} y={pos.y} textAnchor='middle' dominantBaseline='middle'
                  className={`key-text${isActive ? " active" : ""}`}
                  onMouseEnter={() => setHoveredKey({ chord: data.major, frets: data.majorFrets, type: "major" })}
                  onMouseLeave={() => setHoveredKey(null)}
                  onClick={() => selectKey(data.major, data.majorFrets, "major")}
                >
                  {data.major}
                </text>
              </g>
            );
          })}

          {circleData.map((data, index) => {
            const pos = getPosition(index, innerRadius);
            const isActive = activeKey?.chord === data.minor;
            return (
              <g key={`minor-${index}`}>
                <circle
                  cx={pos.x} cy={pos.y} r={isActive ? 25 : 22}
                  className={`key-circle minor-key${isActive ? " active" : ""}`}
                  onMouseEnter={() => setHoveredKey({ chord: data.minor, frets: data.minorFrets, type: "minor" })}
                  onMouseLeave={() => setHoveredKey(null)}
                  onClick={() => selectKey(data.minor, data.minorFrets, "minor")}
                />
                <text
                  x={pos.x} y={pos.y} textAnchor='middle' dominantBaseline='middle'
                  className={`key-text minor-text${isActive ? " active" : ""}`}
                  onMouseEnter={() => setHoveredKey({ chord: data.minor, frets: data.minorFrets, type: "minor" })}
                  onMouseLeave={() => setHoveredKey(null)}
                  onClick={() => selectKey(data.minor, data.minorFrets, "minor")}
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

      {showChordPanel && (
      <div className='chord-column'>
        {activeKey && rootNote ? (
          <div className='chord-display'>
            {/* Chord type — all 13 types for the selected root */}
            <label className='voicing-label'>Chord Type</label>
            <select
              value={chordType}
              onChange={(e) => { setChordType(e.target.value); setVoicingIndex(0); }}
              className='voicing-select'
            >
              {activeTypes.map((t) => (
                <option key={t} value={t}>{formatChordLabel(rootNote, t)}</option>
              ))}
            </select>

            {/* Position — Standard / A-Shape / E-Shape */}
            {voicings.length > 1 && (
              <>
                <label className='voicing-label'>Voicing</label>
                <select
                  value={clampedIndex}
                  onChange={(e) => setVoicingIndex(Number(e.target.value))}
                  className='voicing-select'
                >
                  {voicings.map((v, i) => (
                    <option key={i} value={i}>{v.label}</option>
                  ))}
                </select>
              </>
            )}

            {currentShape ? (
              <>
                <ChordDiagram shape={currentShape} label={formatChordLabel(rootNote, chordType)} />
                <p className='text-xs mt-3 text-center opacity-40 uppercase tracking-wider'>Click to add to favorites</p>
              </>
            ) : (
              <p className='text-sm text-center opacity-40 mt-4'>No voicing available</p>
            )}
          </div>
        ) : (
          <div className='chord-placeholder'>
            <p className='text-base text-center'>Hover over a key to see its guitar chord</p>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
