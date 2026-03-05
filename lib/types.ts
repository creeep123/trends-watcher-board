export interface TrendKeyword {
  name: string;
  value: string;
  source: string;
  url: string;
  tags?: string[];
}

export interface TrendingItem {
  name: string;
  traffic: string;
  url: string;
  is_tech?: boolean;
}

export interface InterestPoint {
  time: string;
  value: number;
}

export interface FreshnessData {
  keyword: string;
  freshness: number;
  recent_avg: number;
  baseline_avg: number;
}

export interface MultiGeoData {
  keyword: string;
  found_in: string[];
  total_geos: number;
}

export interface RedditPost {
  title: string;
  url: string;
  subreddit: string;
  published: string;
}

export interface RedditKeyword {
  keyword: string;
  context: string;
  posts: number;
}

export interface RedditResponse {
  posts: RedditPost[];
  keywords: RedditKeyword[];
  subreddits: string[];
  sort: string;
  total_posts: number;
  timestamp: string;
}

export interface EnrichData {
  growth_score: number;
  allintitle_count: number;
  competition_score: number;
  competition_level: "very_low" | "low" | "medium" | "high" | "unknown";
  base_score: number;
  score: number;
  has_full_score: boolean;
  freshness_score?: number;
  multi_geo_score?: number;
}

export interface EnrichResponse {
  results: Record<string, EnrichData>;
  timestamp: string;
}

export interface TrendsResponse {
  google: TrendKeyword[];
  github: TrendKeyword[];
  timestamp: string;
  params: {
    timeframe: string;
    geo: string;
  };
  _stale?: boolean;
}

export const TIMEFRAME_OPTIONS = [
  { label: "1h", value: "now 1-H", description: "过去 1 小时" },
  { label: "4h", value: "now 4-H", description: "过去 4 小时" },
  { label: "24h", value: "now 1-d", description: "过去 24 小时" },
  { label: "7d", value: "now 7-d", description: "过去 7 天" },
  { label: "30d", value: "today 1-m", description: "过去 30 天" },
] as const;

export const GEO_OPTIONS = [
  { label: "Global", value: "", flag: "🌍" },
  { label: "US", value: "US", flag: "🇺🇸" },
  { label: "ID", value: "ID", flag: "🇮🇩" },
  { label: "BR", value: "BR", flag: "🇧🇷" },
  { label: "CN", value: "CN", flag: "🇨🇳" },
  { label: "JP", value: "JP", flag: "🇯🇵" },
  { label: "GB", value: "GB", flag: "🇬🇧" },
  { label: "DE", value: "DE", flag: "🇩🇪" },
] as const;

export const DEFAULT_KEYWORDS = "AI, ai video, ai tool, LLM";

// KGR Analysis interpretation functions
export function getKGRInterpretation(kgr: number | null): KGRInterpretation {
  if (kgr === null) {
    return {
      label: "待计算",
      emoji: "⏳",
      color: "var(--text-secondary)",
      bg: "var(--bg-secondary)",
      description: "需要填写搜索量和 allintitle 数量"
    };
  }

  if (kgr < 0.025) {
    return {
      label: "黄金关键词",
      emoji: "🏆",
      color: "#34d399",
      bg: "rgba(52,211,153,0.15)",
      description: "KGR < 0.025，低竞争高价值，强烈推荐"
    };
  } else if (kgr < 0.1) {
    return {
      label: "优质机会",
      emoji: "✅",
      color: "#4ade80",
      bg: "rgba(74,222,128,0.15)",
      description: "KGR 0.025-0.1，竞争较低，值得考虑"
    };
  } else if (kgr < 1) {
    return {
      label: "一般竞争",
      emoji: "⚠️",
      color: "#fbbf24",
      bg: "rgba(251,191,36,0.15)",
      description: "KGR 0.1-1，竞争适中，需谨慎"
    };
  } else {
    return {
      label: "高竞争",
      emoji: "❌",
      color: "#f87171",
      bg: "rgba(248,113,113,0.15)",
      description: "KGR > 1，竞争激烈，不建议"
    };
  }
}

// EKGR Analysis interpretation functions
export function getEKGRInterpretation(ekgr: number | null): EKGRInterpretation {
  if (ekgr === null) {
    return {
      label: "待计算",
      emoji: "⏳",
      color: "var(--text-secondary)",
      bg: "var(--bg-secondary)",
      description: "需要填写搜索量、allintitle 和 KD"
    };
  }

  if (ekgr > 20) {
    return {
      label: "极优机会",
      emoji: "🏆",
      color: "#34d399",
      bg: "rgba(52,211,153,0.15)",
      description: "EKGR > 20，考虑竞争后的优质机会"
    };
  } else if (ekgr > 10) {
    return {
      label: "优质机会",
      emoji: "✅",
      color: "#4ade80",
      bg: "rgba(74,222,128,0.15)",
      description: "EKGR 10-20，竞争调整后仍有价值"
    };
  } else if (ekgr > 5) {
    return {
      label: "可考虑",
      emoji: "⚠️",
      color: "#fbbf24",
      bg: "rgba(251,191,36,0.15)",
      description: "EKGR 5-10，需要权衡竞争因素"
    };
  } else {
    return {
      label: "不建议",
      emoji: "❌",
      color: "#f87171",
      bg: "rgba(248,113,113,0.15)",
      description: "EKGR < 5，竞争压力大，风险高"
    };
  }
}

