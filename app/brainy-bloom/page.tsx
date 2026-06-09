import type { Metadata } from "next";
import BrainyBloomPage from "./BrainyBloomPage";

export const metadata: Metadata = {
  title: "Brainy Bloom",
  description: "Kids cognitive learning game covering verbal, quantitative, and spatial reasoning at 5 levels of depth of knowledge. Designed for K–5 students and young learners.",
  keywords: ["kids learning game", "cognitive skills", "DOK levels", "verbal reasoning", "spatial reasoning", "elementary education", "IQ game", "gifted learners"],
  openGraph: {
    title: "Brainy Bloom",
    description: "Kids cognitive learning game with verbal, quantitative, and spatial reasoning at 5 DOK levels.",
    type: "website",
  },
};

export default BrainyBloomPage;
