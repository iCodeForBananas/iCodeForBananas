"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useAuth } from "@/app/hooks/useAuth";

const MOBILE_BREAKPOINT = 1024;
const isMobileDevice = () => window.innerWidth < MOBILE_BREAKPOINT;
const SIDEBAR_OPEN_KEY = "sidebar-open";
const CLICK_COUNTS_KEY = "sidebarClickCounts";

const LINKS: { href: string; text: string; auth?: boolean }[] = [
  { href: "/circle-of-fifths", text: "Circle of Fifths" },
  { href: "/chord-explorer", text: "Chord Explorer" },
  { href: "/chord-finder", text: "Chord Finder" },
  { href: "/chord-positions", text: "Chord Positions" },
  { href: "/scale-tool", text: "Scale Tool" },
  { href: "/fretboard-quiz", text: "Fretboard Quiz" },
  { href: "/lead-sheet-editor", text: "Lead Sheet Editor" },
  { href: "/space-math", text: "Space Math" },
  { href: "/decode-dash", text: "Decode Dash" },
  { href: "/learning-progress", text: "Learning Progress" },
  { href: "/task-board", text: "Task Board" },
  { href: "/mermaid-flow", text: "Mermaid Flow" },
  { href: "/aaron-futures", text: "Aaron Futures" },
  { href: "/workout-tracker", text: "Workout Tracker" },
  { href: "/wordsmith", text: "Wordsmith" },
  { href: "/algo-backtest", text: "Algo Backtest" },
  { href: "/paper-trading", text: "Paper Trading" },
  { href: "/leaderboard", text: "Trading Leaderboard" },
  { href: "/fire-estimator", text: "FIRE Estimator" },
];

function readClickCounts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(CLICK_COUNTS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeClickCounts(counts: Record<string, number>) {
  try {
    localStorage.setItem(CLICK_COUNTS_KEY, JSON.stringify(counts));
  } catch {
    // localStorage may be disabled (private mode)
  }
}

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const { user, signOut } = useAuth();
  const [clickCounts, setClickCounts] = useState<Record<string, number>>({});
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
    setClickCounts(readClickCounts());
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

  const handleLinkClick = (href: string) => {
    setClickCounts((prev) => {
      const next = { ...prev, [href]: (prev[href] ?? 0) + 1 };
      writeClickCounts(next);
      return next;
    });
    if (isMobile) setIsOpen(false);
  };

  // Top-5 by click count, client-only to avoid SSR/hydration mismatch.
  const topLinks = mounted
    ? LINKS.filter(({ href, auth }) => (clickCounts[href] ?? 0) > 0 && (!auth || !!user))
        .sort((a, b) => (clickCounts[b.href] ?? 0) - (clickCounts[a.href] ?? 0))
        .slice(0, 5)
    : [];

  if (pathname.startsWith("/lead-sheet-editor/share/")) return null;

  const navLinkStyle = (href: string) =>
    pathname === href ? { background: "#000000", color: "#ffffff" } : { color: "#000000" };

  const renderLink = (href: string, text: string, keyPrefix: string) => (
    <Link
      key={keyPrefix + href}
      href={href}
      onClick={() => handleLinkClick(href)}
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

          {user ? (
            <button
              onClick={signOut}
              className='w-full text-sm font-semibold rounded px-3 py-2 mt-1 mb-1 whitespace-nowrap transition-colors'
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
            >
              Sign Out
            </button>
          ) : (
            <Link
              href='/login'
              className='w-full text-sm font-semibold rounded px-3 py-2 mt-1 mb-1 whitespace-nowrap transition-colors block text-center'
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
            >
              Sign In
            </Link>
          )}

          <nav className='flex flex-col gap-4 mt-6'>
            {topLinks.length > 0 && (
              <div>
                <h3
                  className='text-xs font-bold mb-2 uppercase tracking-wider whitespace-nowrap'
                  style={{ color: "#000000" }}
                >
                  Recently Used
                </h3>
                <div className='flex flex-col gap-1'>
                  {topLinks.map(({ href, text }) => renderLink(href, text, "recent-"))}
                </div>
              </div>
            )}

            <div className='flex flex-col gap-1'>
              {LINKS.filter(({ auth }) => !auth || !!user).map(({ href, text }) =>
                renderLink(href, text, "all-")
              )}
            </div>
          </nav>
        </div>
      </aside>
    </>
  );
}
