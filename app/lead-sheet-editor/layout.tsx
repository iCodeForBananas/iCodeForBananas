import { CommandPaletteProvider } from "@/app/components/ui/command-palette";

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
 * The command palette is scoped the same way: it only ever knows about songs,
 * and keeping it here keeps its client boundary off every other page.
 */
export default function LeadSheetLayout({ children }: { children: React.ReactNode }) {
  return (
    <CommandPaletteProvider>
      <div className='flex min-h-full flex-1 flex-col bg-surface-base font-sans text-ink-primary'>
        {children}
      </div>
    </CommandPaletteProvider>
  );
}
