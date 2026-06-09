import type { Metadata } from "next";
import SpaceMathPage from "./SpaceMathPage";

export const metadata: Metadata = {
  title: "Space Math",
  description: "Common Core math game for Kindergarten through Grade 3 with a space theme. Spaced repetition and visual scaffolding for addition, subtraction, and number sense.",
  keywords: ["math game", "Common Core", "kindergarten math", "elementary math", "space theme", "spaced repetition", "K-3 math", "kids math"],
  openGraph: {
    title: "Space Math",
    description: "Common Core math game for K–3 with a space theme and spaced repetition.",
    type: "website",
  },
};

export default SpaceMathPage;
