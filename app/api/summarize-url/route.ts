import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.PYTRENDS_API_URL || "http://43.165.126.121";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  const title = searchParams.get("title") || "";

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const params = new URLSearchParams({ url, title });
  const backendUrl = `${API_BASE}/api/summarize-url?${params}`;

  try {
    const resp = await fetch(backendUrl, {
      signal: AbortSignal.timeout(30_000),
    });

    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    console.error("[summarize-url] proxy error:", err);
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
