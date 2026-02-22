"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  TrendsResponse,
  TrendKeyword,
  TrendingItem,
  InterestPoint,
  FreshnessData,
  MultiGeoData,
} from "@/lib/types";
import { TIMEFRAME_OPTIONS, GEO_OPTIONS, DEFAULT_KEYWORDS } from "@/lib/types";

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
    surge: { bg: "rgba(239, 68, 68, 0.15)", color: "#f87171" },
    multi_geo: { bg: "rgba(59, 130, 246, 0.15)", color: "#60a5fa" },
    fresh: { bg: "rgba(251, 191, 36, 0.15)", color: "#fbbf24" },
  };
  return map[tag] || { bg: "rgba(107,114,128,0.15)", color: "#9ca3af" };
}

function sortBySignal(items: TrendKeyword[]): TrendKeyword[] {
  return [...items].sort((a, b) => {
    const aTags = getTags(a).length;
    const bTags = getTags(b).length;
    if (aTags !== bTags) return bTags - aTags;
    const aVal = parseInt(a.value.replace(/[+%,]/g, ""), 10) || 0;
    const bVal = parseInt(b.value.replace(/[+%,]/g, ""), 10) || 0;
    return bVal - aVal;
  });
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

// --- Jump links ---

function googleSearchUrl(kw: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(kw)}`;
}
function googleAiUrl(kw: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(`what is ${kw}, explain in both English and Chinese, just speak plainly`)}&udm=50`;
}
function googleTrendsUrl(kw: string) {
  return `https://trends.google.com/trends/explore?q=${encodeURIComponent(kw)}&date=now%207-d`;
}
function semrushUrl(kw: string) {
  return `https://www.semrush.com/analytics/keywordoverview/?q=${encodeURIComponent(kw)}`;
}
function allintitleUrl(kw: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(`allintitle:${kw}`)}`;
}
function domainSearchUrl(kw: string) {
  const slug = kw.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `https://qury.domains/${encodeURIComponent(slug)}`;
}

// --- Mobile tab type ---

type MobileTab = "trending" | "queries" | "github";

// --- Main ---

