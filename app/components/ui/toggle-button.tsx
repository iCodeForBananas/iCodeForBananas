import { Button, type ButtonProps } from "@/app/components/ui/button";

/**
 * One choice in a row of choices — a note, a chord type, a scale, a tab-like
 * mode — where the picked one is filled with the accent and the rest are
 * quiet. Every picker in the app uses this, so "which one is on" looks the
 * same everywhere. `aria-pressed` carries the state for assistive tech.
 */
export function ToggleButton({ pressed, ...props }: Omit<ButtonProps, "variant"> & { pressed: boolean }) {
  return <Button type='button' variant={pressed ? "primary" : "secondary"} aria-pressed={pressed} {...props} />;
}
