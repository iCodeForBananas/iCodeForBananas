"use client";

import { useState, useMemo } from "react";
import { allNotes, getNoteAt } from "@/app/lib/music";

const ROOT_KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const SCALE_TYPES: Record<string, { intervals: number[]; degrees: string[] }> = {
  "Major":            { intervals: [0, 2, 4, 5, 7, 9, 11], degrees: ["1","2","3","4","5","6","7"] },
  "Minor":            { intervals: [0, 2, 3, 5, 7, 8, 10], degrees: ["1","2","b3","4","5","b6","b7"] },
  "Pentatonic Major": { intervals: [0, 2, 4, 7, 9],        degrees: ["1","2","3","5","6"] },
  "Pentatonic Minor": { intervals: [0, 3, 5, 7, 10],       degrees: ["1","b3","4","5","b7"] },
  "Blues":            { intervals: [0, 3, 5, 6, 7, 10],    degrees: ["1","b3","4","b5","5","b7"] },
  "Dorian":           { intervals: [0, 2, 3, 5, 7, 9, 10], degrees: ["1","2","b3","4","5","6","b7"] },
  "Phrygian":         { intervals: [0, 1, 3, 5, 7, 8, 10], degrees: ["1","b2","b3","4","5","b6","b7"] },
  "Lydian":           { intervals: [0, 2, 4, 6, 7, 9, 11], degrees: ["1","2","3","#4","5","6","7"] },
  "Mixolydian":       { intervals: [0, 2, 4, 5, 7, 9, 10], degrees: ["1","2","3","4","5","6","b7"] },
  "Locrian":          { intervals: [0, 1, 3, 5, 6, 8, 10], degrees: ["1","b2","b3","4","b5","b6","b7"] },
};

const TUNINGS: Record<string, string[]> = {
  "Standard (EADGBE)": ["E","A","D","G","B","E"],
  "Drop D (DADGBE)":   ["D","A","D","G","B","E"],
  "Open G (DGDGBD)":   ["D","G","D","G","B","D"],
  "Open E (EBEG#BE)":  ["E","B","E","G#","B","E"],
};

const FRET_MARKER_FRETS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
const DOUBLE_MARKER_FRETS = new Set([12, 24]);
const STRING_THICKNESS = [1.8, 1.5, 1.2, 0.9, 0.75, 0.6]; // low E → high e

function lsGet(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) ?? fallback;
}

