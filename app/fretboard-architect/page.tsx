import type { Metadata } from "next";
import FretboardArchitect from "./FretboardArchitect";

export const metadata: Metadata = {
  title: "Fretboard Architect",
  description: "Interactive 24-fret guitar visualization with CAGED, 3NPS, Nashville Number System, and voicing tools. Explore every scale, mode, and chord shape on one screen.",
  keywords: ["fretboard", "guitar visualization", "CAGED system", "3NPS", "Nashville Number System", "guitar scales", "chord voicings", "music theory"],
  openGraph: {
    title: "Fretboard Architect",
    description: "Interactive 24-fret guitar visualization with CAGED, 3NPS, and Nashville Number System tools.",
    type: "website",
  },
};

export default function FretboardArchitectPage() {
  return <FretboardArchitect />;
}
