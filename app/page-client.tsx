"use client";

import Link from "next/link";
import { Fragment, useCallback, useState } from "react";
import { useAuth } from "@/app/hooks/useAuth";
import { LINKS } from "./components/Sidebar";
import BentoPageLayout from "./components/BentoPageLayout";

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
    <div className='flex flex-col flex-1 min-h-0 bg-black'>
      <BentoPageLayout title='iCodeForBananas' boxClassName='bg-black' titleClassName='text-yellow-400'>
        <div className='grid grid-cols-3 sm:grid-cols-5 auto-rows-fr flex-1 min-h-0 w-full gap-2'>
          {tools.map(({ href, text }, index) => (
            <Fragment key={href}>
              {index === bananaIndex && (
                <div
                  className='w-full h-full flex items-center justify-center text-center select-none text-7xl sm:text-8xl leading-none rounded-none bg-yellow-300'
                  aria-hidden='true'
                >
                  🍌
                </div>
              )}
              <Link
                href={href}
                onClick={() => handleTap(href)}
                className={`w-full h-full flex items-center justify-center text-center rounded-none bg-yellow-400 text-black font-bold text-sm px-2 select-none transition-transform hover:bg-yellow-300 ${
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
      </BentoPageLayout>
    </div>
  );
}
