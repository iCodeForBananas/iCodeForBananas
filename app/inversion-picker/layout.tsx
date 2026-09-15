import styles from "@/app/components/guitar-tool-theme.module.css";

/**
 * Inversion Picker's share of the guitar tools' fixed identity — see
 * app/components/guitar-tool-theme.module.css. `styles.theme` re-points the
 * design system's Layer 2 custom properties (bg-surface-*, text-ink-*,
 * border-line-*, bg-primary-*) to a near-black-and-amber palette regardless
 * of the site's light/dark toggle, the way every other guitar tool's own
 * layout.tsx does; every component here keeps using its ordinary classes.
 */
export default function InversionPickerLayout({ children }: { children: React.ReactNode }) {
  return <div className={`flex min-h-full flex-1 flex-col ${styles.theme}`}>{children}</div>;
}
