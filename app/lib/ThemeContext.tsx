"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
};

/**
 * One switch, on <html>.
 *
 * `data-theme` is what app/tokens.css reads: dark is the default and lives on
 * `:root` there, so it is `[data-theme="light"]` that carries the light half of
 * Layer 2. globals.css points Tailwind's `dark:` variant at the same attribute.
 *
 * The `dark` / `light` class rides along only because Radix Themes reads
 * appearance from a class, not an attribute. It is derived from the same
 * value in the same place, so the two can't disagree.
 *
 * Both are written by the inline script in app/layout.tsx, which runs before
 * first paint.
 */
function applyTheme(t: Theme) {
  const html = document.documentElement;
  html.setAttribute("data-theme", t);
  // Radix Themes (appearance='inherit' in app/layout.tsx) reads these classes.
  html.classList.toggle("dark", t === "dark");
  html.classList.toggle("light", t === "light");
}

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  // Matches the data-theme the server renders, so the first client render
  // agrees with the markup; the effect below corrects it from storage.
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial: Theme = stored ?? (systemDark ? "dark" : "light");
    setThemeState(initial);
    applyTheme(initial);
    setMounted(true);
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    try {
      localStorage.setItem("theme", t);
    } catch {
      // localStorage unavailable in some private-browsing environments
    }
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
};
