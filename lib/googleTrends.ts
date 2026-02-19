import type { TrendKeyword } from "./types";

/**
 * Fetch Google Trends via the public RSS feed.
 * This is reliable on Vercel (no captcha/blocking issues).
 * RSS provides daily trending searches with approximate traffic.
 */
export async function fetchGoogleTrends(
  timeframe: string,
  geo: string
): Promise<TrendKeyword[]> {
  // RSS feed supports these geos; default to US if unsupported
  const supportedGeos = ["US", "GB", "JP", "DE", "FR", "BR", "IN", "AU", "CA", "KR"];
  const feedGeo = geo && supportedGeos.includes(geo) ? geo : "US";

  try {
    const rssUrl = `https://trends.google.com/trending/rss?geo=${feedGeo}`;
    const res = await fetch(rssUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TrendsWatcher/1.0)",
      },
    });

    if (!res.ok) {
      console.error(`Google Trends RSS failed: ${res.status}`);
      return [];
    }

    const xml = await res.text();
    return parseRss(xml, feedGeo);
  } catch (e) {
    console.error("Google Trends fetch error:", e);
    return [];
  }
}

function parseRss(xml: string, geo: string): TrendKeyword[] {
  const items: TrendKeyword[] = [];

  // Extract each <item>...</item> block
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const title = extractTag(block, "title");
    if (!title) continue;

    const traffic = extractTag(block, "ht:approx_traffic") || "";

    items.push({
      name: title,
      value: traffic,
      source: `Google Trends (${geo})`,
      url: `https://www.google.com/search?q=${encodeURIComponent(title)}&udm=50`,
    });
  }

  return items;
}

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
  const match = regex.exec(xml);
  return match ? match[1].trim() : null;
}
