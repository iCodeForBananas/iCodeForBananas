"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const MOBILE_BREAKPOINT = 1024;
const isMobileDevice = () => window.innerWidth < MOBILE_BREAKPOINT;

const NAV = [
  {
    label: null,
    links: [{ href: "/", text: "🏠 Home" }],
  },
  {
    label: "Music Theory",
    links: [
      { href: "/circle-of-fifths", text: "Circle of Fifths" },
      { href: "/harmonic-flow", text: "Harmonic Flow" },
      { href: "/chord-progressions", text: "Chord Progressions" },
      { href: "/chord-shapes", text: "Chord Shapes" },
      { href: "/note-shapes", text: "Note Shapes" },
      { href: "/chord-finder", text: "Chord Finder" },
      { href: "/songwriter", text: "Songwriter" },
    ],
  },
  {
    label: "Practice",
    links: [
      { href: "/fretboard", text: "Fretboard Explorer" },
      { href: "/fretboard-quiz", text: "Fretboard Quiz" },
      { href: "/chord-practice", text: "Chord Practice" },
      { href: "/silent-metronome", text: "Silent Metronome" },
    ],
  },
  {
    label: "Trading",
    links: [
      { href: "/trading-chart", text: "Momentum Chart" },
      { href: "/algo-backtest", text: "Algo Backtest" },
    ],
  },
  {
    label: "Personal",
    links: [
      { href: "/fire-estimator", text: "FIRE Estimator" },
      { href: "/workout-tracker", text: "Workout Tracker" },
    ],
  },
  {
    label: "City",
    links: [{ href: "/whats-happening-today", text: "📅 What's Happening Today?" }],
  },
  {
    label: "Labs",
    links: [
      { href: "/aws-quiz", text: "AWS CCP Quiz" },
      { href: "/cloud-architect", text: "Cloud Architect" },
      { href: "/ascii-player", text: "ASCII Player" },
      { href: "/spd-crime-density", text: "SPD Crime Density" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

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
      <button
        onClick={toggle}
        className={`fixed top-4 z-50 p-2 bg-yellow-400 hover:bg-yellow-300 text-black rounded-md shadow-lg border-2 border-black ${hasMounted ? "transition-all duration-300" : ""} ${isOpen ? "left-[216px]" : "left-4"}`}
        aria-label={isOpen ? "Close sidebar" : "Open sidebar"}
      >
        {isOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {isOpen && isMobile && <div className="fixed inset-0 bg-black/70 z-30 lg:hidden" onClick={toggle} />}

      <aside
        className={`fixed lg:relative h-screen bg-black text-yellow-400 flex flex-col gap-6 z-40 border-r-2 border-yellow-400 ${hasMounted ? "transition-all duration-300" : ""} overflow-y-auto ${isOpen ? "w-64 translate-x-0 p-6" : "w-0 -translate-x-full lg:w-0 p-0 overflow-hidden"}`}
      >
        <div className={`${isOpen ? "opacity-100" : "opacity-0"} ${hasMounted ? "transition-opacity duration-200" : ""}`}>
          <h2 className="text-xl font-black whitespace-nowrap uppercase tracking-widest text-yellow-400">
            iCodeForBananas
          </h2>

          <nav className="flex flex-col gap-4 mt-6">
            {NAV.map((section) => (
              <div key={section.label ?? "main"}>
                {section.label && (
                  <h3 className="text-xs font-bold text-yellow-600 mb-2 uppercase tracking-wider whitespace-nowrap">
                    {section.label}
                  </h3>
                )}
                <div className="flex flex-col gap-1">
                  {section.links.map(({ href, text }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => isMobile && setIsOpen(false)}
                      className={`px-3 py-2 rounded whitespace-nowrap transition-colors font-medium text-sm ${
                        pathname === href
                          ? "bg-yellow-400 text-black font-bold"
                          : "text-yellow-400 hover:bg-yellow-400 hover:text-black"
                      }`}
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
