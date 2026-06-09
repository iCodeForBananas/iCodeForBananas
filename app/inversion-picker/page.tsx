import type { Metadata } from "next";
import InversionPickerPage from "./InversionPickerPage";

export const metadata: Metadata = {
  title: "Inversion Picker",
  description: "Pick guitar chord inversions for major and minor triads. Shows root position, first inversion, and second inversion shapes across string sets 5-4-3, 4-3-2, and 3-2-1.",
  keywords: ["chord inversions", "inversion picker", "guitar triads", "chord voicings", "string sets", "guitar inversions", "triad shapes"],
  openGraph: {
    title: "Inversion Picker",
    description: "Root position, 1st, and 2nd inversion chord shapes for major and minor triads.",
    type: "website",
  },
};

export default InversionPickerPage;
