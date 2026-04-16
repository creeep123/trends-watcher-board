"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type {
  TrendsResponse,
  TrendKeyword,
  TrendingItem,
  InterestPoint,
  FreshnessData,
  MultiGeoData,
  RedditPost,
  RedditKeyword,
  HackerNewsPost,
  HackerNewsResponse,
  TechNewsPost,
  EnrichData,
  EnrichResponse,
  KGRItem,
  RootKeyword,
} from "@/lib/types";
import { TIMEFRAME_OPTIONS, GEO_OPTIONS, DEFAULT_KEYWORDS,
  getKGRInterpretation, getEKGRInterpretation, getKDROIInterpretation,
  calculateEKGR, calculateKDROI, generateGTCompareUrl } from "@/lib/types";
import { usePushSubscription } from "@/lib/usePushSubscription";

// --- Tag logic ---

function getTags(item: TrendKeyword): string[] {
  const tags: string[] = [];
  const val = item.value;
  if (val.startsWith("+")) {
    const num = parseInt(val.replace(/[+%,]/g, ""), 10);
    if (!isNaN(num) && num >= 1000) tags.push("surge");
  }
  return tags;
}

function tagLabel(tag: string): string {
  const map: Record<string, string> = { surge: "飙升", multi_geo: "多国", fresh: "极新" };
  return map[tag] || tag;
}

function tagColor(tag: string): { bg: string; color: string } {
  const map: Record<string, { bg: string; color: string }> = {
    surge: { bg: "rgba(239, 68, 68, 0.1)", color: "#f87171" },
    multi_geo: { bg: "rgba(94, 106, 210, 0.1)", color: "#7170ff" },
    fresh: { bg: "rgba(251, 191, 36, 0.1)", color: "#fbbf24" },
  };
  return map[tag] || { bg: "rgba(255,255,255,0.05)", color: "var(--text-tertiary)" };
}

function sortBySignal(items: TrendKeyword[], enrichMap?: Record<string, EnrichData>): TrendKeyword[] {
  return [...items].sort((a, b) => {
    // If enrich scores available, sort by score first
    const aScore = enrichMap?.[a.name]?.score;
    const bScore = enrichMap?.[b.name]?.score;
    if (aScore !== undefined && bScore !== undefined) return bScore - aScore;
    if (aScore !== undefined) return -1;
    if (bScore !== undefined) return 1;
    // Fallback: tag count + value
    const aTags = getTags(a).length;
    const bTags = getTags(b).length;
    if (aTags !== bTags) return bTags - aTags;
    const aVal = parseInt(a.value.replace(/[+%,]/g, ""), 10) || 0;
    const bVal = parseInt(b.value.replace(/[+%,]/g, ""), 10) || 0;
    return bVal - aVal;
  });
}

// --- 4-dimension composite score ---

function computeFullScore(
  enrichData: EnrichData,
  freshnessData: FreshnessData | null,
  multiGeoData: MultiGeoData | null,
): { score: number; freshness_score?: number; multi_geo_score?: number; has_full_score: boolean } {
  const growth = enrichData.growth_score || 0;
  const competition = enrichData.competition_score || 0;

  const freshness = freshnessData ? freshnessData.freshness : null;
  const multiGeo = multiGeoData
    ? Math.min(100, Math.round(multiGeoData.found_in.length / Math.max(multiGeoData.total_geos, 1) * 100))
    : null;

  let score: number;
  if (freshness !== null && multiGeo !== null) {
    // Full 4-dimension: growth 30% + competition 25% + freshness 25% + multigeo 20%
    score = Math.round(growth * 0.30 + competition * 0.25 + freshness * 0.25 + multiGeo * 0.20);
  } else if (freshness !== null) {
    score = Math.round(growth * 0.35 + competition * 0.30 + freshness * 0.35);
  } else if (multiGeo !== null) {
    score = Math.round(growth * 0.37 + competition * 0.30 + multiGeo * 0.33);
  } else {
    score = enrichData.base_score ?? enrichData.score;
  }

  return {
    score,
    freshness_score: freshness ?? undefined,
    multi_geo_score: multiGeo ?? undefined,
    has_full_score: freshness !== null && multiGeo !== null,
  };
}

// --- KGR localStorage helpers ---

function getStoredSupply(keyword: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`kgr::${keyword.toLowerCase()}`);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return typeof data.supply === "number" ? data.supply : null;
  } catch {
    return null;
  }
}

function storeSupply(keyword: string, supply: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    `kgr::${keyword.toLowerCase()}`,
    JSON.stringify({ supply, ts: Date.now() })
  );
}

// KGR Workbench localStorage
const KGR_WORKBENCH_KEY = "kgr_workbench_v3";

function loadKGRWorkbench(): KGRItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KGR_WORKBENCH_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data.items)) return [];

    // Migrate old data to new format
    return data.items.map((item: any): KGRItem => ({
      keyword: item.keyword || "",
      allintitleCount: item.allintitleCount ?? null,
      allintitleTimestamp: item.allintitleTimestamp ?? null,
      searchVolume: item.searchVolume ?? null,
      searchVolumeTimestamp: item.searchVolumeTimestamp ?? null,
      kd: item.kd ?? null,
      kdTimestamp: item.kdTimestamp ?? null,
      kgr: item.kgr ?? null,
      kgrStatus: item.kgrStatus ?? null,
      ekgr: item.ekgr ?? null,
      ekgrStatus: item.ekgrStatus ?? null,
      kdroi: item.kdroi ?? null,
      kdroiStatus: item.kdroiStatus ?? null,
      addedAt: item.addedAt || new Date().toISOString(),
      notes: item.notes || "",
    }));
  } catch {
    return [];
  }
}

function saveKGRWorkbench(items: KGRItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KGR_WORKBENCH_KEY, JSON.stringify({
    items,
    lastUpdated: new Date().toISOString()
  }));
}

// --- Jump links ---

function googleSearchUrl(kw: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(kw)}`;
}
function googleAiUrl(kw: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(`what is "${kw}", explain in both English and Chinese, just speak plainly`)}&udm=50`;
}
function googleTrendsUrl(kw: string) {
  return `https://trends.google.com/trends/explore?q=${encodeURIComponent(kw)}&date=today%201-m`;
}
function semrushUrl(kw: string) {
  return `https://www.semrush.com/analytics/keywordoverview/?q=${encodeURIComponent(kw)}`;
}
function allintitleUrl(kw: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(`allintitle:${kw}`)}`;
}
function domainSearchUrl(kw: string) {
  const slug = kw.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `https://query.domains/${encodeURIComponent(slug)}`;
}

// --- Mobile tab type ---

type MobileTab = "trending" | "queries" | "reddit" | "github" | "hn" | "technews";

// --- Main ---

