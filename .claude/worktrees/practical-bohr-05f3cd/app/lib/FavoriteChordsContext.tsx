"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { ChordShape } from "../lib/chordShapes";

export interface FavoriteChord {
  id: string;
  label: string;
  shape: ChordShape;
}

interface FavoriteChordsContextType {
  favorites: FavoriteChord[];
  toggle: (chord: FavoriteChord) => void;
  isFavorite: (id: string) => boolean;
}

const FavoriteChordsContext = createContext<FavoriteChordsContextType>({
  favorites: [], toggle: () => {}, isFavorite: () => false,
});

export const useFavoriteChords = () => useContext(FavoriteChordsContext);

const STORAGE_KEY = "favorite-chords";

export function FavoriteChordsProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<FavoriteChord[]>([]);

  useEffect(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) setFavorites(JSON.parse(s)); } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  const toggle = (chord: FavoriteChord) => {
    setFavorites((prev) =>
      prev.some((f) => f.id === chord.id) ? prev.filter((f) => f.id !== chord.id) : [...prev, chord]
    );
  };

  const isFavorite = (id: string) => favorites.some((f) => f.id === id);

  return (
    <FavoriteChordsContext.Provider value={{ favorites, toggle, isFavorite }}>
      {children}
    </FavoriteChordsContext.Provider>
  );
}
