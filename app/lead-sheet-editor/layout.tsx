import { CommandPaletteProvider } from "@/app/components/ui/command-palette";
import styles from "./lead-sheet-theme.module.css";

/**
 * The songwriting routes.
 *
 * The surface used to be set here because this subtree was the only part of
 * the app on the design system and the rest still carried the banana theme.
 * That is no longer true: the shell in app/layout.tsx is on surface.base and
 * every tool reads Layer 2, so this only re-states the plane for a subtree
 * that is sometimes mounted on its own — the share route renders without the
 * shell around it.
 *
 * `styles.theme` re-points those same Layer 2 custom properties to this
 * tool's own near-black-and-amber identity — see lead-sheet-theme.module.css
 * — so every component here keeps using the ordinary surface, ink and line
 * classes and simply resolves them differently, regardless of the site's
 * light/dark toggle.
 *
 * The command palette is scoped the same way: it only ever knows about songs,
 * and keeping it here keeps its client boundary off every other page.
 */
export default function LeadSheetLayout({ children }: { children: React.ReactNode }) {
  return (
    <CommandPaletteProvider>
      <div className={`flex min-h-full flex-1 flex-col bg-surface-base font-sans text-ink-primary ${styles.theme}`}>
        {children}
      </div>
    </CommandPaletteProvider>
  );
}
