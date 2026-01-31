"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className='w-64 bg-gradient-to-br from-pink-50 to-orange-50 text-gray-900 p-6 flex flex-col gap-6 border-r border-pink-200'>
      <h2 className='text-xl font-bold'>iCodeForBananas</h2>

      <nav className='flex flex-col gap-4'>
        <div>
          <h3 className='text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wider'>Main</h3>
          <div className='flex flex-col gap-1'>
            <Link
              href='/'
              className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors ${
                pathname === "/" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
              }`}
            >
              Home
            </Link>
          </div>
        </div>

        <div>
          <h3 className='text-sm font-semibold text-gray-600 mb-2 uppercase tracking-wider'>Guitar Tools</h3>
          <div className='flex flex-col gap-1'>
            <Link
              href='/fretboard'
              className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors ${
                pathname === "/fretboard" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
              }`}
            >
              Fretboard
            </Link>
            <Link
              href='/chord-progressions'
              className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors ${
                pathname === "/chord-progressions" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
              }`}
            >
              Progressions
            </Link>
            <Link
              href='/chord-shapes'
              className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors ${
                pathname === "/chord-shapes" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
              }`}
            >
              By Shape
            </Link>
            <Link
              href='/silent-metronome'
              className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors ${
                pathname === "/silent-metronome" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
              }`}
            >
              Silent Metronome
            </Link>
            <Link
              href='/harmonic-flow'
              className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors ${
                pathname === "/harmonic-flow" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
              }`}
            >
              Harmonic Flow
            </Link>
            <Link
              href='/circle-of-fifths'
              className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors ${
                pathname === "/circle-of-fifths" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
              }`}
            >
              Circle of Fifths
            </Link>
            <Link
              href='/songwriter'
              className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors ${
                pathname === "/songwriter" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
              }`}
            >
              Songwriter
            </Link>
            <Link
              href='/settings'
              className={`px-3 py-2 rounded hover:bg-pink-100 hover:text-gray-900 transition-colors ${
                pathname === "/settings" ? "bg-pink-100 text-gray-900 font-semibold" : "text-gray-700"
              }`}
            >
              Settings
            </Link>
          </div>
        </div>
      </nav>
    </aside>
  );
}
