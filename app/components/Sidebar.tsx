"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className='w-52 bg-white/10 dark:bg-white/10 text-white p-6 flex flex-col gap-4 border-r border-white/20'>
      <h2 className='text-xl font-bold'>Sidebar</h2>
      <nav className='flex flex-col gap-2'>
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
      </nav>
    </aside>
  );
}
