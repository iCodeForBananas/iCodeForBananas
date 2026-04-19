"use client";

import React, { useState, useEffect, useMemo } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHROMATIC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const TOTAL_FRETS = 24;
const ALL_ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const ENHARMONIC: Record<string, string> = {
  "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb",
};

const TUNING_PRESETS = {
  standard:   { label: "Standard (EADGBe)",   strings: ["E","A","D","G","B","E"] },
  dropD:      { label: "Drop D (DADGBe)",      strings: ["D","A","D","G","B","E"] },
  dadgad:     { label: "DADGAD",               strings: ["D","A","D","G","A","D"] },
  allFourths: { label: "All Fourths (EADGCf)", strings: ["E","A","D","G","C","F"] },
} as const;
type TuningKey = keyof typeof TUNING_PRESETS;

const SCALE_DEFS: Record<string, number[]> = {
  "Major (Ionian)":       [0,2,4,5,7,9,11],
  "Dorian":               [0,2,3,5,7,9,10],
  "Phrygian":             [0,1,3,5,7,8,10],
  "Lydian":               [0,2,4,6,7,9,11],
  "Mixolydian":           [0,2,4,5,7,9,10],
  "Aeolian (Nat. Minor)": [0,2,3,5,7,8,10],
  "Locrian":              [0,1,3,5,6,8,10],
  "Harmonic Minor":       [0,2,3,5,7,8,11],
  "Melodic Minor":        [0,2,3,5,7,9,11],
  "Pentatonic Major":     [0,2,4,7,9],
  "Pentatonic Minor":     [0,3,5,7,10],
  "Blues":                [0,3,5,6,7,10],
  "Whole Tone":           [0,2,4,6,8,10],
  "Diminished (W-H)":     [0,2,3,5,6,8,9,11],
};

const INTERVAL_NAMES: Record<number, string> = {
  0:"R", 1:"b2", 2:"2", 3:"b3", 4:"3", 5:"4",
  6:"b5", 7:"5", 8:"b6", 9:"6", 10:"b7", 11:"7",
};

const DEGREE_NAMES: Record<number, string> = {
  0:"1", 2:"2", 3:"b3", 4:"3", 5:"4", 6:"b5",
  7:"5", 8:"#5", 9:"6", 10:"b7", 11:"7", 1:"b2",
};

const CAGED_COLORS: Record<string, { bg: string; text: string }> = {
  C: { bg: "#3B82F6", text: "#fff" },
  A: { bg: "#22C55E", text: "#fff" },
  G: { bg: "#EAB308", text: "#000" },
  E: { bg: "#F97316", text: "#fff" },
  D: { bg: "#EF4444", text: "#fff" },
};

const NNS_TENSION_COLORS: Record<string, string> = {
  tonic: "#16a34a",
  subdominant: "#ca8a04",
  dominant: "#dc2626",
};

