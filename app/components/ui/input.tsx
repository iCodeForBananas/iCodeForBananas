import { TextField } from "@radix-ui/themes";

/**
 * A single-line text field, drawn by Radix Themes' TextField. The "surface"
 * variant sits on --color-surface, which globals.css binds to the sunken
 * token: a field reads as editable because it is one step behind the plane
 * around it. Pass `slot` children for an icon or a trailing button.
 */
export function Input({
  size = "2",
  children,
  ...props
}: Omit<React.ComponentProps<typeof TextField.Root>, "size"> & { size?: "1" | "2" | "3" }) {
  return (
    <TextField.Root variant='surface' size={size} {...props}>
      {children}
    </TextField.Root>
  );
}

export const InputSlot = TextField.Slot;
