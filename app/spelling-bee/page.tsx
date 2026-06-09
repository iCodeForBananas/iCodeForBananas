import type { Metadata } from "next";
import SpellingBeePage from "./SpellingBeePage";

export const metadata: Metadata = {
  title: "Spelling Bee",
  description: "Adaptive spelling and reading game for Pre-K through 5th grade. Spaced repetition builds vocabulary by grade level with an encouraging bee character.",
  keywords: ["spelling game", "reading game", "Pre-K", "elementary school", "spaced repetition", "phonics", "kids education", "vocabulary builder"],
  openGraph: {
    title: "Spelling Bee",
    description: "Adaptive spelling and reading game for Pre-K through 5th grade with spaced repetition.",
    type: "website",
  },
};

export default SpellingBeePage;
