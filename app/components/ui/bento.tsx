import type { ReactNode } from "react";
import { Card, Flex, Text } from "@radix-ui/themes";
import { cn } from "@/app/lib/utils";

export interface BentoProps extends Omit<React.ComponentProps<typeof Card>, "title"> {
  /** Small uppercase label in the header. */
  title?: ReactNode;
  /** Shown on hover over the title, for a panel that needs a word of explanation. */
  tooltip?: string;
  /** Sits before the title: a drag handle, an icon. */
  leading?: ReactNode;
  /** Pinned to the header's far side: buttons, a count, a toggle. */
  actions?: ReactNode;
  /**
   * Fill the parent's height, with the header fixed and the body scrolling.
   * For panels on a fixed-size grid (BentoBoard). Without it the box is as
   * tall as its content.
   */
  fill?: boolean;
  bodyClassName?: string;
}

/**
 * The one box. Every panel, card and grouped section in the app is a Bento,
 * so they share a surface, border, radius and header style, and all of it
 * comes from the Radix theme (bound to the brand tokens in globals.css).
 * If something needs to look like a box, use this rather than drawing one.
 */
export function Bento({
  title,
  tooltip,
  leading,
  actions,
  fill = false,
  bodyClassName,
  className,
  children,
  ...props
}: BentoProps) {
  const header =
    title !== undefined || leading || actions ? (
      <Flex
        align='center'
        justify='between'
        gap='2'
        className={cn("shrink-0", fill ? "border-b border-line-subtle px-3 py-2" : "mb-3")}
      >
        <Flex align='center' gap='2' minWidth='0'>
          {leading}
          {title !== undefined && (
            <Text
              as='div'
              size='1'
              weight='bold'
              color='gray'
              title={tooltip}
              className={cn("truncate uppercase tracking-wide", tooltip && "cursor-help")}
            >
              {title}
            </Text>
          )}
        </Flex>
        {actions && (
          <Flex align='center' gap='2' className='shrink-0'>
            {actions}
          </Flex>
        )}
      </Flex>
    ) : null;

  if (fill) {
    return (
      <Card size='2' className={cn("flex h-full min-h-0 flex-col p-0", className)} {...props}>
        {header}
        <div className={cn("min-h-0 flex-1 overflow-auto p-4", bodyClassName)}>{children}</div>
      </Card>
    );
  }

  return (
    // shrink-0: Radix's Card sets `overflow: hidden`, and per the flexbox
    // spec that makes a flex item's *automatic* min-height resolve to 0
    // instead of its content size. Stood next to enough other content in a
    // flex-col page (a chart, a multi-panel board) to exceed the viewport,
    // a Bento with no size of its own becomes a shrink target and gets
    // squeezed toward nothing instead of scrolling into view. `fill` panels
    // don't need this — a CSS Grid track or an explicit min-height already
    // sizes them (see BentoBoard).
    <Card size='2' className={cn("shrink-0", className)} {...props}>
      {header}
      {bodyClassName ? <div className={bodyClassName}>{children}</div> : children}
    </Card>
  );
}
