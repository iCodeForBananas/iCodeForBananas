import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Note Map",
  description: "Map out notes across the guitar fretboard with custom tunings. Find scales, chords, and intervals anywhere on the neck.",
  keywords: ["note map", "guitar fretboard", "notes", "scales", "tuning", "intervals"],
  openGraph: {
    title: "Note Map",
    description: "Map out notes across the guitar fretboard with custom tunings. Find scales, chords, and intervals anywhere on the neck.",
    type: "website",
  },
};

export default function FretboardPage() {
  notFound();
}
