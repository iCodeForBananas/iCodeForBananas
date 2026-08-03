import type { Metadata } from "next";
import Home from "./page-client";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your personal toolkit for music theory, fitness, and more.",
  keywords: ["dashboard", "music theory", "fitness", "guitar", "tools"],
  openGraph: {
    title: "Dashboard",
    description: "Your personal toolkit for music theory, fitness, and more.",
    type: "website",
  },
};

export default Home;
