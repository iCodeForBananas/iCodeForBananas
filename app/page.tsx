import type { Metadata } from "next";
import Home from "./page-client";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your personal toolkit for music theory, trading, fitness, and more.",
  keywords: ["dashboard", "music theory", "trading", "fitness", "guitar", "tools"],
  openGraph: {
    title: "Dashboard",
    description: "Your personal toolkit for music theory, trading, fitness, and more.",
    type: "website",
  },
};

export default Home;
