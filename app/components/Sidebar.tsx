"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useAuth } from "@/app/hooks/useAuth";

const MOBILE_BREAKPOINT = 1024;
const isMobileDevice = () => window.innerWidth < MOBILE_BREAKPOINT;

const NAV = [
  {
    label: "Music Theory",
    links: [
      { href: "/circle-of-fifths", text: "Circle of Fifths" },
      { href: "/harmonic-flow", text: "Harmonic Flow" },
      { href: "/chord-progressions", text: "Chord Progressions" },
      { href: "/chord-shapes", text: "Chord Shapes" },
      { href: "/chord-voicings", text: "Chord Voicings" },
      { href: "/chord-finder", text: "Chord Finder" },
      { href: "/chord-inversions", text: "Chord Inversions" },
    ],
  },
  {
    label: "Practice",
    links: [
      { href: "/fretboard", text: "Fretboard Explorer" },
      { href: "/fretboard-quiz", text: "Fretboard Quiz" },
    ],
  },
  {
    label: "Trading",
    links: [{ href: "/algo-backtest", text: "Algo Backtest" }],
  },
  {
    label: "Personal",
    links: [
      { href: "/fire-estimator", text: "FIRE Estimator" },
      { href: "/workout-tracker", text: "Workout Tracker" },
    ],
  },
  {
    label: "Misc",
    links: [
      { href: "/wordsmith", text: "Wordsmith" },
    ],
  },
  {
    label: "Learning Games",
    links: [
      { href: "/space-math", text: "Space Math" },
      { href: "/brainy-bloom", text: "Brainy Bloom" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const { user, signOut } = useAuth();

  useEffect(() => {
    const mobile = isMobileDevice();
    setIsMobile(mobile);
    setIsOpen(!mobile);
    requestAnimationFrame(() => setHasMounted(true));
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

  const toggle = () => setIsOpen((prev) => !prev);

  return (
    <>
      {!isOpen && (
        <button
          onClick={toggle}
          className='fixed top-0 left-0 z-50 px-3 flex items-center'
          style={{
            height: "42px",
            background: "rgba(37, 38, 43, 0.8)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            color: "#F8F9FA",
            border: "none",
            borderBottom: "1px solid #373A40",
            borderRight: "1px solid #373A40",
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

      {isOpen && isMobile && <div className='fixed inset-0 bg-black/70 z-30 lg:hidden' onClick={toggle} />}

      <aside
        className={`fixed lg:relative h-screen flex flex-col z-40 ${hasMounted ? "transition-all duration-300" : ""} ${isOpen ? "w-64 translate-x-0" : "w-0 -translate-x-full lg:w-0 overflow-hidden"}`}
        style={{
          background: "rgba(37, 38, 43, 0.8)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          borderRight: "1px solid #373A40",
        }}
      >
        <button
          onClick={toggle}
          className={`w-full flex items-center justify-center py-2 shrink-0 ${hasMounted ? "transition-opacity duration-200" : ""} ${isOpen ? "opacity-100" : "opacity-0"}`}
          style={{
            background: "rgba(37, 38, 43, 0.8)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            color: "#F8F9FA",
            borderBottom: "1px solid #373A40",
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

        <div
          className={`flex-1 overflow-y-auto p-6 ${hasMounted ? "transition-opacity duration-200" : ""} ${isOpen ? "opacity-100" : "opacity-0"}`}
        >
          <Link
            href='/'
            className='text-xl font-black uppercase tracking-widest mb-3 overflow-hidden text-ellipsis whitespace-nowrap block'
            style={{ color: "#F8F9FA" }}
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
            {NAV.map((section) => (
              <div key={section.label ?? "main"}>
                {section.label && (
                  <h3
                    className='text-xs font-bold mb-2 uppercase tracking-wider whitespace-nowrap'
                    style={{ color: "#909296" }}
                  >
                    {section.label}
                  </h3>
                )}
                <div className='flex flex-col gap-1'>
                  {section.links.map(({ href, text }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => isMobile && setIsOpen(false)}
                      className='px-3 py-2 rounded whitespace-nowrap transition-colors font-medium text-sm'
                      style={
                        pathname === href
                          ? {
                              background: "#facc15",
                              color: "#0a0a0a",
                              fontWeight: 700,
                              borderLeft: "2px solid #facc15",
                              boxShadow: "0 0 10px rgba(250,204,21,0.2)",
                            }
                          : { color: "#F8F9FA" }
                      }
                      onMouseEnter={(e) => {
                        if (pathname !== href) {
                          e.currentTarget.style.background = "rgba(250,204,21,0.15)";
                          e.currentTarget.style.color = "#facc15";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (pathname !== href) {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "#F8F9FA";
                        }
                      }}
                    >
                      {text}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>
      </aside>
    </>
  );
}
