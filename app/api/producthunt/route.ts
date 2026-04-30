import { NextRequest, NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import { getSupabaseCache, setSupabaseCache } from "@/lib/supabase-cache";

const API_BASE = process.env.PYTRENDS_API_URL || "http://43.165.126.121";
const TTL_MS = 8 * 3600_000;

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const period = searchParams.get("period") || "daily";
  const forceRefresh = searchParams.has("refresh");
  const cacheKey = `ph|${period}`;

  if (!forceRefresh) {
    const supabaseCached = await getSupabaseCache<unknown>(cacheKey);
    if (supabaseCached) return NextResponse.json(supabaseCached);
  }

  const cached = getCached<unknown>(cacheKey);
  if (cached && !forceRefresh) return NextResponse.json(cached);

  try {
    const res = await fetch(`${API_BASE}/api/producthunt?period=${encodeURIComponent(period)}`, {
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return NextResponse.json({ products: [], timestamp: new Date().toISOString() }, { status: 200 });
    const data = await res.json();
    setCache(cacheKey, data);
    setSupabaseCache(cacheKey, data, TTL_MS);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ products: [], timestamp: new Date().toISOString() }, { status: 200 });
  }
}
