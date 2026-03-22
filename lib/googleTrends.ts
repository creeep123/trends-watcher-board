import type { TrendKeyword } from "./types";

const API_BASE = process.env.PYTRENDS_API_URL || "http://43.165.126.121";

export interface GoogleTrendsResult {
  google: TrendKeyword[];
  _stale?: boolean;
  _status?: string;
  _proxyAttempts?: number;
}

/**
 * Fetch Google Trends via the pytrends API server.
 */
export async function fetchGoogleTrends(
  timeframe: string,
  geo: string,
  keywords: string[],
  bypassCache: boolean = false,
  onProgress?: (status: string, attempt?: number) => void
): Promise<GoogleTrendsResult> {
  try {
    const params = new URLSearchParams({
      keywords: keywords.join(","),
      timeframe,
      geo,
    });

    if (bypassCache) {
      params.set('bypassCache', 'true');
    }

    const res = await fetch(`${API_BASE}/api/trends?${params}`, {
      signal: AbortSignal.timeout(60000), // Increase timeout for proxy attempts
    });

    if (!res.ok) {
      console.error(`pytrends API error: ${res.status}`);
      return { google: [], _status: "API 请求失败" };
    }

    const data = await res.json();

    // Map backend status to user-friendly messages
    let statusMessage: string | undefined;
    if (data._stale) {
      statusMessage = "暂时使用缓存数据（限频中）";
    } else if (data._proxyAttempts && data._proxyAttempts > 0) {
      statusMessage = `使用代理获取成功（尝试 ${data._proxyAttempts} 个代理）`;
    }

    return {
      google: data.google || [],
      _stale: data._stale,
      _status: statusMessage || data._status,
      _proxyAttempts: data._proxyAttempts
    };
  } catch (e) {
    console.error("Google Trends fetch error:", e);
    const errorMsg = e instanceof Error && e.name === 'AbortError'
      ? "请求超时（代理尝试中）"
      : "网络错误";
    return { google: [], _status: errorMsg };
  }
}
