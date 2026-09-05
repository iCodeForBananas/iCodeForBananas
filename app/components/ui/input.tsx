import { cn } from "@/app/lib/utils";

/**
 * A field reads as editable because of its border, not because of its fill: it
 * sits on the sunken surface, one step behind the plane around it.
 */
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-8 w-full rounded-md border border-line-subtle bg-surface-sunken px-3",
        "text-13 text-ink-primary placeholder:text-ink-muted",
        // See the note in button.tsx: outline-none would disable the ring below.
        "focus-visible:border-line-strong",
        "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        "transition-colors duration-120 ease-ui motion-reduce:transition-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