export default function Home() {
  const [timeframe, setTimeframe] = useState("now 1-d");
  const [geo, setGeo] = useState("");
  const [keywords, setKeywords] = useState(DEFAULT_KEYWORDS);
  const [keywordsInput, setKeywordsInput] = useState(DEFAULT_KEYWORDS);
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forceRefresh, setForceRefresh] = useState(false);

  const [trendingGeo, setTrendingGeo] = useState("US");
  const [trendingItems, setTrendingItems] = useState<TrendingItem[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);

  const [expandedKeyword, setExpandedKeyword] = useState<string | null>(null);
  const [interestData, setInterestData] = useState<InterestPoint[]>([]);
  const [interestLoading, setInterestLoading] = useState(false);

  const [freshnessData, setFreshnessData] = useState<FreshnessData | null>(null);
  const [freshnessLoading, setFreshnessLoading] = useState(false);
  const [multiGeoData, setMultiGeoData] = useState<MultiGeoData | null>(null);
  const [multiGeoLoading, setMultiGeoLoading] = useState(false);

  const [redditPosts, setRedditPosts] = useState<RedditPost[]>([]);
  const [redditKeywords, setRedditKeywords] = useState<RedditKeyword[]>([]);
  const [redditLoading, setRedditLoading] = useState(true);

  const [hnPosts, setHnPosts] = useState<HackerNewsPost[]>([]);
  const [hnLoading, setHnLoading] = useState(true);

  const [techNewsPosts, setTechNewsPosts] = useState<TechNewsPost[]>([]);
  const [techNewsLoading, setTechNewsLoading] = useState(true);

  const [enrichMap, setEnrichMap] = useState<Record<string, EnrichData>>({});
  const [enrichLoading, setEnrichLoading] = useState(false);

  const [mobileTab, setMobileTab] = useState<MobileTab>("trending");

  // KGR Workbench state
  const [kgrItems, setKgrItems] = useState<KGRItem[]>([]);
  const [kgrExpanded, setKgrExpanded] = useState(false);
  const [kgrLoading, setKgrLoading] = useState<Record<string, boolean>>({});
  const [batchImportText, setBatchImportText] = useState("");
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [kgrFilter, setKgrFilter] = useState<'all' | 'good-kgr' | 'good-ekgr' | 'good-kdroi'>('all');
  const [kgrSort, setKgrSort] = useState<'added' | 'kgr' | 'ekgr' | 'kdroi'>('added');
  const push = usePushSubscription();

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Root Keywords Monitoring state
  const [rootsExpanded, setRootsExpanded] = useState(false);
  const [rootKeywords, setRootKeywords] = useState<RootKeyword[]>([]);
  const [rootsLoading, setRootsLoading] = useState(false);
  const [rootsImportText, setRootsImportText] = useState("");
  const [showRootsImport, setShowRootsImport] = useState(false);
  const [scanProgress, setScanProgress] = useState({ scanned: 0, total: 0 });

  // Helper function to format timestamps
  const timeAgo = (timestamp: string) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return "";
    const diff = Date.now() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "刚刚";
    if (hours < 24) return `${hours}小时前`;
    return `${Math.floor(hours / 24)}天前`;
  };

  const fetchData = useCallback(async (bypassCache = false) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ timeframe, geo, keywords });
      if (bypassCache) {
        params.set('bypassCache', 'true');
      }

      const res = await fetch(`/api/trends?${params}`);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: TrendsResponse & { enrich?: Record<string, EnrichData> } = await res.json();

      setData(json);

      // Set enrich data from response (if available)
      if (json.enrich && Object.keys(json.enrich).length > 0) {
        setEnrichMap(json.enrich);
        setEnrichLoading(false);
      }

      // 保存到 localStorage
      try {
        localStorage.setItem('trends_cache', JSON.stringify(json));
      } catch (e) {
        console.error('Failed to save cache to localStorage:', e);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, [timeframe, geo, keywords]);

  const fetchTrending = useCallback(async () => {
    setTrendingLoading(true);
    try {
      const res = await fetch(`/api/trending?geo=${trendingGeo}`);
      if (res.ok) {
        const json = await res.json();
        setTrendingItems(json.trending || []);
      }
    } catch {
      setTrendingItems([]);
    } finally {
      setTrendingLoading(false);
    }
  }, [trendingGeo]);

  const fetchReddit = useCallback(async () => {
    setRedditLoading(true);
    try {
      const res = await fetch("/api/reddit?sort=hot");
      if (res.ok) {
        const json = await res.json();
        setRedditPosts(json.posts || []);
        setRedditKeywords(json.keywords || []);
      }
    } catch {
      setRedditPosts([]);
      setRedditKeywords([]);
    } finally {
      setRedditLoading(false);
    }
  }, []);

  const fetchHackerNews = useCallback(async () => {
    setHnLoading(true);
    try {
      const res = await fetch("/api/hackernews");
      if (res.ok) {
        const json = await res.json();
        setHnPosts(json.posts || []);
      }
    } catch {
      setHnPosts([]);
    } finally {
      setHnLoading(false);
    }
  }, []);

  const fetchTechNews = useCallback(async () => {
    setTechNewsLoading(true);
    try {
      const res = await fetch("/api/technews");
      if (res.ok) {
        const json = await res.json();
        setTechNewsPosts(json.articles || []);
      }
    } catch {
      setTechNewsPosts([]);
    } finally {
      setTechNewsLoading(false);
    }
  }, []);

  useEffect(() => {
    // 页面加载时不主动获取数据，只从 localStorage 读取缓存
    if (forceRefresh) {
      fetchData(true);
      setForceRefresh(false);
    } else {
      // 尝试从 localStorage 读取缓存
      try {
        const cached = localStorage.getItem('trends_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          // 检查缓存是否在1小时内
          const cacheTime = new Date(parsed.timestamp).getTime();
          const now = Date.now();
          if (now - cacheTime < 3600000) { // 1小时内
            setData(parsed);
            setLoading(false);
            return;
          }
        }
      } catch (e) {
        console.error('Failed to read cache from localStorage:', e);
      }
      // 没有缓存或缓存过期，自动获取数据
      fetchData();
    }
  }, [fetchData, forceRefresh]);
  useEffect(() => { fetchTrending(); }, [fetchTrending]);
  useEffect(() => { fetchReddit(); }, [fetchReddit]);
  useEffect(() => { fetchHackerNews(); }, [fetchHackerNews]);
  useEffect(() => { fetchTechNews(); }, [fetchTechNews]);

  // Load KGR workbench on mount - try Supabase first, fallback to localStorage
  useEffect(() => {
    const loadKGRFromSupabase = async () => {
      try {
        const res = await fetch('/api/kgr-workbench');
        if (res.ok) {
          const data = await res.json();
          if (data.items && Array.isArray(data.items)) {
            setKgrItems(data.items);
            // Also update localStorage as backup
            saveKGRWorkbench(data.items);
            return;
          }
        }
      } catch (error) {
        console.log('[KGR] Failed to load from Supabase, using localStorage');
      }
      // Fallback to localStorage
      setKgrItems(loadKGRWorkbench());
    };

    loadKGRFromSupabase();
  }, []);

  // Save KGR workbench on change - localStorage immediately, sync to Supabase in background
  useEffect(() => {
    // Always save to localStorage immediately
    saveKGRWorkbench(kgrItems);

    // Sync to Supabase in background (don't await, let it happen asynchronously)
    if (kgrItems.length > 0) {
      fetch('/api/kgr-workbench', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: kgrItems }),
      }).catch((error) => {
        // Silent fail - localStorage is the source of truth for offline
        console.log('[KGR] Background sync failed:', error);
      });
    }
  }, [kgrItems]);

  // Fetch enrich scores when google data is available
  useEffect(() => {
    fetchRootKeywords();
  }, []);

  useEffect(() => {
    if (!data || data.google.length === 0) return;

    // Check if enrich data is already in the response (from backend cache)
    const enrichData = (data as any).enrich as Record<string, EnrichData> | undefined;
    if (enrichData && Object.keys(enrichData).length > 0) {
      setEnrichMap(enrichData);
      setEnrichLoading(false);
      return;
    }

    // Fallback: fetch enrich data for old cache without enrich
    setEnrichLoading(true);

    // Select top 10 keywords by surge value (not by position)
    const sortedByValue = [...data.google].sort((a, b) => {
      // Extract numeric value from strings like "+5000%", "200", "Breakout"
      const getNumericValue = (val: string): number => {
        if (val === "Breakout") return 10000;
        const num = parseInt(val.replace(/[+%,]/g, ""), 10);
        return isNaN(num) ? 0 : num;
      };
      return getNumericValue(b.value) - getNumericValue(a.value);
    });

    const topKeywords = sortedByValue.slice(0, 10).map((k) => ({ name: k.name, value: k.value }));
    fetch("/api/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: topKeywords }),
    })
      .then((r) => r.json())
      .then((d: EnrichResponse) => setEnrichMap(d.results || {}))
      .catch(() => setEnrichMap({}))
      .finally(() => setEnrichLoading(false));
  }, [data]);

  // Fetch interest + freshness + multi-geo when a keyword is expanded
  useEffect(() => {
    if (!expandedKeyword) return;

    // Interest (existing)
    setInterestLoading(true);
    setInterestData([]);
    const interestParams = new URLSearchParams({ keyword: expandedKeyword, geo });
    fetch(`/api/interest?${interestParams}`)
      .then((r) => r.json())
      .then((d) => setInterestData(d.points || []))
      .catch(() => setInterestData([]))
      .finally(() => setInterestLoading(false));

    // Freshness
    setFreshnessLoading(true);
    setFreshnessData(null);
    const freshParams = new URLSearchParams({ keyword: expandedKeyword, geo });
    fetch(`/api/freshness?${freshParams}`)
      .then((r) => r.json())
      .then((d) => setFreshnessData(d))
      .catch(() => setFreshnessData(null))
      .finally(() => setFreshnessLoading(false));

    // Multi-geo
    setMultiGeoLoading(true);
    setMultiGeoData(null);
    const mgParams = new URLSearchParams({ keyword: expandedKeyword });
    fetch(`/api/multi-geo?${mgParams}`)
      .then((r) => r.json())
      .then((d) => setMultiGeoData(d))
      .catch(() => setMultiGeoData(null))
      .finally(() => setMultiGeoLoading(false));

  }, [expandedKeyword, geo]);

  // Progressive score upgrade: when freshness/multi-geo arrives, recompute full score
  useEffect(() => {
    if (!expandedKeyword || !enrichMap[expandedKeyword]) return;
    if (freshnessLoading || multiGeoLoading) return;

    const current = enrichMap[expandedKeyword];
    const { score, freshness_score, multi_geo_score, has_full_score } = computeFullScore(
      current, freshnessData, multiGeoData,
    );

    if (score !== current.score ||
        freshness_score !== current.freshness_score ||
        multi_geo_score !== current.multi_geo_score) {
      setEnrichMap(prev => ({
        ...prev,
        [expandedKeyword]: { ...prev[expandedKeyword], score, freshness_score, multi_geo_score, has_full_score },
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedKeyword, freshnessData, multiGeoData, freshnessLoading, multiGeoLoading]);

  const handleKeywordsSubmit = () => {
    const trimmed = keywordsInput.trim();
    if (trimmed && trimmed !== keywords) setKeywords(trimmed);
  };

  const toggleExpand = (name: string) => {
    setExpandedKeyword(expandedKeyword === name ? null : name);
  };

  // KGR Workbench handlers
  const handleAddToKGR = useCallback((keyword: string) => {
    // Check if already exists
    if (kgrItems.some(item => item.keyword === keyword)) {
      setToast({ message: `"${keyword}" 已在工作台中`, type: 'info' });
      setTimeout(() => setToast(null), 2000);
      return; // Already in workbench
    }

    const newItem: KGRItem = {
      keyword,
      allintitleCount: null,
      allintitleTimestamp: null,
      searchVolume: null,
      searchVolumeTimestamp: null,
      kd: null,
      kdTimestamp: null,
      kgr: null,
      kgrStatus: null,
      ekgr: null,
      ekgrStatus: null,
      kdroi: null,
      kdroiStatus: null,
      addedAt: new Date().toISOString(),
    };

    setKgrItems(prev => [...prev, newItem]);

    // Auto-fetch allintitle
    fetchAllintitleForKGR(keyword);

    // Show success message
    setToast({ message: `已添加 "${keyword}" 到 KGR 工作台`, type: 'success' });
    setTimeout(() => setToast(null), 2000);
  }, [kgrItems]);

  const fetchAllintitleForKGR = async (keyword: string) => {
    setKgrLoading(prev => ({ ...prev, [keyword]: true }));

    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: [{ name: keyword, value: "0" }]
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const count = data.results[keyword]?.allintitle_count;

        if (count !== undefined && count >= 0) {
          handleUpdateKGR(keyword, {
            allintitleCount: count,
            allintitleTimestamp: new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      console.error("Failed to fetch allintitle:", e);
    } finally {
      setKgrLoading(prev => ({ ...prev, [keyword]: false }));
    }
  };

  const handleUpdateKGR = (keyword: string, updates: Partial<KGRItem>) => {
    setKgrItems(prev => prev.map(item => {
      if (item.keyword === keyword) {
        const updated = { ...item, ...updates };

        // Recalculate KGR if we have the data
        // KGR = allintitleCount / searchVolume
        if (updated.searchVolume && updated.allintitleCount && updated.allintitleCount > 0) {
          updated.kgr = updated.allintitleCount / updated.searchVolume;
          if (updated.kgr < 0.25) updated.kgrStatus = 'good';
          else if (updated.kgr < 1) updated.kgrStatus = 'medium';
          else updated.kgrStatus = 'bad';
        } else {
          updated.kgr = null;
          updated.kgrStatus = null;
        }

        // Calculate EKGR
        updated.ekgr = calculateEKGR(updated.searchVolume, updated.allintitleCount, updated.kd);
        if (updated.ekgr !== null) {
          if (updated.ekgr < 0.25) updated.ekgrStatus = 'good';
          else if (updated.ekgr < 1) updated.ekgrStatus = 'medium';
          else updated.ekgrStatus = 'bad';
        } else {
          updated.ekgrStatus = null;
        }

        // Calculate KDROI
        updated.kdroi = calculateKDROI(updated.searchVolume, updated.kd);
        if (updated.kdroi !== null) {
          if (updated.kdroi > 100) updated.kdroiStatus = 'good';
          else updated.kdroiStatus = 'bad';
        } else {
          updated.kdroiStatus = null;
        }

        return updated;
      }
      return item;
    }));
  };

  const handleRemoveFromKGR = (keyword: string) => {
    setKgrItems(prev => prev.filter(item => item.keyword !== keyword));
  };

  // Batch import keywords
  const handleBatchImport = () => {
    const keywords = batchImportText
      .split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    let addedCount = 0;
    let skippedCount = 0;

    keywords.forEach(keyword => {
      // Check if already exists
      if (kgrItems.some(item => item.keyword === keyword)) {
        skippedCount++;
        return;
      }

      const newItem: KGRItem = {
        keyword,
        allintitleCount: null,
        allintitleTimestamp: null,
        searchVolume: null,
        searchVolumeTimestamp: null,
        kd: null,
        kdTimestamp: null,
        kgr: null,
        kgrStatus: null,
        ekgr: null,
        ekgrStatus: null,
        kdroi: null,
        kdroiStatus: null,
        addedAt: new Date().toISOString(),
      };

      setKgrItems(prev => [...prev, newItem]);
      fetchAllintitleForKGR(keyword);
      addedCount++;
    });

    setBatchImportText("");
    setShowBatchImport(false);

    // Show summary toast
    if (addedCount > 0 || skippedCount > 0) {
      let message = `批量导入完成`;
      if (addedCount > 0) message += `，添加 ${addedCount} 个`;
      if (skippedCount > 0) message += `，跳过 ${skippedCount} 个（已存在）`;
      setToast({ message, type: 'success' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Fetch allintitle for all items
  const handleFetchAllAllintitle = async () => {
    for (const item of kgrItems) {
      if (item.allintitleCount === null) {
        await fetchAllintitleForKGR(item.keyword);
      }
    }
  };

  // Filter and sort items
  const filteredAndSortedItems = useMemo(() => {
    let items = [...kgrItems];

    // Apply filter
    if (kgrFilter === 'good-kgr') {
      items = items.filter(item => item.kgrStatus === 'good');
    } else if (kgrFilter === 'good-ekgr') {
      items = items.filter(item => item.ekgrStatus === 'good');
    } else if (kgrFilter === 'good-kdroi') {
      items = items.filter(item => item.kdroiStatus === 'good');
    }

    // Apply sort
    items.sort((a, b) => {
      if (kgrSort === 'added') {
        return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
      } else if (kgrSort === 'kgr') {
        const aVal = a.kgr ?? Infinity;
        const bVal = b.kgr ?? Infinity;
        return aVal - bVal;
      } else if (kgrSort === 'ekgr') {
        const aVal = a.ekgr ?? -Infinity;
        const bVal = b.ekgr ?? -Infinity;
        return bVal - aVal;
      } else if (kgrSort === 'kdroi') {
        const aVal = a.kdroi ?? -Infinity;
        const bVal = b.kdroi ?? -Infinity;
        return bVal - aVal;
      }
      return 0;
    });

    return items;
  }, [kgrItems, kgrFilter, kgrSort]);

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ['关键词', 'allintitle', '搜索量', 'KD', 'KGR', 'KGR状态', 'EKGR', 'EKGR状态', 'KDROI', 'KDROI状态'];
    const rows = filteredAndSortedItems.map(item => [
      item.keyword,
      item.allintitleCount ?? '',
      item.searchVolume ?? '',
      item.kd ?? '',
      item.kgr?.toFixed(4) ?? '',
      item.kgrStatus ?? '',
      item.ekgr?.toFixed(4) ?? '',
      item.ekgrStatus ?? '',
      (item.kdroi?.toFixed(2) ?? '') + '%',
      item.kdroiStatus ?? ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `kgr-analysis-${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCompareTrends = () => {
    const keywords = kgrItems.map(item => item.keyword);
    if (keywords.length === 0) return;

    const url = `https://trends.google.com/trends/explore?date=today%201-m&q=${
      keywords.map(k => encodeURIComponent(k)).join(",")
    }`;
    window.open(url, "_blank");
  };

  // Root Keywords Monitoring handlers
  const fetchRootKeywords = async () => {
    try {
      const res = await fetch("/api/roots");
      if (res.ok) {
        const data = await res.json();
        setRootKeywords(data.keywords || []);
      }
    } catch (e) {
      console.error("Failed to fetch root keywords:", e);
    }
  };

  const addRootKeyword = async (keyword: string) => {
    try {
      const res = await fetch(`/api/roots?keyword=${encodeURIComponent(keyword)}`, {
        method: "POST"
      });
      if (res.ok) {
        await fetchRootKeywords();
      }
    } catch (e) {
      console.error("Failed to add root keyword:", e);
    }
  };

  const deleteRootKeyword = async (keyword: string) => {
    try {
      const res = await fetch(`/api/roots/${encodeURIComponent(keyword)}`, {
        method: "DELETE"
      });
      if (res.ok) {
        await fetchRootKeywords();
      }
    } catch (e) {
      console.error("Failed to delete root keyword:", e);
    }
  };

  const importRootKeywords = async () => {
    const keywords = rootsImportText
      .split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    if (keywords.length === 0) return;

    try {
      const res = await fetch("/api/roots/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(keywords)
      });

      if (res.ok) {
        const data = await res.json();
        await fetchRootKeywords();
        setRootsImportText("");
        setShowRootsImport(false);
      }
    } catch (e) {
      console.error("Failed to import root keywords:", e);
    }
  };

  const scanRootKeywords = async (limit: number = 5) => {
    setRootsLoading(true);
    try {
      const res = await fetch(`/api/roots/scan?limit=${limit}`, {
        method: "POST"
      });

      if (res.ok) {
        const data = await res.json();
        await fetchRootKeywords();
        setScanProgress({ scanned: data.scanned, total: rootKeywords.length });
      }
    } catch (e) {
      console.error("Failed to scan root keywords:", e);
    } finally {
      setRootsLoading(false);
    }
  };

  const currentTimeframe = TIMEFRAME_OPTIONS.find((t) => t.value === timeframe);
  const currentGeo = GEO_OPTIONS.find((g) => g.value === geo);
  // Memoize sort: only re-sort when enrich batch completes, not on progressive updates
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sortedGoogle = useMemo(() => data ? sortBySignal(data.google, enrichMap) : [], [data, enrichLoading]);

  const TRENDING_GEOS = [
    { label: "US", value: "US" },
    { label: "ID", value: "ID" },
    { label: "BR", value: "BR" },
  ];

  const MOBILE_TABS: { key: MobileTab; label: string; icon: string }[] = [
    { key: "trending", label: "Trending", icon: "🔥" },
    { key: "queries", label: "Queries", icon: "📊" },
    { key: "github", label: "GitHub", icon: "💻" },
    { key: "reddit", label: "Reddit", icon: "💬" },
    { key: "hn", label: "HN", icon: "🍊" },
    { key: "technews", label: "Tech", icon: "📰" },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      {/* ===== Header ===== */}
      <header
        className="sticky top-0 z-10 backdrop-blur-md"
        style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(8, 9, 10, 0.85)" }}
      >
        <div className="mx-auto max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
          {/* Title row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-medium sm:text-xl">
                <span style={{ color: "var(--accent-blue-hover)", letterSpacing: "-0.02em" }}>Trends</span>{" "}
                <span className="hidden sm:inline">Watcher Board</span>
                <span className="sm:hidden">Board</span>
              </h1>
              <a
                href="/batch-gt"
                className="rounded-md px-2 py-1 text-xs font-medium transition-colors hover:opacity-80"
                style={{ background: "var(--bg-elevated)", color: "var(--text-tertiary)" }}
              >
                批量 GT
              </a>
              {push.supported && (
                <button
                  onClick={push.subscribed ? push.unsubscribe : push.subscribe}
                  disabled={push.loading}
                  className="rounded-md px-2 py-1 text-xs font-medium transition-colors hover:opacity-80"
                  style={{
                    background: push.subscribed ? "rgba(39, 166, 68, 0.1)" : "var(--bg-elevated)",
                    color: push.subscribed ? "var(--accent-green-bright)" : "var(--text-tertiary)",
                  }}
                  title={push.subscribed ? "关闭推送" : "开启推送通知"}
                >
                  {push.loading ? "..." : push.subscribed ? "🔔 已订阅" : "🔕 推送"}
                </button>
              )}
            </div>
            <button
              onClick={() => { fetchData(); fetchTrending(); fetchReddit(); fetchHackerNews(); fetchTechNews(); }}
              disabled={loading}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm"
              style={{
                background: loading ? "var(--bg-elevated)" : "var(--accent-blue)",
                color: "var(--text-primary)",
                opacity: loading ? 0.6 : 1,
                boxShadow: loading ? "none" : "var(--shadow-subtle)",
              }}
            >
              {loading ? "..." : "Refresh"}
            </button>
          </div>

          {/* Keywords */}
          <div className="mt-3 flex items-center gap-1.5 sm:mt-4 sm:gap-2">
            <span className="hidden text-xs font-medium sm:block" style={{ color: "var(--text-secondary)" }}>KEYWORDS</span>
            <input
              type="text"
              value={keywordsInput}
              onChange={(e) => setKeywordsInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleKeywordsSubmit(); }}
              placeholder={DEFAULT_KEYWORDS}
              className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none transition-colors sm:py-1.5 sm:text-xs"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)", borderRadius: "var(--radius-md)" }}
            />
            <button
              onClick={handleKeywordsSubmit}
              className="shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition-colors sm:py-1.5"
              style={{ background: "var(--bg-elevated)", color: "var(--text-tertiary)", borderColor: "var(--border)", borderRadius: "var(--radius-md)" }}
            >
              Apply
            </button>
          </div>
        </div>
      </header>

      {/* ===== Mobile Tab Bar ===== */}
      <div
        className="sticky z-10 sm:hidden"
        style={{ top: "auto", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-primary)" }}
      >
        <div className="flex">
          {MOBILE_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setMobileTab(tab.key)}
              className="flex-1 py-2.5 text-center text-sm font-medium transition-colors"
              style={{
                color: mobileTab === tab.key ? "var(--accent-blue-hover)" : "var(--text-tertiary)",
                borderBottom: mobileTab === tab.key ? "2px solid var(--accent-blue-hover)" : "2px solid transparent",
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== KGR Workbench Panel ===== */}
      {kgrExpanded && (
        <div className="mx-auto max-w-7xl px-3 py-3 sm:px-4">
          <div className="border" style={{
            background: "var(--bg-card)",
            borderColor: "var(--border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-surface)"
          }}>
            <div className="p-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🎯</span>
                  <h2 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    KGR 决策工作台
                  </h2>
                  <span className="rounded-full px-2 py-0.5 text-xs"
                    style={{ background: "var(--bg-elevated)", color: "var(--text-tertiary)" }}>
                    {kgrItems.length}
                  </span>
                </div>
                <div className="flex gap-2">
                  {kgrItems.length > 0 && (
                    <>
                      <button onClick={handleFetchAllAllintitle}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80"
                        style={{ background: "var(--accent-blue)", color: "var(--text-primary)" }}
                        title="自动获取所有关键词的 allintitle 数据">
                        🔄 一键分析
                      </button>
                      <button onClick={handleExportCSV}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80"
                        style={{ background: "var(--accent-green)", color: "var(--text-primary)" }}
                        title="导出为 CSV 文件">
                        📥 导出
                      </button>
                      <button onClick={handleCompareTrends}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80"
                        style={{ background: "var(--bg-elevated)", color: "var(--text-tertiary)" }}>
                        📊 对比
                      </button>
                    </>
                  )}
                  <button onClick={() => setShowBatchImport(!showBatchImport)}
                    className="rounded-lg px-2 py-1 text-xs transition-colors hover:opacity-80"
                    style={{ background: "var(--bg-elevated)", color: "var(--text-tertiary)" }}
                    title="批量导入关键词">
                    📋 批量
                  </button>
                  <button onClick={() => setKgrExpanded(false)}
                    className="rounded-lg px-2 py-1 text-xs transition-colors hover:opacity-80"
                    style={{ background: "var(--bg-elevated)", color: "var(--text-tertiary)" }}>
                    ✕
                  </button>
                </div>
              </div>
            </div>

            {/* Manual keyword input */}
            <div className="p-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <input type="text" placeholder="手动添加关键词，按回车确认..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.currentTarget.value.trim()) {
                    handleAddToKGR(e.currentTarget.value.trim());
                    e.currentTarget.value = "";
                  }
                }}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
                style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
              />

              {/* Batch import textarea */}
              {showBatchImport && (
                <div className="mt-3">
                  <textarea
                    value={batchImportText}
                    onChange={(e) => setBatchImportText(e.target.value)}
                    placeholder="批量导入关键词（每行一个）&#10;AI tool&#10;machine learning&#10;data science"
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
                    style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)", minHeight: "120px" }}
                    rows={5}
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={handleBatchImport}
                      disabled={!batchImportText.trim()}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-50"
                      style={{ background: "var(--accent-blue)", color: "var(--text-primary)" }}
                    >
                      导入 {batchImportText.split('\n').filter(k => k.trim()).length} 个关键词
                    </button>
                    <button
                      onClick={() => { setShowBatchImport(false); setBatchImportText(""); }}
                      className="rounded-lg px-3 py-1.5 text-xs transition-colors hover:opacity-80"
                      style={{ background: "var(--bg-elevated)", color: "var(--text-tertiary)" }}
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Filter and Sort controls */}
            {kgrItems.length > 0 && (
              <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>筛选:</span>
                    <select
                      value={kgrFilter}
                      onChange={(e) => setKgrFilter(e.target.value as any)}
                      className="rounded border px-2 py-1 text-xs outline-none"
                      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                    >
                      <option value="all">全部</option>
                      <option value="good-kgr">黄金 KGR</option>
                      <option value="good-ekgr">优质 EKGR</option>
                      <option value="good-kdroi">高 KDROI</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>排序:</span>
                    <select
                      value={kgrSort}
                      onChange={(e) => setKgrSort(e.target.value as any)}
                      className="rounded border px-2 py-1 text-xs outline-none"
                      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                    >
                      <option value="added">添加时间</option>
                      <option value="kgr">KGR (低→高)</option>
                      <option value="ekgr">EKGR (高→低)</option>
                      <option value="kdroi">KDROI (高→低)</option>
                    </select>
                  </div>
                  <div className="ml-auto text-xs" style={{ color: "var(--text-tertiary)" }}>
                    显示 {filteredAndSortedItems.length} / {kgrItems.length} 个
                  </div>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
              {filteredAndSortedItems.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-xs" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                      <th className="p-2 text-left font-medium">关键词</th>
                      <th className="p-2 text-right font-medium">allintitle</th>
                      <th className="p-2 text-right font-medium">搜索量</th>
                      <th className="p-2 text-right font-medium">KD</th>
                      <th className="p-2 text-right font-medium">KGR</th>
                      <th className="p-2 text-right font-medium">EKGR</th>
                      <th className="p-2 text-right font-medium">KDROI</th>
                      <th className="p-2 text-left font-medium">备注</th>
                      <th className="p-2 text-center font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedItems.map((item) => (
                      <KGRRow key={item.keyword} item={item}
                        onUpdate={handleUpdateKGR}
                        onRemove={handleRemoveFromKGR}
                        onFetchAllintitle={fetchAllintitleForKGR}
                        loading={kgrLoading[item.keyword]}
                      />
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
                  {kgrItems.length === 0 ? "从下方列表添加关键词，或手动输入" : "没有符合筛选条件的关键词"}
                </div>
              )}
            </div>

            {/* Help text */}
            <div className="border-t p-3 text-xs" style={{
              borderColor: "var(--border)",
              color: "var(--text-tertiary)"
            }}>
              <div className="space-y-3 sm:space-y-1.5">
                <div className="flex items-start gap-2">
                  <span className="shrink-0">📊</span>
                  <div>
                    <strong>KGR</strong> = 搜索量 ÷ allintitle
                    <span className="ml-1 inline-block rounded px-1" style={{ background: "rgba(52,211,153,0.15)", color: "#34d399" }}>&lt; 0.025 🏆 黄金</span>
                    <span className="ml-1 inline-block rounded px-1" style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80" }}>&lt; 0.1 ✅ 优质</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="shrink-0">🎯</span>
                  <div>
                    <strong>EKGR</strong> = (搜索量 × 0.6) ÷ (allintitle × √KD)
                    <span className="ml-1 inline-block rounded px-1" style={{ background: "rgba(52,211,153,0.15)", color: "#34d399" }}>&gt; 20 🏆 极优</span>
                    <span className="ml-1 inline-block rounded px-1" style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80" }}>&gt; 10 ✅ 优质</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="shrink-0">💰</span>
                  <div>
                    <strong>KDROI</strong> = (收入 - 反链成本) ÷ 反链成本
                    <span className="ml-1 inline-block rounded px-1" style={{ background: "rgba(52,211,153,0.15)", color: "#34d399" }}>&gt; 200% 🏆 极高回报</span>
                  </div>
                </div>
                <div className="pt-1" style={{ color: "var(--text-tertiary)" }}>
                  数据来源: <a href="https://www.semrush.com" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--accent-blue-hover)" }}>Semrush</a> | <a href="https://ads.google.com/aw/keywordplanner" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--accent-blue-hover)" }}>Google Ads</a> | <a href="https://ahrefs.com" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--accent-blue-hover)" }}>Ahrefs</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Root Keywords Monitoring Panel */}
      {rootsExpanded && (
        <div className="mx-auto max-w-7xl px-3 py-3 sm:px-4">
          <div className="border" style={{
            background: "var(--bg-card)",
            borderColor: "var(--border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-surface)"
          }}>
            <div className="p-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🌱</span>
                  <h2 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    词根监控
                  </h2>
                  <span className="rounded-full px-2 py-0.5 text-xs"
                    style={{ background: "var(--bg-elevated)", color: "var(--text-tertiary)" }}>
                    {rootKeywords.length}
                  </span>
                </div>
                <button onClick={() => setRootsExpanded(false)}
                  className="rounded-lg px-2 py-1 text-xs transition-colors hover:opacity-80"
                  style={{ background: "var(--bg-elevated)", color: "var(--text-tertiary)" }}>
                  ✕
                </button>
              </div>
            </div>

            {/* Add keyword input */}
            <div className="p-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <input type="text" placeholder="添加词根，按回车确认..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.currentTarget.value.trim()) {
                    addRootKeyword(e.currentTarget.value.trim());
                    e.currentTarget.value = "";
                  }
                }}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
                style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
              />
            </div>

            {/* Root keywords list */}
            <div className="max-h-96 overflow-y-auto p-3">
              {rootsLoading ? (
                <div className="text-center py-4" style={{ color: "var(--text-tertiary)" }}>加载中...</div>
              ) : rootKeywords.length === 0 ? (
                <div className="text-center py-4 text-sm" style={{ color: "var(--text-tertiary)" }}>
                  暂无词根，请添加
                </div>
              ) : (
                <div className="space-y-2">
                  {rootKeywords.map((root) => (
                    <div key={root.id} className="flex items-center justify-between rounded-lg border p-2 text-sm"
                      style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium" style={{ color: "var(--text-primary)" }}>{root.keyword}</span>
                        {root.category && (
                          <span className="rounded px-1.5 py-0.5 text-xs"
                            style={{ background: "var(--accent-blue)", color: "var(--text-primary)" }}>
                            {root.category}
                          </span>
                        )}
                        <span className={`rounded px-1.5 py-0.5 text-xs ${
                          root.priority === "high" ? "bg-red-100 text-red-700" :
                          root.priority === "medium" ? "bg-yellow-100 text-yellow-700" :
                          "bg-gray-100 text-gray-700"
                        }`}>
                          {root.priority === "high" ? "高" : root.priority === "medium" ? "中" : "低"}
                        </span>
                      </div>
                      <button
                        onClick={() => deleteRootKeyword(root.keyword)}
                        className="rounded px-2 py-1 text-xs transition-colors hover:opacity-80"
                        style={{ background: "var(--accent-red)", color: "var(--text-primary)" }}>
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toggle buttons when collapsed - combined toolbar */}
      {!kgrExpanded && !rootsExpanded && (
        <div className="mx-auto max-w-7xl flex gap-2 px-3 pb-3 pt-4 sm:px-4">
          <button onClick={() => setKgrExpanded(true)}
            className="flex-1 border px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80 sm:flex-none sm:min-w-0"
            style={{
              background: "var(--bg-elevated)",
              borderColor: "var(--border)",
              borderRadius: "var(--radius-md)",
              color: kgrItems.length > 0 ? "var(--accent-blue-hover)" : "var(--text-tertiary)"
            }}>
            🎯 KGR {kgrItems.length > 0 && `(${kgrItems.length})`}
          </button>
          <button onClick={() => setRootsExpanded(true)}
            className="flex-1 border px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80 sm:flex-none sm:min-w-0"
            style={{
              background: "var(--bg-elevated)",
              borderColor: "var(--border)",
              borderRadius: "var(--radius-md)",
              color: rootKeywords.length > 0 ? "var(--accent-blue-hover)" : "var(--text-tertiary)"
            }}>
            🌱 词根监控 {rootKeywords.length > 0 && `(${rootKeywords.length})`}
          </button>
        </div>
      )}

      {/* Toggle button when only KGR is collapsed */}
      {!kgrExpanded && rootsExpanded && (
        <div className="mx-auto max-w-7xl px-3 pb-3 pt-4 sm:px-4">
          <button onClick={() => setKgrExpanded(true)}
            className="border px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80"
            style={{
              background: "var(--bg-elevated)",
              borderColor: "var(--border)",
              borderRadius: "var(--radius-md)",
              color: kgrItems.length > 0 ? "var(--accent-blue-hover)" : "var(--text-tertiary)"
            }}>
            🎯 KGR {kgrItems.length > 0 && `(${kgrItems.length})`}
          </button>
        </div>
      )}

      {/* Toggle button when only roots is collapsed */}
      {kgrExpanded && !rootsExpanded && (
        <div className="mx-auto max-w-7xl px-3 pb-3 pt-4 sm:px-4">
          <button onClick={() => setRootsExpanded(true)}
            className="border px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80"
            style={{
              background: "var(--bg-elevated)",
              borderColor: "var(--border)",
              borderRadius: "var(--radius-md)",
              color: rootKeywords.length > 0 ? "var(--accent-blue-hover)" : "var(--text-tertiary)"
            }}>
            🌱 词根监控 {rootKeywords.length > 0 && `(${rootKeywords.length})`}
          </button>
        </div>
      )}

      {/* ===== Main Content ===== */}
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
        {data && !loading && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs sm:mb-4 sm:gap-3" style={{ color: "var(--text-tertiary)" }}>
            <span>{currentGeo?.flag || "🌍"} {currentGeo?.label || "Global"} · {currentTimeframe?.description}</span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">Updated {new Date(data.timestamp).toLocaleTimeString()}</span>
          </div>
        )}

        {error && (
          <div className="mb-3 border p-3 text-sm sm:mb-4 sm:p-4"
            style={{ borderColor: "var(--accent-red)", background: "rgba(239, 68, 68, 0.06)", color: "var(--accent-red)", borderRadius: "var(--radius-lg)" }}>
            Failed to load: {error}
          </div>
        )}

        {/* Main content always visible, each section handles its own loading state */}
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-4">
            {/* --- Trending Now --- */}
            <section className={`${mobileTab !== "trending" ? "hidden" : ""} sm:block`}>
              <SectionHeader title="Trending Now" icon="🔥" count={trendingItems.length}>
                <div className="flex gap-0.5 rounded-md p-0.5" style={{ background: "var(--bg-secondary)" }}>
                  {TRENDING_GEOS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTrendingGeo(opt.value)}
                      className="rounded px-1.5 py-0.5 text-xs font-medium transition-colors"
                      style={{
                        background: trendingGeo === opt.value ? "var(--accent-blue)" : "transparent",
                        color: trendingGeo === opt.value ? "var(--text-primary)" : "var(--text-tertiary)",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </SectionHeader>
              <div className="space-y-3 lg:max-h-[calc(100vh-240px)] lg:overflow-y-auto lg:space-y-1.5">
                {trendingLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-11 animate-pulse rounded-lg" style={{ background: "var(--bg-card)", opacity: 1 - i * 0.12 }} />
                  ))
                ) : trendingItems.length === 0 ? (
                  <EmptyState text="No trending data" />
                ) : (
                  trendingItems.map((item, i) => (
                    <TrendingCard
                      key={`t-${i}`}
                      item={item}
                      index={i}
                      isExpanded={expandedKeyword === item.name}
                      onToggle={() => toggleExpand(item.name)}
                      interestData={expandedKeyword === item.name ? interestData : []}
                      interestLoading={expandedKeyword === item.name && interestLoading}
                      onAddToKGR={handleAddToKGR}
                    />
                  ))
                )}
              </div>
            </section>

            {/* --- Related Queries --- */}
            <section className={`${mobileTab !== "queries" ? "hidden" : ""} sm:block`}>
              <SectionHeader title="Related Queries" icon="📊" count={data?.google?.length || 0}>
                <button
                  onClick={() => setForceRefresh(true)}
                  disabled={loading}
                  className="rounded-md px-2.5 py-1 text-xs font-medium transition-opacity disabled:opacity-50"
                  style={{
                    background: "var(--bg-elevated)",
                    color: "var(--text-tertiary)",
                    border: "1px solid var(--border-color)"
                  }}
                  title="强制刷新（绕过缓存，获取最新数据）"
                >
                  {loading ? "刷新中..." : "🔄 刷新"}
                </button>
                {data?.timestamp && (
                  <span className="hidden rounded-md px-2 py-1 text-xs sm:inline-block" style={{ color: "var(--text-tertiary)" }}>
                    🕒 {timeAgo(data.timestamp)}
                  </span>
                )}
                <CompactTimeSelector
                  value={timeframe}
                  onChange={setTimeframe}
                  options={TIMEFRAME_OPTIONS}
                />
                <CompactGeoSelector
                  value={geo}
                  onChange={setGeo}
                  options={GEO_OPTIONS}
                />
              </SectionHeader>

              {/* Google 限频提示 - 显示缓存数据时也提示 */}
              {data?._stale && (
                <div className="mb-3 border p-3 text-xs" style={{ borderColor: "rgba(251,191,36,0.3)", background: "rgba(251,191,36,0.06)", color: "#fbbf24", borderRadius: "var(--radius-lg)" }}>
                  <div className="flex items-start gap-2">
                    <span className="text-sm">⚠️</span>
                    <div>
                      <div className="font-medium">Google Trends 暂时不可用（显示缓存数据）</div>
                      <div style={{ color: "var(--text-tertiary)" }}>Google 正在限频，当前显示的是缓存数据。点击刷新按钮将重新获取最新数据。</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-2 space-y-3 lg:max-h-[calc(100vh-240px)] lg:overflow-y-auto lg:space-y-1.5">
                {loading ? (
                  <div className="rounded-lg p-4 text-center" style={{ background: "var(--bg-secondary)" }}>
                    <div className="mb-2 flex justify-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--accent-blue-hover)", borderTopColor: "transparent" }}></div>
                    </div>
                    <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      正在获取 Google Trends 数据...
                    </div>
                  </div>
                ) : sortedGoogle.length === 0 ? (
                  <EmptyState
                    text={
                      data?._stale ? "Google Trends 暂时不可用（限频中）" :
                      data?._status ? `Google Trends 错误: ${data._status}` :
                      "No Google Trends data"
                    }
                    actionLink={(function() {
                      const keywordsArray = keywords.split(',').map(k => k.trim());
                      const qParam = keywordsArray.map(k => encodeURIComponent(k)).join(',');
                      return `https://trends.google.com/trends/explore?q=${qParam}&date=${encodeURIComponent(timeframe)}${geo ? `&geo=${geo}` : ''}`;
                    })()}
                    actionText="在 Google Trends 查看 →"
                  />
                ) : (
                  sortedGoogle.map((item, i) => (
                    <KeywordCard
                      key={`g-${item.name}`}
                      item={item}
                      index={i}
                      isExpanded={expandedKeyword === item.name}
                      onToggle={() => toggleExpand(item.name)}
                      interestData={expandedKeyword === item.name ? interestData : []}
                      interestLoading={expandedKeyword === item.name && interestLoading}
                      freshnessData={expandedKeyword === item.name ? freshnessData : null}
                      freshnessLoading={expandedKeyword === item.name && freshnessLoading}
                      multiGeoData={expandedKeyword === item.name ? multiGeoData : null}
                      multiGeoLoading={expandedKeyword === item.name && multiGeoLoading}
                      enrichData={enrichMap[item.name]}
                      enrichLoading={enrichLoading}
                      onAddToKGR={handleAddToKGR}
                    />
                  ))
                )}
              </div>
            </section>

            {/* --- Reddit Signals --- */}
            <section className={`${mobileTab !== "reddit" ? "hidden" : ""} sm:block`}>
              <SectionHeader title="Reddit Signals" icon="💬" count={redditPosts.length} />
              <div className="mt-2 space-y-3 lg:max-h-[calc(100vh-240px)] lg:overflow-y-auto lg:space-y-1.5">
                {redditLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-11 animate-pulse rounded-lg" style={{ background: "var(--bg-card)", opacity: 1 - i * 0.12 }} />
                  ))
                ) : redditPosts.length === 0 ? (
                  <EmptyState text="No Reddit data" />
                ) : (
                  <>
                    {redditKeywords.length > 0 && (
                      <div className="rounded-lg border p-2.5" style={{ background: "rgba(255, 69, 0, 0.04)", borderColor: "rgba(255, 69, 0, 0.2)" }}>
                        <div className="mb-1.5 text-xs font-medium" style={{ color: "#ff4500" }}>
                          LLM Extracted Keywords
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {redditKeywords.map((kw, i) => (
                            <a
                              key={i}
                              href={`https://www.google.com/search?q=${encodeURIComponent(kw.keyword)}&udm=50`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-md px-2 py-1 text-xs font-medium transition-opacity hover:opacity-80"
                              style={{ background: "rgba(255, 69, 0, 0.12)", color: "#ff6b35" }}
                              title={kw.context}
                            >
                              {kw.keyword} ({kw.posts})
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    {redditPosts.map((post, i) => (
                      <RedditCard key={`r-${i}`} post={post} index={i} />
                    ))}
                  </>
                )}
              </div>
            </section>

            {/* --- HackerNews --- */}
            <section className={`${mobileTab !== "hn" ? "hidden" : ""} sm:block`}>
              <SectionHeader title="HackerNews" icon="🍊" count={hnPosts.length} />
              <div className="mt-2 space-y-3 lg:max-h-[calc(100vh-240px)] lg:overflow-y-auto lg:space-y-1.5">
                {hnLoading ? (
                  <div className="py-8 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
                    Loading...
                  </div>
                ) : hnPosts.length === 0 ? (
                  <EmptyState text="No HackerNews posts available" />
                ) : (
                  hnPosts.map((post, i) => (
                    <HackerNewsCard key={`hn-${i}`} post={post} index={i} />
                  ))
                )}
              </div>
            </section>

            {/* --- Tech News --- */}
            <section className={`${mobileTab !== "technews" ? "hidden" : ""} sm:block`}>
              <SectionHeader title="Tech News" icon="📰" count={techNewsPosts.length} />
              <div className="mt-2 space-y-3 lg:max-h-[calc(100vh-240px)] lg:overflow-y-auto lg:space-y-1.5">
                {techNewsLoading ? (
                  <div className="py-8 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
                    Loading...
                  </div>
                ) : techNewsPosts.length === 0 ? (
                  <EmptyState text="No tech news available" />
                ) : (
                  techNewsPosts.map((article, i) => (
                    <div
                      key={`tn-${i}`}
                      className="group border p-3 transition-colors"
                      style={{ borderColor: "var(--border)", background: "var(--bg-card)", borderRadius: "var(--radius-lg)" }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{
                            color: "var(--text-primary)",
                            background: article.source === "TechCrunch" ? "#0a9e01"
                                   : article.source === "The Verge" ? "#e5127d"
                                   : "#ff4e00"
                          }}>
                            {article.source}
                          </span>
                          {article.author && article.author !== article.source && (
                            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                              · {article.author}
                            </span>
                          )}
                          {article.published && (
                            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                              🕒 {(() => {
                                const date = new Date(article.published);
                                const diff = Date.now() - date.getTime();
                                const hours = Math.floor(diff / 3600000);
                                if (hours < 1) return "just now";
                                if (hours < 24) return `${hours}h ago`;
                                return `${Math.floor(hours / 24)}d ago`;
                              })()}
                            </span>
                          )}
                        </div>
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-sm font-medium leading-snug transition-colors"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {article.title}
                        </a>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* --- GitHub Trending --- */}
            <section className={`${mobileTab !== "github" ? "hidden" : ""} sm:block`}>
              <SectionHeader title="GitHub Trending" icon="💻" count={data?.github?.length || 0} />
              <div className="mt-2 space-y-3 lg:max-h-[calc(100vh-240px)] lg:overflow-y-auto lg:space-y-1.5">
                {!data?.github || data.github.length === 0 ? (
                  <EmptyState text="No GitHub projects trending" />
                ) : (
                  data.github.map((item, i) => (
                    <KeywordCard key={`gh-${i}`} item={item} index={i} isGithub />
                  ))
                )}
              </div>
            </section>
          </div>
      </main>

      <footer
        className="border-t py-3 text-center text-xs sm:py-4"
        style={{ borderColor: "var(--border)", color: "var(--text-tertiary)" }}
      >
        Trends Watcher Board · #trends_watcher
      </footer>
      <ScrollToTopButton />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-16 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm">
          <div
            className="rounded-lg px-4 py-3 shadow-lg text-sm font-medium animate-in slide-in-from-bottom-2"
            style={{
              background: toast.type === 'success' ? 'rgba(52,211,153,0.95)' :
                         toast.type === 'error' ? 'rgba(239,68,68,0.95)' :
                         'rgba(59,130,246,0.95)',
              color: 'var(--text-primary)',
              backdropFilter: 'blur(8px)'
            }}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Components =====

function SectionHeader({ title, icon, count, children }: { title: string; icon: string; count: number; children?: React.ReactNode }) {
  return (
    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)", letterSpacing: "-0.01em" }}>{title}</h2>
        <span className="px-2 py-0.5 text-xs font-medium" style={{ background: "var(--bg-elevated)", color: "var(--text-tertiary)", borderRadius: "var(--radius-full)" }}>
          {count}
        </span>
      </div>
      {children && <div className="flex flex-wrap gap-2 sm:ml-auto">{children}</div>}
    </div>
  );
}

// Compact Time Selector for inline use
function CompactTimeSelector({
  value, onChange, options
}: {
  value: string;
  onChange: (val: string) => void;
  options: readonly { label: string; value: string; description: string }[];
}) {
  return (
    <>
      {/* Mobile: button group */}
      <div className="flex items-center gap-1 rounded-md p-0.5 sm:hidden" style={{ background: "var(--bg-secondary)" }}>
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="rounded px-1.5 py-0.5 text-xs font-medium transition-colors"
            style={{
              background: value === opt.value ? "var(--accent-blue)" : "transparent",
              color: value === opt.value ? "var(--text-primary)" : "var(--text-tertiary)",
            }}
            title={opt.description}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {/* Desktop: dropdown */}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="hidden border px-2 py-1 text-xs font-medium sm:block"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border)",
          color: "var(--text-primary)",
          borderRadius: "var(--radius-md)",
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </>
  );
}

// Compact Geo Selector for inline use
function CompactGeoSelector({
  value, onChange, options
}: {
  value: string;
  onChange: (val: string) => void;
  options: readonly { label: string; value: string; flag: string }[];
}) {
  return (
    <>
      {/* Mobile: button group */}
      <div className="flex items-center gap-0.5 rounded-md p-0.5 sm:hidden" style={{ background: "var(--bg-secondary)" }}>
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="rounded px-1.5 py-0.5 text-xs font-medium transition-colors"
            style={{
              background: value === opt.value ? "var(--accent-blue)" : "transparent",
              color: value === opt.value ? "var(--text-primary)" : "var(--text-tertiary)",
            }}
          >
            {opt.flag} <span className="hidden sm:inline">{opt.label}</span>
          </button>
        ))}
      </div>
      {/* Desktop: dropdown */}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="hidden border px-2 py-1 text-xs font-medium sm:block"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border)",
          color: "var(--text-primary)",
          borderRadius: "var(--radius-md)",
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.flag} {opt.label}
          </option>
        ))}
      </select>
    </>
  );
}

function TrendingCard({
  item, index, isExpanded, onToggle, interestData, interestLoading, onAddToKGR,
}: {
  item: TrendingItem; index: number; isExpanded: boolean; onToggle: () => void;
  interestData: InterestPoint[]; interestLoading: boolean;
  onAddToKGR?: (keyword: string) => void;
}) {
  const isTech = item.is_tech;
  return (
    <div className="border transition-all"
      style={{
        background: isTech ? "rgba(94, 106, 210, 0.06)" : "var(--bg-card)",
        borderColor: isExpanded ? "var(--accent-blue-hover)" : isTech ? "rgba(94, 106, 210, 0.3)" : "var(--border)",
        borderRadius: "var(--radius-lg)",
      }}>
      <button onClick={onToggle} className="flex w-full items-start gap-2.5 p-4 text-left sm:items-center sm:gap-3 sm:p-2.5">
        <Rank n={index + 1} />
        <span className={`min-w-0 flex-1 text-sm font-medium ${isExpanded ? '' : 'line-clamp-2 sm:line-clamp-1'}`} style={{ color: "var(--text-primary)" }}>{item.name}</span>
        {isTech && (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium" style={{ background: "rgba(94, 106, 210, 0.15)", color: "#5e6ad2" }}>
            Tech
          </span>
        )}
        {item.traffic && (
          <span className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-mono" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#f87171" }}>
            {item.traffic}
          </span>
        )}
        <Chevron open={isExpanded} />
      </button>
      {isExpanded && <DecisionPanel keyword={item.name} points={interestData} loading={interestLoading} onAddToKGR={onAddToKGR} />}
    </div>
  );
}

