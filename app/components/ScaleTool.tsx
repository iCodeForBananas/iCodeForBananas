"use client";

import { useState, useMemo } from "react";
import { allNotes, getNoteAt } from "@/app/lib/music";
import {
  CAGED_ORDER,
  CAGED_BLURB,
  cagedPositions,
  isStandardTuning,
  type CagedKey,
  type Tonality,
} from "@/app/lib/caged";

// `tonality` is which triad the CAGED shapes are drawn as — a scale with a flat
// third wants the minor forms, or the shape sitting under the notes is not the
// chord they belong to.
const SCALE_TYPES: Record<string, { intervals: number[]; degrees: string[]; tonality: Tonality }> = {
  "Major":            { intervals: [0, 2, 4, 5, 7, 9, 11], degrees: ["1","2","3","4","5","6","7"],        tonality: "major" },
  "Minor":            { intervals: [0, 2, 3, 5, 7, 8, 10], degrees: ["1","2","b3","4","5","b6","b7"],     tonality: "minor" },
  "Pentatonic Major": { intervals: [0, 2, 4, 7, 9],        degrees: ["1","2","3","5","6"],                tonality: "major" },
  "Pentatonic Minor": { intervals: [0, 3, 5, 7, 10],       degrees: ["1","b3","4","5","b7"],              tonality: "minor" },
  "Blues":            { intervals: [0, 3, 5, 6, 7, 10],    degrees: ["1","b3","4","b5","5","b7"],         tonality: "minor" },
  "Dorian":           { intervals: [0, 2, 3, 5, 7, 9, 10], degrees: ["1","2","b3","4","5","6","b7"],      tonality: "minor" },
  "Phrygian":         { intervals: [0, 1, 3, 5, 7, 8, 10], degrees: ["1","b2","b3","4","5","b6","b7"],    tonality: "minor" },
  "Lydian":           { intervals: [0, 2, 4, 6, 7, 9, 11], degrees: ["1","2","3","#4","5","6","7"],       tonality: "major" },
  "Mixolydian":       { intervals: [0, 2, 4, 5, 7, 9, 10], degrees: ["1","2","3","4","5","6","b7"],       tonality: "major" },
  "Locrian":          { intervals: [0, 1, 3, 5, 6, 8, 10], degrees: ["1","b2","b3","4","b5","b6","b7"],   tonality: "minor" },
};

const TUNINGS: Record<string, string[]> = {
  "Standard (EADGBE)": ["E","A","D","G","B","E"],
  "Drop D (DADGBE)":   ["D","A","D","G","B","E"],
  "Open G (DGDGBD)":   ["D","G","D","G","B","D"],
  "Open E (EBEG#BE)":  ["E","B","E","G#","B","E"],
};

const SHAPE_COLOURS: Record<CagedKey, { fill: string; stroke: string }> = {
  C: { fill: "#facc15", stroke: "#78600a" },
  A: { fill: "#4ade80", stroke: "#166534" },
  G: { fill: "#38bdf8", stroke: "#075985" },
  E: { fill: "#f472b6", stroke: "#9d174d" },
  D: { fill: "#c084fc", stroke: "#6b21a8" },
};

// Every scale note, when no one shape is picked out.
const ALL_FILL   = "#facc15";
const ALL_STROKE = "#78600a";

// The ring drawn around the notes that make up the chord shape itself.
const CHORD_RING = "#ffffff";

// The root note keeps one colour of its own, whichever position it falls in —
// a red that none of the five position colours can be confused with.
const ROOT_FILL         = "#ef4444";
const ROOT_STROKE       = "#ffffff";
const ROOT_TEXT         = "#ffffff";
const ROOT_MUTED_STROKE = "#8f4b4b";

const MUTED_FILL   = "#4a4238";
const MUTED_STROKE = "#6b6154";
const MUTED_TEXT   = "#9a9186";

const FRET_MARKER_FRETS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
const DOUBLE_MARKER_FRETS = new Set([12, 24]);
const STRING_THICKNESS = [1.8, 1.5, 1.2, 0.9, 0.75, 0.6]; // low E → high e

function lsGet(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) ?? fallback;
}


