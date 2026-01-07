"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className='w-64 bg-white/10 dark:bg-white/10 text-white p-6 flex flex-col gap-6 border-r border-white/20'>
      <h2 className='text-xl font-bold'>Navigation</h2>

      <nav className='flex flex-col gap-4'>
        <div>
          <h3 className='text-sm font-semibold text-white/60 mb-2 uppercase tracking-wider'>Main</h3>
          <div className='flex flex-col gap-1'>
            <Link
              href='/'
              className={`px-3 py-2 rounded hover:bg-white/20 hover:text-zinc-300 transition-colors ${
                pathname === "/" ? "bg-white/20 text-zinc-300" : ""
              }`}
            >
              Home
            </Link>
            <Link
              href='/harmonic-flow'
              className={`px-3 py-2 rounded hover:bg-white/20 hover:text-zinc-300 transition-colors ${
                pathname === "/harmonic-flow" ? "bg-white/20 text-zinc-300" : ""
              }`}
            >
              Harmonic Flow
            </Link>
          </div>
        </div>

        <div>
          <h3 className='text-sm font-semibold text-white/60 mb-2 uppercase tracking-wider'>Guitar Tools</h3>
          <div className='flex flex-col gap-1'>
            <Link
              href='/fretboard'
              className={`px-3 py-2 rounded hover:bg-white/20 hover:text-zinc-300 transition-colors ${
                pathname === "/fretboard" ? "bg-white/20 text-zinc-300" : ""
              }`}
            >
              Fretboard
            </Link>
            <Link
              href='/chord-progressions'
              className={`px-3 py-2 rounded hover:bg-white/20 hover:text-zinc-300 transition-colors ${
                pathname === "/chord-progressions" ? "bg-white/20 text-zinc-300" : ""
              }`}
            >
              Progressions
            </Link>
            <Link
              href='/chord-shapes'
              className={`px-3 py-2 rounded hover:bg-white/20 hover:text-zinc-300 transition-colors ${
                pathname === "/chord-shapes" ? "bg-white/20 text-zinc-300" : ""
              }`}
            >
              By Shape
            </Link>
            <Link
              href='/silent-metronome'
              className={`px-3 py-2 rounded hover:bg-white/20 hover:text-zinc-300 transition-colors ${
                pathname === "/silent-metronome" ? "bg-white/20 text-zinc-300" : ""
              }`}
            >
              Silent Metronome
            </Link>
            <Link
              href='/settings'
              className={`px-3 py-2 rounded hover:bg-white/20 hover:text-zinc-300 transition-colors ${
                pathname === "/settings" ? "bg-white/20 text-zinc-300" : ""
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
