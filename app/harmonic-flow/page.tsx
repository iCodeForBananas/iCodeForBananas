import type { Metadata } from "next";
import ProgressionNavigator from "../components/ProgressionNavigator";
import BentoPageLayout from "../components/BentoPageLayout";

export const metadata: Metadata = { title: "Harmonic Flow" };

export default function HarmonicFlowPage() {
  return (
    <BentoPageLayout
      title='Harmonic Flow'
      category='Music AI Suite'
      description='Build beautiful chord progressions interactively'
    >
      <ProgressionNavigator startKey='G' bpm={80} />
    </BentoPageLayout>
  );
}
