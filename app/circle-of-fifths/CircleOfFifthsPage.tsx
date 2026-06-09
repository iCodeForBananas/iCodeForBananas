import type { Metadata } from "next";
import CircleOfFifthsPage from "./page-client";

export const metadata: Metadata = {
  title: "Circle of Fifths",
  description: "Interactive circle of fifths for musicians. Explore key signatures, relative minors, and chord relationships.",
  keywords: ["circle of fifths", "key signatures", "music theory", "relative minor", "chord relationships"],
  openGraph: {
    title: "Circle of Fifths",
    description: "Interactive circle of fifths for musicians. Explore key signatures, relative minors, and chord relationships.",
    type: "website",
  },
};

export default CircleOfFifthsPage;
