"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Bento } from "@/app/components/ui/bento";

/**
 * Tells you when the service worker behind you has changed, so you're never
 * just stuck running yesterday's build with no way to know it.
 *
 * sw.js calls `skipWaiting()` on install and `clients.claim()` on activate,
 * so a new worker takes over the instant it's ready — there's no
 * `registration.waiting` phase to watch for, because it never waits. What
 * does happen, reliably, is a `controllerchange` event on every open tab the
 * moment that takeover completes. The first one ever (this tab's own
 * registration taking control for the first time) isn't an update and is
 * ignored; every one after that is, because nothing but a new activation
 * ever changes who's controlling an already-controlled tab.
 *
 * It never reloads on its own — the in-progress edit queue (offlineCache.ts)
 * means a reload can't lose anything even mid-edit, but forcing one anyway
 * would still yank the page out from under whatever you were doing.
 */
export default function UpdateAvailable() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let hadController = !!navigator.serviceWorker.controller;
    const onControllerChange = () => {
      if (hadController) setReady(true);
      hadController = true;
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  if (!ready) return null;

  return (
    <div className='fixed bottom-4 left-4 right-4 z-[70] sm:left-auto sm:w-80 print:hidden'>
      <Bento className='p-0 shadow-overlay'>
        <div className='flex items-center gap-3 p-4'>
          <RefreshCw className='h-5 w-5 shrink-0 text-primary-text' aria-hidden='true' />
          <div className='min-w-0 flex-1'>
            <p className='text-13 font-medium text-ink-primary'>Update available</p>
            <p className='mt-0.5 text-12 text-ink-muted'>Reload for the newest version.</p>
          </div>
          <Button variant='primary' size='sm' onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </Bento>
    </div>
  );
}
