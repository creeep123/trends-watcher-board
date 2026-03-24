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
  ups?: number;       // 点赞数
  num_comments?: number;  // 评论数
  score?: number;     // 综合热度 (ups + num_comments * 2)
}

export interface HackerNewsPost {
  id: number;
  title: string;
  url: string;
  domain: string;
  points: number;
  comments: number;
  time: string;
  score?: number;     // 综合热度 (points + comments * 0.5)
}

export interface HackerNewsResponse {
  posts: HackerNewsPost[];
  timestamp: string;
}

export interface TechNewsPost {
  title: string;
  url: string;
  source: string;
  author: string;
  published: string;
}

export interface TechNewsResponse {
  articles: TechNewsPost[];
  total: number;
  timestamp: string;
}

export interface TikTokVideo {
  id: string;
  title: string;
  author: string;
  thumbnail?: string;
  playCount: number;
  likeCount: number;
  url: string;
  keyword: string;
}

export interface TikTokResponse {
  videos: TikTokVideo[];
  timestamp: string;
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
  _cached?: boolean;
  _status?: string;
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

export const DEFAULT_KEYWORDS = "AI, LLM, maker, generator, creator, filter";

// Google Trends 对比关键词（固定）
export const GT_COMPARISON_KEYWORDS = ["gpts", "happy birthday image"] as const;

// 生成 Google Trends 对比 URL
export function generateGTCompareUrl(keyword: string, timeframe: string = "today 1-m"): string {
  const allKeywords = [keyword, ...GT_COMPARISON_KEYWORDS];
  const qParam = allKeywords.map(k => encodeURIComponent(k)).join(',');
  return `https://trends.google.com/trends/explore?q=${qParam}&date=${encodeURIComponent(timeframe)}`;
}

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

  if (kgr < 0.25) {
    return {
      label: "低竞争",
      emoji: "🏆",
      color: "#34d399",
      bg: "rgba(52,211,153,0.15)",
      description: "KGR < 0.25，低竞争高价值，强烈推荐"
    };
  } else if (kgr < 1) {
    return {
      label: "中等竞争",
      emoji: "⚠️",
      color: "#fbbf24",
      bg: "rgba(251,191,36,0.15)",
      description: "KGR 0.25-1，竞争适中，需谨慎"
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

  if (ekgr < 0.25) {
    return {
      label: "低竞争",
      emoji: "🏆",
      color: "#34d399",
      bg: "rgba(52,211,153,0.15)",
      description: "EKGR < 0.25，考虑竞争后的优质机会"
    };
  } else if (ekgr < 1) {
    return {
      label: "中等竞争",
      emoji: "⚠️",
      color: "#fbbf24",
      bg: "rgba(251,191,36,0.15)",
      description: "EKGR 0.25-1，需要权衡竞争因素"
    };
  } else {
    return {
      label: "高竞争",
      emoji: "❌",
      color: "#f87171",
      bg: "rgba(248,113,113,0.15)",
      description: "EKGR > 1，竞争压力大，风险高"
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

  if (kdroi > 100) {
    return {
      label: "高回报",
      emoji: "🏆",
      color: "#34d399",
      bg: "rgba(52,211,153,0.15)",
      description: "ROI > 100%，投资回报良好"
    };
  } else {
    return {
      label: "低回报",
      emoji: "❌",
      color: "#f87171",
      bg: "rgba(248,113,113,0.15)",
      description: "ROI ≤ 100%，回报不足以覆盖成本"
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
  // EKGR = (allintitleCount * (1 + KD/100)) / searchVolume
  return (allintitleCount * (1 + kd / 100)) / searchVolume;
}

// Calculate backlink cost based on tiered pricing model
export function calculateBacklinkCost(kd: number): number {
  // Fixed: 10 backlinks needed (as per requirements)
  const requiredLinks = 10;

  let cost = 0;
  const baseCost = 100; // $100 per link for first 10

  // First 10 links: $100 each = $1,000 total
  cost = requiredLinks * baseCost;

  // Note: Higher tiers (11-50, 51-200, 200+) not used since we only need 10 links
  // But keeping the function structure in case requirements change

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

  // Assumptions:
  // - Required backlinks: 10 (fixed)
  // - Investment cost: $1,000 (10 × $100)
  // - Revenue per click: $0.1
  // - Can capture 100% of clicks

  const monthlyRevenue = searchVolume * 0.1; // $0.1 per click
  const annualRevenue = monthlyRevenue * 12;
  const investmentCost = 1000; // $1,000 for 10 backlinks

  const roi = ((annualRevenue - investmentCost) / investmentCost) * 100;
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
  kgr: number | null;  // Calculated: allintitleCount / searchVolume
  kgrStatus: 'good' | 'medium' | 'bad' | null;  // <0.25 good, 0.25-1 medium, >1 bad
  ekgr: number | null;  // Enhanced KGR: (allintitleCount * (1 + KD/100)) / searchVolume
  ekgrStatus: 'good' | 'medium' | 'bad' | null;  // <0.25 good, 0.25-1 medium, >1 bad
  kdroi: number | null;  // Keyword Difficulty ROI: (annualRevenue - $1000) / $1000 * 100
  kdroiStatus: 'good' | 'medium' | 'bad' | null;  // >100% good, ≤100% bad
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

// Root Keyword Monitoring types
export interface RootKeyword {
  id: string;
  keyword: string;
  category?: string;
  priority: 'high' | 'medium' | 'low';
  addedAt: string;

  // 查询控制
  lastChecked: string | null;
  nextCheckTime: string | null;
  checkFrequency: number; // 小时

  // 最新数据
  latestData: {
    trendValue: number | null;
    changePercent: number | null;
    status: 'surging' | 'rising' | 'stable' | 'declining' | 'unknown';
    relatedKeywords: string[];
    newKeywords: string[];
    timestamp: string | null;
  };

  // 历史快照
  history: DailySnapshot[];
}

export interface DailySnapshot {
  date: string;
  trendValue: number;
  relatedKeywords: string[];
  topRising: string[];
  timestamp: string;
}

export interface RootKeywordLibrary {
  keywords: RootKeyword[];
  lastUpdated: string;
  settings: {
    autoScanEnabled: boolean;
    highPriorityFrequency: number;
    normalPriorityFrequency: number;
    lowPriorityFrequency: number;
  };
}
