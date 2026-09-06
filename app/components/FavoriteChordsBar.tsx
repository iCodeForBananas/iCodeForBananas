"use client";

import { useFavoriteChords } from "../lib/FavoriteChordsContext";
import ChordDiagram from "./ChordDiagram";

export default function FavoriteChordsBar() {
  const { favorites, toggle } = useFavoriteChords();
  if (favorites.length === 0) return null;

  return (
    <div className="w-full bg-surface-sunken border-b border-line-subtle px-4 py-3">
      <p className="text-10 font-semibold text-primary-text uppercase tracking-wider mb-2">♥ Favorites</p>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {favorites.map((fav) => (
          <div
            key={fav.id}
            className="shrink-0 bg-surface-raised rounded-lg p-2 cursor-pointer hover:opacity-60 transition-opacity duration-120 ease-ui"
            onClick={() => toggle(fav)}
          >
            <div className="pointer-events-none">
              <ChordDiagram shape={fav.shape} label={fav.label} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
