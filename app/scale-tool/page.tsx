import type { Metadata } from "next";
import ScaleToolPage from "./page-client";

export const metadata: Metadata = {
  title: "Scale Tool",
  description: "Visualize any scale on a guitar fretboard. Pick your root note, scale type, and tuning — see every note highlighted across the neck.",
  keywords: ["scale tool", "guitar scales", "fretboard", "music theory", "guitar tuning", "scale visualization"],
  openGraph: {
    title: "Scale Tool",
    description: "Visualize any scale on a guitar fretboard. Pick your root note, scale type, and tuning — see every note highlighted across the neck.",
    type: "website",
  },
};

export default ScaleToolPage;
