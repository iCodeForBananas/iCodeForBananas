import { attribution, type Provenance } from "./sharing";
import { cn } from "@/app/lib/utils";

/**
 * The credit a forked song carries. Rendered wherever the song is, not tucked
 * into a menu: a copy that does not say whose it was is passing itself off.
 */
export function SongAttribution({
  song,
  className,
}: {
  song: Provenance;
  className?: string;
}) {
  const credit = attribution(song);
  if (!credit) return null;
  return (
    <p className={cn("text-12 text-ink-muted", className)} data-testid='attribution'>
      {credit}
    </p>
  );
}
