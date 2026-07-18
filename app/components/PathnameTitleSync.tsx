"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const TITLES: Record<string, string> = {
  "/":                                   "iCodeForBananas",
  "/algo-backtest":                       "Algo Backtest | iCodeForBananas",
  "/ascii-player":                        "ASCII Player | iCodeForBananas",
  "/brainy-bloom":                        "Brainy Bloom | iCodeForBananas",
  "/chord-diagrams":                      "Chord Diagrams | iCodeForBananas",
  "/chord-finder":                        "Chord Finder | iCodeForBananas",
  "/chord-inversions":                    "Chord Inversions | iCodeForBananas",
  "/chord-progressions":                  "Chord Progressions | iCodeForBananas",
  "/chord-voicings":                      "Chord Voicings | iCodeForBananas",
  "/circle-of-fifths":                    "Circle of Fifths | iCodeForBananas",
  "/decode-dash":                         "Decode Dash | iCodeForBananas",
  "/fire-estimator":                      "FIRE Estimator | iCodeForBananas",
  "/fretboard-architect":                 "Fretboard Architect | iCodeForBananas",
  "/fretboard-explorer":                  "Fretboard Explorer | iCodeForBananas",
  "/fretboard-quiz":                      "Fretboard Quiz | iCodeForBananas",
  "/lead-sheet-editor":                   "Lead Sheet Editor | iCodeForBananas",
  "/leaderboard":                         "Trading Leaderboard | iCodeForBananas",
  "/learning-progress":                   "Learning Progress | iCodeForBananas",
  "/login":                               "Sign In | iCodeForBananas",
  "/paper-trading":                       "Paper Trading | iCodeForBananas",
  "/inversion-picker":                     "Inversion Picker | iCodeForBananas",
  "/settings":                            "Settings | iCodeForBananas",
  "/space-math":                          "Space Math | iCodeForBananas",
  "/spelling-bee":                        "Spelling Bee | iCodeForBananas",
  "/task-board":                          "Task Board | iCodeForBananas",
  "/workout-tracker":                     "Workout Tracker | iCodeForBananas",
  "/aaron-futures":                       "Aaron Futures | iCodeForBananas",
  "/mermaid-flow":                        "Mermaid Flow | iCodeForBananas",
  "/websites/seattle-concrete":           "Seattle Concrete | iCodeForBananas",
  "/websites/seattle-concrete/estimate":  "Concrete Estimate | iCodeForBananas",
};

export default function PathnameTitleSync() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.startsWith("/lead-sheet-editor/") && pathname.endsWith("/edit")) {
      document.title = "Edit Lead Sheet | iCodeForBananas";
      return;
    }
    if (pathname.startsWith("/lead-sheet-editor/") && pathname.endsWith("/preview")) {
      document.title = "Preview Lead Sheet | iCodeForBananas";
      return;
    }
    const title = TITLES[pathname];
    if (title) document.title = title;
  }, [pathname]);

  return null;
}
