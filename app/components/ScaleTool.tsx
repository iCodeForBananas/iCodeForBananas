"use client";

import { useState, useMemo } from "react";
import { allNotes, getNoteAt } from "@/app/lib/music";

// `anchors` are the five scale degrees the five box shapes start from — the
// pentatonic skeleton of the scale. Everything about positions falls out of these.
const SCALE_TYPES: Record<string, { intervals: number[]; degrees: string[]; anchors: number[] }> = {
  "Major":            { intervals: [0, 2, 4, 5, 7, 9, 11], degrees: ["1","2","3","4","5","6","7"],        anchors: [0, 2, 4, 7, 9] },
  "Minor":            { intervals: [0, 2, 3, 5, 7, 8, 10], degrees: ["1","2","b3","4","5","b6","b7"],     anchors: [0, 3, 5, 7, 10] },
  "Pentatonic Major": { intervals: [0, 2, 4, 7, 9],        degrees: ["1","2","3","5","6"],                anchors: [0, 2, 4, 7, 9] },
  "Pentatonic Minor": { intervals: [0, 3, 5, 7, 10],       degrees: ["1","b3","4","5","b7"],              anchors: [0, 3, 5, 7, 10] },
  "Blues":            { intervals: [0, 3, 5, 6, 7, 10],    degrees: ["1","b3","4","b5","5","b7"],         anchors: [0, 3, 5, 7, 10] },
  "Dorian":           { intervals: [0, 2, 3, 5, 7, 9, 10], degrees: ["1","2","b3","4","5","6","b7"],      anchors: [0, 3, 5, 7, 10] },
  "Phrygian":         { intervals: [0, 1, 3, 5, 7, 8, 10], degrees: ["1","b2","b3","4","5","b6","b7"],    anchors: [0, 3, 5, 7, 10] },
  "Lydian":           { intervals: [0, 2, 4, 6, 7, 9, 11], degrees: ["1","2","3","#4","5","6","7"],       anchors: [0, 2, 4, 7, 9] },
  "Mixolydian":       { intervals: [0, 2, 4, 5, 7, 9, 10], degrees: ["1","2","3","4","5","6","b7"],       anchors: [0, 2, 4, 7, 9] },
  "Locrian":          { intervals: [0, 1, 3, 5, 6, 8, 10], degrees: ["1","b2","b3","4","b5","b6","b7"],   anchors: [0, 3, 5, 6, 10] },
};

const TUNINGS: Record<string, string[]> = {
  "Standard (EADGBE)": ["E","A","D","G","B","E"],
  "Drop D (DADGBE)":   ["D","A","D","G","B","E"],
  "Open G (DGDGBD)":   ["D","G","D","G","B","D"],
  "Open E (EBEG#BE)":  ["E","B","E","G#","B","E"],
};

const POSITIONS = [
  { label: "1st", fill: "#facc15", stroke: "#78600a" },
  { label: "2nd", fill: "#4ade80", stroke: "#166534" },
  { label: "3rd", fill: "#38bdf8", stroke: "#075985" },
  { label: "4th", fill: "#f472b6", stroke: "#9d174d" },
  { label: "5th", fill: "#c084fc", stroke: "#6b21a8" },
];

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

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/**
 * `rootKey` is owned by the page so one Root Note drives every panel — the
 * scale has no root of its own to fall out of step with the chords.
 */
