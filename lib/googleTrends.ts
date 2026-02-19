import type { TrendKeyword } from "./types";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const googleTrends = require("google-trends-api");

const SEARCH_ROOTS = ["AI", "ai video", "ai tool", "ai agent", "LLM", "GPT"];
const MAX_PER_ROOT = 12;

export async function fetchGoogleTrends(
  timeframe: string,
  geo: string
): Promise<TrendKeyword[]> {
  const allKeywords: TrendKeyword[] = [];
  const seen = new Set<string>();

  for (const keyword of SEARCH_ROOTS) {
    try {
      const startTime = getStartTime(timeframe);
      const results = await googleTrends.relatedQueries({
        keyword,
        startTime,
        geo: geo || undefined,
      });

      const parsed = JSON.parse(results);
      const data = parsed?.default?.rankedList;
      if (!data || !Array.isArray(data)) continue;

      // rankedList[0] = top, rankedList[1] = rising
      const rising = data[1]?.rankedKeyword || [];
      const top = data[0]?.rankedKeyword || [];

      // Prefer rising queries
      const combined = [...rising, ...top];

      for (const item of combined.slice(0, MAX_PER_ROOT)) {
        const name = item?.query;
        if (!name || name.toLowerCase() === keyword.toLowerCase()) continue;

        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const value = item?.value;
        const formattedValue =
          typeof value === "number" ? `+${value}%` : String(value || "");

        allKeywords.push({
          name,
          value: formattedValue,
          source: "Google Trends",
          url: `https://www.google.com/search?q=${encodeURIComponent(name)}&udm=50`,
        });
      }

      // Rate limiting
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      console.error(`Google Trends error for "${keyword}":`, e);
      continue;
    }
  }

  return allKeywords;
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
