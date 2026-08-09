import type { Metadata } from "next";
import ShootSimulatorPage from "./ShootSimulatorPage";

export const metadata: Metadata = {
  title: "Shoot Simulator",
  description:
    "A side-scrolling beat-em-up on a procedurally generated city street. Punch combos, a parrot that slams enemies, and a goldfish drive-by.",
  keywords: ["beat em up", "browser game", "canvas game", "side scroller", "arcade game", "street brawler"],
  openGraph: {
    title: "Shoot Simulator",
    description: "A side-scrolling beat-em-up on a procedurally generated city street.",
    type: "website",
  },
};

export default ShootSimulatorPage;