function RedditCard({ post, index }: { post: RedditPost; index: number }) {
  const timeAgo = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    // Check if date is valid
    if (isNaN(date.getTime())) return "";
    const diff = Date.now() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "just now";
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const formatNumber = (n: number | undefined) => {
    if (typeof n !== "number" || isNaN(n)) return "0";
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return n.toString();
  };

  // Safely get values with defaults
  const subreddit = post.subreddit ?? "unknown";
  const url = post.url ?? "#";
  const title = post.title ?? "Untitled";

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-2.5 border p-4 transition-all sm:gap-3 sm:p-2.5"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)", borderRadius: "var(--radius-lg)" }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255, 69, 0, 0.4)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
    >
      <Rank n={index + 1} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium line-clamp-2 sm:line-clamp-1" style={{ color: "var(--text-primary)" }}>
          {title}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
          <span className="rounded px-1 py-0.5" style={{ background: "rgba(255, 69, 0, 0.1)", color: "#ff6b35" }}>
            r/{subreddit}
          </span>
          {post.published && <span>🕒 {timeAgo(post.published)}</span>}
        </div>
      </div>
      <ExternalIcon />
    </a>
  );
}

function HackerNewsCard({ post, index }: { post: HackerNewsPost; index: number }) {
  const timeAgo = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    // Check if date is valid
    if (isNaN(date.getTime())) return "";
    const diff = Date.now() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "just now";
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const formatNumber = (n: number | undefined) => {
    if (typeof n !== "number" || isNaN(n)) return "0";
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return n.toString();
  };

  // Safely get values with defaults
  const points = post.points ?? 0;
  const comments = post.comments ?? 0;
  const domain = post.domain ?? "unknown";
  const url = post.url ?? "#";
  const title = post.title ?? "Untitled";
  const hnDiscussUrl = `https://news.ycombinator.com/item?id=${post.id}`;
  const hasExternalUrl = url && url !== hnDiscussUrl && domain !== "news.ycombinator.com";

  return (
    <a
      href={hnDiscussUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-2.5 border p-4 transition-all sm:gap-3 sm:p-2.5"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)", borderRadius: "var(--radius-lg)" }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255, 102, 0, 0.4)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
    >
      <Rank n={index + 1} />
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="text-sm font-medium line-clamp-2 sm:line-clamp-1" style={{ color: "var(--text-primary)" }}>
          {title}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
          <span className="rounded px-1 py-0.5 max-w-[100px] truncate" style={{ background: "rgba(255, 102, 0, 0.1)", color: "#ff6600" }}>
            {domain}
          </span>
          <span>🔥 {formatNumber(points + comments * 0.5)}</span>
          <span>↑ {formatNumber(points)}</span>
          <span>💬 {formatNumber(comments)}</span>
          <span>{timeAgo(post.time)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {hasExternalUrl ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded p-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            style={{ color: "var(--text-tertiary)" }}
            title={`访问外部链接: ${url}`}
            onClick={(e) => e.stopPropagation()}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        ) : (
          <ExternalIcon />
        )}
      </div>
    </a>
  );
}

