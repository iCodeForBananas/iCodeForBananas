import type { Metadata } from "next";
import ChordExplorerPage from "./page-client";

export const metadata: Metadata = {
  title: "Chord Explorer",
  description: "Explore guitar chord voicings, inversions, and progressions. Interactive diagrams with beginner-friendly tooltips for every note.",
  keywords: ["chord explorer", "guitar chords", "chord voicings", "music theory", "beginner guitar", "chord diagrams"],
  openGraph: {
    title: "Chord Explorer",
    description: "Explore guitar chord voicings, inversions, and progressions. Interactive diagrams with beginner-friendly tooltips for every note.",
    type: "website",
  },
};

export default ChordExplorerPage;
