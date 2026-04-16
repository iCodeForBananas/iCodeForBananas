"use client";

import { usePathname } from "next/navigation";
import FavoriteChordsBar from "./FavoriteChordsBar";

const MUSIC_ROUTES = [
  "/circle-of-fifths", "/harmonic-flow", "/chord-progressions", "/chord-shapes",
  "/note-shapes", "/chord-finder", "/chord-inversions", "/fretboard",
  "/fretboard-quiz", "/silent-metronome", "/blues-practice",
];

export default function MusicFavoritesBar() {
  const pathname = usePathname();
  if (!MUSIC_ROUTES.some((r) => pathname.startsWith(r))) return null;
  return <FavoriteChordsBar />;
}
