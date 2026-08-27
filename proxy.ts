import { type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Static PWA files are served as-is: refreshing a Supabase session on the
    // service worker or the manifest costs a round trip and buys nothing.
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
