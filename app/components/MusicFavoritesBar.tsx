"use client";

import { usePathname } from "next/navigation";
import FavoriteChordsBar from "./FavoriteChordsBar";

const MUSIC_ROUTES = [
  "/chord-progressions", "/chord-diagrams",
  "/chord-voicings", "/chord-inversions", "/guitar/",
  "/fretboard-explorer", "/fretboard-quiz", "/blues-practice", "/inversion-picker",
];

export default function MusicFavoritesBar() {
  const pathname = usePathname();
  if (!MUSIC_ROUTES.some((r) => pathname.startsWith(r))) return null;
  return <FavoriteChordsBar />;
}