export default function Home() {
  const [timeframe, setTimeframe] = useState("now 1-d");
  const [geo, setGeo] = useState("");
  const [keywords, setKeywords] = useState(DEFAULT_KEYWORDS);
  const [keywordsInput, setKeywordsInput] = useState(DEFAULT_KEYWORDS);
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const [mobileTab, setMobileTab] = useState<MobileTab>("trending");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ timeframe, geo, keywords });
      const res = await fetch(`/api/trends?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: TrendsResponse = await res.json();
      setData(json);
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

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchTrending(); }, [fetchTrending]);

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

  const handleKeywordsSubmit = () => {
    const trimmed = keywordsInput.trim();
    if (trimmed && trimmed !== keywords) setKeywords(trimmed);
  };

  const toggleExpand = (name: string) => {
    setExpandedKeyword(expandedKeyword === name ? null : name);
  };

  const currentTimeframe = TIMEFRAME_OPTIONS.find((t) => t.value === timeframe);
  const currentGeo = GEO_OPTIONS.find((g) => g.value === geo);
  const sortedGoogle = data ? sortBySignal(data.google) : [];

  const TRENDING_GEOS = [
    { label: "US", value: "US" },
    { label: "ID", value: "ID" },
    { label: "BR", value: "BR" },
  ];

  const MOBILE_TABS: { key: MobileTab; label: string; icon: string }[] = [
    { key: "trending", label: "Trending", icon: "🔥" },
    { key: "queries", label: "Queries", icon: "📊" },
    { key: "github", label: "GitHub", icon: "💻" },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      {/* ===== Header ===== */}
      <header
        className="sticky top-0 z-10 border-b backdrop-blur-md"
        style={{ borderColor: "var(--border)", background: "rgba(10, 10, 15, 0.88)" }}
      >
        <div className="mx-auto max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
          {/* Title row */}
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold tracking-tight sm:text-xl">
              <span style={{ color: "var(--accent-blue)" }}>Trends</span>{" "}
              <span className="hidden sm:inline">Watcher Board</span>
              <span className="sm:hidden">Board</span>
            </h1>
            <button
              onClick={() => { fetchData(); fetchTrending(); }}
              disabled={loading}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm"
              style={{
                background: loading ? "var(--border)" : "var(--accent-blue)",
                color: "#fff",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "..." : "Refresh"}
            </button>
          </div>

          {/* Filters */}
          <div className="mt-2 flex gap-3 overflow-x-auto pb-1 sm:mt-3 sm:flex-wrap sm:overflow-visible sm:pb-0">
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>TIME</span>
              <div className="flex gap-0.5 rounded-lg p-0.5" style={{ background: "var(--bg-secondary)" }}>
                {TIMEFRAME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTimeframe(opt.value)}
                    className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                    style={{
                      background: timeframe === opt.value ? "var(--accent-blue)" : "transparent",
                      color: timeframe === opt.value ? "#fff" : "var(--text-secondary)",
                    }}
                    title={opt.description}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>GEO</span>
              <div className="flex gap-0.5 rounded-lg p-0.5" style={{ background: "var(--bg-secondary)" }}>
                {GEO_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setGeo(opt.value)}
                    className="rounded-md px-2 py-1 text-xs font-medium transition-colors"
                    style={{
                      background: geo === opt.value ? "var(--accent-blue)" : "transparent",
                      color: geo === opt.value ? "#fff" : "var(--text-secondary)",
                    }}
                  >
                    <span className="sm:hidden">{opt.flag}</span>
                    <span className="hidden sm:inline">{opt.flag} {opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Keywords */}
          <div className="mt-2 flex items-center gap-1.5 sm:mt-3 sm:gap-2">
            <span className="hidden text-xs font-medium sm:block" style={{ color: "var(--text-secondary)" }}>KEYWORDS</span>
            <input
              type="text"
              value={keywordsInput}
              onChange={(e) => setKeywordsInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleKeywordsSubmit(); }}
              placeholder={DEFAULT_KEYWORDS}
              className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 sm:py-1.5 sm:text-xs"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            />
            <button
              onClick={handleKeywordsSubmit}
              className="shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition-colors sm:py-1.5"
              style={{ background: "var(--bg-card)", color: "var(--text-secondary)", borderColor: "var(--border)" }}
            >
              Apply
            </button>
          </div>
        </div>
      </header>

      {/* ===== Mobile Tab Bar ===== */}
      <div
        className="sticky z-10 border-b sm:hidden"
        style={{ top: "auto", borderColor: "var(--border)", background: "var(--bg-primary)" }}
      >
        <div className="flex">
          {MOBILE_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setMobileTab(tab.key)}
              className="flex-1 py-2.5 text-center text-sm font-medium transition-colors"
              style={{
                color: mobileTab === tab.key ? "var(--accent-blue)" : "var(--text-secondary)",
                borderBottom: mobileTab === tab.key ? "2px solid var(--accent-blue)" : "2px solid transparent",
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Main Content ===== */}
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
        {data && !loading && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs sm:mb-4 sm:gap-3" style={{ color: "var(--text-secondary)" }}>
            <span>{currentGeo?.flag || "🌍"} {currentGeo?.label || "Global"} · {currentTimeframe?.description}</span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">Updated {new Date(data.timestamp).toLocaleTimeString()}</span>
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-lg border p-3 text-sm sm:mb-4 sm:p-4"
            style={{ borderColor: "var(--accent-red)", background: "rgba(239, 68, 68, 0.1)", color: "var(--accent-red)" }}>
            Failed to load: {error}
          </div>
        )}

        {loading && (
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
            <SkeletonSection />
            <div className="hidden lg:block"><SkeletonSection /></div>
            <div className="hidden lg:block"><SkeletonSection /></div>
          </div>
        )}

        {data && !loading && (
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
            {/* --- Trending Now --- */}
            <section className={`${mobileTab !== "trending" ? "hidden" : ""} sm:block`}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-lg">🔥</span>
                <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Trending Now</h2>
                <div className="ml-auto flex gap-0.5 rounded-lg p-0.5" style={{ background: "var(--bg-secondary)" }}>
                  {TRENDING_GEOS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTrendingGeo(opt.value)}
                      className="rounded-md px-2 py-0.5 text-xs font-medium transition-colors"
                      style={{
                        background: trendingGeo === opt.value ? "var(--accent-blue)" : "transparent",
                        color: trendingGeo === opt.value ? "#fff" : "var(--text-secondary)",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5 lg:max-h-[calc(100vh-280px)] lg:overflow-y-auto">
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
                    />
                  ))
                )}
              </div>
            </section>

            {/* --- Related Queries --- */}
            <section className={`${mobileTab !== "queries" ? "hidden" : ""} sm:block`}>
              <SectionHeader title="Related Queries" icon="📊" count={data.google.length} />
              <div className="mt-2 space-y-1.5 lg:max-h-[calc(100vh-280px)] lg:overflow-y-auto">
                {sortedGoogle.length === 0 ? (
                  <EmptyState text="No Google Trends data" />
                ) : (
                  sortedGoogle.map((item, i) => (
                    <KeywordCard
                      key={`g-${i}`}
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
                    />
                  ))
                )}
              </div>
            </section>

            {/* --- GitHub Trending --- */}
            <section className={`${mobileTab !== "github" ? "hidden" : ""} sm:block`}>
              <SectionHeader title="GitHub Trending" icon="💻" count={data.github.length} />
              <div className="mt-2 space-y-1.5 lg:max-h-[calc(100vh-280px)] lg:overflow-y-auto">
                {data.github.length === 0 ? (
                  <EmptyState text="No GitHub projects trending" />
                ) : (
                  data.github.map((item, i) => (
                    <KeywordCard key={`gh-${i}`} item={item} index={i} isGithub />
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      <footer
        className="border-t py-3 text-center text-xs sm:py-4"
        style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
      >
        Trends Watcher Board · #trends_watcher
      </footer>
    </div>
  );
}

// ===== Components =====

function SectionHeader({ title, icon, count }: { title: string; icon: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-lg">{icon}</span>
      <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{title}</h2>
      <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "var(--bg-card)", color: "var(--text-secondary)" }}>
        {count}
      </span>
    </div>
  );
}

function TrendingCard({
  item, index, isExpanded, onToggle, interestData, interestLoading,
}: {
  item: TrendingItem; index: number; isExpanded: boolean; onToggle: () => void;
  interestData: InterestPoint[]; interestLoading: boolean;
}) {
  const isTech = item.is_tech;
  return (
    <div className="rounded-lg border transition-all"
      style={{
        background: isTech ? "rgba(79, 143, 247, 0.06)" : "var(--bg-card)",
        borderColor: isExpanded ? "var(--accent-blue)" : isTech ? "rgba(79, 143, 247, 0.3)" : "var(--border)",
      }}>
      <button onClick={onToggle} className="flex w-full items-center gap-2.5 p-3 text-left sm:gap-3 sm:p-2.5">
        <Rank n={index + 1} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>{item.name}</span>
        {isTech && (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium" style={{ background: "rgba(79, 143, 247, 0.15)", color: "#4f8ff7" }}>
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
      {isExpanded && <DecisionPanel keyword={item.name} points={interestData} loading={interestLoading} />}
    </div>
  );
}

function KeywordCard({
  item, index, isGithub, isExpanded, onToggle, interestData, interestLoading,
  freshnessData, freshnessLoading, multiGeoData, multiGeoLoading,
}: {
  item: TrendKeyword; index: number; isGithub?: boolean; isExpanded?: boolean;
  onToggle?: () => void; interestData?: InterestPoint[]; interestLoading?: boolean;
  freshnessData?: FreshnessData | null; freshnessLoading?: boolean;
  multiGeoData?: MultiGeoData | null; multiGeoLoading?: boolean;
}) {
  const tags = getTags(item);
  const hasSurge = tags.includes("surge");

  if (isGithub) {
    return (
      <a href={item.url} target="_blank" rel="noopener noreferrer"
        className="group flex items-center gap-2.5 rounded-lg border p-3 transition-all sm:gap-3 sm:p-2.5"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-purple)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}>
        <Rank n={index + 1} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>{item.name}</span>
        <span className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-mono font-medium" style={{ background: "rgba(163, 120, 250, 0.15)", color: "var(--accent-purple)" }}>
          {item.value}
        </span>
        <ExternalIcon />
      </a>
    );
  }

  return (
    <div className="rounded-lg border transition-all"
      style={{ background: "var(--bg-card)", borderColor: isExpanded ? "var(--accent-blue)" : hasSurge ? "rgba(239, 68, 68, 0.3)" : "var(--border)" }}>
      <button onClick={onToggle} className="flex w-full items-center gap-2.5 p-3 text-left sm:gap-3 sm:p-2.5">
        <Rank n={index + 1} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>{item.name}</span>
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
}: {
  keyword: string; points: InterestPoint[]; loading: boolean;
  freshnessData: FreshnessData | null; freshnessLoading: boolean;
  multiGeoData: MultiGeoData | null; multiGeoLoading: boolean;
}) {
  const [supplyInput, setSupplyInput] = useState("");
  const [storedSupply, setStoredSupply] = useState<number | null>(null);
  const [showGuide, setShowGuide] = useState(false);

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
    <div className="border-t px-3 py-3" style={{ borderColor: "var(--border)" }}>
      {/* 7-day trend chart */}
      <div className="mb-3">
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>7-day trend</span>
        {loading ? (
          <div className="mt-1 h-14 animate-pulse rounded" style={{ background: "var(--bg-secondary)" }} />
        ) : points.length > 0 ? (
          <MiniChart points={points} />
        ) : (
          <div className="mt-1 flex h-14 items-center justify-center rounded text-xs" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
            No trend data
          </div>
        )}
      </div>

      {/* === Assessment Section === */}
      <div className="mb-3 rounded-lg p-2.5" style={{ background: "var(--bg-secondary)" }}>
        <div className="mb-2 text-xs font-bold" style={{ color: "var(--text-primary)" }}>
          上站评估
        </div>

        {/* Freshness + Multi-geo row */}
        <div className="mb-2 grid grid-cols-2 gap-2">
          {/* Freshness */}
          <div className="rounded-md p-2" style={{ background: "var(--bg-card)" }}>
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
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>--</span>
            )}
          </div>

          {/* Multi-geo */}
          <div className="rounded-md p-2" style={{ background: "var(--bg-card)" }}>
            <div className="mb-1 text-xs" style={{ color: "var(--text-secondary)" }}>多国热度</div>
            {multiGeoLoading ? (
              <div className="h-4 w-12 animate-pulse rounded" style={{ background: "var(--bg-secondary)" }} />
            ) : multiGeoData ? (
              <div>
                <span className="text-xs font-bold" style={{
                  color: multiGeoData.found_in.length >= 3 ? "#34d399"
                    : multiGeoData.found_in.length >= 1 ? "#fbbf24" : "var(--text-secondary)",
                }}>
                  {multiGeoData.found_in.length}/{multiGeoData.total_geos} 国
                </span>
                {multiGeoData.found_in.length > 0 && (
                  <div className="mt-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                    {multiGeoData.found_in.join(", ")}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>--</span>
            )}
          </div>
        </div>

        {/* Supply input + KGR */}
        <div className="rounded-md p-2" style={{ background: "var(--bg-card)" }}>
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>页面供给量</span>
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="text-xs underline decoration-dotted"
              style={{ color: "var(--accent-blue)" }}
            >
              {showGuide ? "收起" : "怎么查?"}
            </button>
          </div>

          {/* Guide */}
          {showGuide && (
            <div className="mb-2 rounded p-2 text-xs leading-relaxed" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
              <div className="mb-1.5 font-medium" style={{ color: "var(--text-primary)" }}>
                查 allintitle 结果数：
              </div>
              <ol className="ml-3 list-decimal space-y-0.5">
                <li>点下面「查 allintitle」按钮打开 Google</li>
                <li>看搜索结果页顶部 &quot;约 X,XXX 条结果&quot;</li>
                <li>把那个数字填到输入框，按回车</li>
              </ol>
              <div className="mt-1.5 mb-1 font-medium" style={{ color: "var(--text-primary)" }}>KGR = 搜索热度 / 页面供给量</div>
              <div>{"< 0.25 → 低竞争，值得冲"}</div>
              <div>{"0.25~1 → 有竞争，谨慎评估"}</div>
              <div>{"> 1 → 供给过剩，不建议做"}</div>
            </div>
          )}

          {/* Input row */}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={supplyInput}
              onChange={(e) => setSupplyInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSupplySubmit(); }}
              placeholder="填入 allintitle 结果数"
              className="min-w-0 flex-1 rounded border px-2 py-1.5 text-xs outline-none"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            />
            <button
              onClick={handleSupplySubmit}
              className="shrink-0 rounded px-2 py-1.5 text-xs font-medium"
              style={{ background: "var(--accent-blue)", color: "#fff" }}
            >
              OK
            </button>
          </div>

          {/* Quick action: open allintitle search */}
          <div className="mt-1.5 flex gap-1.5">
            <a
              href={allintitleUrl(keyword)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded py-1.5 text-center text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: "rgba(66,133,244,0.15)", color: "#4285f4" }}
            >
              查 allintitle
            </a>
            <button
              onClick={() => { navigator.clipboard.writeText(`allintitle:${keyword}`); }}
              className="shrink-0 rounded px-2 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: "rgba(107,114,128,0.15)", color: "var(--text-secondary)" }}
            >
              复制
            </button>
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

      {/* Quick competition check */}
      <div className="mb-3 rounded-lg p-2.5" style={{ background: "var(--bg-secondary)" }}>
        <div className="mb-1.5 text-xs font-bold" style={{ color: "var(--text-primary)" }}>
          竞争快查
        </div>
        <div className="mb-1.5 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          点击下方按钮查看 SERP，看前 5 名是大站还是小站
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <a
            href={googleSearchUrl(keyword)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded py-2 text-center text-xs font-medium transition-opacity hover:opacity-80"
            style={{ background: "rgba(66,133,244,0.15)", color: "#4285f4" }}
          >
            查 SERP
          </a>
          <a
            href={allintitleUrl(keyword)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded py-2 text-center text-xs font-medium transition-opacity hover:opacity-80"
            style={{ background: "rgba(234,67,53,0.15)", color: "#ea4335" }}
          >
            查 allintitle
          </a>
        </div>
      </div>

      {/* Links */}
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6 sm:gap-2">
        <JumpLink href={googleAiUrl(keyword)} label="G AI" color="#8b5cf6" />
        <JumpLink href={googleSearchUrl(keyword)} label="Google" color="#4285f4" />
        <JumpLink href={googleTrendsUrl(keyword)} label="G Trends" color="#34a853" />
        <JumpLink href={semrushUrl(keyword)} label="Semrush" color="#ff642d" />
        <JumpLink href={allintitleUrl(keyword)} label="allintitle" color="#ea4335" />
        <JumpLink href={domainSearchUrl(keyword)} label="域名" color="#de5833" />
      </div>
    </div>
  );
}

// Original simple DecisionPanel for TrendingCard
function DecisionPanel({ keyword, points, loading }: { keyword: string; points: InterestPoint[]; loading: boolean }) {
  return (
    <div className="border-t px-3 py-3" style={{ borderColor: "var(--border)" }}>
      <div className="mb-3">
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>7-day trend</span>
        {loading ? (
          <div className="mt-1 h-14 animate-pulse rounded" style={{ background: "var(--bg-secondary)" }} />
        ) : points.length > 0 ? (
          <MiniChart points={points} />
        ) : (
          <div className="mt-1 flex h-14 items-center justify-center rounded text-xs" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
            No trend data
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2">
        <JumpLink href={googleAiUrl(keyword)} label="G AI" color="#8b5cf6" />
        <JumpLink href={googleSearchUrl(keyword)} label="Google" color="#4285f4" />
        <JumpLink href={googleTrendsUrl(keyword)} label="G Trends" color="#34a853" />
        <JumpLink href={semrushUrl(keyword)} label="Semrush" color="#ff642d" />
      </div>
    </div>
  );
}

// ===== Score helpers =====

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
      <div className="mt-0.5 flex justify-between text-xs" style={{ color: "var(--text-secondary)" }}>
        <span style={{ color: stroke }}>{label}</span>
        <span>Peak: {max}</span>
      </div>
    </div>
  );
}

function JumpLink({ href, label, color }: { href: string; label: string; color: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="rounded-md py-2 text-center text-xs font-medium transition-opacity hover:opacity-80 active:opacity-60 sm:py-1.5"
      style={{ background: `${color}20`, color }}>
      {label} ↗
    </a>
  );
}

function Rank({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold"
      style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
      {n}
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className="h-4 w-4 shrink-0 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
      style={{ color: "var(--text-secondary)", transform: open ? "rotate(180deg)" : "none" }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 opacity-40 transition-opacity sm:opacity-0 sm:group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
      style={{ color: "var(--text-secondary)" }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm sm:p-8" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
      {text}
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
