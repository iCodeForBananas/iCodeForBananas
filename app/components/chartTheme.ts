"use client";

import { useMemo } from "react";
import { useTheme } from "@/app/lib/ThemeContext";

/**
 * Colors for charts drawn on a canvas (lightweight-charts, or by hand), read
 * from the same Layer 2 tokens the rest of the UI uses. A canvas can't take a
 * CSS variable, and neither lightweight-charts nor every canvas implementation
 * parses oklch(), so each token is resolved to rgba() by painting it.
 */
export interface ChartTheme {
  background: string;
  text: string;
  grid: string;
  border: string;
  up: string;
  down: string;
  accent: string;
  /** The accent at low opacity, for area fills under a line. */
  accentFill: string;
}

let scratch: CanvasRenderingContext2D | null = null;

function resolveColor(css: string, alpha = 1): string {
  if (!scratch) scratch = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!scratch || !css) return css;
  scratch.clearRect(0, 0, 1, 1);
  scratch.fillStyle = css;
  scratch.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = scratch.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * alpha * 1000) / 1000})`;
}

export function readChartTheme(): ChartTheme {
  const cs = getComputedStyle(document.documentElement);
  const token = (name: string) => cs.getPropertyValue(name).trim();
  return {
    background: resolveColor(token("--ds-color-surface-raised")),
    text: resolveColor(token("--ds-color-text-muted")),
    grid: resolveColor(token("--ds-color-border-subtle")),
    border: resolveColor(token("--ds-color-border-strong")),
    up: resolveColor(token("--ds-color-success")),
    down: resolveColor(token("--ds-color-danger")),
    accent: resolveColor(token("--ds-color-primary-solid")),
    accentFill: resolveColor(token("--ds-color-primary-solid"), 0.18),
  };
}

/**
 * The current chart colors, re-read whenever the light/dark theme changes.
 * Null during server render, where there are no tokens to read. Charts only
 * use these in effects, so that null never reaches markup.
 */
export function useChartTheme(): ChartTheme | null {
  const { theme } = useTheme();
  // ThemeContext writes data-theme to <html> in the same handler that changes
  // `theme`, so by the time this re-renders the tokens are the new theme's.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (typeof document === "undefined" ? null : readChartTheme()), [theme]);
}
