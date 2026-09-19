"use client";

import { useFavoriteChords } from "../lib/FavoriteChordsContext";
import { Card } from "@radix-ui/themes";
import ChordDiagram from "./ChordDiagram";

export default function FavoriteChordsBar() {
  const { favorites, toggle } = useFavoriteChords();
  if (favorites.length === 0) return null;

  return (
    <div className="w-full bg-surface-sunken border-b border-line-subtle px-4 py-3">
      <p className="text-10 font-semibold text-primary-text uppercase tracking-wider mb-2">♥ Favorites</p>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {favorites.map((fav) => (
          <Card key={fav.id} asChild size="1" className="shrink-0 transition-opacity duration-120 ease-ui hover:opacity-60">
            <button type="button" onClick={() => toggle(fav)} aria-label={`Remove ${fav.label} from favorites`}>
              <div className="pointer-events-none">
                <ChordDiagram shape={fav.shape} label={fav.label} />
              </div>
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
