"use client";

import { Dialog as BaseDialog } from "@base-ui-components/react/dialog";
import { cn } from "@/app/lib/utils";

/**
 * Base UI owns the hard parts: focus trap, escape, scroll lock, portalling and
 * the open/closed data attributes the transitions below hang off. Everything
 * here is presentation, and all of it reads from Layer 2 tokens.
 */
export const Dialog = BaseDialog.Root;
export const DialogTrigger = BaseDialog.Trigger;
export const DialogClose = BaseDialog.Close;

export function DialogBackdrop({
  className,
  ...props
}: React.ComponentProps<typeof BaseDialog.Backdrop>) {
  return (
    <BaseDialog.Backdrop
      className={cn(
        "fixed inset-0 z-50 bg-surface-sunken/70 backdrop-blur-[2px]",
        "transition-opacity duration-180 ease-ui motion-reduce:transition-none",
        "data-starting-style:opacity-0 data-ending-style:opacity-0",
        className
      )}
      {...props}
    />
  );
}

export function DialogPopup({
  className,
  children,
  ...props
}: React.ComponentProps<typeof BaseDialog.Popup>) {
  return (
    <BaseDialog.Portal>
      <DialogBackdrop />
      <BaseDialog.Popup
        className={cn(
          // An overlay is the top surface step, and the one place a shadow is
          // allowed to be noticeable, because it has to read as detached rather
          // than merely lighter than what is behind it.
          "fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2",
          "rounded-xl border border-line-subtle bg-surface-overlay shadow-overlay",
          "text-ink-primary outline-none",
          "transition-[opacity,transform] duration-240 ease-ui motion-reduce:transition-none",
          "data-starting-style:scale-[0.98] data-starting-style:opacity-0",
          "data-ending-style:scale-[0.98] data-ending-style:opacity-0",
          className
        )}
        {...props}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof BaseDialog.Title>) {
  return <BaseDialog.Title className={cn("text-17 font-semibold", className)} {...props} />;
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof BaseDialog.Description>) {
  return (
    <BaseDialog.Description className={cn("text-13 text-ink-muted", className)} {...props} />
  );
}
