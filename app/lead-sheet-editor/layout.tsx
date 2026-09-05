import { CommandPaletteProvider } from "@/app/components/ui/command-palette";

/**
 * The songwriting routes, and only these, sit on the design system.
 *
 * The surface is set here rather than on :root because the other nine tools in
 * this repo keep the banana theme; scoping it to this subtree is what lets both
 * exist without one having to win. Everything inside reads from Layer 2 tokens,
 * so this is the only place the two worlds meet.
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