function KeywordCard({
  item, index, isGithub, isExpanded, onToggle, interestData, interestLoading,
  freshnessData, freshnessLoading, multiGeoData, multiGeoLoading,
  enrichData, enrichLoading, onAddToKGR,
}: {
  item: TrendKeyword; index: number; isGithub?: boolean; isExpanded?: boolean;
  onToggle?: () => void; interestData?: InterestPoint[]; interestLoading?: boolean;
  freshnessData?: FreshnessData | null; freshnessLoading?: boolean;
  multiGeoData?: MultiGeoData | null; multiGeoLoading?: boolean;
  enrichData?: EnrichData; enrichLoading?: boolean;
  onAddToKGR?: (keyword: string) => void;
}) {
  const tags = getTags(item);
  const hasSurge = tags.includes("surge");

  if (isGithub) {
    return (
      <a href={item.url} target="_blank" rel="noopener noreferrer"
        className="group flex items-start gap-2.5 border p-4 transition-all sm:items-center sm:gap-3 sm:p-2.5"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)", borderRadius: "var(--radius-lg)" }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-purple)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}>
        <Rank n={index + 1} />
        <span className="min-w-0 flex-1 text-sm font-medium line-clamp-2 sm:line-clamp-1" style={{ color: "var(--text-primary)" }}>{item.name}</span>
        <span className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-mono font-medium" style={{ background: "rgba(163, 120, 250, 0.15)", color: "var(--accent-purple)" }}>
          {item.value}
        </span>
        <ExternalIcon />
      </a>
    );
  }

  const score = enrichData?.score;
  const scoreBg = score !== undefined
    ? score >= 75 ? "rgba(52,211,153,0.2)" : score >= 55 ? "rgba(59,130,246,0.2)" : score >= 35 ? "rgba(251,191,36,0.2)" : "rgba(107,114,128,0.2)"
    : "var(--bg-secondary)";
  const scoreColor2 = score !== undefined
    ? score >= 75 ? "#34d399" : score >= 55 ? "#60a5fa" : score >= 35 ? "#fbbf24" : "#9ca3af"
    : "var(--text-secondary)";

  return (
    <div className="border transition-all"
      style={{ background: "var(--bg-card)", borderColor: isExpanded ? "var(--accent-blue-hover)" : score !== undefined && score >= 75 ? "rgba(52,211,153,0.4)" : hasSurge ? "rgba(239, 68, 68, 0.3)" : "var(--border)", borderRadius: "var(--radius-lg)" }}>
      <button onClick={onToggle} className="flex w-full items-start gap-2.5 p-4 text-left sm:items-center sm:gap-3 sm:p-2.5">
        {/* Score badge or rank */}
        {enrichLoading && !enrichData ? (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full animate-pulse" style={{ background: "var(--bg-secondary)" }}>
            <span className="text-[9px]" style={{ color: "var(--text-tertiary)" }}>...</span>
          </span>
        ) : score !== undefined ? (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: scoreBg, color: scoreColor2 }}>
            {score}
          </span>
        ) : (
          <Rank n={index + 1} />
        )}
        <span className={`min-w-0 flex-1 text-sm font-medium ${isExpanded ? '' : 'line-clamp-2 sm:line-clamp-1'}`} style={{ color: "var(--text-primary)" }}>{item.name}</span>
        {score !== undefined && score >= 75 && (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium" style={{ background: "rgba(52,211,153,0.15)", color: "#34d399" }}>冲</span>
        )}
        {tags.map((tag) => {
          const c = tagColor(tag);
          return <span key={tag} className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium" style={{ background: c.bg, color: c.color }}>{tagLabel(tag)}</span>;
        })}
        <span className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-mono font-medium" style={{ background: "rgba(52, 211, 153, 0.15)", color: "var(--accent-green)" }}>
          {item.value}
        </span>
        <Chevron open={!!isExpanded} />
      </button>
      {isExpanded && (
        <EnrichedDecisionPanel
          keyword={item.name}
          points={interestData || []}
          loading={!!interestLoading}
          freshnessData={freshnessData || null}
          freshnessLoading={!!freshnessLoading}
          multiGeoData={multiGeoData || null}
          multiGeoLoading={!!multiGeoLoading}
          enrichData={enrichData}
          onAddToKGR={onAddToKGR}
        />
      )}
    </div>
  );
}

