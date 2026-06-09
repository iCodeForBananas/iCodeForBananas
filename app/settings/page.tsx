import type { Metadata } from "next";
import SettingsPage from "./SettingsPage";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your iCodeForBananas account settings and app preferences. Update your profile, notification settings, and connected integrations.",
  keywords: ["settings", "preferences", "account settings", "profile", "app settings"],
  openGraph: {
    title: "Settings",
    description: "Manage your iCodeForBananas account settings and app preferences.",
    type: "website",
  },
};

export default SettingsPage;
