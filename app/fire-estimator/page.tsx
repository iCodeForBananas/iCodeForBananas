import type { Metadata } from "next";
import FireEstimatorPage from "./FireEstimatorPage";

export const metadata: Metadata = {
  title: "FIRE Calculator",
  description: "Financial Independence Retire Early calculator. Find your FIRE number using the Rule of 25, Coast FIRE, Barista FIRE, and Monte Carlo projections with SPY/QQQ data.",
  keywords: ["FIRE calculator", "financial independence", "retire early", "Coast FIRE", "Barista FIRE", "Rule of 25", "4% SWR", "Monte Carlo", "retirement calculator"],
  openGraph: {
    title: "FIRE Calculator",
    description: "Calculate your FIRE number, Coast FIRE, Barista FIRE, and Monte Carlo retirement projections.",
    type: "website",
  },
};

export default FireEstimatorPage;