// KDROI Analysis interpretation functions
export function getKDROIInterpretation(kdroi: number | null): KDROIInterpretation {
  if (kdroi === null) {
    return {
      label: "待计算",
      emoji: "⏳",
      color: "var(--text-secondary)",
      bg: "var(--bg-secondary)",
      description: "需要填写搜索量和 KD"
    };
  }

  if (kdroi > 200) {
    return {
      label: "极高回报",
      emoji: "🏆",
      color: "#34d399",
      bg: "rgba(52,211,153,0.15)",
      description: "ROI > 200%，投资回报极高"
    };
  } else if (kdroi > 100) {
    return {
      label: "高回报",
      emoji: "✅",
      color: "#4ade80",
      bg: "rgba(74,222,128,0.15)",
      description: "ROI 100-200%，投资回报良好"
    };
  } else if (kdroi > 0) {
    return {
      label: "一般回报",
      emoji: "⚠️",
      color: "#fbbf24",
      bg: "rgba(251,191,36,0.15)",
      description: "ROI 0-100%，有一定回报但不高"
    };
  } else {
    return {
      label: "亏损风险",
      emoji: "❌",
      color: "#f87171",
      bg: "rgba(248,113,113,0.15)",
      description: "ROI < 0%，预期收益无法覆盖成本"
    };
  }
}

// Calculate EKGR
export function calculateEKGR(
  searchVolume: number | null,
  allintitleCount: number | null,
  kd: number | null
): number | null {
  if (!searchVolume || !allintitleCount || !kd || kd === 0 || allintitleCount === 0) {
    return null;
  }
  return (searchVolume * 0.6) / (allintitleCount * Math.sqrt(kd));
}

// Calculate backlink cost based on tiered pricing model
export function calculateBacklinkCost(kd: number): number {
  // Estimate number of backlinks needed based on KD
  // Assuming KD 0-100 maps to approximately 0-500 backlinks needed
  const estimatedLinks = Math.floor(kd * 5); // KD 100 = 500 links

  let cost = 0;
  let linksProcessed = 0;
  const linkCost = 100;

  // First 10 links: $100 each
  const tier1 = Math.min(estimatedLinks, 10);
  cost += tier1 * linkCost;
  linksProcessed += tier1;

  if (linksProcessed >= estimatedLinks) return cost;

  // Links 11-50: Cost increases by 1% per additional link
  const tier2Max = Math.min(estimatedLinks, 50);
  const tier2Links = tier2Max - 10;
  for (let i = 1; i <= tier2Links; i++) {
    cost += linkCost * (1 + i * 0.01);
  }
  linksProcessed += tier2Links;

  if (linksProcessed >= estimatedLinks) return cost;

  // Links 51-200: Cost increases by 1.5% per additional link
  const tier3Max = Math.min(estimatedLinks, 200);
  const tier3Links = tier3Max - 50;
  for (let i = 1; i <= tier3Links; i++) {
    cost += linkCost * (1 + 40 * 0.01 + i * 0.015);
  }
  linksProcessed += tier3Links;

  if (linksProcessed >= estimatedLinks) return cost;

  // Links 201+: Cost increases by 2% per additional link
  const tier4Links = estimatedLinks - 200;
  for (let i = 1; i <= tier4Links; i++) {
    cost += linkCost * (1 + 40 * 0.01 + 150 * 0.015 + i * 0.02);
  }

  return cost;
}

// Calculate KDROI
export function calculateKDROI(
  searchVolume: number | null,
  kd: number | null
): number | null {
  if (!searchVolume || !kd) {
    return null;
  }

  const revenuePerClick = 0.1; // $0.1 per click
  const estimatedRevenue = searchVolume * revenuePerClick;
  const backlinkCost = calculateBacklinkCost(kd);

  if (backlinkCost === 0) return null;

  const roi = ((estimatedRevenue - backlinkCost) / backlinkCost) * 100;
  return roi;
}

// KGR Workbench types
export interface KGRItem {
  keyword: string;
  allintitleCount: number | null;  // Auto-fetched from backend
  allintitleTimestamp: string | null;  // When fetched
  searchVolume: number | null;  // Manual input from Semrush/Google Ads
  searchVolumeTimestamp: string | null;  // When entered
  kd: number | null;  // Keyword Difficulty (0-100), from Ahrefs/Semrush
  kdTimestamp: string | null;  // When KD was entered
  kgr: number | null;  // Calculated: searchVolume / allintitleCount
  kgrStatus: 'good' | 'medium' | 'bad' | null;  // <0.025 good, 0.025-1 medium, >1 bad
  ekgr: number | null;  // Enhanced KGR: (searchVolume * 0.6) / (allintitleCount * sqrt(KD))
  ekgrStatus: 'good' | 'medium' | 'bad' | null;  // >20 good, 10-20 medium, <10 bad
  kdroi: number | null;  // Keyword Difficulty ROI: (revenue - cost) / cost
  kdroiStatus: 'good' | 'medium' | 'bad' | null;  // >200% good, 100-200% medium, <100% bad
  addedAt: string;  // ISO timestamp when added to workbench
}

// KGR Analysis interpretation
export interface KGRInterpretation {
  label: string;
  emoji: string;
  color: string;
  bg: string;
  description: string;
}

// EKGR Analysis interpretation
export interface EKGRInterpretation {
  label: string;
  emoji: string;
  color: string;
  bg: string;
  description: string;
}

// KDROI Analysis interpretation
export interface KDROIInterpretation {
  label: string;
  emoji: string;
  color: string;
  bg: string;
  description: string;
}

export interface KGRWorkbenchState {
  items: KGRItem[];
  isExpanded: boolean;
  lastUpdated: string;
}
