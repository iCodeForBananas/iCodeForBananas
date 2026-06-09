import type { Metadata } from "next";
import FretboardQuizPage from "./FretboardQuizPage";

export const metadata: Metadata = {
  title: "Fretboard Quiz",
  description: "Timed note identification quiz on the guitar fretboard. Test how fast you can name notes across all 6 strings and 24 frets to sharpen your fretboard knowledge.",
  keywords: ["fretboard quiz", "note identification", "guitar notes", "fretboard memorization", "guitar practice", "music theory quiz", "note recognition"],
  openGraph: {
    title: "Fretboard Quiz",
    description: "Timed note identification quiz across all 6 strings and 24 frets.",
    type: "website",
  },
};

export default FretboardQuizPage;
