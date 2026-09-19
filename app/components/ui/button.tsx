import { Button as RadixButton, IconButton } from "@radix-ui/themes";

/**
 * The app's button, drawn by Radix Themes. The variant names describe intent
 * rather than Radix's visual vocabulary, so call sites say what a button is
 * for and the mapping to a look lives here, once:
 *
 *   primary    the one action in a view that matters most (solid amber)
 *   secondary  every other action (soft gray)
 *   ghost      a quiet action in a toolbar or beside content (no fill)
 *   danger     destructive (soft red)
 *
 * Colors come from the Radix theme, which globals.css binds to the brand
 * tokens; nothing here names a hue.
 */
const VARIANTS = {
  primary: { variant: "solid", color: undefined },
  secondary: { variant: "soft", color: "gray" },
  ghost: { variant: "ghost", color: "gray" },
  danger: { variant: "soft", color: "red" },
} as const;

const SIZES = {
  sm: "1",
  md: "2",
  lg: "3",
  /** Square, for a lone icon. Same heights as sm / md so it lines up in a toolbar. */
  "icon-sm": "1",
  icon: "2",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

export type ButtonProps = Omit<React.ComponentProps<"button">, "color"> & {
  variant?: ButtonVariant | null;
  size?: ButtonSize | null;
};

export function Button({ variant, size, ...props }: ButtonProps) {
  const v = VARIANTS[variant ?? "secondary"];
  const s = size ?? "md";
  const Component = s === "icon" || s === "icon-sm" ? IconButton : RadixButton;
  return <Component variant={v.variant} color={v.color} size={SIZES[s]} {...props} />;
}
