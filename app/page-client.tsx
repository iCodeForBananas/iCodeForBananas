"use client";

import Link from "next/link";
import { Fragment, useCallback, useState } from "react";
import { useAuth } from "@/app/hooks/useAuth";
import { LINKS } from "./components/Sidebar";

export default function Home() {
  const { user } = useAuth();
  const [tappedHref, setTappedHref] = useState<string | null>(null);

  const tools = LINKS.filter((link) => !link.auth || !!user);
  const bananaIndex = Math.floor(tools.length / 2);

  const handleTap = useCallback((href: string) => {
    setTappedHref(href);
    window.setTimeout(() => {
      setTappedHref((prev) => (prev === href ? null : prev));
    }, 300);
  }, []);

  return (
    <main className='h-screen w-full bg-yellow-400'>
      <div className='grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 auto-rows-fr h-full w-full gap-0'>
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
              className={`w-full h-full flex items-center justify-center text-center rounded-none bg-black border border-yellow-400 text-white font-semibold text-sm px-2 select-none transition-transform ${
                tappedHref === href ? "btn-tap-active" : ""
              }`}
            >
              {text}
            </Link>
          </Fragment>
        ))}
      </div>
    </main>
  );
}
