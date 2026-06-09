export const dynamic = 'force-dynamic';

import type { Metadata } from "next";
import WorkoutTrackerContent from './WorkoutTrackerContent';

export const metadata: Metadata = {
  title: "Workout Tracker",
  description: "Track your lifts, bodyweight exercises, and progress over time. Log sets and reps and visualize your strength gains.",
  keywords: ["workout tracker", "fitness", "strength training", "exercise log", "progressive overload"],
  openGraph: {
    title: "Workout Tracker",
    description: "Track your lifts, bodyweight exercises, and progress over time. Log sets and reps and visualize your strength gains.",
    type: "website",
  },
};

export default function WorkoutTrackerPage() {
  return <WorkoutTrackerContent />;
}
