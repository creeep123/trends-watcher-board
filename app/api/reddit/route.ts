import { NextRequest, NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";

const API_BASE = process.env.PYTRENDS_API_URL || "http://43.165.126.121";

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const sort = request.nextUrl.searchParams.get("sort") || "hot";

  const cacheKey = `reddit:${sort}`;
  const cached = getCached<unknown>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const res = await fetch(`${API_BASE}/api/reddit?sort=${sort}`, {
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { posts: [], keywords: [], subreddits: [], sort, total_posts: 0 },
        { status: 200 },
      );
    }
    const data = await res.json();
    setCache(cacheKey, data);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { posts: [], keywords: [], subreddits: [], sort, total_posts: 0 },
      { status: 200 },
    );
  }
}
