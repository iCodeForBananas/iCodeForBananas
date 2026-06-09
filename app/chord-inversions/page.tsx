import type { Metadata } from "next";
import ChordInversionsPage from "./ChordInversionsPage";

export const metadata: Metadata = {
  title: "Chord Inversions",
  description: "Guitar chord inversions for major and minor triads. View root position, first inversion, and second inversion shapes across all three-string sets for any root note.",
  keywords: ["chord inversions", "guitar inversions", "triad inversions", "root position", "first inversion", "second inversion", "guitar theory", "triads"],
  openGraph: {
    title: "Chord Inversions",
    description: "Major and minor chord inversions across all string sets for any root note.",
    type: "website",
  },
};

export default ChordInversionsPage;