const ROMAN = ["I","II","III","IV","V","VI","VII"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function noteIdx(note: string): number {
  const i = CHROMATIC.indexOf(note);
  if (i >= 0) return i;
  const flatMap: Record<string,string> = { Db:"C#", Eb:"D#", Gb:"F#", Ab:"G#", Bb:"A#" };
  return CHROMATIC.indexOf(flatMap[note] ?? note);
}

function noteAtFret(open: string, fret: number): string {
  return CHROMATIC[(noteIdx(open) + fret) % 12];
}

function interval(note: string, root: string): number {
  return ((noteIdx(note) - noteIdx(root)) + 12) % 12;
}

function computeCAGEDBoxes(root: string) {
  // Root position on low E string (E=0, F=1, ...)
  const r = ((noteIdx(root) - noteIdx("E")) + 12) % 12;
  // Shape box offsets (fretStart = r + offset)
  const shapes = [
    { shape:"E", offsets:[ 0, 12] },
    { shape:"D", offsets:[ 1, 13] },
    { shape:"C", offsets:[ 4, 16] },
    { shape:"A", offsets:[ 7, 19] },
    { shape:"G", offsets:[10, 22] },
  ] as const;

  const SPAN = 4;
  const boxes: { shape: string; start: number; end: number }[] = [];
  for (const { shape, offsets } of shapes) {
    for (const off of offsets) {
      const s = ((r + off) % 24 + 24) % 24;
      if (s <= TOTAL_FRETS) {
        boxes.push({ shape, start: s, end: Math.min(s + SPAN, TOTAL_FRETS) });
      }
    }
  }
  return boxes;
}

function cagedShapeAt(fret: number, boxes: { shape: string; start: number; end: number }[]): string | null {
  for (const b of boxes) {
    if (fret >= b.start && fret <= b.end) return b.shape;
  }
  return null;
}

function compute3NPSPositions(tuning: string[], root: string, intervals: number[]): Set<string> {
  const positions = new Set<string>();
  const allIntervals = new Set([0, ...intervals]);

  for (let s = 0; s < tuning.length; s++) {
    const open = tuning[s];
    const scaleNotesOnString: number[] = [];
    for (let f = 0; f <= TOTAL_FRETS; f++) {
      const note = noteAtFret(open, f);
      if (allIntervals.has(interval(note, root))) {
        scaleNotesOnString.push(f);
      }
    }
    // Take first 3 in lowest playable position (frets 0-9)
    const first3 = scaleNotesOnString.filter(f => f <= 9).slice(0, 3);
    first3.forEach(f => positions.add(`${s}-${f}`));
  }
  return positions;
}

function computeNNS(root: string, scaleIntervals: number[]) {
  if (scaleIntervals.length < 7) return [];
  const rootI = noteIdx(root);

  return scaleIntervals.slice(0, 7).map((degInterval, i) => {
    const chordRootIdx = (rootI + degInterval) % 12;
    const chordRoot = CHROMATIC[chordRootIdx];
    const third = ((scaleIntervals[(i+2) % 7] - degInterval) + 12) % 12;
    const fifth  = ((scaleIntervals[(i+4) % 7] - degInterval) + 12) % 12;

    let quality: string;
    let symbol: string;
    if (third === 4 && fifth === 7) { quality = "major"; symbol = ""; }
    else if (third === 3 && fifth === 7) { quality = "minor"; symbol = "m"; }
    else if (third === 3 && fifth === 6) { quality = "dim"; symbol = "°"; }
    else if (third === 4 && fifth === 8) { quality = "aug"; symbol = "+"; }
    else { quality = third === 4 ? "major" : "minor"; symbol = third === 4 ? "" : "m"; }

    const degree = i + 1;
    const tension: "tonic"|"subdominant"|"dominant" =
      [1,3,6].includes(degree) ? "tonic" :
      [2,4].includes(degree) ? "subdominant" : "dominant";

    return { degree, roman: ROMAN[i], chordRoot, quality, symbol, tension };
  });
}

function buildShellVoicingNotes(root: string, quality: "major"|"minor"|"dom7"|"maj7"|"m7") {
  const rootI = noteIdx(root);
  const voicings: Record<string, number[]> = {
    major: [0,4,7],
    minor: [0,3,7],
    dom7:  [0,4,10],
    maj7:  [0,4,11],
    m7:    [0,3,10],
  };
  return (voicings[quality] ?? [0,4,7]).map(i => CHROMATIC[(rootI + i) % 12]);
}

// ─── Fretboard Cell ───────────────────────────────────────────────────────────

interface CellInfo {
  note: string;
  isRoot: boolean;
  isScale: boolean;
  inRange: boolean;
  cagedShape: string | null;
  is3NPS: boolean;
  isVoicing: boolean;
  viewLayer: "noteName"|"scaleDegree"|"intervallic";
  root: string;
  scaleIntervals: number[];
  overlay: string;
  showCAGED: boolean;
  show3NPS: boolean;
}

const FretCell = React.memo(function FretCell({ info }: { info: CellInfo }) {
  const {
    note, isRoot, isScale, inRange, cagedShape, is3NPS, isVoicing,
    viewLayer, root, scaleIntervals, overlay, showCAGED, show3NPS,
  } = info;

  const iv = interval(note, root);

  let label = "";
  if (viewLayer === "noteName") label = note;
  else if (viewLayer === "scaleDegree") label = (isRoot || isScale) ? (DEGREE_NAMES[iv] ?? "") : "";
  else label = INTERVAL_NAMES[iv] ?? "";

  let bg = "#1e1e1e";
  let textColor = "#555";
  let border = "1px solid #333";
  let fontWeight = "normal";
  let opacity = inRange ? 1 : 0.2;

  if (isVoicing) {
    bg = "#a855f7";
    textColor = "#fff";
    fontWeight = "bold";
    opacity = 1;
  } else if (isRoot && (isRoot)) {
    bg = "#facc15";
    textColor = "#000";
    fontWeight = "bold";
  } else if (isScale) {
    bg = "#374151";
    textColor = "#e5e7eb";
  }

  if (showCAGED && cagedShape && (isRoot || isScale)) {
    const c = CAGED_COLORS[cagedShape];
    if (c) { bg = c.bg; textColor = c.text; }
  }

  if (show3NPS && is3NPS && isScale && !showCAGED) {
    bg = "#6366f1";
    textColor = "#fff";
  }

  return (
    <div
      style={{
        width: 32, height: 26, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 9, fontWeight,
        background: bg, color: textColor, border,
        borderRadius: 3, cursor: "default", opacity,
        transition: "background 0.15s",
        userSelect: "none",
      }}
    >
      {label}
    </div>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FretboardArchitect() {
  // Core settings
  const [tuningKey, setTuningKey] = useState<TuningKey>("standard");
  const [root, setRoot] = useState("C");
  const [scaleName, setScaleName] = useState("Major (Ionian)");
  const [viewLayer, setViewLayer] = useState<"noteName"|"scaleDegree"|"intervallic">("noteName");

  // Overlays
  const [overlay, setOverlay] = useState<"none"|"caged"|"3nps">("none");

  // Range focus
  const [rangeFocus, setRangeFocus] = useState(false);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(5);

  // Voicing panel
  const [showVoicingPanel, setShowVoicingPanel] = useState(false);
  const [voicingRoot, setVoicingRoot] = useState("C");
  const [voicingQuality, setVoicingQuality] = useState<"major"|"minor"|"dom7"|"maj7"|"m7">("major");
  const [voicingInversion, setVoicingInversion] = useState(0);

  // NNS
  const [showNNS, setShowNNS] = useState(false);

  // Compare mode
  const [compareMode, setCompareMode] = useState(false);
  const [compareQuality, setCompareQuality] = useState<"major"|"minor"|"dom7"|"maj7"|"m7">("dom7");

  const tuning = TUNING_PRESETS[tuningKey].strings as unknown as string[];
  const scaleIntervals = SCALE_DEFS[scaleName] ?? [0,2,4,5,7,9,11];
  const cagedBoxes = useMemo(() => computeCAGEDBoxes(root), [root]);
  const npsPositions = useMemo(
    () => compute3NPSPositions(tuning, root, scaleIntervals),
    [tuning, root, scaleIntervals]
  );
  const nnsChords = useMemo(
    () => computeNNS(root, scaleIntervals),
    [root, scaleIntervals]
  );

  // Voicing notes (purple dots)
  const voicingNotes = useMemo(() => {
    if (!showVoicingPanel) return new Set<string>();
    return new Set(buildShellVoicingNotes(voicingRoot, voicingQuality));
  }, [showVoicingPanel, voicingRoot, voicingQuality]);

  const compareNotes = useMemo(() => {
    if (!showVoicingPanel || !compareMode) return new Set<string>();
    return new Set(buildShellVoicingNotes(voicingRoot, compareQuality));
  }, [showVoicingPanel, compareMode, voicingRoot, compareQuality]);

  // Notes that DIFFER between voicing and compare (highlight the change)
  const diffNotes = useMemo(() => {
    if (!compareMode) return new Set<string>();
    const diff = new Set<string>();
    voicingNotes.forEach(n => { if (!compareNotes.has(n)) diff.add(n); });
    compareNotes.forEach(n => { if (!voicingNotes.has(n)) diff.add(n); });
    return diff;
  }, [compareMode, voicingNotes, compareNotes]);

  // Fret number row
  const fretNumbers = useMemo(() => {
    const markers = new Set([3,5,7,9,12,15,17,19,21,24]);
    return Array.from({ length: TOTAL_FRETS + 1 }, (_, f) => ({
      fret: f, marker: markers.has(f),
    }));
  }, []);

  // Build fret display — reversed tuning (high e first = top of board)
  const reversedTuning = [...tuning].reverse();

  const enharmonicRoot = ENHARMONIC[root] ?? null;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:"#111", color:"#e5e7eb", fontFamily:"monospace", minHeight:"100vh" }}>
      {/* Top Bar */}
      <div style={{ padding:"8px 16px", borderBottom:"1px solid #333", display:"flex", alignItems:"center", gap:16 }}>
        <h1 style={{ margin:0, fontSize:16, fontWeight:"bold", color:"#facc15", letterSpacing:1 }}>
          FRETBOARD ARCHITECT
        </h1>
        <span style={{ fontSize:11, color:"#6b7280" }}>
          {root} {scaleName} · {TOTAL_FRETS} frets · {TUNING_PRESETS[tuningKey].label}
        </span>
      </div>

      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
        {/* ── Left Control Panel ── */}
        <div style={{ width:220, background:"#161616", borderRight:"1px solid #333", overflowY:"auto", padding:12, flexShrink:0, display:"flex", flexDirection:"column", gap:14 }}>

          {/* Tuning */}
          <Section title="TUNING">
            {(Object.keys(TUNING_PRESETS) as TuningKey[]).map(k => (
              <RadioBtn key={k} selected={tuningKey === k} onClick={() => setTuningKey(k)}>
                {TUNING_PRESETS[k].label.split(" ")[0]}
              </RadioBtn>
            ))}
            <div style={{ fontSize:10, color:"#9ca3af", marginTop:4 }}>
              {reversedTuning.slice().reverse().join(" – ")}
            </div>
          </Section>

          {/* Key & Scale */}
          <Section title="KEY">
            <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
              {ALL_ROOTS.map(r => (
                <button key={r} onClick={() => setRoot(r)}
                  style={{
                    padding:"2px 6px", fontSize:10, borderRadius:3, cursor:"pointer",
                    background: root === r ? "#facc15" : "#2a2a2a",
                    color: root === r ? "#000" : "#9ca3af",
                    border: "1px solid " + (root === r ? "#facc15" : "#444"),
                  }}>
                  {r}{ENHARMONIC[r] ? `/${ENHARMONIC[r]}` : ""}
                </button>
              ))}
            </div>
          </Section>

          <Section title="SCALE">
            <select value={scaleName} onChange={e => setScaleName(e.target.value)}
              style={{ width:"100%", background:"#2a2a2a", color:"#e5e7eb", border:"1px solid #444", borderRadius:3, padding:4, fontSize:11 }}>
              {Object.keys(SCALE_DEFS).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <div style={{ fontSize:10, color:"#9ca3af", marginTop:4 }}>
              Intervals: [{scaleIntervals.join(",")}]
            </div>
          </Section>

          {/* View Layer */}
          <Section title="VIEW LAYER">
            {(["noteName","scaleDegree","intervallic"] as const).map(v => (
              <RadioBtn key={v} selected={viewLayer === v} onClick={() => setViewLayer(v)}>
                {v === "noteName" ? "Note Name" : v === "scaleDegree" ? "Scale Degree" : "Intervallic"}
              </RadioBtn>
            ))}
          </Section>

          {/* Overlay */}
          <Section title="OVERLAY">
            {(["none","caged","3nps"] as const).map(o => (
              <RadioBtn key={o} selected={overlay === o} onClick={() => setOverlay(o)}>
                {o === "none" ? "None" : o === "caged" ? "CAGED System" : "3 Notes/String"}
              </RadioBtn>
            ))}
            {overlay === "caged" && (
              <div style={{ marginTop:6, display:"flex", flexWrap:"wrap", gap:4 }}>
                {Object.entries(CAGED_COLORS).map(([shape, c]) => (
                  <div key={shape} style={{ background:c.bg, color:c.text, padding:"1px 6px", borderRadius:3, fontSize:10, fontWeight:"bold" }}>
                    {shape}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Range Focus */}
          <Section title="RANGE FOCUS">
            <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, cursor:"pointer" }}>
              <input type="checkbox" checked={rangeFocus} onChange={e => setRangeFocus(e.target.checked)} />
              Enable fret masking
            </label>
            {rangeFocus && (
              <>
                <div style={{ fontSize:10, color:"#9ca3af", marginTop:6 }}>
                  Frets {rangeStart}–{rangeEnd} (span: {rangeEnd-rangeStart})
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:4 }}>
                  <span style={{ fontSize:9, color:"#6b7280", width:20 }}>Lo</span>
                  <input type="range" min={0} max={TOTAL_FRETS-1} value={rangeStart}
                    onChange={e => { const v = +e.target.value; setRangeStart(v); if(rangeEnd < v+2) setRangeEnd(v+2); }}
                    style={{ flex:1 }} />
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <span style={{ fontSize:9, color:"#6b7280", width:20 }}>Hi</span>
                  <input type="range" min={rangeStart+2} max={TOTAL_FRETS} value={rangeEnd}
                    onChange={e => setRangeEnd(+e.target.value)}
                    style={{ flex:1 }} />
                </div>
              </>
            )}
          </Section>

          {/* Voicing Panel Toggle */}
          <Section title="VOICING PANEL">
            <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, cursor:"pointer" }}>
              <input type="checkbox" checked={showVoicingPanel} onChange={e => setShowVoicingPanel(e.target.checked)} />
              Show voicings
            </label>
            {showVoicingPanel && (
              <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:6 }}>
                <div style={{ fontSize:10, color:"#9ca3af" }}>Root</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
                  {ALL_ROOTS.map(r => (
                    <button key={r} onClick={() => setVoicingRoot(r)}
                      style={{ padding:"1px 5px", fontSize:9, borderRadius:2, cursor:"pointer",
                        background: voicingRoot === r ? "#a855f7" : "#2a2a2a",
                        color: voicingRoot === r ? "#fff" : "#9ca3af",
                        border:"1px solid " + (voicingRoot === r ? "#a855f7" : "#444") }}>
                      {r}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize:10, color:"#9ca3af" }}>Quality</div>
                {(["major","minor","dom7","maj7","m7"] as const).map(q => (
                  <RadioBtn key={q} selected={voicingQuality === q} onClick={() => setVoicingQuality(q)}>
                    {q === "dom7" ? "Dominant 7" : q === "maj7" ? "Major 7" : q === "m7" ? "Minor 7" : q.charAt(0).toUpperCase()+q.slice(1)}
                  </RadioBtn>
                ))}
                <div style={{ fontSize:10, color:"#9ca3af", marginTop:4 }}>
                  Notes: {Array.from(voicingNotes).join(" – ")}
                </div>
                <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, cursor:"pointer" }}>
                  <input type="checkbox" checked={compareMode} onChange={e => setCompareMode(e.target.checked)} />
                  Compare mode
                </label>
                {compareMode && (
                  <>
                    <div style={{ fontSize:10, color:"#9ca3af" }}>Compare to</div>
                    {(["major","minor","dom7","maj7","m7"] as const).map(q => (
                      <RadioBtn key={q} selected={compareQuality === q} onClick={() => setCompareQuality(q)}>
                        {q === "dom7" ? "Dominant 7" : q === "maj7" ? "Major 7" : q === "m7" ? "Minor 7" : q.charAt(0).toUpperCase()+q.slice(1)}
                      </RadioBtn>
                    ))}
                    {diffNotes.size > 0 && (
                      <div style={{ fontSize:10, color:"#fb923c", marginTop:4 }}>
                        Difference: {Array.from(diffNotes).join(" vs ")}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </Section>

          {/* NNS */}
          <Section title="NASHVILLE #">
            <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, cursor:"pointer" }}>
              <input type="checkbox" checked={showNNS} onChange={e => setShowNNS(e.target.checked)} />
              Tension spectrum
            </label>
          </Section>

        </div>

        {/* ── Main Area ── */}
        <div style={{ flex:1, overflowY:"auto", padding:16, display:"flex", flexDirection:"column", gap:16 }}>

          {/* Fretboard */}
          <div style={{ overflowX:"auto" }}>
            <div style={{ display:"inline-flex", flexDirection:"column", gap:1 }}>

              {/* Fret numbers + markers */}
              <div style={{ display:"flex", gap:1, paddingLeft:32 }}>
                {fretNumbers.map(({ fret, marker }) => (
                  <div key={fret} style={{
                    width:32, textAlign:"center", fontSize:9,
                    color: marker ? "#facc15" : "#555",
                    fontWeight: marker ? "bold" : "normal",
                  }}>
                    {fret}
                    {marker && <div style={{ width:6, height:6, borderRadius:"50%", background:"#facc15", margin:"1px auto 0" }} />}
                  </div>
                ))}
              </div>

              {/* CAGED shape labels row */}
              {overlay === "caged" && (
                <div style={{ display:"flex", gap:1, paddingLeft:32 }}>
                  {fretNumbers.map(({ fret }) => {
                    const shape = cagedShapeAt(fret, cagedBoxes);
                    const c = shape ? CAGED_COLORS[shape] : null;
                    return (
                      <div key={fret} style={{
                        width:32, height:12, textAlign:"center", fontSize:8,
                        background: c ? c.bg + "55" : "transparent",
                        color: c ? c.bg : "transparent",
                        borderRadius:2, fontWeight:"bold",
                      }}>
                        {shape ?? ""}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* String rows */}
              {reversedTuning.map((openNote, sIdx) => {
                const realStringIdx = tuning.length - 1 - sIdx;
                const stringLabel = `e${tuning.length - sIdx}`;
                return (
                  <div key={sIdx} style={{ display:"flex", alignItems:"center", gap:1 }}>
                    {/* String label */}
                    <div style={{ width:28, textAlign:"right", fontSize:9, color:"#6b7280", paddingRight:4, flexShrink:0 }}>
                      {openNote}
                    </div>
                    {/* Cells */}
                    {fretNumbers.map(({ fret }) => {
                      const note = noteAtFret(openNote, fret);
                      const iv = interval(note, root);
                      const isRoot = iv === 0;
                      const isScale = scaleIntervals.includes(iv);
                      const inRange = !rangeFocus || (fret >= rangeStart && fret <= rangeEnd);
                      const cagedShape = overlay === "caged" ? cagedShapeAt(fret, cagedBoxes) : null;
                      const is3NPS = overlay === "3nps" && npsPositions.has(`${realStringIdx}-${fret}`);

                      const primaryVoicing = voicingNotes.has(note);
                      const secondaryVoicing = compareMode && compareNotes.has(note);
                      const isDiff = diffNotes.has(note);
                      const isVoicing = showVoicingPanel && (primaryVoicing || secondaryVoicing);

                      const cellInfo: CellInfo = {
                        note, isRoot, isScale, inRange,
                        cagedShape, is3NPS, isVoicing,
                        viewLayer, root, scaleIntervals,
                        overlay,
                        showCAGED: overlay === "caged",
                        show3NPS: overlay === "3nps",
                      };

                      return (
                        <div key={fret} style={{ position:"relative" }}>
                          {/* Nut line at fret 0 */}
                          {fret === 0 && (
                            <div style={{ position:"absolute", right:-2, top:0, bottom:0, width:3, background:"#888", zIndex:1 }} />
                          )}
                          {/* String line */}
                          <div style={{
                            position:"absolute", top:"50%", left:0, right:0, height:1,
                            background: sIdx < 2 ? "#888" : sIdx < 4 ? "#aaa" : "#ccc",
                            zIndex:0,
                          }} />
                          <div style={{ position:"relative", zIndex:2 }}>
                            <FretCell info={cellInfo} />
                          </div>
                          {/* Diff indicator */}
                          {showVoicingPanel && compareMode && isDiff && (isRoot || isScale || voicingNotes.has(note) || compareNotes.has(note)) && (
                            <div style={{ position:"absolute", top:-3, right:-3, width:6, height:6, borderRadius:"50%", background:"#fb923c", zIndex:3 }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Double dot markers at 12 and 24 */}
              <div style={{ display:"flex", gap:1, paddingLeft:32, marginTop:2 }}>
                {fretNumbers.map(({ fret }) => (
                  <div key={fret} style={{ width:32, height:8, display:"flex", justifyContent:"center", alignItems:"center", gap:2 }}>
                    {(fret === 12 || fret === 24) && (
                      <>
                        <div style={{ width:4, height:4, borderRadius:"50%", background:"#facc15" }} />
                        <div style={{ width:4, height:4, borderRadius:"50%", background:"#facc15" }} />
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div style={{ display:"flex", gap:12, flexWrap:"wrap", fontSize:10, color:"#9ca3af" }}>
            <LegendDot color="#facc15" textColor="#000" label="Root" />
            <LegendDot color="#374151" textColor="#e5e7eb" label="Scale tone" />
            <LegendDot color="#1e1e1e" textColor="#555" label="Non-scale" />
            {showVoicingPanel && <LegendDot color="#a855f7" textColor="#fff" label="Voicing" />}
            {overlay === "caged" && Object.entries(CAGED_COLORS).map(([s,c]) => (
              <LegendDot key={s} color={c.bg} textColor={c.text} label={`${s} shape`} />
            ))}
            {overlay === "3nps" && <LegendDot color="#6366f1" textColor="#fff" label="3NPS position" />}
          </div>

          {/* NNS Panel */}
          {showNNS && nnsChords.length > 0 && (
            <div>
              <div style={{ fontSize:11, color:"#9ca3af", marginBottom:8, textTransform:"uppercase", letterSpacing:1 }}>
                Nashville Number System — {root} {scaleName}
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {nnsChords.map(chord => (
                  <div key={chord.degree} style={{
                    background:"#1e1e1e", border:`2px solid ${NNS_TENSION_COLORS[chord.tension]}`,
                    borderRadius:6, padding:"8px 12px", textAlign:"center", minWidth:60,
                  }}>
                    <div style={{ fontSize:18, fontWeight:"bold", color:"#fff" }}>
                      {chord.roman}{chord.symbol}
                    </div>
                    <div style={{ fontSize:11, color:"#9ca3af" }}>{chord.chordRoot}{chord.symbol}</div>
                    <div style={{ fontSize:9, marginTop:4, color: NNS_TENSION_COLORS[chord.tension], textTransform:"uppercase" }}>
                      {chord.tension}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", gap:16, marginTop:8, fontSize:10 }}>
                <span style={{ color: NNS_TENSION_COLORS.tonic }}>■ Tonic (home)</span>
                <span style={{ color: NNS_TENSION_COLORS.subdominant }}>■ Subdominant (transitional)</span>
                <span style={{ color: NNS_TENSION_COLORS.dominant }}>■ Dominant (tension)</span>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize:9, color:"#6b7280", textTransform:"uppercase", letterSpacing:1.5, marginBottom:6, borderBottom:"1px solid #2a2a2a", paddingBottom:3 }}>
        {title}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
        {children}
      </div>
    </div>
  );
}

function RadioBtn({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      textAlign:"left", padding:"3px 8px", fontSize:11, borderRadius:3, cursor:"pointer",
      background: selected ? "#facc15" : "#2a2a2a",
      color: selected ? "#000" : "#9ca3af",
      border: "1px solid " + (selected ? "#facc15" : "#444"),
      fontFamily:"monospace",
    }}>
      {children}
    </button>
  );
}

function LegendDot({ color, textColor, label }: { color: string; textColor: string; label: string }) {
  return (
    <span style={{ display:"flex", alignItems:"center", gap:4 }}>
      <span style={{ width:12, height:12, borderRadius:2, background:color, display:"inline-block", border:"1px solid #444" }} />
      {label}
    </span>
  );
}
