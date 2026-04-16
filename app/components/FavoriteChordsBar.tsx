"use client";

import { useFavoriteChords } from "../lib/FavoriteChordsContext";
import ChordDiagram from "./ChordDiagram";

export default function FavoriteChordsBar() {
  const { favorites } = useFavoriteChords();
  if (favorites.length === 0) return null;

  return (
    <div className="w-full bg-[#1a1a1a] border-b border-[#2a2a2a] px-4 py-3">
      <p className="text-xs font-semibold text-[#facc15] uppercase tracking-wider mb-2">♥ Favorites</p>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {favorites.map((fav) => (
          <div key={fav.id} className="shrink-0 bg-white rounded-lg p-2">
            <ChordDiagram shape={fav.shape} label={fav.label} />
          </div>
        ))}
      </div>
    </div>
  );
}
