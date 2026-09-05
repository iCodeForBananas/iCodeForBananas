"use client";

import { Menu as BaseMenu } from "@base-ui-components/react/menu";
import { cn } from "@/app/lib/utils";

export const Menu = BaseMenu.Root;
export const MenuTrigger = BaseMenu.Trigger;

export function MenuContent({
  className,
  sideOffset = 6,
  align = "start",
  children,
  ...props
}: React.ComponentProps<typeof BaseMenu.Popup> & {
  sideOffset?: number;
  align?: "start" | "center" | "end";
}) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner sideOffset={sideOffset} align={align} className='z-50'>
        <BaseMenu.Popup
          className={cn(
            "min-w-44 rounded-lg border border-line-subtle bg-surface-overlay p-1",
            "text-13 text-ink-primary shadow-overlay outline-none",
            "transition-[opacity,transform] duration-180 ease-ui motion-reduce:transition-none",
            "data-starting-style:scale-[0.98] data-starting-style:opacity-0",
            "data-ending-style:scale-[0.98] data-ending-style:opacity-0",
            className
          )}
          {...props}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

export function MenuItem({
  className,
  ...props
}: React.ComponentProps<typeof BaseMenu.Item>) {
  return (
    <BaseMenu.Item
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded px-2 py-1.5 outline-none",
        // Base UI drives this from the keyboard as well as the pointer, so the
        // hover and the arrow-key highlight are deliberately the same thing.
        "data-highlighted:bg-surface-raised data-highlighted:text-ink-primary",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-muted",
        className
      )}
      {...props}
    />
  );
}

/**
 * A labelled group of items. The label is a prop rather than a separate
 * component on purpose: Base UI's GroupLabel throws if it is not inside a
 * Group, and a lone label is an easy mistake to make and a loud one to hit, so
 * the API does not offer the shape that breaks. Omitting `label` gives a plain
 * group, which is still worth having for the keyboard.
 */
export function MenuGroup({
  label,
  children,
  ...props
}: React.ComponentProps<typeof BaseMenu.Group> & { label?: React.ReactNode }) {
  return (
    <BaseMenu.Group {...props}>
      {label !== undefined && (
        <BaseMenu.GroupLabel className='px-2 py-1.5 text-10 font-semibold uppercase tracking-wide text-ink-muted'>
          {label}
        </BaseMenu.GroupLabel>
      )}
      {children}
    </BaseMenu.Group>
  );
}

export function MenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof BaseMenu.Separator>) {
  return <BaseMenu.Separator className={cn("-mx-1 my-1 h-px bg-line-subtle", className)} {...props} />;
}
