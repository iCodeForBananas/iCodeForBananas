import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.icodeforbananas.spacemath",
  appName: "Space Math",
  webDir: "dist",
  backgroundColor: "#0b0d10",
  ios: {
    contentInset: "never",
    // Keeps the WebView from rubber-banding the whole game when a kid drags.
    scrollEnabled: false,
  },
};

export default config;
