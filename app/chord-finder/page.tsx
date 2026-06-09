import type { Metadata } from "next";
import ChordFinderPage from "./ChordFinderPage";

export const metadata: Metadata = {
  title: "Chord Finder",
  description: "Click notes on the guitar fretboard to identify chords instantly. Select any combination of frets and discover the chord name, quality, and its variations.",
  keywords: ["chord finder", "chord identification", "guitar fretboard", "chord recognition", "guitar chords", "fretboard tool", "chord detector"],
  openGraph: {
    title: "Chord Finder",
    description: "Click fretboard notes to identify guitar chords instantly.",
    type: "website",
  },
};

export default ChordFinderPage;
