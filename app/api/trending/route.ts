import { NextRequest, NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";

const API_BASE = process.env.PYTRENDS_API_URL || "http://43.165.126.121";

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const geo = request.nextUrl.searchParams.get("geo") || "US";

  const cacheKey = `trending:${geo}`;
  const cached = getCached<unknown>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const res = await fetch(`${API_BASE}/api/trending?geo=${geo}`, {
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      return NextResponse.json({ trending: [], geo }, { status: 200 });
    }
    const data = await res.json();
    setCache(cacheKey, data);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ trending: [], geo }, { status: 200 });
  }
}
