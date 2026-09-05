import { cn } from "@/app/lib/utils";

/**
 * A key on a keyboard. Sunken rather than raised, because a key you are being
 * told to press is a label, not a control: making it look pressable invites a
 * click that does nothing.
 */
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-subtle",
        "bg-surface-sunken px-1 font-sans text-10 text-ink-muted",
        className
      )}
      {...props}
    />
  );
}
