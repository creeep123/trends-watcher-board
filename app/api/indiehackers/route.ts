import { NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";

const API_BASE = process.env.PYTRENDS_API_URL || "http://43.165.126.121";

export const maxDuration = 30;

export async function GET() {
  const cacheKey = "indiehackers";
  const cached = getCached<unknown>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const res = await fetch(`${API_BASE}/api/indiehackers`, {
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      return NextResponse.json({ posts: [], timestamp: new Date().toISOString() }, { status: 200 });
    }
    const data = await res.json();
    setCache(cacheKey, data);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ posts: [], timestamp: new Date().toISOString() }, { status: 200 });
  }
}