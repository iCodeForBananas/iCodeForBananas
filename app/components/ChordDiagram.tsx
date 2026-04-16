"use client";

import { sharpNotes, flatNotes, stringNotes, type ChordShape } from "../lib/chordShapes";
import { useFavoriteChords, type FavoriteChord } from "../lib/FavoriteChordsContext";

interface ChordDiagramProps {
  shape: ChordShape;
  label?: string;
  useFlats?: boolean;
  dotColor?: string;
}

export default function ChordDiagram({ shape, label, useFlats = false, dotColor = "#facc15" }: ChordDiagramProps) {
  const { toggle, isFavorite } = useFavoriteChords();
  const noteNames = useFlats ? flatNotes : sharpNotes;
  const getNoteAtFret = (openNote: string, fret: number) => {
    const idx = sharpNotes.indexOf(openNote);
    return noteNames[(idx + fret) % 12];
  };

  const id = `${label || "chord"}-${shape.frets.join(",")}`;
  const favorited = isFavorite(id);

  const handleClick = () => {
    const chord: FavoriteChord = { id, label: label || "Chord", shape };
    toggle(chord);
  };

  const playedFrets = shape.frets.filter((f) => f > 0);
  const minFret = playedFrets.length > 0 ? Math.min(...playedFrets) : 1;
  const maxFret = playedFrets.length > 0 ? Math.max(...playedFrets) : 1;
  const startFret = minFret > 2 || maxFret > 5 ? minFret : 1;
  const displayFrets = 5;
  const stringSpacing = 22;
  const fretSpacing = 24;
  const diagramWidth = stringSpacing * 5 + 20;
  const diagramHeight = fretSpacing * displayFrets + 40;

  return (
    <div className="flex flex-col items-center cursor-pointer group" onClick={handleClick}>
      {label && (
        <h6 className="text-center mb-1 font-semibold text-sm flex items-center gap-1">
          {label} <span className={`text-xs ${favorited ? "text-red-500" : "text-transparent group-hover:text-red-300"}`}>♥</span>
        </h6>
      )}
      <div className="relative" style={{ width: `${diagramWidth}px`, height: `${diagramHeight}px` }}>
        {favorited && <div className="absolute -top-1 -right-1 w-4 h-4 text-red-500 text-xs z-10">♥</div>}
        <div className="relative" style={{ height: "16px", marginBottom: "2px" }}>
          {shape.frets.map((fret, i) => (
            <span key={i} className="absolute text-center text-xs font-medium"
              style={{ left: `${i * stringSpacing + 10}px`, transform: "translateX(-50%)", color: fret === -1 ? "#000" : "transparent" }}>
              {fret === -1 ? "✕" : ""}
            </span>
          ))}
        </div>
        {startFret > 1 && (
          <span className="absolute text-xs font-medium text-[#1A1B1E]/50" style={{ left: `${diagramWidth + 2}px`, top: "24px" }}>{startFret}fr</span>
        )}
        {[0, 1, 2, 3, 4, 5].map((si) => (
          <div key={si} className="absolute bg-[#1A1B1E]/40" style={{ left: `${si * stringSpacing + 10}px`, top: "20px", width: "1px", height: `${fretSpacing * displayFrets}px`, zIndex: 1 }} />
        ))}
        {Array.from({ length: displayFrets + 1 }, (_, i) => i).map((f) => (
          <div key={f} className={`absolute ${f === 0 && startFret <= 1 ? "bg-[#1A1B1E]" : "bg-[#1A1B1E]/40"}`}
            style={{ left: "6px", top: `${20 + f * fretSpacing}px`, width: `${stringSpacing * 5 + 8}px`, height: f === 0 && startFret <= 1 ? "3px" : "1px", zIndex: 1 }} />
        ))}
        {shape.frets.map((fretNum, si) => {
          if (fretNum === -1) return null;
          const note = getNoteAtFret(stringNotes[si], fretNum);
          const dotSize = 18;
          if (fretNum === 0) {
            return (
              <div key={si} className="absolute rounded-full flex items-center justify-center font-bold"
                style={{ left: `${si * stringSpacing + 10 - dotSize / 2}px`, top: `${20 - dotSize - 2}px`, width: `${dotSize}px`, height: `${dotSize}px`, fontSize: "9px", zIndex: 2, backgroundColor: dotColor, border: `2px solid ${dotColor}`, color: "#1A1B1E" }}>
                {note}
              </div>
            );
          }
          const displayPos = fretNum - startFret;
          return (
            <div key={si} className="absolute rounded-full flex items-center justify-center font-bold"
              style={{ left: `${si * stringSpacing + 10 - dotSize / 2}px`, top: `${20 + displayPos * fretSpacing + fretSpacing / 2 - dotSize / 2}px`, width: `${dotSize}px`, height: `${dotSize}px`, fontSize: "9px", zIndex: 2, backgroundColor: dotColor, color: "#1A1B1E" }}>
              {note}
            </div>
          );
        })}
      </div>
    </div>
  );
}
