"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

interface ThemeContextType {
  theme: string;
  setTheme: (theme: string) => void;
  toggleTheme: () => void;
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("guitar-fretboard-theme");
      const validThemes = ["light", "dark"];
      if (savedTheme && validThemes.includes(savedTheme)) {
        return savedTheme;
      }
      const systemPrefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
      return systemPrefersLight ? "light" : "dark";
    }
    return "dark";
  });
  const [mounted, setMounted] = useState(false);

  // Set mounted flag after hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Save theme to localStorage and update document
  useEffect(() => {
    if (mounted) {
      localStorage.setItem("guitar-fretboard-theme", theme);
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme, mounted]);

  const toggleTheme = () => {
    setTheme((prevTheme) => {
      const order = ["light", "dark"];
      const idx = order.indexOf(prevTheme);
      return order[(idx + 1) % order.length];
    });
  };

  const value = {
    theme,
    setTheme,
    toggleTheme,
    mounted,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
