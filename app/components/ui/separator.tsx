import { cn } from "@/app/lib/utils";

/** A hairline. Separates, does not divide. */
export function Separator({
  orientation = "horizontal",
  className,
  ...props
}: React.ComponentProps<"div"> & { orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      role='separator'
      aria-orientation={orientation}
      className={cn(
        "shrink-0 bg-line-subtle",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className
      )}
      {...props}
    />
  );
}
