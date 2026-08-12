import { NextRequest, NextResponse } from "next/server";
import { fetchGoogleTrends } from "@/lib/googleTrends";
import { getCached, setCache } from "@/lib/cache";
import { getSupabaseCache, getSupabaseCacheFallback, setSupabaseCache } from "@/lib/supabase-cache";
import type { TrendsResponse } from "@/lib/types";

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const timeframe = searchParams.get("timeframe") || "now 1-d";
  const geo = searchParams.get("geo") || "";
  const keywordsParam = searchParams.get("keywords") || "AI,ai video,ai tool,LLM";
  const keywords = keywordsParam.split(",").map((k) => k.trim()).filter(Boolean);
  const bypassCache = searchParams.get("bypassCache") === "true";
  const forceRefresh = searchParams.has("refresh");
  const cacheOnly = searchParams.has("cacheOnly");

  const cacheKey = `trends:${keywords.join(",")}:${timeframe}:${geo}`;

  // cacheOnly mode: only return Supabase cache (including expired), skip backend
  if (cacheOnly) {
    const cached = await getSupabaseCacheFallback<TrendsResponse>(cacheKey, keywords.join(","));
    if (cached && cached.google && cached.google.length > 0) {
      return NextResponse.json({ ...cached, _cached: true, _cacheFallback: true });
    }
    return NextResponse.json({
      google: [],
      timestamp: new Date().toISOString(),
      params: { timeframe, geo },
      _cached: false,
      _status: "无缓存数据",
    });
  }

  // Check Supabase persistent cache first
  if (!bypassCache && !forceRefresh) {
    const cached = await getSupabaseCache<TrendsResponse>(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, _cached: true });
    }
  }

  // Check in-memory cache
  if (!bypassCache && !forceRefresh) {
    const cached = getCached(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, _cached: true });
    }
  }

  const googleResult = await fetchGoogleTrends(timeframe, geo, keywords, bypassCache);

  const response = {
    google: googleResult.google,
    timestamp: new Date().toISOString(),
    params: { timeframe, geo },
    _stale: googleResult._stale || false,
    _cached: false,
  };

  setCache(cacheKey, response);
  // Only persist to Supabase if we have actual data (don't overwrite good cache with empty)
  if (googleResult.google && googleResult.google.length > 0) {
    setSupabaseCache(cacheKey, response, 12 * 3600_000);
  }

  return NextResponse.json(response);
}
