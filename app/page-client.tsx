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
    <main className='min-h-screen w-full flex flex-col items-center justify-center gap-8 px-4 py-10 sm:px-8 bg-black'>
      <div className='grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3 justify-items-center mx-auto max-w-4xl'>
        {tools.map(({ href, text }, index) => (
          <Fragment key={href}>
            {index === bananaIndex && (
              <div
                className='w-[140px] h-[140px] flex items-center justify-center text-center select-none text-[4rem] leading-none'
                aria-hidden='true'
              >
                🍌
              </div>
            )}
            <Link
              href={href}
              onClick={() => handleTap(href)}
              className={`w-[140px] h-[140px] flex items-center justify-center text-center rounded-none bg-black border border-neutral-700 text-white font-semibold text-sm px-2 select-none transition-transform ${
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
