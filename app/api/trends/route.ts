import { NextRequest, NextResponse } from "next/server";
import { fetchGoogleTrends, debugErrors } from "@/lib/googleTrends";
import { fetchGithubTrends } from "@/lib/githubTrends";
import { getCached, setCache } from "@/lib/cache";
import type { TrendsResponse } from "@/lib/types";

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const timeframe = searchParams.get("timeframe") || "now 1-d";
  const geo = searchParams.get("geo") || "";

  const cacheKey = `trends:${timeframe}:${geo}`;
  const cached = getCached<TrendsResponse>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const [google, github] = await Promise.all([
    fetchGoogleTrends(timeframe, geo),
    fetchGithubTrends(),
  ]);

  const response: TrendsResponse & { _debug?: string[] } = {
    google,
    github,
    timestamp: new Date().toISOString(),
    params: { timeframe, geo },
    _debug: debugErrors.slice(),
  };

  setCache(cacheKey, response);

  return NextResponse.json(response);
}
