import type { Metadata } from "next";
import EditLeadSheet from "./page-client";

export const metadata: Metadata = {
  title: "Edit Lead Sheet",
  description: "Edit your lead sheet with ChordPro notation. Add chord symbols, lyrics, sections, and notes.",
  keywords: ["lead sheet", "ChordPro", "edit", "chord symbols", "lyrics", "songwriting"],
  openGraph: {
    title: "Edit Lead Sheet",
    description: "Edit your lead sheet with ChordPro notation. Add chord symbols, lyrics, sections, and notes.",
    type: "website",
  },
};

export default EditLeadSheet;
