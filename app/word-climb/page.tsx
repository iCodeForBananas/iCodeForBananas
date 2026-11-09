import type { Metadata } from "next";
import WordClimbPage from "./WordClimbPage";

export const metadata: Metadata = {
  title: "Word Climb",
  description: "Learn to read with a grown-up, from first sight words to long sentences. Kindergarten through Grade 3, scheduled with spaced repetition.",
  keywords: ["learn to read", "sight words", "Dolch", "spaced repetition", "kindergarten reading", "K-3 reading"],
  openGraph: {
    title: "Word Climb",
    description: "Sight words to sentences for K-3 readers, with spaced repetition.",
    type: "website",
  },
};

export default WordClimbPage;
