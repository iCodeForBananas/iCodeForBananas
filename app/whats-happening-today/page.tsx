import { createClient } from "@supabase/supabase-js";
import WhatsHappeningClient from "../components/WhatsHappeningClient";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export default async function WhatsHappeningTodayPage() {
  const { data: events, error } = await supabase.from("events").select("*");

  if (error) console.error("[whats-happening-today] Supabase fetch error:", error.message);

  return <WhatsHappeningClient events={events ?? []} />;
}
