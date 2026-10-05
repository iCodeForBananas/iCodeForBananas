"use client";

import { createContext, useContext, useState } from "react";

/**
 * Radix portals its dialogs, menus and select lists to the end of <body>,
 * which is outside this subtree and so outside `.root` in
 * lead-sheet-editor.module.css — they rendered in the app-wide navy and
 * Roboto rather than the Songbook palette. The host renders an empty node
 * inside the subtree and the subtree's own overlays portal into it instead,
 * so they inherit the scoped tokens without any global CSS. Overlays are
 * position: fixed, so where the node sits in the layout does not matter.
 */
const PortalContext = createContext<HTMLElement | null>(null);

export function SongbookPortalHost({ children }: { children: React.ReactNode }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  return (
    <PortalContext.Provider value={host}>
      {children}
      <div ref={setHost} />
    </PortalContext.Provider>
  );
}

/** The `container` for a Radix overlay opened from inside the lead sheet routes. */
export const useSongbookPortal = () => useContext(PortalContext) ?? undefined;
