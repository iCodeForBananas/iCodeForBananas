import { Button } from "@radix-ui/themes";

/**
 * One choice in a row of choices — a note, a chord type, a scale, a tab-like
 * mode — where the picked one is filled with the accent and the rest are
 * quiet. Every picker in the app uses this, so "which one is on" looks the
 * same everywhere. `aria-pressed` carries the state for assistive tech.
 */
export function ToggleButton({
  pressed,
  ...props
}: React.ComponentProps<typeof Button> & { pressed: boolean }) {
  return (
    <Button
      type='button'
      variant={pressed ? "solid" : "surface"}
      color={pressed ? undefined : "gray"}
      aria-pressed={pressed}
      {...props}
    />
  );
}
