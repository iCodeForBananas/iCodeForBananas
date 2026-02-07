"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const MOBILE_BREAKPOINT = 1024;
const SIDEBAR_STATE_KEY = "sidebarOpen";

// Helper function to check if current window width is below mobile breakpoint
const isMobileDevice = () => window.innerWidth < MOBILE_BREAKPOINT;

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Load sidebar state from localStorage and check screen size on mount
  useEffect(() => {
    let shouldBeOpen = true; // Default state
    
    try {
      const savedState = localStorage.getItem(SIDEBAR_STATE_KEY);
      if (savedState !== null) {
        shouldBeOpen = savedState === "true";
      }
    } catch (error) {
      // localStorage not available, use default state
      console.warn("Failed to load sidebar state from localStorage:", error);
    }
    
    // On mobile, always start closed regardless of saved state
    const mobile = isMobileDevice();
    setIsMobile(mobile);
    setIsOpen(mobile ? false : shouldBeOpen);
  }, []);

  // Handle window resize
  useEffect(() => {
    const checkScreenSize = () => {
      const mobile = isMobileDevice();
      setIsMobile(mobile);
      // Auto-close on mobile/tablet (only if currently open to avoid unnecessary state updates)
      if (mobile) {
        setIsOpen((prev) => prev ? false : prev);
      }
    };

    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  const toggleSidebar = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    try {
      localStorage.setItem(SIDEBAR_STATE_KEY, String(newState));
    } catch (error) {
      // localStorage not available, state will reset on page reload
      console.warn("Failed to save sidebar state to localStorage:", error);
    }
  };

  return (
    <>
      {/* Toggle Button - Always visible */}
      <button
        onClick={toggleSidebar}
        className={`fixed top-4 z-50 p-2 bg-gradient-to-br from-pink-100 to-orange-100 hover:from-pink-200 hover:to-orange-200 text-gray-900 rounded-md shadow-lg border border-pink-200 transition-all duration-300 ${
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
        className={`fixed lg:relative h-screen bg-gradient-to-br from-pink-50 to-orange-50 text-gray-900 p-6 flex flex-col gap-6 border-r border-pink-200 z-40 transition-all duration-300 overflow-y-auto ${
          isOpen ? "w-64 translate-x-0" : "w-0 -translate-x-full lg:w-0 p-0 overflow-hidden"
        }`}
      >
        <div className={`${isOpen ? "opacity-100" : "opacity-0"} transition-opacity duration-200`}>
          <h2 className='text-xl font-bold whitespace-nowrap'>iCodeForBananas</h2>

          <nav className='flex flex-col gap-4 mt-6'>
            <div>
              <h3 className='text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wider whitespace-nowrap'>
                Main
              </h3>
              <div className='flex flex-col gap-1'>
                <Link
                  href='/'
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors whitespace-nowrap ${
                    pathname === "/" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
                  }`}
                >
                  Home
                </Link>
              </div>
            </div>

            <div>
              <h3 className='text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wider whitespace-nowrap'>
                Guitar Tools
              </h3>
              <div className='flex flex-col gap-1'>
                <Link
                  href='/fretboard'
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors whitespace-nowrap ${
                    pathname === "/fretboard" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
                  }`}
                >
                  Fretboard
                </Link>
                <Link
                  href='/fretboard-quiz'
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors whitespace-nowrap ${
                    pathname === "/fretboard-quiz" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
                  }`}
                >
                  Fret Board Quiz
                </Link>
                <Link
                  href='/chord-progressions'
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors whitespace-nowrap ${
                    pathname === "/chord-progressions" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
                  }`}
                >
                  Progressions
                </Link>
                <Link
                  href='/chord-shapes'
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors whitespace-nowrap ${
                    pathname === "/chord-shapes" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
                  }`}
                >
                  By Shape
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
                  href='/circle-of-fifths'
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors whitespace-nowrap ${
                    pathname === "/circle-of-fifths" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
                  }`}
                >
                  Circle of Fifths
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
                  Time-Series Momentum
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
          </nav>
        </div>
      </aside>
    </>
  );
}
