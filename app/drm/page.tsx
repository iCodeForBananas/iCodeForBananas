import type { Metadata } from "next";
import DRMPage from "./page-client";

export const metadata: Metadata = {
  title: "Dating Relationship Manager",
  description: "Track your dating pipeline with stage-based momentum scoring. From Talking to Partnership — know where things stand.",
  keywords: ["dating", "relationship tracker", "dating pipeline", "momentum scoring"],
  openGraph: {
    title: "Dating Relationship Manager",
    description: "Track your dating pipeline with stage-based momentum scoring. From Talking to Partnership — know where things stand.",
    type: "website",
  },
};

export default function DRMServerPage() {
  return <DRMPage />;
}
