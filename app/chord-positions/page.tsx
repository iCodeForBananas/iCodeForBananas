import type { Metadata } from "next";
import FretRangeProgressionPage from "./FretRangeProgressionPage";

export const metadata: Metadata = {
  title: "Chord Positions",
  description: "Find all guitar chord positions across the full fretboard. Displays E-shape, A-shape, and open-position voicings for any chord and key up to the 12th fret.",
  keywords: ["chord positions", "guitar voicings", "fretboard positions", "barre chords", "chord shapes", "guitar fretboard", "CAGED system"],
  openGraph: {
    title: "Chord Positions",
    description: "All guitar chord positions: E-shape, A-shape, and open voicings for any key.",
    type: "website",
  },
};

export default FretRangeProgressionPage;
