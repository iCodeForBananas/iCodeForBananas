"use client";

import GuitarSettingsPanel from "../GuitarSettingsPanel";
import GuitarToolView from "../GuitarToolView";

export default function GuitarSettingsPage() {
  return (
    <GuitarToolView
      title="Settings"
      tooltip="Saved in this browser and followed by every Guitar tool"
      showSettings={false}
    >
      <GuitarSettingsPanel />
    </GuitarToolView>
  );
}
