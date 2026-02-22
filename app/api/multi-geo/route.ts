import { NextRequest, NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";

const API_BASE = process.env.PYTRENDS_API_URL || "http://43.165.126.121";

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("keyword") || "";
  const geos = request.nextUrl.searchParams.get("geos") || "US,ID,BR,GB,DE,JP";

  if (!keyword) {
    return NextResponse.json({ keyword: "", found_in: [], total_geos: 0 }, { status: 200 });
  }

  const cacheKey = `multigeo:${keyword.toLowerCase()}:${geos}`;
  const cached = getCached<unknown>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const params = new URLSearchParams({ keyword, geos });
    const res = await fetch(`${API_BASE}/api/multi-geo?${params}`, {
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      return NextResponse.json({ keyword, found_in: [], total_geos: 0 }, { status: 200 });
    }
    const data = await res.json();
    setCache(cacheKey, data);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ keyword, found_in: [], total_geos: 0 }, { status: 200 });
  }
}
