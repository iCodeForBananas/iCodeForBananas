import type { Metadata } from "next";
import LeadSheetList from "./page-client";

export const metadata: Metadata = {
  title: "Songwriter",
  description: "Create, edit, and share lead sheets with ChordPro notation. Print-ready with adjustable font size and one-click sharing.",
  keywords: ["lead sheet", "ChordPro", "sheet music", "songwriting", "chord notation", "music editor"],
  openGraph: {
    title: "Songwriter",
    description: "Create, edit, and share lead sheets with ChordPro notation. Print-ready with adjustable font size and one-click sharing.",
    type: "website",
  },
};

export default LeadSheetList;
