import { CommandPaletteProvider } from "@/app/components/ui/command-palette";

/**
 * The palette is scoped to the songwriting routes rather than mounted at the
 * app root: it only ever knows about songs, and the other tools in this repo
 * have no commands to give it. Keeping it here also keeps its client boundary
 * off every other page.
 */
export default function LeadSheetLayout({ children }: { children: React.ReactNode }) {
  return <CommandPaletteProvider>{children}</CommandPaletteProvider>;
}
