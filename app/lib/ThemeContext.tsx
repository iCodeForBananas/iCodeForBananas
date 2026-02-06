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
  // Always use light theme
  const [theme] = useState("light");
  const [mounted, setMounted] = useState(false);

  // Set mounted flag after hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Update document to use light theme
  useEffect(() => {
    if (mounted) {
      document.documentElement.setAttribute("data-theme", "light");
    }
  }, [mounted]);

  // No-op functions for compatibility
  const setTheme = (_theme: string) => {
    // Theme is fixed to light mode - parameter ignored
  };

  const toggleTheme = () => {
    // Theme is fixed to light mode
  };

  const value = {
    theme,
    setTheme,
    toggleTheme,
    mounted,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
