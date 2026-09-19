import { Kbd as RadixKbd } from "@radix-ui/themes";

/** A key on a keyboard: a label for a shortcut, not a control. */
export function Kbd(props: React.ComponentProps<typeof RadixKbd>) {
  return <RadixKbd size='1' {...props} />;
}
