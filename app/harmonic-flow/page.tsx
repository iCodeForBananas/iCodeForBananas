import type { Metadata } from "next";
import ProgressionNavigator from "../components/ProgressionNavigator";
import BentoPageLayout from "../components/BentoPageLayout";

export const metadata: Metadata = { title: "Harmonic Flow" };

export default function HarmonicFlowPage() {
  return (
    <BentoPageLayout
      title='Harmonic Flow'
    >
      <ProgressionNavigator startKey='G' bpm={80} />
    </BentoPageLayout>
  );
}
