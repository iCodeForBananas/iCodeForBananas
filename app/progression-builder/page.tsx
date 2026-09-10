import type { Metadata } from "next";
import ProgressionBuilderPage from "./ProgressionBuilderPage";

export const metadata: Metadata = {
  title: "Progression Builder",
  description:
    "Click your way around the Circle of Fifths to build a chord progression, then browse every voicing — chord type, shape, and neck position — for each chord you've picked.",
  keywords: [
    "chord progression builder",
    "circle of fifths",
    "guitar chord voicings",
    "chord shapes",
    "music theory",
    "guitar chords",
  ],
  openGraph: {
    title: "Progression Builder",
    description: "Build a chord progression from the Circle of Fifths, then explore every voicing for each chord.",
    type: "website",
  },
};

export default ProgressionBuilderPage;
