/**
 * Lays a song out for paper. Paper size isn't known up front (Letter or
 * A4), so the page is the smaller of the two, less the 1.5cm `@page`
 * margin from globals.css, at the 96px-per-inch CSS uses for print.
 */
const CM = 96 / 2.54;
export const PRINT_PAGE_WIDTH = Math.floor(8.27 * 96 - 2 * 1.5 * CM);
export const PRINT_PAGE_HEIGHT = Math.floor(11 * 96 - 2 * 1.5 * CM);

export interface PrintLayout {
  columns: 1 | 2;
  /** Text size as a percent of the normal sheet size. */
  scale: number;
}

/**
 * Tried in order; the first that fits one page wins. One column reads
 * best, so it goes first, at full size and then a touch smaller. Two
 * columns start at 90%: at full size a half-page column is too narrow
 * for an ordinary chord line, which then wraps. Nothing goes below 80%:
 * past that it's better to turn a page than squint.
 */
export const PRINT_LAYOUTS: readonly PrintLayout[] = [
  { columns: 1, scale: 100 },
  { columns: 1, scale: 90 },
  { columns: 2, scale: 90 },
  { columns: 2, scale: 80 },
];

/**
 * Used when nothing fits one page. Two columns spread over several pages
 * leave half-empty pages and a confusing reading order, so it's one column.
 */
export const PRINT_FALLBACK: PrintLayout = { columns: 1, scale: 100 };

export function choosePrintLayout(
  heightOf: (layout: PrintLayout) => number,
  pageHeight: number = PRINT_PAGE_HEIGHT,
): PrintLayout {
  for (const layout of PRINT_LAYOUTS) {
    if (heightOf(layout) <= pageHeight) return layout;
  }
  return PRINT_FALLBACK;
}

function apply(el: HTMLElement, layout: PrintLayout) {
  el.style.fontSize = `${layout.scale}%`;
  el.style.columnCount = String(layout.columns);
  el.style.columnGap = "2rem";
}

/**
 * Measures the print view at page width and applies the layout that fits.
 * `outer` is the print-only wrapper (display:none on screen), shown
 * off-screen just long enough to measure; `inner` takes the layout.
 */
export function fitForPrint(outer: HTMLElement, inner: HTMLElement): PrintLayout {
  const saved = outer.getAttribute("style");
  outer.style.cssText +=
    `;display:block;position:absolute;left:-10000px;top:0;visibility:hidden;width:${PRINT_PAGE_WIDTH}px`;
  try {
    const layout = choosePrintLayout((l) => {
      apply(inner, l);
      return inner.getBoundingClientRect().height;
    });
    apply(inner, layout);
    return layout;
  } finally {
    if (saved === null) outer.removeAttribute("style");
    else outer.setAttribute("style", saved);
  }
}
