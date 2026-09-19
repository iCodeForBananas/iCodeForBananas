import { Separator as RadixSeparator } from "@radix-ui/themes";

/** A hairline. Separates, does not divide. */
export function Separator({
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof RadixSeparator>) {
  return <RadixSeparator orientation={orientation} size='4' {...props} />;
}
