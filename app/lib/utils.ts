import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The design system's type scale is named by pixel size, so `text-13` is a font
 * size while `text-ink-muted` is a colour. tailwind-merge cannot tell them
 * apart on its own: both look like `text-<something>`, so it files them in the
 * same group and keeps only the last one.
 *
 * That is not a cosmetic problem. `text-ink-on-primary text-13` on a button
 * silently became `text-13`, which left the amber primary button rendering its
 * label in near-white at about 1.4:1, the one outcome the whole colour system
 * exists to prevent. Teaching the merger the scale is what keeps a size and a
 * colour from cancelling each other out.
 */
const FONT_SIZE_STEPS = ["10", "12", "13", "15", "16", "17", "20", "24", "32", "48"];

const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: FONT_SIZE_STEPS }],
    },
  },
});

/**
 * Join class names, letting a later Tailwind utility win over an earlier one in
 * the same group. Without the merge, a component's own `px-4` and a caller's
 * `px-2` both end up in the class list and whichever CSS rule happens to come
 * last decides, which is not the caller.
 */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
