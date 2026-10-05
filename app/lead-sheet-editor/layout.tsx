import { Atkinson_Hyperlegible } from "next/font/google";
import { CommandPaletteProvider } from "@/app/components/ui/command-palette";
import styles from "./lead-sheet-editor.module.css";

const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-atkinson",
  display: "swap",
});

/**
 * The songwriting routes.
 *
 * This subtree used to carry its own scoped theme override (a deeper,
 * always-dark near-black-and-amber palette independent of the site's
 * light/dark toggle), then gave it up in favor of the app-wide dark palette
 * (ink black / Prussian blue / Oxford navy, School Bus Yellow / gold — see
 * tokens/README.md). It has its own look again now, requested separately
 * from that app-wide theme: `lead-sheet-editor.module.css`'s `.root`
 * re-points the same --ds-color-* custom properties everything here already
 * reads at a different, warmer near-black-and-amber palette (lifted from the
 * "Open Mic Songbook" design reference), scoped by the CSS Module class so
 * it cannot leak into any other page the way the old global override could.
 *
 * The command palette is scoped the same way: it only ever knows about songs,
 * and keeping it here keeps its client boundary off every other page.
 */
export default function LeadSheetLayout({ children }: { children: React.ReactNode }) {
  return (
    <CommandPaletteProvider>
      <div className={`flex min-h-full flex-1 flex-col font-sans ${atkinson.variable} ${styles.root}`}>
        {children}
      </div>
    </CommandPaletteProvider>
  );
}
