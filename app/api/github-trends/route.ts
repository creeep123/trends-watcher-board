import { NextResponse } from "next/server";
import { fetchGithubTrends } from "@/lib/githubTrends";
import { getCached, setCache } from "@/lib/cache";
import { getSupabaseCache, setSupabaseCache } from "@/lib/supabase-cache";
import type { TrendKeyword } from "@/lib/types";

export const maxDuration = 15;

const CACHE_KEY = "github-trends:daily";
const CACHE_TTL = 4 * 3600_000; // 4 hours

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.has("refresh");

  // Check Supabase cache
  if (!forceRefresh) {
    const cached = await getSupabaseCache<TrendKeyword[]>(CACHE_KEY);
    if (cached) {
      return NextResponse.json({ github: cached, _cached: true });
    }
  }

  // Check in-memory cache
  if (!forceRefresh) {
    const cached = getCached<TrendKeyword[]>(CACHE_KEY);
    if (cached) {
      return NextResponse.json({ github: cached, _cached: true });
    }
  }

  const github = await fetchGithubTrends();

  setCache(CACHE_KEY, github);
  if (github.length > 0) {
    setSupabaseCache(CACHE_KEY, github, CACHE_TTL);
  }

  return NextResponse.json({ github, _cached: false });
}