// ===== Enhanced Decision Panel with KGR =====

function EnrichedDecisionPanel({
  keyword, points, loading,
  freshnessData, freshnessLoading,
  multiGeoData, multiGeoLoading,
  enrichData,
  onAddToKGR,
}: {
  keyword: string; points: InterestPoint[]; loading: boolean;
  freshnessData: FreshnessData | null; freshnessLoading: boolean;
  multiGeoData: MultiGeoData | null; multiGeoLoading: boolean;
  enrichData?: EnrichData;
  onAddToKGR?: (keyword: string) => void;
}) {
  const [supplyInput, setSupplyInput] = useState("");
  const [storedSupply, setStoredSupply] = useState<number | null>(null);

  // Load stored supply from localStorage on mount
  useEffect(() => {
    const saved = getStoredSupply(keyword);
    setStoredSupply(saved);
    if (saved !== null) setSupplyInput(String(saved));
  }, [keyword]);

  const handleSupplySubmit = () => {
    const num = parseInt(supplyInput.replace(/[,\s]/g, ""), 10);
    if (!isNaN(num) && num >= 0) {
      storeSupply(keyword, num);
      setStoredSupply(num);
    }
  };

  // Calculate KGR: use interest peak value as demand proxy
  const peakInterest = points.length > 0 ? Math.max(...points.map((p) => p.value)) : null;
  const kgr = peakInterest !== null && storedSupply !== null && storedSupply > 0
    ? peakInterest / storedSupply
    : null;

  const kgrStatus = kgr !== null
    ? kgr < 0.25 ? { label: "低竞争，值得冲", color: "#34d399", bg: "rgba(52,211,153,0.15)" }
    : kgr < 1 ? { label: "有竞争，谨慎评估", color: "#fbbf24", bg: "rgba(251,191,36,0.15)" }
    : { label: "供给过剩，不建议", color: "#f87171", bg: "rgba(239,68,68,0.15)" }
    : null;

  return (
    <div className="border-t px-4 py-3 sm:px-3 sm:py-2.5" style={{ borderColor: "var(--border)", borderRadius: "var(--radius-lg)" }}>
      {/* 7-day trend chart */}
      <div className="mb-2.5">
        <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>7-day trend</span>
        {loading ? (
          <div className="mt-1 h-20 animate-pulse rounded sm:h-14" style={{ background: "var(--bg-secondary)" }} />
        ) : points.length > 0 ? (
          <MiniChart points={points} />
        ) : (
          <div className="mt-1 flex h-20 items-center justify-center rounded text-xs sm:h-14" style={{ background: "var(--bg-secondary)", color: "var(--text-tertiary)" }}>
            No trend data
          </div>
        )}
      </div>

      {/* === Score Breakdown === */}
      {enrichData && enrichData.score !== undefined && (
        <div className="mb-3 rounded-lg p-3 sm:p-2.5" style={{ background: "var(--bg-secondary)" }}>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>上站指数</span>
            <span className="rounded-full px-2 py-0.5 text-sm font-bold" style={{
              background: enrichData.score >= 75 ? "rgba(52,211,153,0.2)" : enrichData.score >= 55 ? "rgba(59,130,246,0.2)" : enrichData.score >= 35 ? "rgba(251,191,36,0.2)" : "rgba(107,114,128,0.2)",
              color: enrichData.score >= 75 ? "#34d399" : enrichData.score >= 55 ? "#60a5fa" : enrichData.score >= 35 ? "#fbbf24" : "#9ca3af",
            }}>
              {enrichData.score}
            </span>
            {!enrichData.has_full_score && (
              <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>(初步)</span>
            )}
            {enrichData.score >= 75 && <span className="text-xs font-medium" style={{ color: "#34d399" }}>值得冲!</span>}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-2">
            <ScoreDimension label="增长 30%" score={enrichData.growth_score || 0} />
            <ScoreDimension label="竞争 25%" score={enrichData.competition_score || 0} note={enrichData.competition_level !== "unknown" ? enrichData.competition_level : undefined} />
            <ScoreDimension label="新鲜 25%" score={enrichData.freshness_score ?? 0} note={enrichData.freshness_score === undefined ? "展开加载" : undefined} />
            <ScoreDimension label="多国 20%" score={enrichData.multi_geo_score ?? 0} note={enrichData.multi_geo_score === undefined ? "展开加载" : undefined} />
          </div>
        </div>
      )}

      {/* === Assessment Section === */}
      <div className="mb-3 rounded-lg p-2.5" style={{ background: "var(--bg-secondary)" }}>
        <div className="mb-2 text-xs font-medium" style={{ color: "var(--text-primary)" }}>
          上站评估
        </div>

        {/* Freshness + Multi-geo row */}
        <div className="mb-2 grid grid-cols-2 gap-3 sm:gap-2">
          {/* Freshness */}
          <div className="rounded-md p-3 sm:p-2" style={{ background: "var(--bg-card)" }}>
            <div className="mb-1 text-xs" style={{ color: "var(--text-secondary)" }}>新鲜度</div>
            {freshnessLoading ? (
              <div className="h-4 w-12 animate-pulse rounded" style={{ background: "var(--bg-secondary)" }} />
            ) : freshnessData ? (
              <div className="flex items-center gap-1.5">
                <ScoreBar value={freshnessData.freshness} />
                <span className="text-xs font-bold" style={{ color: scoreColor(freshnessData.freshness) }}>
                  {freshnessData.freshness}
                </span>
              </div>
            ) : (
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>--</span>
            )}
          </div>

          {/* Multi-geo */}
          <div className="rounded-md p-3 sm:p-2" style={{ background: "var(--bg-card)" }}>
            <div className="mb-1 text-xs" style={{ color: "var(--text-tertiary)" }}>多国热度</div>
            {multiGeoLoading ? (
              <div className="h-4 w-12 animate-pulse rounded" style={{ background: "var(--bg-secondary)" }} />
            ) : multiGeoData ? (
              <div>
                <span className="text-xs font-bold" style={{
                  color: multiGeoData.found_in.length >= 3 ? "#34d399"
                    : multiGeoData.found_in.length >= 1 ? "#fbbf24" : "var(--text-tertiary)",
                }}>
                  {multiGeoData.found_in.length}/{multiGeoData.total_geos} 国
                </span>
                {multiGeoData.found_in.length > 0 && (
                  <div className="mt-0.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {multiGeoData.found_in.join(", ")}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>--</span>
            )}
          </div>
        </div>

        {/* Supply input + KGR */}
        <div className="rounded-md p-2" style={{ background: "var(--bg-card)" }}>
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>页面供给量</span>
            <span
              className="cursor-help text-xs"
              style={{ color: "var(--accent-blue-hover)" }}
              title="1. 点击查 allintitle 打开 Google&#10;2. 看结果页顶部 '约 X,XXX 条结果'&#10;3. 把数字填入下方输入框"
            >
              ⓘ
            </span>
          </div>

          {/* Input row */}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={supplyInput}
              onChange={(e) => setSupplyInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSupplySubmit(); }}
              placeholder="填入 allintitle 结果数"
              className="min-w-0 flex-1 rounded border px-3 py-2.5 text-base outline-none sm:px-2 sm:py-1 sm:text-xs"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            />
            <a
              href={allintitleUrl(keyword)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded px-3 py-2.5 text-sm font-medium transition-opacity hover:opacity-80 sm:px-2 sm:py-1 sm:text-xs"
              style={{ background: "rgba(66,133,244,0.15)", color: "#4285f4" }}
            >
              查 allintitle
            </a>
          </div>

          {/* KGR result */}
          {kgr !== null && kgrStatus && (
            <div className="mt-2 flex items-center gap-2 rounded p-2" style={{ background: kgrStatus.bg }}>
              <span className="text-sm font-bold" style={{ color: kgrStatus.color }}>
                KGR = {kgr.toFixed(3)}
              </span>
              <span className="text-xs" style={{ color: kgrStatus.color }}>
                {kgrStatus.label}
              </span>
            </div>
          )}
          {storedSupply !== null && peakInterest !== null && kgr === null && storedSupply === 0 && (
            <div className="mt-2 rounded p-2 text-xs" style={{ background: "rgba(52,211,153,0.15)", color: "#34d399" }}>
              供给量为 0 — 全新蓝海！
            </div>
          )}
        </div>
      </div>

      {/* Simplified Links - grid layout for mobile, row for desktop */}
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2">
        <JumpLink href={googleAiUrl(keyword)} label="AI" color="#8b5cf6" />
        <JumpLink href={googleSearchUrl(keyword)} label="G" color="#4285f4" />
        <JumpLink href={googleTrendsUrl(keyword)} label="GT" color="#34a853" />
        <JumpLink href={semrushUrl(keyword)} label="Sem" color="#ff642d" />
        <JumpLink href={allintitleUrl(keyword)} label="allint" color="#ea4335" />
        <JumpLink href={domainSearchUrl(keyword)} label="域" color="#de5833" />
        <JumpLink href={generateGTCompareUrl(keyword)} label="vs gpts" color="#4285f4" />
        {onAddToKGR && (
          <button onClick={() => onAddToKGR(keyword)}
            className="rounded-md px-2 py-0.5 text-xs font-medium transition-colors hover:opacity-80"
            style={{ background: "rgba(94, 106, 210, 0.15)", color: "var(--accent-blue-hover)" }}
            title="添加到 KGR 工作台">
            +KGR
          </button>
        )}
      </div>
    </div>
  );
}

// Original simple DecisionPanel for TrendingCard
function DecisionPanel({ keyword, points, loading, onAddToKGR }: { keyword: string; points: InterestPoint[]; loading: boolean; onAddToKGR?: (keyword: string) => void }) {
  return (
    <div className="border-t px-3 py-3" style={{ borderColor: "var(--border)", borderRadius: "var(--radius-lg)" }}>
      <div className="mb-3">
        <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>7-day trend</span>
        {loading ? (
          <div className="mt-1 h-20 animate-pulse rounded sm:h-14" style={{ background: "var(--bg-secondary)" }} />
        ) : points.length > 0 ? (
          <MiniChart points={points} />
        ) : (
          <div className="mt-1 flex h-20 items-center justify-center rounded text-xs sm:h-14" style={{ background: "var(--bg-secondary)", color: "var(--text-tertiary)" }}>
            No trend data
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2">
        <JumpLink href={googleAiUrl(keyword)} label="AI" color="#8b5cf6" />
        <JumpLink href={googleSearchUrl(keyword)} label="G" color="#4285f4" />
        <JumpLink href={googleTrendsUrl(keyword)} label="GT" color="#34a853" />
        <JumpLink href={semrushUrl(keyword)} label="Sem" color="#ff642d" />
        <JumpLink href={allintitleUrl(keyword)} label="allint" color="#ea4335" />
        <JumpLink href={domainSearchUrl(keyword)} label="域" color="#de5833" />
        <JumpLink href={generateGTCompareUrl(keyword)} label="vs gpts" color="#4285f4" />
        {onAddToKGR && (
          <button onClick={() => onAddToKGR(keyword)}
            className="rounded-md px-2 py-0.5 text-xs font-medium transition-colors hover:opacity-80"
            style={{ background: "rgba(94, 106, 210, 0.15)", color: "var(--accent-blue-hover)" }}
            title="添加到 KGR 工作台">
            +KGR
          </button>
        )}
      </div>
    </div>
  );
}

// ===== Score helpers =====

function ScoreDimension({ label, score, note }: { label: string; score: number; note?: string }) {
  return (
    <div className="rounded-md p-1.5" style={{ background: "var(--bg-card)" }}>
      <div className="mb-0.5 text-[10px]" style={{ color: "var(--text-secondary)" }}>{label}</div>
      <div className="flex items-center gap-1.5">
        <ScoreBar value={score} />
        <span className="text-xs font-bold" style={{ color: scoreColor(score) }}>{score}</span>
      </div>
      {note && <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-tertiary)" }}>{note}</div>}
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 70) return "#34d399";
  if (score >= 40) return "#fbbf24";
  return "#f87171";
}

function ScoreBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${clamped}%`, background: scoreColor(clamped) }}
      />
    </div>
  );
}

// ===== Chart =====

function MiniChart({ points }: { points: InterestPoint[] }) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const w = 300, h = 52, pad = 2;

  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });
  const lineD = `M${pts.join(" L")}`;
  const areaD = `${lineD} L${w - pad},${h} L${pad},${h} Z`;

  const third = Math.max(1, Math.floor(values.length / 3));
  const recentAvg = values.slice(-third).reduce((a, b) => a + b, 0) / third;
  const earlyAvg = values.slice(0, third).reduce((a, b) => a + b, 0) / third;
  const dir = recentAvg > earlyAvg * 1.1 ? "up" : recentAvg < earlyAvg * 0.9 ? "down" : "flat";

  const stroke = dir === "up" ? "#34d399" : dir === "down" ? "#f87171" : "#60a5fa";
  const fill = dir === "up" ? "rgba(52,211,153,0.1)" : dir === "down" ? "rgba(248,113,113,0.1)" : "rgba(96,165,250,0.1)";
  const label = dir === "up" ? "↗ Rising" : dir === "down" ? "↘ Declining" : "→ Stable";

  return (
    <div className="mt-1">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 52 }}>
        <path d={areaD} fill={fill} />
        <path d={lineD} fill="none" stroke={stroke} strokeWidth="2" />
      </svg>
      <div className="mt-0.5 flex justify-between text-xs" style={{ color: "var(--text-tertiary)" }}>
        <span style={{ color: stroke }}>{label}</span>
        <span>Peak: {max}</span>
      </div>
    </div>
  );
}

function JumpLink({ href, label, color }: { href: string; label: string; color: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="flex-1 rounded-md py-1.5 px-1.5 text-center text-xs font-medium transition-opacity sm:py-1.5 sm:px-2.5 sm:text-xs hover:opacity-90 active:scale-95"
      style={{
        background: `${color}15`,
        color,
        border: `1px solid ${color}30`
      }}>
      {label}
    </a>
  );
}

function Rank({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold sm:h-5 sm:w-5"
      style={{ background: "var(--bg-secondary)", color: "var(--text-tertiary)" }}>
      {n}
    </span>
  );
}

// Scroll to top button for mobile
function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => setVisible(window.scrollY > 300);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!visible) return null;

  return (
    <button
      onClick={scrollToTop}
      className="fixed bottom-6 right-4 sm:bottom-8 sm:right-8 z-50 flex h-12 w-12 items-center justify-center rounded-full shadow-lg hover:opacity-90 transition-opacity"
      style={{
        background: "var(--accent-blue)",
        color: "var(--text-primary)",
        marginBottom: "80px",
      }}
      aria-label="回到顶部"
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7" />
      </svg>
    </button>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className="h-4 w-4 shrink-0 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
      style={{ color: "var(--text-tertiary)", transform: open ? "rotate(180deg)" : "none" }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 opacity-40 transition-opacity sm:opacity-0 sm:group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
      style={{ color: "var(--text-tertiary)" }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

function EmptyState({ text, actionLink, actionText }: { text: string; actionLink?: string; actionText?: string }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm sm:p-8" style={{ borderColor: "var(--border)", color: "var(--text-tertiary)" }}>
      <div>{text}</div>
      {actionLink && (
        <a
          href={actionLink}
          target="_blank"
          rel="noopener"
          className="mt-3 inline-block rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          style={{ background: "var(--accent-blue)", color: "var(--text-primary)" }}
        >
          {actionText || "在 Google Trends 查看 →"}
        </a>
      )}
    </div>
  );
}

function SkeletonSection() {
  return (
    <section>
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 animate-pulse rounded" style={{ background: "var(--bg-card)" }} />
        <div className="h-4 w-28 animate-pulse rounded" style={{ background: "var(--bg-card)" }} />
      </div>
      <div className="mt-2 space-y-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-11 animate-pulse rounded-lg" style={{ background: "var(--bg-card)", opacity: 1 - i * 0.15 }} />
        ))}
      </div>
    </section>
  );
}

// KGR Workbench components
function KGRRow({ item, onUpdate, onRemove, loading, onFetchAllintitle }: {
  item: KGRItem;
  onUpdate: (keyword: string, updates: Partial<KGRItem>) => void;
  onRemove: (keyword: string) => void;
  loading?: boolean;
  onFetchAllintitle: (keyword: string) => void;
}) {
  const [volumeInput, setVolumeInput] = useState(
    item.searchVolume !== null ? String(item.searchVolume) : ""
  );
  const [kdInput, setKdInput] = useState(
    item.kd !== null ? String(item.kd) : ""
  );
  const [allintitleInput, setAllintitleInput] = useState("");
  const [showAllintitleManual, setShowAllintitleManual] = useState(false);

  const handleAllintitleManualSubmit = () => {
    const count = parseInt(allintitleInput.replace(/[,\s]/g, ""), 10);
    if (!isNaN(count) && count >= 0) {
      onUpdate(item.keyword, {
        allintitleCount: count,
        allintitleTimestamp: new Date().toISOString(),
      });
      setAllintitleInput("");
      setShowAllintitleManual(false);
    }
  };

  const handleVolumeSubmit = () => {
    const vol = parseInt(volumeInput.replace(/[,\s]/g, ""), 10);
    if (!isNaN(vol) && vol >= 0) {
      onUpdate(item.keyword, {
        searchVolume: vol,
        searchVolumeTimestamp: new Date().toISOString(),
      });
    }
  };

  const handleKdSubmit = () => {
    const kd = parseInt(kdInput.replace(/[,\s]/g, ""), 10);
    if (!isNaN(kd) && kd >= 0 && kd <= 100) {
      onUpdate(item.keyword, {
        kd: kd,
        kdTimestamp: new Date().toISOString(),
      });
    }
  };

  const allintitleGoogleUrl = `https://www.google.com/search?q=${encodeURIComponent(`allintitle:${item.keyword}`)}`;

  const timeAgo = (timestamp: string | null) => {
    if (!timestamp) return "";
    const diff = Date.now() - new Date(timestamp).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "刚刚";
    if (hours < 24) return `${hours}小时前`;
    return `${Math.floor(hours / 24)}天前`;
  };

  // Get interpretations for each metric
  const kgrInterpretation = getKGRInterpretation(item.kgr);
  const ekgrInterpretation = getEKGRInterpretation(item.ekgr);
  const kdroiInterpretation = getKDROIInterpretation(item.kdroi);

  return (
    <tr className="border-b" style={{ borderColor: "var(--border)" }}>
      {/* Keyword */}
      <td className="p-2">
        <div className="min-w-[150px] max-w-[200px] text-sm font-medium break-words" style={{ color: "var(--text-primary)" }}>
          {item.keyword}
        </div>
      </td>

      {/* allintitle */}
      <td className="p-2 text-right">
        {loading ? (
          <span className="animate-pulse text-xs">获取中...</span>
        ) : showAllintitleManual ? (
          <div className="flex items-center justify-end gap-1">
            <input
              type="text"
              value={allintitleInput}
              onChange={(e) => setAllintitleInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAllintitleManualSubmit(); }}
              onBlur={handleAllintitleManualSubmit}
              placeholder="结果数"
              className="w-16 rounded border px-1.5 py-1 text-right text-xs"
              style={{
                background: "var(--bg-secondary)",
                borderColor: "var(--border)",
                color: "var(--text-primary)"
              }}
              autoFocus
            />
            <a
              href={allintitleGoogleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded px-1 py-1 text-xs"
              style={{ background: "rgba(66,133,244,0.15)", color: "#4285f4" }}
              title="在 Google 搜索 allintitle，看结果页顶部的 '约 X 条结果'"
            >
              G
            </a>
            <button
              onClick={() => {
                setShowAllintitleManual(false);
                setAllintitleInput("");
              }}
              className="text-xs"
              style={{ color: "var(--text-secondary)" }}
              title="取消编辑"
            >
              ✕
            </button>
          </div>
        ) : item.allintitleCount !== null ? (
          <div className="flex items-center justify-end gap-1">
            <span className="font-mono text-xs">{item.allintitleCount.toLocaleString()}</span>
            <button
              onClick={() => {
                setShowAllintitleManual(true);
                setAllintitleInput(String(item.allintitleCount));
              }}
              className="text-xs"
              style={{ color: "var(--text-secondary)" }}
              title="编辑数值"
            >
              ✏️
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => onFetchAllintitle(item.keyword)}
              className="rounded px-1.5 py-1 text-xs underline"
              style={{ color: "var(--accent-blue-hover)" }}
            >
              获取
            </button>
            <button
              onClick={() => setShowAllintitleManual(true)}
              className="text-xs"
              style={{ color: "var(--text-secondary)" }}
              title="手动输入从 Google 查询的结果"
            >
              ✏️
            </button>
          </div>
        )}
      </td>

      {/* Search Volume */}
      <td className="p-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <input type="text" value={volumeInput}
            onChange={(e) => setVolumeInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleVolumeSubmit(); }}
            onBlur={handleVolumeSubmit}
            placeholder="搜索量"
            className="w-20 rounded border px-2 py-1 text-right text-xs"
            style={{
              background: "var(--bg-secondary)",
              borderColor: "var(--border)",
              color: "var(--text-primary)"
            }}
          />
          <a href={googleTrendsUrl(`${item.keyword},happy birthday image`)}
            target="_blank" rel="noopener noreferrer"
            className="shrink-0 rounded px-1.5 py-1 text-xs font-medium transition-opacity hover:opacity-80"
            style={{ background: "rgba(66,133,244,0.15)", color: "#4285f4" }}
            title="在 Google Trends 中与 happy birthday image 比较">
            G
          </a>
        </div>
      </td>

      {/* KD */}
      <td className="p-2 text-right">
        <input type="text" value={kdInput}
          onChange={(e) => setKdInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleKdSubmit(); }}
          onBlur={handleKdSubmit}
          placeholder="0-100"
          className="w-16 rounded border px-2 py-1 text-right text-xs"
          style={{
            background: "var(--bg-secondary)",
            borderColor: "var(--border)",
            color: "var(--text-primary)"
          }}
        />
      </td>

      {/* KGR */}
      <td className="p-2 text-right">
        {item.kgr !== null ? (
          <div className="flex flex-col items-end gap-0.5">
            <span
              className="font-mono text-xs font-bold"
              style={{ color: kgrInterpretation.color }}
              title={kgrInterpretation.description}
            >
              {item.kgr.toFixed(4)}
            </span>
            {item.kgrStatus && (
              <span
                className="text-[10px]"
                style={{ color: kgrInterpretation.color }}
              >
                {kgrInterpretation.emoji}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>--</span>
        )}
      </td>

      {/* EKGR */}
      <td className="p-2 text-right">
        {item.ekgr !== null ? (
          <div className="flex flex-col items-end gap-0.5">
            <span
              className="font-mono text-xs font-bold"
              style={{ color: ekgrInterpretation.color }}
              title={ekgrInterpretation.description}
            >
              {item.ekgr.toFixed(2)}
            </span>
            {item.ekgrStatus && (
              <span
                className="text-[10px]"
                style={{ color: ekgrInterpretation.color }}
              >
                {ekgrInterpretation.emoji}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>--</span>
        )}
      </td>

      {/* KDROI */}
      <td className="p-2 text-right">
        {item.kdroi !== null ? (
          <div className="flex flex-col items-end gap-0.5">
            <span
              className="font-mono text-xs font-bold"
              style={{ color: kdroiInterpretation.color }}
              title={kdroiInterpretation.description}
            >
              {item.kdroi.toFixed(0)}%
            </span>
            {item.kdroiStatus && (
              <span
                className="text-[10px]"
                style={{ color: kdroiInterpretation.color }}
              >
                {kdroiInterpretation.emoji}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>--</span>
        )}
      </td>

      {/* Notes */}
      <td className="p-2">
        <input
          type="text"
          value={item.notes || ""}
          onChange={(e) => onUpdate(item.keyword, { notes: e.target.value })}
          onBlur={(e) => onUpdate(item.keyword, { notes: e.target.value })}
          placeholder="备注"
          className="w-full rounded border px-2 py-1 text-xs"
          style={{
            background: "var(--bg-secondary)",
            borderColor: "var(--border)",
            color: "var(--text-primary)"
          }}
        />
      </td>

      {/* Actions */}
      <td className="p-2 text-center">
        <button
          onClick={() => onRemove(item.keyword)}
          className="text-xs hover:opacity-80"
          style={{ color: "var(--accent-red)" }}
          title="移除"
        >
          ✕
        </button>
      </td>
    </tr>
  );
}
