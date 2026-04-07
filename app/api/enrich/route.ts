import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.PYTRENDS_API_URL || "http://127.0.0.1:8081";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await fetch(`${API_BASE}/api/enrich`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(55000),
    });
    if (!res.ok) {
      return NextResponse.json({ results: {} }, { status: 200 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ results: {} }, { status: 200 });
  }
}
