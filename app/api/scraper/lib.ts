import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export function supabaseAnon() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}

export function supabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface ScraperSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  last_scraped_at: string | null;
  last_status: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

// Verify the request carries a valid Supabase session. Returns the user, or a 401 response to return as-is.
export async function requireUser(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return { user: null, response: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: { user }, error } = await supabaseAnon().auth.getUser(token);
  if (error || !user) {
    return { user: null, response: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  }
  return { user, response: null };
}
