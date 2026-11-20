import type { ButtonHTMLAttributes } from "react";

// Stand-in for the main site's Radix-backed Button, keeping its variant and
// size names so the game code ports over unchanged.
const VARIANTS = {
  primary: "bg-primary-solid text-ink-on-primary active:brightness-90",
  secondary: "bg-white/10 text-ink-primary active:bg-white/20",
  danger: "bg-danger/15 text-danger active:bg-danger/25",
} as const;

const SIZES = {
  sm: "h-8 px-3 text-sm rounded-md",
  md: "h-10 px-4 text-base rounded-md",
  xl: "h-16 px-8 text-xl rounded-lg",
} as const;

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS; size?: keyof typeof SIZES }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 font-bold select-none transition disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}
