import type { Metadata } from "next";
import ScraperAdminPage from "./page-client";

export const metadata: Metadata = {
  title: "Scraper Admin",
  description: "Manage scraper sources and trigger scrape runs.",
  keywords: ["scraper", "admin"],
  openGraph: {
    title: "Scraper Admin",
    description: "Manage scraper sources and trigger scrape runs.",
    type: "website",
  },
};

export default ScraperAdminPage;
