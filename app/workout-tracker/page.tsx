export const dynamic = 'force-dynamic';

import type { Metadata } from "next";
import WorkoutTrackerContent from './WorkoutTrackerContent';

export const metadata: Metadata = { title: "Workout Tracker" };

export default function WorkoutTrackerPage() {
  return <WorkoutTrackerContent />;
}
