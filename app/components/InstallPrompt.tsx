"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, X } from "lucide-react";

/**
 * What Chrome fires once a site meets its install criteria — a manifest with
 * PNG icons, a service worker with a fetch handler, and HTTPS. Not in the DOM
 * lib, since only Chromium implements it.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

declare global {
  interface Window {
    /** Parked by the inline script in the root layout; see the note there. */
    __installPromptEvent?: BeforeInstallPromptEvent | null;
  }
}

/** How long "Not now" keeps the card away. */
const SNOOZE_DAYS = 30;
const SNOOZE_KEY = "installPrompt:snoozedUntil";

function snoozed(): boolean {
  try {
    const until = localStorage.getItem(SNOOZE_KEY);
    return !!until && Date.now() < parseInt(until);
  } catch {
    return false;
  }
}

function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
  } catch {}
}

/**
 * Registers the service worker and offers the browser's own install dialog.
 *
 * Chrome hands the prompt over to the page rather than showing it itself, so
 * catching the event is the only way to get the native "Install app" sheet on
 * Android. The card below is just the doorway — tapping Install opens Chrome's
 * dialog, not one of ours.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // No service worker means no install offer, which is the status quo.
      });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  useEffect(() => {
    // Already running as an installed app — there's nothing to offer.
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // The event usually landed before this component existed, so start by
    // taking whatever the layout parked on the window.
    const adopt = () => {
      const event = window.__installPromptEvent;
      if (!event) return;
      setDeferred(event);
      if (!snoozed()) setVisible(true);
    };
    const onBeforeInstallPrompt = (e: Event) => {
      // Chrome's own mini-infobar goes away the moment this is preventDefault'd,
      // and the event becomes ours to fire whenever the card is tapped.
      e.preventDefault();
      window.__installPromptEvent = e as BeforeInstallPromptEvent;
      adopt();
    };
    const onInstalled = () => {
      window.__installPromptEvent = null;
      setDeferred(null);
      setVisible(false);
    };

    adopt();
    window.addEventListener("installpromptready", adopt);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("installpromptready", adopt);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    setVisible(false);
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // A prompt can only be fired once; Chrome sends a fresh event if the app
    // is still installable later.
    window.__installPromptEvent = null;
    setDeferred(null);
    if (outcome === "dismissed") snooze();
  }, [deferred]);

  const dismiss = () => {
    snooze();
    setVisible(false);
  };

  if (!visible || !deferred) return null;

  return (
    <div className='fixed bottom-4 left-4 right-4 z-[70] sm:left-auto sm:w-80 print:hidden'>
      <div className='rounded-2xl border border-yellow-300 bg-white shadow-2xl dark:border-yellow-400/30 dark:bg-neutral-900'>
        <div className='flex items-start gap-3 p-4'>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src='/icons/icon-192.png' alt='' className='h-10 w-10 shrink-0' />
          <div className='min-w-0 flex-1'>
            <p className='text-sm font-semibold text-black dark:text-white'>Install iCodeForBananas</p>
            <p className='mt-0.5 text-xs text-gray-600 dark:text-neutral-400'>
              Add it to your home screen — full screen, no address bar.
            </p>
          </div>
          <button
            type='button'
            onClick={dismiss}
            aria-label='Dismiss install offer'
            className='-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors duration-150 hover:bg-gray-100 dark:hover:bg-neutral-800'
          >
            <X className='h-4 w-4' />
          </button>
        </div>
        <div className='flex gap-2 px-4 pb-4'>
          <button
            type='button'
            onClick={dismiss}
            className='h-11 flex-1 rounded-xl bg-gray-100 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700'
          >
            Not now
          </button>
          <button
            type='button'
            onClick={install}
            className='flex h-11 flex-[2] items-center justify-center gap-1.5 rounded-xl bg-black text-sm font-semibold text-yellow-400 transition-colors duration-150 hover:bg-black/80 dark:bg-yellow-400 dark:text-black dark:hover:bg-yellow-300'
          >
            <Download className='h-4 w-4' />
            Install
          </button>
        </div>
      </div>
    </div>
  );
}
