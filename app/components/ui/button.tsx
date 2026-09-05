import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/app/lib/utils";

/**
 * Every colour here is a Layer 2 semantic token. Nothing in this file names a
 * hue, a hex value or a Tailwind palette step; swapping the amber for something
 * else is a change to tokens/, not to this component.
 */
const button = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap",
    "rounded-md border font-medium select-none",
    // Focus is never removed, only restyled. The ring sits outside the control
    // so it stays legible against whatever surface the button is sitting on.
    //
    // No `outline-none` here, deliberately. In Tailwind v4 it sets the outline
    // style to none through a variable that focus-visible:outline-2 then reads,
    // so the pair silently produces a 2px outline that does not draw. The
    // browser shows nothing until :focus-visible anyway, so there is nothing to
    // suppress; the style is stated outright so it cannot be inherited away.
    "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    "transition-colors duration-120 ease-ui motion-reduce:transition-none",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        /**
         * The one action in a view that matters most. The border is not
         * decorative: amber at full strength cannot reach 3:1 against a
         * near-white surface, so in light theme this hairline is the only thing
         * giving the control a discernible boundary. See the mitigation in
         * scripts/contrast-check.mjs.
         */
        primary:
          "border-line-strong bg-primary-solid text-ink-on-primary hover:bg-primary-hover",
        secondary:
          "border-line-subtle bg-surface-raised text-ink-primary hover:bg-surface-overlay",
        ghost:
          "border-transparent bg-transparent text-ink-muted hover:bg-surface-raised hover:text-ink-primary",
        danger:
          "border-line-subtle bg-transparent text-danger hover:bg-danger/10 hover:border-danger/40",
      },
      size: {
        sm: "h-7 px-2 text-12",
        md: "h-8 px-3 text-13",
        lg: "h-10 px-4 text-15",
        /** Square, for a lone icon. Same heights so it lines up in a toolbar. */
        "icon-sm": "size-7",
        icon: "size-8",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  }
);

export type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof button>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(button({ variant, size }), className)} {...props} />;
}

export { button as buttonVariants };
