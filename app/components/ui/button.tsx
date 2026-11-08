import { Button as RadixButton, IconButton } from "@radix-ui/themes";

/**
 * The app's only button. Drawn by Radix Themes, but nothing else imports
 * Radix's Button or IconButton, so one change here reaches every button.
 * The variant names describe intent rather than Radix's visual vocabulary:
 *
 *   primary    the one action in a view that matters most (solid accent)
 *   secondary  every other action (soft gray)
 *   ghost      a quiet action in a toolbar or beside content (no fill)
 *   danger     destructive (soft red)
 *
 * Colors come from the Radix theme, which globals.css binds to the iTerm
 * tokens; nothing here names a hue. A choice among options is a ToggleButton,
 * which is this same button with a pressed state.
 */
const VARIANTS = {
  primary: { variant: "solid", color: undefined },
  secondary: { variant: "soft", color: "gray" },
  ghost: { variant: "ghost", color: "gray" },
  danger: { variant: "soft", color: "red" },
} as const;

/** Heights are 24 / 32 / 40 / 48. `xl` is for a touch target that has to be hit without looking. */
const SIZES = {
  sm: "1",
  md: "2",
  lg: "3",
  xl: "4",
  /** Square, for a lone icon. Same heights as the text sizes so a toolbar lines up. */
  "icon-sm": "1",
  icon: "2",
  "icon-lg": "3",
  "icon-xl": "4",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

export type ButtonProps = Omit<React.ComponentProps<typeof RadixButton>, "variant" | "size" | "color" | "radius"> & {
  variant?: ButtonVariant | null;
  size?: ButtonSize | null;
};

export function Button({ variant, size, ...props }: ButtonProps) {
  const v = VARIANTS[variant ?? "secondary"];
  const s = size ?? "md";
  const Component = s.startsWith("icon") ? IconButton : RadixButton;
  return <Component variant={v.variant} color={v.color} size={SIZES[s]} {...props} />;
}