export default function ScaleTool() {
  const [rootKey,    setRootKey]    = useState(() => lsGet("st-root",   "C"));
  const [scaleType,  setScaleType]  = useState(() => lsGet("st-scale",  "Major"));
  const [numFrets,   setNumFrets]   = useState(() => parseInt(lsGet("st-frets", "15")));
  const [tuningName, setTuningName] = useState(() => lsGet("st-tuning", "Standard (EADGBE)"));

  const tuning    = TUNINGS[tuningName]    ?? TUNINGS["Standard (EADGBE)"];
  const scaleData = SCALE_TYPES[scaleType] ?? SCALE_TYPES["Major"];

  const scaleNotes = useMemo(() => {
    const ri = allNotes.indexOf(rootKey);
    if (ri < 0) return new Set<string>();
    return new Set(scaleData.intervals.map(n => allNotes[(ri + n) % 12]));
  }, [rootKey, scaleData]);

  const scaleNoteList = useMemo(() => {
    const ri = allNotes.indexOf(rootKey);
    if (ri < 0) return [];
    return scaleData.intervals.map((n, i) => ({
      note: allNotes[(ri + n) % 12],
      degree: scaleData.degrees[i],
    }));
  }, [rootKey, scaleData]);

  // Fretboard SVG constants
  const FW = 52;  // column width per fret
  const SH = 36;  // row height per string
  const LW = 44;  // left label width
  const HH = 30;  // header height (fret numbers)
  const PR = 16;  // right padding
  const PB = 12;  // bottom padding
  const DR = 12;  // dot radius

  const W = LW + (numFrets + 1) * FW + PR;
  const H = HH + 6 * SH + PB;

  // Center x of column (0 = open string, 1..n = fret n)
  const cx = (col: number) => LW + col * FW + FW / 2;
  // Center y of string row (0 = low E at top, 5 = high e at bottom)
  const cy = (s: number)   => HH + s * SH + SH / 2;

  const nutX = LW + FW;

  const selStyle: React.CSSProperties = {
    background: "#111",
    color: "#facc15",
    border: "1px solid #333",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: "0.875rem",
    cursor: "pointer",
    outline: "none",
  };

  return (
    <div className="flex flex-col gap-5 min-w-0">
      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-end">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#888" }}>
            Root Key
          </span>
          <select
            value={rootKey}
            onChange={e => { setRootKey(e.target.value); localStorage.setItem("st-root", e.target.value); }}
            style={selStyle}
          >
            {ROOT_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#888" }}>
            Scale
          </span>
          <select
            value={scaleType}
            onChange={e => { setScaleType(e.target.value); localStorage.setItem("st-scale", e.target.value); }}
            style={selStyle}
          >
            {Object.keys(SCALE_TYPES).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#888" }}>
            Tuning
          </span>
          <select
            value={tuningName}
            onChange={e => { setTuningName(e.target.value); localStorage.setItem("st-tuning", e.target.value); }}
            style={selStyle}
          >
            {Object.keys(TUNINGS).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#888" }}>
            Frets: {numFrets}
          </span>
          <input
            type="range"
            min={12}
            max={24}
            value={numFrets}
            onChange={e => {
              const v = parseInt(e.target.value);
              setNumFrets(v);
              localStorage.setItem("st-frets", String(v));
            }}
            className="accent-yellow-400 w-36"
          />
        </label>
      </div>

      {/* Fretboard */}
      <div className="overflow-x-auto rounded-xl" style={{ background: "#0f0800" }}>
        <svg width={W} height={H} style={{ display: "block" }}>
          {/* Background */}
          <rect width={W} height={H} fill="#0f0800" />

          {/* Fretboard body */}
          <rect x={LW} y={HH} width={(numFrets + 1) * FW + PR} height={6 * SH} fill="#2c1a08" />

          {/* Open string area (before nut) */}
          <rect x={LW} y={HH} width={FW} height={6 * SH} fill="#1e1205" />

          {/* Nut */}
          <line
            x1={nutX} y1={HH + 4}
            x2={nutX} y2={HH + 6 * SH - 4}
            stroke="#e0d4b8" strokeWidth={5} strokeLinecap="round"
          />

          {/* Fret wires */}
          {Array.from({ length: numFrets }, (_, i) => i + 1).map(fret => (
            <line
              key={fret}
              x1={LW + (fret + 1) * FW} y1={HH + 4}
              x2={LW + (fret + 1) * FW} y2={HH + 6 * SH - 4}
              stroke="#7a7060" strokeWidth={1.5} strokeLinecap="round"
            />
          ))}

          {/* Position markers */}
          {FRET_MARKER_FRETS.filter(f => f <= numFrets).map(fret => {
            const x = cx(fret);
            return DOUBLE_MARKER_FRETS.has(fret) ? (
              <g key={fret}>
                <circle cx={x} cy={(cy(1) + cy(2)) / 2} r={4.5} fill="#3a2d1a" />
                <circle cx={x} cy={(cy(3) + cy(4)) / 2} r={4.5} fill="#3a2d1a" />
              </g>
            ) : (
              <circle key={fret} cx={x} cy={(cy(2) + cy(3)) / 2} r={4.5} fill="#3a2d1a" />
            );
          })}

          {/* Strings */}
          {tuning.map((_, s) => (
            <line
              key={s}
              x1={LW} y1={cy(s)}
              x2={W - PR} y2={cy(s)}
              stroke="#c8b898" strokeWidth={STRING_THICKNESS[s]}
            />
          ))}

          {/* Note dots */}
          {tuning.map((openNote, s) =>
            Array.from({ length: numFrets + 1 }, (_, col) => {
              const note = getNoteAt(openNote, col);
              if (!scaleNotes.has(note)) return null;
              const isRoot = note === rootKey;
              return (
                <g key={`${s}-${col}`}>
                  <circle
                    cx={cx(col)} cy={cy(s)} r={DR}
                    fill={isRoot ? "#f59e0b" : "#facc15"}
                    stroke={isRoot ? "#92400e" : "#78600a"}
                    strokeWidth={1.5}
                  />
                  <text
                    x={cx(col)} y={cy(s)}
                    textAnchor="middle" dominantBaseline="central"
                    fill="#000"
                    fontSize={note.length > 1 ? 8 : 9}
                    fontWeight="bold"
                    fontFamily="system-ui, -apple-system, sans-serif"
                  >
                    {note}
                  </text>
                </g>
              );
            })
          )}

          {/* String name labels (left) */}
          {tuning.map((note, s) => (
            <text
              key={s}
              x={LW / 2} y={cy(s)}
              textAnchor="middle" dominantBaseline="central"
              fill="#facc15" fontSize={12} fontWeight="bold"
              fontFamily="system-ui, -apple-system, sans-serif"
            >
              {note}
            </text>
          ))}

          {/* Fret number labels (top) */}
          <text
            x={cx(0)} y={HH / 2}
            textAnchor="middle" dominantBaseline="central"
            fill="#9a8a6a" fontSize={9}
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            Open
          </text>
          {Array.from({ length: numFrets }, (_, i) => i + 1).map(fret => (
            <text
              key={fret}
              x={cx(fret)} y={HH / 2}
              textAnchor="middle" dominantBaseline="central"
              fill="#9a8a6a" fontSize={11}
              fontFamily="system-ui, -apple-system, sans-serif"
            >
              {fret}
            </text>
          ))}
        </svg>
      </div>

      {/* Scale info */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Notes & degrees */}
        <div
          className="flex-1 rounded-xl p-4"
          style={{ background: "#111", border: "1px solid #222" }}
        >
          <div
            className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: "#666" }}
          >
            {rootKey} {scaleType}
          </div>
          <div className="flex flex-wrap gap-2">
            {scaleNoteList.map(({ note, degree }, i) => (
              <div
                key={i}
                className="flex flex-col items-center rounded-lg px-3 py-2"
                style={{
                  background: note === rootKey ? "#f59e0b" : "#facc15",
                  minWidth: 44,
                }}
              >
                <span className="text-sm font-bold leading-tight" style={{ color: "#000" }}>
                  {note}
                </span>
                <span className="text-xs leading-tight" style={{ color: "rgba(0,0,0,0.55)" }}>
                  {degree}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div
          className="rounded-xl p-4 flex flex-col justify-center gap-3 shrink-0"
          style={{ background: "#111", border: "1px solid #222" }}
        >
          <div
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "#666" }}
          >
            Legend
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-full shrink-0"
              style={{ background: "#f59e0b", border: "1.5px solid #92400e" }}
            />
            <span className="text-sm" style={{ color: "#ccc" }}>
              Root note ({rootKey})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-full shrink-0"
              style={{ background: "#facc15", border: "1.5px solid #78600a" }}
            />
            <span className="text-sm" style={{ color: "#ccc" }}>
              Scale note
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
