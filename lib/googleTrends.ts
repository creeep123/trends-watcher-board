import type { TrendKeyword } from "./types";

const API_BASE = process.env.PYTRENDS_API_URL || "http://43.165.126.121:8765";

/**
 * Fetch Google Trends via the pytrends API server.
 */
export async function fetchGoogleTrends(
  timeframe: string,
  geo: string,
  keywords: string[]
): Promise<TrendKeyword[]> {
  try {
    const params = new URLSearchParams({
      keywords: keywords.join(","),
      timeframe,
      geo,
    });

    const res = await fetch(`${API_BASE}/api/trends?${params}`, {
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      console.error(`pytrends API error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    return data.google || [];
  } catch (e) {
    console.error("Google Trends fetch error:", e);
    return [];
  }
}
