"use client";

import { useEffect, type RefObject } from "react";

/**
 * The reference's `fit()`: binary-search the largest text size that still
 * lays the sheet out without overflow, trying each column count in turn and
 * only preferring more columns when they land a meaningfully bigger size
 * (`ok > best.pct * 1.08`, ported as-is) — more columns at the same size
 * read as clutter, not a win.
 *
 * Adapted to this app's sizing model: the reference sets a raw pixel
 * `font-size` and `column-count` directly on one `.sheet` div. This app
 * already scales text by percentage on a wrapping div (every size in
 * SheetContent is `em`-based off it) and drives columns through the
 * `--leadsheet-col-count` custom property `.leadsheet-columns` reads — so
 * the search mutates those instead, through the same two refs, landing on
 * the same `{ scale, cols }` result the reference's `{ px, cols }` would.
 */
export function useAutoFit({
  enabled,
  containerRef,
  contentRef,
  minScale,
  maxScale,
  minCols,
  maxCols,
  scale,
  cols,
  onFit,
  deps,
}: {
  enabled: boolean;
  /** The scroll box the content has to fit inside — the reference's `stageEl`. */
  containerRef: RefObject<HTMLElement | null>;
  /** The font-size/column-count wrapper — the reference's `sheetEl`. */
  contentRef: RefObject<HTMLElement | null>;
  minScale: number;
  maxScale: number;
  minCols: number;
  maxCols: number;
  scale: number;
  cols: number;
  onFit: (next: { scale: number; cols: number }) => void;
  /** Re-run when these change — song text, mode, panel open/close, and so on. */
  deps: unknown[];
}) {
  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    let raf = 0;
    // The size the last fit was measured at. A resize that lands on the same
    // size is the fit's own re-render echoing back, not a reason to fit again;
    // re-fitting on it is what let a fit chase its own tail.
    let lastSize = "";
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(run);
    };

    function run() {
      if (!container || !content) return;
      const H = container.clientHeight;
      const W = container.clientWidth;
      if (H < 40 || W < 80) return;
      const size = `${W}x${H}`;
      if (size === lastSize) return;
      lastSize = size;

      // The column count has to be tried on the element that lays the columns
      // out. `.leadsheet-columns` carries --leadsheet-col-count inline, which
      // beats anything inherited from `content`, so setting it on `content`
      // alone measured every trial at the current count and then applied a
      // different one — the layout never matched what was measured.
      const grid = content.querySelector<HTMLElement>(".leadsheet-columns") ?? content;
      const prevHeight = content.style.height;
      const prevFontSize = content.style.fontSize;
      const prevCols = grid.style.getPropertyValue("--leadsheet-col-count");
      content.style.height = `${H}px`;

      const items = content.querySelectorAll<HTMLElement>("[data-fit-line]");
      const fits = (pct: number, colCount: number) => {
        grid.style.setProperty("--leadsheet-col-count", String(colCount));
        content.style.fontSize = `${pct}%`;
        if (content.scrollWidth > content.clientWidth + 1) return false;
        if (content.scrollHeight > content.clientHeight + 1) return false;
        for (const item of items) {
          if (item.scrollWidth > item.clientWidth + 1) return false;
        }
        return true;
      };

      let best = { pct: 0, cols: minCols };
      for (let c = minCols; c <= maxCols; c++) {
        let lo = minScale;
        let hi = maxScale;
        let ok = 0;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (fits(mid, c)) {
            ok = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        if (c === minCols ? ok > 0 : ok > best.pct * 1.08) best = { pct: ok, cols: c };
      }
      if (!best.pct) best = { pct: minScale, cols: maxCols };

      content.style.height = prevHeight;
      content.style.fontSize = prevFontSize;
      if (prevCols) grid.style.setProperty("--leadsheet-col-count", prevCols);
      else grid.style.removeProperty("--leadsheet-col-count");

      if (best.pct !== scale || best.cols !== cols) onFit({ scale: best.pct, cols: best.cols });
    }

    const ro = new ResizeObserver(schedule);
    ro.observe(container);
    schedule();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // Deliberately keyed on `enabled` and the caller's own `deps` list, not on
    // `scale`/`cols`/the ref objects — those change *because* of a fit and
    // would otherwise retrigger one; a ref object is stable identity anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
}
