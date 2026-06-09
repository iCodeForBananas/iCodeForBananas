import type { Metadata } from "next";
import NoteShapesPage from "./NoteShapesPage";

export const metadata: Metadata = {
  title: "Chord Voicings",
  description: "Guitar chord voicings for any root note. See standard open-position, E-shape barre, and A-shape barre chord diagrams across every chord quality.",
  keywords: ["chord voicings", "guitar chords", "barre chords", "E-shape", "A-shape", "chord diagrams", "guitar voicings", "open chords"],
  openGraph: {
    title: "Chord Voicings",
    description: "Guitar chord voicings across open, E-shape, and A-shape positions for every chord quality.",
    type: "website",
  },
};

export default NoteShapesPage;