/**
 * `rootKey` is owned by the page so one Root Note drives every panel — the
 * scale has no root of its own to fall out of step with the chords.
 */
export default function ScaleTool({ rootKey }: { rootKey: string }) {
  const [scaleType,  setScaleType]  = useState(() => lsGet("st-scale",  "Major"));
  const [numFrets,   setNumFrets]   = useState(() => parseInt(lsGet("st-frets", "15")));
  const [tuningName, setTuningName] = useState(() => lsGet("st-tuning", "Standard (EADGBE)"));
  const [shapeKey,   setShapeKey]   = useState(() => lsGet("st-caged", "all"));

  const tuning    = TUNINGS[tuningName]    ?? TUNINGS["Standard (EADGBE)"];
  const scaleData = SCALE_TYPES[scaleType] ?? SCALE_TYPES["Major"];

  const selectedShape = (CAGED_ORDER as readonly string[]).includes(shapeKey)
    ? (shapeKey as CagedKey)
    : null;
  const standardTuning = isStandardTuning(tuning);

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

  // ── CAGED positions ─────────────────────────────────────────────────────────
  //
  // A position is the stretch of neck one of the five chord shapes lives in, so
  // there is nothing to work out here about hand span or where a box "should"
  // begin — the chord decides, and the scale notes around it come along.
  const allPositions = useMemo(
    () => cagedPositions(rootKey, tuning, scaleData.tonality, numFrets),
    [rootKey, tuning, scaleData.tonality, numFrets]
  );

  /** Every copy of the picked shape that lands on this neck, lowest first. */
  const shapeSpans = useMemo(
    () => (selectedShape ? allPositions.filter(p => p.key === selectedShape) : []),
    [allPositions, selectedShape]
  );

  const inSelectedShape = (fret: number) =>
    shapeSpans.some(p => fret >= p.low && fret <= p.high);

  /** The notes spelling the chord the picked shape is built on. */
  const chordDots = useMemo(() => {
    const set = new Set<string>();
    for (const p of shapeSpans) {
      for (const { s, fret } of p.chord) {
        if (fret >= 0 && fret <= numFrets) set.add(`${s}-${fret}`);
      }
    }
    return set;
  }, [shapeSpans, numFrets]);

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
  // Center y of string row. Rows run the way the neck looks when you glance down
  // at it playing — the highest string on top, the lowest on the bottom — so
  // string 0 (the lowest) takes the last row.
  const cy = (s: number)   => HH + (tuning.length - 1 - s) * SH + SH / 2;

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

  const chooseShape = (value: string) => {
    setShapeKey(value);
    localStorage.setItem("st-caged", value);
  };

  return (
    <div className="flex flex-col gap-5 min-w-0">
      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-end">
        <label className="flex flex-col gap-1" title="The type of scale — each scale has a unique pattern of notes that gives it a distinctive sound and mood">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#888" }}>
            Scale
          </span>
          <select
            value={scaleType}
            onChange={e => { setScaleType(e.target.value); localStorage.setItem("st-scale", e.target.value); }}
            title="Choose a scale type — Major sounds bright and happy, Minor sounds darker, Pentatonic is great for beginners and soloing"
            style={selStyle}
          >
            {Object.keys(SCALE_TYPES).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1" title="How your guitar strings are tuned from low E to high e — Standard EADGBE is the most common tuning for beginners">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#888" }}>
            Tuning
          </span>
          <select
            value={tuningName}
            onChange={e => { setTuningName(e.target.value); localStorage.setItem("st-tuning", e.target.value); }}
            title="Choose your guitar's tuning — this changes which notes appear on each string and fret"
            style={selStyle}
          >
            {Object.keys(TUNINGS).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1.5" title="How many frets to display on the neck — drag to see more or fewer positions">
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
            title="Drag to show more or fewer frets on the neck — higher frets = higher pitch"
            className="accent-yellow-400 w-36"
          />
        </label>

        <div
          className="flex flex-col gap-1.5"
          title="CAGED: the five chord shapes a guitar can hold, and the five places on the neck the scale sits around them. Pick one to drill it, or show every note at once."
        >
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#888" }}>
            CAGED shape
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => chooseShape("all")}
              title="Show every note of the scale on the whole neck, with the root note marked"
              className="rounded-lg px-2.5 py-1 text-sm font-semibold cursor-pointer"
              style={{
                background: selectedShape === null ? ALL_FILL : "#111",
                color:      selectedShape === null ? "#000"   : "#888",
                border: `1px solid ${selectedShape === null ? ALL_FILL : "#333"}`,
              }}
            >
              All
            </button>
            {CAGED_ORDER.map(key => {
              const active = selectedShape === key;
              const colour = SHAPE_COLOURS[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => chooseShape(key)}
                  title={`${key} shape — ${CAGED_BLURB[key]}`}
                  className="rounded-lg px-2.5 py-1 text-sm font-semibold cursor-pointer"
                  style={{
                    background: active ? colour.fill : "#111",
                    color:      active ? "#000" : colour.fill,
                    border: `1px solid ${active ? colour.fill : "#333"}`,
                  }}
                >
                  {key}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Fretboard */}
      <div className="overflow-x-auto rounded-xl" style={{ background: "#0f0800" }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
          {/* Background */}
          <rect width={W} height={H} fill="#0f0800" />

          {/* Fretboard body */}
          <rect x={LW} y={HH} width={(numFrets + 1) * FW + PR} height={6 * SH} fill="#2c1a08" />

          {/* Open string area (before nut) */}
          <rect x={LW} y={HH} width={FW} height={6 * SH} fill="#1e1205" />

          {/* Highlighted band behind each copy of the selected shape */}
          {selectedShape !== null && shapeSpans.map((p, i) => (
            <rect
              key={i}
              x={LW + p.low * FW} y={HH}
              width={(p.high - p.low + 1) * FW} height={6 * SH}
              fill={SHAPE_COLOURS[selectedShape].fill}
              opacity={0.09}
            />
          ))}

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
              const shown  = selectedShape === null || inSelectedShape(col);
              const colour = selectedShape === null
                ? { fill: ALL_FILL, stroke: ALL_STROKE }
                : SHAPE_COLOURS[selectedShape];
              // A note that is part of the chord the shape is named for — the
              // thing the whole position is hanging off.
              const inChord = selectedShape !== null && shown && chordDots.has(`${s}-${col}`);

              const where = col === 0 ? ", open string" : `, fret ${col}`;
              const posLabel = selectedShape === null
                ? ""
                : shown
                  ? inChord
                    ? ` — in the ${selectedShape} shape, and part of its chord`
                    : ` — in the ${selectedShape} shape`
                  : ` — outside the ${selectedShape} shape`;
              const dotLabel = isRoot
                ? `Root note — ${note} (the home base of the ${rootKey} ${scaleType} scale)${where}${posLabel}`
                : `Scale note — ${note}${where}${posLabel}`;

              return (
                <g key={`${s}-${col}`} opacity={shown ? 1 : 0.45}>
                  <title>{dotLabel}</title>
                  {inChord && (
                    <circle
                      cx={cx(col)} cy={cy(s)} r={DR + 4}
                      fill="none" stroke={CHORD_RING} strokeWidth={1.75} opacity={0.85}
                    />
                  )}
                  <circle
                    cx={cx(col)} cy={cy(s)} r={DR}
                    fill={shown ? (isRoot ? ROOT_FILL : colour.fill) : MUTED_FILL}
                    stroke={
                      shown
                        ? (isRoot ? ROOT_STROKE : colour.stroke)
                        : (isRoot ? ROOT_MUTED_STROKE : MUTED_STROKE)
                    }
                    strokeWidth={isRoot ? 2.5 : 1.5}
                  />
                  <text
                    x={cx(col)} y={cy(s)}
                    textAnchor="middle" dominantBaseline="central"
                    fill={shown ? (isRoot ? ROOT_TEXT : "#000") : MUTED_TEXT}
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
          {Array.from({ length: numFrets }, (_, i) => i + 1).map(fret => {
            const lit = selectedShape !== null && inSelectedShape(fret);
            return (
              <text
                key={fret}
                x={cx(fret)} y={HH / 2}
                textAnchor="middle" dominantBaseline="central"
                fill={lit ? SHAPE_COLOURS[selectedShape].fill : "#9a8a6a"}
                fontSize={11}
                fontWeight={lit ? "bold" : "normal"}
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                {fret}
              </text>
            );
          })}
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
            {selectedShape !== null && ` — ${selectedShape} shape`}
          </div>
          <div className="flex flex-wrap gap-2">
            {scaleNoteList.map(({ note, degree }, i) => {
              const isRoot = note === rootKey;
              return (
                <div
                  key={i}
                  className="flex flex-col items-center rounded-lg px-3 py-2"
                  title={
                    isRoot
                      ? `${note} — the root note (degree ${degree}), the 'home base' of this scale`
                      : `${note} — scale degree ${degree}`
                  }
                  style={{
                    background: isRoot ? ROOT_FILL : "#facc15",
                    minWidth: 44,
                  }}
                >
                  <span
                    className="text-sm font-bold leading-tight"
                    style={{ color: isRoot ? ROOT_TEXT : "#000" }}
                  >
                    {note}
                  </span>
                  <span
                    className="text-xs leading-tight"
                    style={{ color: isRoot ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.55)" }}
                  >
                    {degree}
                  </span>
                </div>
              );
            })}
          </div>
          {selectedShape !== null && (
            <div className="text-xs mt-3 flex flex-col gap-1" style={{ color: "#888" }}>
              <span>{CAGED_BLURB[selectedShape]}.</span>
              {shapeSpans.length > 0 ? (
                <span>
                  Play it between frets{" "}
                  {shapeSpans.map(p => `${p.low}–${p.high}`).join(" and ")}.{" "}
                  {standardTuning ? (
                    <>
                      The ringed notes are the {rootKey}{" "}
                      {scaleData.tonality === "minor" ? "minor" : "major"} chord itself — everything
                      else in the box is a note you can play around it.
                    </>
                  ) : (
                    <>The ringed notes are where the shape&apos;s own fingers land.</>
                  )}
                </span>
              ) : (
                <span>
                  This shape sits past the last visible fret — drag the Frets slider up to reach it.
                </span>
              )}
              {!standardTuning && (
                <span style={{ color: "#c08a3e" }}>
                  CAGED is a standard-tuning system. The positions follow your tuning&apos;s roots,
                  but the ringed shape only spells a chord in standard tuning.
                </span>
              )}
            </div>
          )}
        </div>

        {/* Legend */}
        <div
          className="rounded-xl p-4 flex flex-col justify-center gap-2 shrink-0"
          style={{ background: "#111", border: "1px solid #222" }}
        >
          <div
            className="text-xs font-semibold uppercase tracking-wider mb-1"
            style={{ color: "#666" }}
          >
            CAGED shapes
          </div>
          {CAGED_ORDER.map(key => (
            <button
              key={key}
              type="button"
              onClick={() => chooseShape(selectedShape === key ? "all" : key)}
              title={`${key} shape — ${CAGED_BLURB[key]}`}
              className="flex items-center gap-2 cursor-pointer text-left"
              style={{ opacity: selectedShape === null || selectedShape === key ? 1 : 0.4 }}
            >
              <div
                className="w-5 h-5 rounded-full shrink-0"
                style={{
                  background: SHAPE_COLOURS[key].fill,
                  border: `1.5px solid ${SHAPE_COLOURS[key].stroke}`,
                }}
              />
              <span className="text-sm" style={{ color: "#ccc" }}>
                {key} shape
              </span>
            </button>
          ))}
          <div className="flex flex-col gap-2 mt-1 pt-2" style={{ borderTop: "1px solid #222" }}>
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded-full shrink-0"
                style={{ background: ROOT_FILL, border: `2.5px solid ${ROOT_STROKE}` }}
              />
              <span className="text-sm" style={{ color: "#ccc" }}>
                Root note ({rootKey})
              </span>
            </div>
            <div className="flex items-center gap-2" title="These notes spell the chord the shape is named after">
              <div
                className="w-5 h-5 rounded-full shrink-0"
                style={{ background: "transparent", border: `2px solid ${CHORD_RING}` }}
              />
              <span className="text-sm" style={{ color: "#ccc" }}>
                In the chord shape
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
