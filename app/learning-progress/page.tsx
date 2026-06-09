import type { Metadata } from "next";
import LearningProgressPage from "./LearningProgressPage";

export const metadata: Metadata = {
  title: "Learning Progress",
  description: "Track Common Core K–Grade 3 math learning progress. View mastered skills, accuracy by topic, strengths and weaknesses, and syllabus completion by grade level.",
  keywords: ["learning progress", "Common Core", "K-3 math", "math skills tracker", "education progress", "syllabus tracker", "skill mastery"],
  openGraph: {
    title: "Learning Progress",
    description: "Common Core K–3 math progress tracker with skill heat maps and grade-by-grade syllabi.",
    type: "website",
  },
};

export default LearningProgressPage;
