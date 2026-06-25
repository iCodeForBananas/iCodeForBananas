"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/app/lib/ThemeContext";

export default function Header() {
  const { theme, toggleTheme, mounted } = useTheme();

  return (
    <header
      className="sticky top-0 z-20 shrink-0 flex items-center justify-end px-3 bg-yellow-400 dark:bg-neutral-900 border-b border-black/10 dark:border-white/5 print:hidden"
      style={{ height: "42px" }}
    >
      {mounted && (
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-lg transition-colors hover:bg-black/10 dark:hover:bg-white/10"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4 text-yellow-400" />
          ) : (
            <Moon className="h-4 w-4 text-black" />
          )}
        </button>
      )}
    </header>
  );
}
