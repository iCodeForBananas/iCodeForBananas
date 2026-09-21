import { type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Static PWA files are served as-is: refreshing a Supabase session on the
    // service worker or the manifest costs a round trip and buys nothing. The
    // same goes for the backtester's CSVs in public/data, which the worker
    // fetches by the dozen per run.
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|offline.html|data/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
