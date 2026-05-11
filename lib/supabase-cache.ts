import { supabase } from "./supabase";

/**
 * Read from Supabase twb_cache. Returns null only if key doesn't exist at all.
 * Prefers fresh data, falls back to stale (expired) data rather than nothing.
 */
export async function getSupabaseCache<T>(key: string): Promise<T | null> {
  try {
    const { data, error } = await supabase
      .from("twb_cache")
      .select("data, expires_at")
      .eq("key", key)
      .single();

    if (error || !data) return null;
    // Respect expiry — expired entries are not returned for normal requests
    if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
    return data.data as T;
  } catch {
    return null;
  }
}

/**
 * Fuzzy search Supabase twb_cache for trends data.
 * Tries exact key, then alternative prefix (trends| vs trends:),
 * then any key starting with "trends" that has non-empty google data.
 * Returns the most recent match with actual google data.
 */
export async function getSupabaseCacheFallback<T = { google?: unknown[] }>(
  exactKey: string,
  keywords: string
): Promise<T | null> {
  try {
    // 1. Try exact key
    const exact = await getSupabaseCache<T>(exactKey);
    if (exact && (exact as any).google?.length > 0) return exact;

    // 2. Try alternative prefix: trends: -> trends| and vice versa
    const altKey = exactKey.startsWith("trends:")
      ? exactKey.replace("trends:", "trends|")
      : exactKey.startsWith("trends|")
        ? exactKey.replace("trends|", "trends:")
        : null;
    if (altKey) {
      const alt = await getSupabaseCache<T>(altKey);
      if (alt && (alt as any).google?.length > 0) return alt;
    }

    // 3. Fuzzy: find any recent trends cache with google data
    const { data: rows, error } = await supabase
      .from("twb_cache")
      .select("key, data")
      .like("key", "trends%")
      .order("fetched_at", { ascending: false })
      .limit(10);

    if (error || !rows) return null;

    for (const row of rows) {
      const d = row.data as T & { google?: unknown[] };
      if (d.google && d.google.length > 0) {
        return d;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Write to Supabase twb_cache (fire-and-forget).
 */
export async function setSupabaseCache(key: string, data: unknown, ttlMs: number): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  void supabase
    .from("twb_cache")
    .upsert({ key, data, expires_at: expiresAt });
}
