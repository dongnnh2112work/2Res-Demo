export function isLocalDataModeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return (
    process.env.NEXT_PUBLIC_USE_LOCAL_STORE === "true" ||
    !url ||
    url.includes("placeholder")
  );
}
