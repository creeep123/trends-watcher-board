import { supabase } from "./supabase";

/**
 * Read from Supabase twb_cache. Returns null if miss or expired.
 */
export async function getSupabaseCache<T>(key: string): Promise<T | null> {
  try {
    const { data, error } = await supabase
      .from("twb_cache")
      .select("data")
      .eq("key", key)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (error || !data) return null;
    return data.data as T;
  } catch {
    return null;
  }
}

/**
 * Write to Supabase twb_cache (fire-and-forget).
 */
export async function setSupabaseCache(key: string, data: unknown, ttlMs: number): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  // Fire-and-forget: wrap in void to handle PromiseLike
  void supabase
    .from("twb_cache")
    .upsert({ key, data, expires_at: expiresAt });
}
