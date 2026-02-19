import type { TrendKeyword } from "./types";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const googleTrends = require("google-trends-api");

const SEARCH_ROOTS = ["AI", "ai tool", "LLM"];
const MAX_PER_ROOT = 15;

export async function fetchGoogleTrends(
  timeframe: string,
  geo: string
): Promise<TrendKeyword[]> {
  const allKeywords: TrendKeyword[] = [];
  const seen = new Set<string>();

  // Fetch all roots in parallel to avoid timeout
  const results = await Promise.allSettled(
    SEARCH_ROOTS.map((keyword) => fetchForKeyword(keyword, timeframe, geo))
  );

  for (const result of results) {
    if (result.status !== "fulfilled") {
      console.error("Google Trends fetch failed:", result.reason);
      continue;
    }

    for (const item of result.value) {
      const key = item.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      allKeywords.push(item);
    }
  }

  return allKeywords;
}

async function fetchForKeyword(
  keyword: string,
  timeframe: string,
  geo: string
): Promise<TrendKeyword[]> {
  const items: TrendKeyword[] = [];

  try {
    const startTime = getStartTime(timeframe);
    const options: Record<string, unknown> = {
      keyword,
      startTime,
    };
    if (geo) options.geo = geo;

    const results = await googleTrends.relatedQueries(options);
    const parsed = JSON.parse(results);
    const rankedList = parsed?.default?.rankedList;

    if (!rankedList || !Array.isArray(rankedList)) return items;

    // rankedList[0] = top, rankedList[1] = rising
    const top = rankedList[0]?.rankedKeyword || [];
    const rising = rankedList[1]?.rankedKeyword || [];

    // Prefer rising, then top
    const combined = [...rising, ...top];

    for (const entry of combined.slice(0, MAX_PER_ROOT)) {
      const name = entry?.query;
      if (!name || name.toLowerCase() === keyword.toLowerCase()) continue;

      const value = entry?.formattedValue || entry?.value;
      const formattedValue =
        typeof value === "number" ? `+${value}%` : String(value || "");

      items.push({
        name,
        value: formattedValue,
        source: "Google Trends",
        url: `https://www.google.com/search?q=${encodeURIComponent(name)}&udm=50`,
      });
    }
  } catch (e) {
    console.error(`Google Trends error for "${keyword}":`, e);
  }

  return items;
}

function getStartTime(timeframe: string): Date {
  const now = new Date();
  switch (timeframe) {
    case "now 1-H":
      return new Date(now.getTime() - 60 * 60 * 1000);
    case "now 4-H":
      return new Date(now.getTime() - 4 * 60 * 60 * 1000);
    case "now 1-d":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "now 7-d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "today 1-m":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
}
