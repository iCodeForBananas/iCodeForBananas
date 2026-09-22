import type { useRouter } from "next/navigation";

/**
 * A client-side transition fetches the next route's payload over the
 * network; with none available that fetch just fails. A full navigation to
 * the same URL instead hits the service worker, which — for anything under
 * /lead-sheet-editor — serves whatever it cached the last time that exact
 * page loaded successfully (see public/sw.js). So offline, `goTo` trades the
 * faster client transition for the one that actually has a chance of
 * working; online, it's the normal push.
 */
export function goTo(router: ReturnType<typeof useRouter>, href: string): void {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    window.location.href = href;
    return;
  }
  router.push(href);
}
