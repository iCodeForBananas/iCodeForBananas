"use client";

import Link from "next/link";
import { Fragment, useCallback, useState } from "react";
import { useAuth } from "@/app/hooks/useAuth";
import { LINKS } from "./components/Sidebar";

// Tablet+ breakpoint (sm and up) uses this many columns. Keeping it odd,
// and padding the tile count to an odd multiple of it, guarantees a single
// true center cell where the banana lands.
const GRID_COLUMNS = 5;

function computeBananaLayout(toolCount: number, columns: number) {
  let rows = 1;
  while (columns * rows < toolCount + 1) rows += 2;
  const total = columns * rows;
  const bananaIndex = (total - 1) / 2;
  const spacerCount = total - 1 - toolCount;
  return { bananaIndex, spacerCount };
}

export default function Home() {
  const { user } = useAuth();
  const [tappedHref, setTappedHref] = useState<string | null>(null);

  const tools = LINKS.filter((link) => !link.auth || !!user);
  const { bananaIndex, spacerCount } = computeBananaLayout(tools.length, GRID_COLUMNS);

  const handleTap = useCallback((href: string) => {
    setTappedHref(href);
    window.setTimeout(() => {
      setTappedHref((prev) => (prev === href ? null : prev));
    }, 300);
  }, []);

  return (
    <main className='relative h-screen w-full bg-yellow-400 overflow-hidden'>
      <div
        className='absolute inset-0'
        aria-hidden='true'
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.12) 1px, transparent 1px), linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)",
          backgroundSize: "80px 80px, 80px 80px, 16px 16px, 16px 16px",
        }}
      />
      <div className='relative grid grid-cols-3 sm:grid-cols-5 auto-rows-fr h-full w-full gap-2'>
        {tools.map(({ href, text }, index) => (
          <Fragment key={href}>
            {index === bananaIndex && (
              <div
                className='w-full h-full flex items-center justify-center text-center select-none text-6xl sm:text-7xl leading-none'
                aria-hidden='true'
              >
                🍌
              </div>
            )}
            <Link
              href={href}
              onClick={() => handleTap(href)}
              className={`w-full h-full flex items-center justify-center text-center rounded-none bg-black/50 backdrop-blur-sm border border-yellow-400 text-white font-semibold text-sm px-2 select-none transition-transform ${
                tappedHref === href ? "btn-tap-active" : ""
              }`}
            >
              {text}
            </Link>
          </Fragment>
        ))}
        {Array.from({ length: spacerCount }).map((_, index) => (
          <div key={`spacer-${index}`} className='w-full h-full' aria-hidden='true' />
        ))}
      </div>
    </main>
  );
}
