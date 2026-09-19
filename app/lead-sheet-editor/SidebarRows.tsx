"use client";

import { Button, Text } from "@radix-ui/themes";
import { cn } from "@/app/lib/utils";

/**
 * One row of the sidebar. Every tool is a full-width line separated from its
 * neighbours by a hairline rather than boxed in a border of its own — a column
 * of nested boxes reads as clutter at the size these controls run to. `active`
 * fills it with the accent, for a mode that is on.
 */
export function RowButton({
  active = false,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { active?: boolean }) {
  return (
    <Button
      type='button'
      size='3'
      variant={active ? "solid" : "ghost"}
      color={active ? undefined : "gray"}
      highContrast={!active}
      className={cn("m-0 h-11 w-full justify-start gap-2.5 rounded-none px-3 print:hidden", className)}
      {...props}
    />
  );
}

/**
 * A labelled control row. Every one sits on the same four columns — label,
 * step down, value, step up — so down the whole sidebar the labels, the
 * buttons and the values each line up and the column reads at a glance.
 * Children fill columns two to four; a control that isn't a stepper spans them.
 */
export function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='grid grid-cols-[4.5rem_2.5rem_minmax(0,1fr)_2.5rem] items-center gap-x-1.5 px-3 py-2 print:hidden'>
      <Text size='2' weight='medium' className='select-none'>
        {label}
      </Text>
      {children}
    </div>
  );
}
