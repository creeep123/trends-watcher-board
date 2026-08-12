import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.PYTRENDS_API_URL || "http://43.165.126.121";
const ALLOWED = new Set(["status", "brief", "records", "raw", "refresh"]);

async function proxy(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  const { resource } = await context.params;
  if (!ALLOWED.has(resource)) {
    return NextResponse.json({ error: "Unknown intelligence resource" }, { status: 404 });
  }
  const target = `${API_BASE}/api/v1/intelligence/${resource}${request.nextUrl.search}`;
  try {
    const response = await fetch(target, {
      method: request.method,
      headers: {
        Authorization: request.headers.get("authorization") || "",
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") || "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Intelligence backend unavailable" }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
