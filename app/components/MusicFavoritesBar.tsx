"use client";

import { usePathname } from "next/navigation";
import FavoriteChordsBar from "./FavoriteChordsBar";

const MUSIC_ROUTES = [
  "/circle-of-fifths", "/harmonic-flow", "/chord-progressions", "/chord-shapes",
  "/chord-voicings", "/chord-finder", "/chord-inversions", "/fretboard-explorer",
  "/fretboard-quiz", "/blues-practice",
];

export default function MusicFavoritesBar() {
  const pathname = usePathname();
  if (!MUSIC_ROUTES.some((r) => pathname.startsWith(r))) return null;
  return <FavoriteChordsBar />;
}
