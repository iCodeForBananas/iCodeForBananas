"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const MOBILE_BREAKPOINT = 1024;

// Helper function to check if current window width is below mobile breakpoint
const isMobileDevice = () => window.innerWidth < MOBILE_BREAKPOINT;

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  // Check screen size on mount; sidebar always defaults to open on desktop
  useEffect(() => {
    const mobile = isMobileDevice();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initializing state from window dimensions on mount
    setIsMobile(mobile);
    // Always open on desktop by default; always closed on mobile
    setIsOpen(!mobile);

    // Enable transitions after initial state is resolved
    // Use requestAnimationFrame to ensure the browser has painted the correct initial state
    requestAnimationFrame(() => {
      setHasMounted(true);
    });
  }, []);

  // Handle window resize
  useEffect(() => {
    const checkScreenSize = () => {
      const mobile = isMobileDevice();
      setIsMobile(mobile);
      // Auto-close on mobile/tablet (only if currently open to avoid unnecessary state updates)
      if (mobile) {
        setIsOpen((prev) => (prev ? false : prev));
      }
    };

    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  const toggleSidebar = () => {
    setIsOpen((prev) => !prev);
  };

  return (
    <>
      {/* Toggle Button - Always visible */}
      <button
        onClick={toggleSidebar}
        className={`fixed top-4 z-50 p-2 bg-gradient-to-br from-pink-100 to-orange-100 hover:from-pink-200 hover:to-orange-200 text-gray-900 rounded-md shadow-lg border border-pink-200 ${hasMounted ? "transition-all duration-300" : ""} ${
          isOpen ? "left-[216px]" : "left-4"
        }`}
        aria-label={isOpen ? "Close sidebar" : "Open sidebar"}
      >
        {isOpen ? (
          <svg
            xmlns='http://www.w3.org/2000/svg'
            className='h-5 w-5'
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
          >
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M11 19l-7-7 7-7m8 14l-7-7 7-7' />
          </svg>
        ) : (
          <svg
            xmlns='http://www.w3.org/2000/svg'
            className='h-5 w-5'
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
          >
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M4 6h16M4 12h16M4 18h16' />
          </svg>
        )}
      </button>

      {/* Overlay for mobile when sidebar is open */}
      {isOpen && isMobile && <div className='fixed inset-0 bg-black/50 z-30 lg:hidden' onClick={toggleSidebar} />}

      {/* Sidebar */}
      <aside
        className={`fixed lg:relative h-screen bg-gradient-to-br from-pink-50 to-orange-50 text-gray-900 flex flex-col gap-6 z-40 ${hasMounted ? "transition-all duration-300" : ""} overflow-y-auto ${
          isOpen ? "w-64 translate-x-0 p-6" : "w-0 -translate-x-full lg:w-0 p-0 overflow-hidden"
        }`}
      >
        <div
          className={`${isOpen ? "opacity-100" : "opacity-0"} ${hasMounted ? "transition-opacity duration-200" : ""}`}
        >
          <h2 className='text-xl font-bold whitespace-nowrap'>iCodeForBananas</h2>

          <nav className='flex flex-col gap-4 mt-6'>
            {/* ── Main ──────────────────────────────────────── */}
            <div>
              <div className='flex flex-col gap-1'>
                <Link
                  href='/'
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors whitespace-nowrap ${
                    pathname === "/" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
                  }`}
                >
                  🏠 Home
                </Link>
              </div>
            </div>

            {/* ── Music Theory ──────────────────────────────── */}
            <div>
              <h3 className='text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wider whitespace-nowrap'>
                Music Theory
              </h3>
              <div className='flex flex-col gap-1'>
                <Link
                  href='/circle-of-fifths'
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors whitespace-nowrap ${
                    pathname === "/circle-of-fifths" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
                  }`}
                >
                  Circle of Fifths
                </Link>
                <Link
                  href='/harmonic-flow'
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors whitespace-nowrap ${
                    pathname === "/harmonic-flow" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
                  }`}
                >
                  Harmonic Flow
                </Link>
                <Link
                  href='/chord-progressions'
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors whitespace-nowrap ${
                    pathname === "/chord-progressions" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
                  }`}
                >
                  Chord Progressions
                </Link>
                <Link
                  href='/chord-shapes'
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors whitespace-nowrap ${
                    pathname === "/chord-shapes" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
                  }`}
                >
                  Chord Shapes
                </Link>
                <Link
                  href='/songwriter'
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors whitespace-nowrap ${
                    pathname === "/songwriter" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
                  }`}
                >
                  Songwriter
                </Link>
              </div>
            </div>

            {/* ── Practice ──────────────────────────────────── */}
            <div>
              <h3 className='text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wider whitespace-nowrap'>
                Practice
              </h3>
              <div className='flex flex-col gap-1'>
                <Link
                  href='/fretboard'
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors whitespace-nowrap ${
                    pathname === "/fretboard" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
                  }`}
                >
                  Fretboard Explorer
                </Link>
                <Link
                  href='/fretboard-quiz'
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors whitespace-nowrap ${
                    pathname === "/fretboard-quiz" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
                  }`}
                >
                  Fretboard Quiz
                </Link>
                <Link
                  href='/chord-practice'
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors whitespace-nowrap ${
                    pathname === "/chord-practice" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
                  }`}
                >
                  Chord Practice
                </Link>
                <Link
                  href='/silent-metronome'
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors whitespace-nowrap ${
                    pathname === "/silent-metronome" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
                  }`}
                >
                  Silent Metronome
                </Link>
              </div>
            </div>

            {/* ── Trading ───────────────────────────────────── */}
            <div>
              <h3 className='text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wider whitespace-nowrap'>
                Trading
              </h3>
              <div className='flex flex-col gap-1'>
                <Link
                  href='/trading-chart'
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors whitespace-nowrap ${
                    pathname === "/trading-chart" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
                  }`}
                >
                  Momentum Chart
                </Link>
                <Link
                  href='/algo-backtest'
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors whitespace-nowrap ${
                    pathname === "/algo-backtest" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
                  }`}
                >
                  Algo Backtest
                </Link>
              </div>
            </div>

            {/* ── Personal ──────────────────────────────────── */}
            <div>
              <h3 className='text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wider whitespace-nowrap'>
                Personal
              </h3>
              <div className='flex flex-col gap-1'>
                <Link
                  href='/fire-estimator'
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors whitespace-nowrap ${
                    pathname === "/fire-estimator" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
                  }`}
                >
                  FIRE Estimator
                </Link>
                <Link
                  href='/workout-tracker'
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors whitespace-nowrap ${
                    pathname === "/workout-tracker" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
                  }`}
                >
                  Workout Tracker
                </Link>
              </div>
            </div>

            {/* ── Labs ──────────────────────────────────────── */}
            <div>
              <h3 className='text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wider whitespace-nowrap'>
                Labs
              </h3>
              <div className='flex flex-col gap-1'>
                <Link
                  href='/cloud-architect'
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors whitespace-nowrap ${
                    pathname === "/cloud-architect" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
                  }`}
                >
                  Cloud Architect
                </Link>
                <Link
                  href='/ascii-player'
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors whitespace-nowrap ${
                    pathname === "/ascii-player" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
                  }`}
                >
                  ASCII Player
                </Link>
                <Link
                  href='/spd-crime-density'
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors whitespace-nowrap ${
                    pathname === "/spd-crime-density" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
                  }`}
                >
                  SPD Crime Density
                </Link>
              </div>
            </div>
          </nav>
        </div>
      </aside>
    </>
  );
}
