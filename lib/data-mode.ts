function normalizeSupabaseUrl(url: string) {
  return url
    .trim()
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/+$/, "");
}

function hasRealSupabaseUrl(url: string) {
  const normalized = normalizeSupabaseUrl(url);
  return (
    Boolean(normalized) &&
    !normalized.includes("placeholder") &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(normalized)
  );
}

/** Server: in-memory only when explicitly requested — never on Vercel. */
export function isLocalDataMode() {
  if (process.env.USE_LOCAL_STORE === "true") return true;
  // Per-lambda memory on Vercel → wishes flicker 0 ↔ N across requests
  if (process.env.VERCEL === "1") return false;
  return !hasRealSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
}

/** Browser: same rule — Vercel builds must use Supabase, not local poll. */
export function isLocalDataModeClient() {
  if (process.env.NEXT_PUBLIC_USE_LOCAL_STORE === "true") return true;
  if (process.env.NEXT_PUBLIC_VERCEL_ENV) return false;
  return !hasRealSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
}

export function getSupabaseUrl() {
  return normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
}
