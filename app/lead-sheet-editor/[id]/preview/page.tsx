import type { Metadata } from "next";
import PreviewLeadSheet from "./page-client";

export const metadata: Metadata = {
  title: "Preview Lead Sheet",
  description: "Preview and print your lead sheet. Share a public link or copy the text for use anywhere.",
  keywords: ["lead sheet", "preview", "print", "share", "ChordPro", "sheet music"],
  openGraph: {
    title: "Preview Lead Sheet",
    description: "Preview and print your lead sheet. Share a public link or copy the text for use anywhere.",
    type: "website",
  },
};

export default PreviewLeadSheet;
