import { Atkinson_Hyperlegible } from "next/font/google";
import { CommandPaletteProvider } from "@/app/components/ui/command-palette";
import styles from "./songwriter.module.css";
import { SongbookPortalHost } from "./portal";

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
 * Colors follow the app-wide iTerm schemes and the light/dark switch like
 * every other page (see tokens/README.md). `songwriter.module.css`'s `.root`
 * only sets this subtree's typeface.
 *
 * The command palette is scoped the same way: it only ever knows about songs,
 * and keeping it here keeps its client boundary off every other page.
 */
export default function LeadSheetLayout({ children }: { children: React.ReactNode }) {
  return (
    <CommandPaletteProvider>
      <div className={`flex min-h-full flex-1 flex-col font-sans ${atkinson.variable} ${styles.root}`}>
        <SongbookPortalHost>{children}</SongbookPortalHost>
      </div>
    </CommandPaletteProvider>
  );
}
