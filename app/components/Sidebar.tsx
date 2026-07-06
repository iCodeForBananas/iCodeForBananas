"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { LogIn, LogOut, Moon, Sun } from "lucide-react";
import { useAuth } from "@/app/hooks/useAuth";
import { useTheme } from "@/app/lib/ThemeContext";

const MOBILE_BREAKPOINT = 1024;
const isMobileDevice = () => window.innerWidth < MOBILE_BREAKPOINT;
const SIDEBAR_OPEN_KEY = "sidebar-open";

type Category = "Music" | "Tools" | "Education" | "Experiments";

const CATEGORIES: Category[] = ["Music", "Tools", "Education", "Experiments"];

const LINKS: { href: string; text: string; category: Category; auth?: boolean }[] = [
  // Music
  { href: "/chord-explorer", text: "Chord Explorer", category: "Music" },
  { href: "/chord-finder", text: "Chord Finder", category: "Music" },
  { href: "/chord-positions", text: "Chord Positions", category: "Music" },
  { href: "/circle-of-fifths", text: "Circle of Fifths", category: "Music" },
  { href: "/fretboard-quiz", text: "Fretboard Quiz", category: "Music" },
  { href: "/lead-sheet-editor", text: "Lead Sheet Editor", category: "Music" },
  { href: "/scale-tool", text: "Scale Tool", category: "Music" },
  // Tools
  { href: "/algo-backtest", text: "Algo Backtest", category: "Tools" },
  { href: "/fire-estimator", text: "FIRE Estimator", category: "Tools" },
  { href: "/mermaid-flow", text: "Mermaid Flow", category: "Tools" },
  { href: "/paper-trading", text: "Paper Trading", category: "Tools" },
  { href: "/task-board", text: "Task Board", category: "Tools" },
  { href: "/leaderboard", text: "Trading Leaderboard", category: "Tools" },
  { href: "/wordsmith", text: "Wordsmith", category: "Tools" },
  { href: "/workout-tracker", text: "Workout Tracker", category: "Tools" },
  // Education
  { href: "/decode-dash", text: "Decode Dash", category: "Education" },
  { href: "/learning-progress", text: "Learning Progress", category: "Education" },
  { href: "/space-math", text: "Space Math", category: "Education" },
  // Experiments
  { href: "/aaron-futures", text: "Aaron Futures", category: "Experiments" },
  { href: "/territory", text: "Territory", category: "Experiments", auth: true },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const mobile = isMobileDevice();
    setIsMobile(mobile);
    // Mobile always starts closed regardless of stored preference (avoids
    // the sidebar covering content on a phone). Desktop restores from
    // localStorage, defaulting to open on first visit.
    if (mobile) {
      setIsOpen(false);
    } else {
      const stored = localStorage.getItem(SIDEBAR_OPEN_KEY);
      setIsOpen(stored === null ? true : stored === "true");
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    const checkScreenSize = () => {
      const mobile = isMobileDevice();
      setIsMobile(mobile);
      if (mobile) setIsOpen((prev) => (prev ? false : prev));
    };
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  const toggle = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (!isMobileDevice()) {
        try {
          localStorage.setItem(SIDEBAR_OPEN_KEY, String(next));
        } catch {
          // localStorage may be disabled (private mode); fall back to in-memory state.
        }
      }
      window.dispatchEvent(new CustomEvent("sidebar-toggle", { detail: { isOpen: next } }));
      return next;
    });
  };

  const handleLinkClick = () => {
    if (isMobile) setIsOpen(false);
  };

  if (pathname.startsWith("/lead-sheet-editor/share/")) return null;

  const navLinkStyle = (href: string) =>
    pathname === href ? { background: "#000000", color: "#ffffff" } : { color: "#000000" };

  const renderLink = (href: string, text: string) => (
    <Link
      key={href}
      href={href}
      onClick={handleLinkClick}
      className='px-3 py-2 rounded whitespace-nowrap transition-colors font-medium text-sm'
      style={navLinkStyle(href)}
      onMouseEnter={(e) => {
        if (pathname !== href) {
          e.currentTarget.style.background = "#000000";
          e.currentTarget.style.color = "#ffffff";
        }
      }}
      onMouseLeave={(e) => {
        if (pathname !== href) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "#000000";
        }
      }}
    >
      {text}
    </Link>
  );

  return (
    <>
      {!isOpen && (
        <button
          onClick={toggle}
          className='fixed top-0 left-0 z-[60] px-3 flex items-center print:hidden'
          style={{
            height: "42px",
            background: "#facc15",
            color: "#000000",
            border: "none",
          }}
          aria-label='Open sidebar'
        >
          <svg
            xmlns='http://www.w3.org/2000/svg'
            className='h-5 w-5'
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
          >
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M4 6h16M4 12h16M4 18h16' />
          </svg>
        </button>
      )}

      {isOpen && isMobile && <div className='fixed inset-0 bg-black/50 z-30 lg:hidden print:hidden' onClick={toggle} />}

      <aside
        className={`fixed lg:relative h-screen flex flex-col z-40 print:hidden ${isOpen ? "w-64 translate-x-0" : "w-0 -translate-x-full lg:w-0 overflow-hidden"}`}
        style={{
          background: "#facc15",
          color: "var(--bg-secondary)",
        }}
      >
        <button
          onClick={toggle}
          className={`w-full flex items-center justify-center shrink-0 ${isOpen ? "opacity-100" : "opacity-0"}`}
          style={{
            height: "42px",
            background: "#facc15",
            color: "#000000",
            border: "none",
          }}
          aria-label='Close sidebar'
        >
          <svg
            xmlns='http://www.w3.org/2000/svg'
            className='h-5 w-5'
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
          >
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M4 6h16M4 12h16M4 18h16' />
          </svg>
        </button>

        <div className={`flex-1 p-6 overflow-y-auto ${isOpen ? "opacity-100" : "opacity-0"}`}>
          <Link
            href='/'
            className='font-black uppercase mb-3 block w-full'
            style={{ color: "#000000", fontSize: "1rem", letterSpacing: "0.18em" }}
          >
            iCodeForBananas
          </Link>

          <div className='flex gap-2 mt-1 mb-1'>
            {mounted && (
              <button
                onClick={toggleTheme}
                className='rounded p-2 transition-colors'
                style={{ border: "1px solid #373A40", color: "#F8F9FA", background: "#1A1B1E" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#facc15";
                  e.currentTarget.style.color = "#1A1B1E";
                  e.currentTarget.style.borderColor = "#facc15";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#1A1B1E";
                  e.currentTarget.style.color = "#F8F9FA";
                  e.currentTarget.style.borderColor = "#373A40";
                }}
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? <Sun className='h-4 w-4' /> : <Moon className='h-4 w-4' />}
              </button>
            )}
            {user ? (
              <button
                onClick={signOut}
                className='rounded p-2 transition-colors'
                style={{ border: "1px solid #373A40", color: "#F8F9FA", background: "#1A1B1E" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#facc15";
                  e.currentTarget.style.color = "#1A1B1E";
                  e.currentTarget.style.borderColor = "#facc15";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#1A1B1E";
                  e.currentTarget.style.color = "#F8F9FA";
                  e.currentTarget.style.borderColor = "#373A40";
                }}
                aria-label='Sign out'
              >
                <LogOut className='h-4 w-4' />
              </button>
            ) : (
              <Link
                href='/login'
                className='rounded p-2 transition-colors inline-flex items-center justify-center'
                style={{ border: "1px solid #373A40", color: "#F8F9FA", background: "#1A1B1E" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#facc15";
                  e.currentTarget.style.color = "#1A1B1E";
                  e.currentTarget.style.borderColor = "#facc15";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#1A1B1E";
                  e.currentTarget.style.color = "#F8F9FA";
                  e.currentTarget.style.borderColor = "#373A40";
                }}
                aria-label='Sign in'
              >
                <LogIn className='h-4 w-4' />
              </Link>
            )}
          </div>

          <nav className='flex flex-col gap-5 mt-6'>
            {CATEGORIES.map((category) => {
              const items = LINKS.filter(
                (link) => link.category === category && (!link.auth || !!user)
              );
              if (items.length === 0) return null;
              return (
                <div key={category} className='flex flex-col gap-1'>
                  <p
                    className='px-3 mb-1 text-[11px] font-bold uppercase tracking-wider'
                    style={{ color: "rgba(0, 0, 0, 0.45)" }}
                  >
                    {category}
                  </p>
                  {items.map(({ href, text }) => renderLink(href, text))}
                </div>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
}
