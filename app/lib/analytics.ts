/**
 * GA4 custom events. The root layout loads gtag.js once; this only queues
 * events onto the same dataLayer, so it never adds a second Google tag.
 *
 * Events sent before gtag.js arrives wait in dataLayer and go out when it
 * loads. Nothing here throws: analytics must never break the page.
 */

type Params = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function track(name: string, params: Params = {}): void {
  if (typeof window === "undefined") return;
  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", name, params);
      return;
    }
    window.dataLayer = window.dataLayer || [];
    // gtag.js only reads Arguments objects off dataLayer, not plain arrays.
    const queue = function () {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    } as (...args: unknown[]) => void;
    queue("event", name, params);
  } catch {
    // Ignore: a blocked or broken analytics script is not the page's problem.
  }
}

/**
 * The tool a path belongs to, for grouping engagement: its first segment.
 * "/" and pages that aren't tools return null.
 */
export function toolFromPath(pathname: string): string | null {
  const first = pathname.split("/").filter(Boolean)[0];
  if (!first || first === "login" || first === "settings" || first === "api") return null;
  return first;
}