export default function ScaleTool({ rootKey }: { rootKey: string }) {
  const [scaleType,  setScaleType]  = useState(() => lsGet("st-scale",  "Major"));
  const [numFrets,   setNumFrets]   = useState(() => parseInt(lsGet("st-frets", "15")));
  const [tuningName, setTuningName] = useState(() => lsGet("st-tuning", "Standard (EADGBE)"));
  const [position,   setPosition]   = useState(() => lsGet("st-position", "all"));

  const tuning    = TUNINGS[tuningName]    ?? TUNINGS["Standard (EADGBE)"];
  const scaleData = SCALE_TYPES[scaleType] ?? SCALE_TYPES["Major"];

  const selectedPos = position === "all" ? null : parseInt(position);

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

  // ── Positions ───────────────────────────────────────────────────────────────
  // Pitch of each open string, in semitones above the lowest string.
  const openPitches = useMemo(() => {
    const idx = tuning.map(n => allNotes.indexOf(n));
    const out = [0];
    for (let i = 1; i < idx.length; i++) {
      const step = mod12(idx[i] - idx[i - 1]) || 12;
      out.push(out[i - 1] + step);
    }
    return out;
  }, [tuning]);

  // Fret of the root on the lowest string — every position is measured from it.
  const rootFret = useMemo(() => {
    const ri = allNotes.indexOf(rootKey);
    const oi = allNotes.indexOf(tuning[0]);
    if (ri < 0 || oi < 0) return 0;
    return mod12(ri - oi);
  }, [rootKey, tuning]);

  // Walk the scale up the neck one string at a time. Each position starts on its
  // anchor degree on the lowest string, takes every scale note within a hand's
  // reach, then carries on from the next note up on the string above — which is
  // what puts the familiar kink in the shape at the B string.
  const positions = useMemo(() => {
    const { intervals, anchors } = scaleData;
    const reach = intervals.length <= 6 ? 3 : 4; // two notes per string, or three
    const inScale = (pitch: number) => intervals.includes(mod12(pitch - rootFret));
    const nextIn  = (pitch: number) => { let q = pitch + 1; while (!inScale(q)) q++; return q; };

    return anchors.map(deg => {
      const dots: { s: number; fret: number }[] = [];
      let cursor = rootFret + deg;
      for (let s = 0; s < tuning.length; s++) {
        let fret = cursor - openPitches[s];
        while (fret < 0) { cursor = nextIn(cursor); fret = cursor - openPitches[s]; }
        const limit = fret + reach;
        let pitch = cursor;
        while (fret <= limit) {
          dots.push({ s, fret });
          pitch = nextIn(pitch);
          fret = pitch - openPitches[s];
        }
        cursor = pitch;
      }
      return dots;
    });
  }, [scaleData, rootFret, openPitches, tuning]);

  // Each shape repeats every octave, so paint every copy that fits on the neck.
  const positionSets = useMemo(() =>
    positions.map(dots => {
      const set = new Set<string>();
      dots.forEach(({ s, fret }) => {
        for (let k = -2; k <= 2; k++) {
          const f = fret + 12 * k;
          if (f >= 0 && f <= numFrets) set.add(`${s}-${f}`);
        }
      });
      return set;
    }),
  [positions, numFrets]);

  // Where each position begins, as an offset from the root. Used to hand every
  // fret to one position when all five are shown at once.
  const bands = useMemo(() => {
    const arr = positions.map((dots, p) => ({
      p,
      rel: mod12(Math.min(...dots.map(d => d.fret)) - rootFret),
    }));
    arr.sort((a, b) => a.rel - b.rel);
    return arr;
  }, [positions, rootFret]);

  const positionOfFret = (fret: number) => {
    const rel = mod12(fret - rootFret);
    let p = bands[bands.length - 1].p;
    for (const b of bands) if (b.rel <= rel) p = b.p;
    return p;
  };

  // Fret range of every copy of the selected shape that lands on the neck.
  const positionSpans = useMemo(() => {
    if (selectedPos === null) return [];
    const frets = positions[selectedPos].map(d => d.fret);
    const lo = Math.min(...frets);
    const hi = Math.max(...frets);
    const out: { start: number; end: number }[] = [];
    for (let k = -2; k <= 2; k++) {
      const a = lo + 12 * k;
      const b = hi + 12 * k;
      if (b < 0 || a > numFrets) continue;
      out.push({ start: Math.max(0, a), end: Math.min(numFrets, b) });
    }
    return out;
  }, [positions, selectedPos, numFrets]);

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

  const choosePosition = (value: string) => {
    setPosition(value);
    localStorage.setItem("st-position", value);
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
          title="The scale falls into five box shapes up the neck. Pick one to drill it on its own, or show all five at once."
        >
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#888" }}>
            Position
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => choosePosition("all")}
              title="Show the whole neck, with each fret coloured by the position it belongs to"
              className="rounded-lg px-2.5 py-1 text-sm font-semibold cursor-pointer"
              style={{
                background: selectedPos === null ? "#facc15" : "#111",
                color:      selectedPos === null ? "#000"    : "#888",
                border: `1px solid ${selectedPos === null ? "#facc15" : "#333"}`,
              }}
            >
              All
            </button>
            {POSITIONS.map((p, i) => {
              const active = selectedPos === i;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => choosePosition(String(i))}
                  title={`Show only the ${p.label} position — one box shape, repeated up the neck`}
                  className="rounded-lg px-2.5 py-1 text-sm font-semibold cursor-pointer"
                  style={{
                    background: active ? p.fill : "#111",
                    color:      active ? "#000" : p.fill,
                    border: `1px solid ${active ? p.fill : "#333"}`,
                  }}
                >
                  {i + 1}
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

          {/* Highlighted band behind the selected position */}
          {selectedPos !== null && positionSpans.map(({ start, end }, i) => (
            <rect
              key={i}
              x={LW + start * FW} y={HH}
              width={(end - start + 1) * FW} height={6 * SH}
              fill={POSITIONS[selectedPos].fill}
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
              const posIdx = positionOfFret(col);
              const shown  = selectedPos === null || positionSets[selectedPos].has(`${s}-${col}`);
              const colour = POSITIONS[selectedPos === null ? posIdx : selectedPos];

              const where = col === 0 ? ", open string" : `, fret ${col}`;
              const posLabel = selectedPos === null
                ? ` — ${POSITIONS[posIdx].label} position`
                : shown
                  ? ` — ${POSITIONS[selectedPos].label} position`
                  : " — outside this position";
              const dotLabel = isRoot
                ? `Root note — ${note} (the home base of the ${rootKey} ${scaleType} scale)${where}${posLabel}`
                : `Scale note — ${note}${where}${posLabel}`;

              return (
                <g key={`${s}-${col}`} opacity={shown ? 1 : 0.45}>
                  <title>{dotLabel}</title>
                  <circle
                    cx={cx(col)} cy={cy(s)} r={DR}
                    fill={shown ? colour.fill : MUTED_FILL}
                    stroke={shown ? (isRoot ? "#fff" : colour.stroke) : MUTED_STROKE}
                    strokeWidth={shown && isRoot ? 2.5 : 1.5}
                  />
                  <text
                    x={cx(col)} y={cy(s)}
                    textAnchor="middle" dominantBaseline="central"
                    fill={shown ? "#000" : MUTED_TEXT}
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
            const lit = selectedPos !== null
              && positionSpans.some(r => fret >= r.start && fret <= r.end);
            return (
              <text
                key={fret}
                x={cx(fret)} y={HH / 2}
                textAnchor="middle" dominantBaseline="central"
                fill={lit ? POSITIONS[selectedPos].fill : "#9a8a6a"}
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
            {selectedPos !== null && ` — ${POSITIONS[selectedPos].label} position`}
          </div>
          <div className="flex flex-wrap gap-2">
            {scaleNoteList.map(({ note, degree }, i) => (
              <div
                key={i}
                className="flex flex-col items-center rounded-lg px-3 py-2"
                title={
                  note === rootKey
                    ? `${note} — the root note (degree ${degree}), the 'home base' of this scale`
                    : `${note} — scale degree ${degree}`
                }
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
          {selectedPos !== null && (
            <div className="text-xs mt-3" style={{ color: "#888" }}>
              {positionSpans.length > 0
                ? `Play it between frets ${positionSpans
                    .map(r => `${r.start}–${r.end}`)
                    .join(" and ")}.`
                : "This position sits past the last visible fret — drag the Frets slider up to reach it."}
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
            Positions
          </div>
          {POSITIONS.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => choosePosition(selectedPos === i ? "all" : String(i))}
              title={`${p.label} position — click to drill it on its own`}
              className="flex items-center gap-2 cursor-pointer text-left"
              style={{ opacity: selectedPos === null || selectedPos === i ? 1 : 0.4 }}
            >
              <div
                className="w-5 h-5 rounded-full shrink-0"
                style={{ background: p.fill, border: `1.5px solid ${p.stroke}` }}
              />
              <span className="text-sm" style={{ color: "#ccc" }}>
                {p.label} position
              </span>
            </button>
          ))}
          <div className="flex items-center gap-2 mt-1 pt-2" style={{ borderTop: "1px solid #222" }}>
            <div
              className="w-5 h-5 rounded-full shrink-0"
              style={{ background: "#facc15", border: "2.5px solid #fff" }}
            />
            <span className="text-sm" style={{ color: "#ccc" }}>
              Root note ({rootKey})
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
