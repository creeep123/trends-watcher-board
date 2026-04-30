import { NextRequest, NextResponse } from "next/server";
import { fetchGoogleTrends } from "@/lib/googleTrends";
import { fetchGithubTrends } from "@/lib/githubTrends";
import { getCached, setCache } from "@/lib/cache";
import { getSupabaseCache, setSupabaseCache } from "@/lib/supabase-cache";
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

  const cacheKey = `trends:${keywords.join(",")}:${timeframe}:${geo}`;

  // Check Supabase persistent cache first
  if (!bypassCache && !forceRefresh) {
    const supabaseCached = await getSupabaseCache<TrendsResponse>(cacheKey);
    if (supabaseCached) {
      return NextResponse.json({ ...supabaseCached, _cached: true });
    }
  }

  // Check in-memory cache
  if (!bypassCache && !forceRefresh) {
    const cached = getCached<TrendsResponse>(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, _cached: true });
    }
  }

  const [googleResult, github] = await Promise.all([
    fetchGoogleTrends(timeframe, geo, keywords, bypassCache),
    fetchGithubTrends(),
  ]);

  const response = {
    google: googleResult.google,
    github,
    timestamp: new Date().toISOString(),
    params: { timeframe, geo },
    _stale: googleResult._stale || false,
    _cached: false,
  };

  setCache(cacheKey, response);
  setSupabaseCache(cacheKey, response, 4 * 3600_000);

  return NextResponse.json(response);
}
