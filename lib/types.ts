export interface TrendKeyword {
  name: string;
  value: string;
  source: string;
  url: string;
}

export interface TrendsResponse {
  google: TrendKeyword[];
  github: TrendKeyword[];
  timestamp: string;
  params: {
    timeframe: string;
    geo: string;
  };
}

export const TIMEFRAME_OPTIONS = [
  { label: "1h", value: "now 1-H", description: "过去 1 小时" },
  { label: "4h", value: "now 4-H", description: "过去 4 小时" },
  { label: "24h", value: "now 1-d", description: "过去 24 小时" },
  { label: "7d", value: "now 7-d", description: "过去 7 天" },
  { label: "30d", value: "today 1-m", description: "过去 30 天" },
] as const;

export const GEO_OPTIONS = [
  { label: "US", value: "US", flag: "🇺🇸" },
  { label: "JP", value: "JP", flag: "🇯🇵" },
  { label: "GB", value: "GB", flag: "🇬🇧" },
  { label: "DE", value: "DE", flag: "🇩🇪" },
  { label: "IN", value: "IN", flag: "🇮🇳" },
  { label: "KR", value: "KR", flag: "🇰🇷" },
] as const;
