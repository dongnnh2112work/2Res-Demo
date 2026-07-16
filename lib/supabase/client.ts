import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/data-mode";

let browserClient: SupabaseClient | null = null;

export function createBrowserClient() {
  if (browserClient) return browserClient;

  const url = getSupabaseUrl();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey || url.includes("placeholder")) {
    throw new Error(
      "Missing Supabase env on this deploy. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel, then Redeploy.",
    );
  }

  browserClient = createClient(url, anonKey, {
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return browserClient;
}
