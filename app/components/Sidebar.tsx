"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { LogIn, LogOut, Moon, Sun } from "lucide-react";
import { useAuth } from "@/app/hooks/useAuth";
import { useTheme } from "@/app/lib/ThemeContext";
import { Button, buttonVariants } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";

const MOBILE_BREAKPOINT = 1024;
const isMobileDevice = () => window.innerWidth < MOBILE_BREAKPOINT;
const SIDEBAR_OPEN_KEY = "sidebar-open";

export type Category = "Music" | "Tools" | "Education" | "Experiments";

const CATEGORIES: Category[] = ["Music", "Tools", "Education", "Experiments"];

export const LINKS: { href: string; text: string; category: Category; auth?: boolean; abbr?: string }[] = [
  // Music
  { href: "/chord-explorer", text: "Chord Explorer", category: "Music", abbr: "CE" },
  { href: "/fretboard-quiz", text: "Fretboard Quiz", category: "Music" },
  { href: "/lead-sheet-editor", text: "Lead Sheet Editor", category: "Music", abbr: "LS" },
  // Tools
  { href: "/workout-tracker", text: "Workout Tracker", category: "Tools" },
  // Education
  { href: "/learning-progress", text: "Learning Progress", category: "Education", abbr: "LP" },
  { href: "/space-math", text: "Space Math", category: "Education", abbr: "SP" },
  // Experiments
  { href: "/shoot-simulator", text: "Shoot Simulator", category: "Experiments", abbr: "SS" },
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

  /**
   * Hover used to be four inline style writes per link, which is why the whole
   * sidebar named its own colours: a :hover rule cannot be written inline.
   * With the tokens it is one class list, and the active state is the primary
   * fill with the near-black label the amber rule requires.
   */
  const navLinkClass = (href: string) =>
    cn(
      "transition-colors duration-120 ease-ui motion-reduce:transition-none",
      "focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
      pathname === href
        ? "bg-primary-solid text-ink-on-primary"
        : "text-ink-muted hover:bg-surface-overlay hover:text-ink-primary"
    );

  const renderLink = (href: string, text: string) => (
    <Link
      key={href}
      href={href}
      onClick={handleLinkClick}
      className={cn("px-3 py-2 whitespace-nowrap text-13 font-medium", navLinkClass(href))}
    >
      {text}
    </Link>
  );

  const renderRailLink = (href: string, text: string, abbr?: string) => (
    <Link
      key={href}
      href={href}
      onClick={handleLinkClick}
      title={text}
      aria-label={text}
      className={cn(
        "h-10 w-full flex items-center justify-center text-12 font-semibold",
        navLinkClass(href)
      )}
    >
      {abbr ?? text[0].toUpperCase()}
    </Link>
  );

  const widthClass = isOpen ? "w-64 translate-x-0" : isMobile ? "w-0 -translate-x-full overflow-hidden" : "w-12 translate-x-0";

  return (
    <>
      {!isOpen && isMobile && (
        <button
          onClick={toggle}
          className={cn(
            "fixed top-0 left-0 z-[60] h-[42px] px-3 flex items-center print:hidden",
            "border-b border-r border-line-subtle bg-surface-raised text-ink-primary",
            "hover:bg-surface-overlay transition-colors duration-120 ease-ui",
            "focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
          )}
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

      {isOpen && isMobile && (
        <div
          className='fixed inset-0 z-30 bg-surface-sunken/70 lg:hidden print:hidden'
          onClick={toggle}
        />
      )}

      {/* The rail is one step behind the content it navigates, not in front of
          it: raised is the card plane, and a sidebar that shouted louder than
          the page was what the full-bleed yellow was doing before. */}
      <aside
        className={cn(
          "fixed lg:relative h-screen flex flex-col z-40 print:hidden",
          "border-r border-line-subtle bg-surface-sunken text-ink-primary",
          "transition-[width] duration-200 ease-ui motion-reduce:transition-none",
          widthClass
        )}
      >
        <button
          onClick={toggle}
          className={cn(
            "h-[42px] w-full flex items-center justify-center shrink-0",
            "border-b border-line-subtle text-ink-muted",
            "hover:bg-surface-overlay hover:text-ink-primary",
            "transition-colors duration-120 ease-ui motion-reduce:transition-none",
            "focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
          )}
          aria-label={isOpen ? "Close sidebar" : "Open sidebar"}
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

        {!isOpen && !isMobile && (
          <nav className='flex-1 overflow-y-auto flex flex-col'>
            {CATEGORIES.map((category, idx) => {
              const items = LINKS.filter((link) => link.category === category && (!link.auth || !!user));
              if (items.length === 0) return null;
              return (
                <div key={category} className='flex flex-col'>
                  {idx !== 0 && <div className='border-t border-line-subtle' />}
                  {items.map(({ href, text, abbr }) => renderRailLink(href, text, abbr))}
                </div>
              );
            })}
          </nav>
        )}

        {isOpen && (
          <div className='flex-1 p-6 overflow-y-auto'>
          <Link
            href='/'
            className={cn(
              "mb-3 block w-full font-display text-16 font-semibold uppercase text-primary-text",
              "tracking-[0.18em]",
              "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            )}
          >
            iCodeForBananas
          </Link>

          <div className='flex gap-2 mt-1 mb-1'>
            {mounted && (
              <Button
                variant='secondary'
                size='icon'
                onClick={toggleTheme}
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? <Sun className='h-4 w-4' /> : <Moon className='h-4 w-4' />}
              </Button>
            )}
            {user ? (
              <Button variant='secondary' size='icon' onClick={signOut} aria-label='Sign out'>
                <LogOut className='h-4 w-4' />
              </Button>
            ) : (
              <Link
                href='/login'
                className={cn(buttonVariants({ variant: "secondary", size: "icon" }))}
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
                <div key={category} className='flex flex-col'>
                  <p className='px-3 mb-1 text-10 font-semibold uppercase tracking-wider text-ink-muted'>
                    {category}
                  </p>
                  {items.map(({ href, text }) => renderLink(href, text))}
                </div>
              );
            })}
          </nav>
          </div>
        )}
      </aside>
    </>
  );
}
