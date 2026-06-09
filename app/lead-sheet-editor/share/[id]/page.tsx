import type { Metadata } from "next";
import ShareLeadSheet from "./page-client";

export const metadata: Metadata = {
  title: "Lead Sheet",
  description: "View this shared lead sheet. Created with iCodeForBananas Lead Sheet Editor.",
  keywords: ["lead sheet", "shared sheet", "music", "ChordPro"],
  openGraph: {
    title: "Lead Sheet",
    description: "View this shared lead sheet. Created with iCodeForBananas Lead Sheet Editor.",
    type: "website",
  },
};

export default function Page(props: { params: Promise<{ id: string }> }) {
  return <ShareLeadSheet {...props} />;
}
