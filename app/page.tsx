import type { Metadata } from "next";
import Home from "./page-client";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your personal toolkit for music theory, trading, fitness, and more. Built for musicians, traders, and makers.",
  keywords: ["dashboard", "music theory", "trading", "fitness", "guitar", "tools"],
  openGraph: {
    title: "Dashboard",
    description: "Your personal toolkit for music theory, trading, fitness, and more. Built for musicians, traders, and makers.",
    type: "website",
  },
};

export default Home;
