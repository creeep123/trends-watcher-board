"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  TrendsResponse,
  TrendKeyword,
  TrendingItem,
  InterestPoint,
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

  useEffect(() => {
    if (!expandedKeyword) return;
    setInterestLoading(true);
    setInterestData([]);
    const params = new URLSearchParams({ keyword: expandedKeyword, geo });
    fetch(`/api/interest?${params}`)
      .then((r) => r.json())
      .then((d) => setInterestData(d.points || []))
      .catch(() => setInterestData([]))
      .finally(() => setInterestLoading(false));
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

          {/* Filters — horizontal scroll on mobile */}
          <div className="mt-2 flex gap-3 overflow-x-auto pb-1 sm:mt-3 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {/* Timeframe */}
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
            {/* Region */}
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

          {/* Keywords — full width */}
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
        {/* Status bar */}
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
}: {
  item: TrendKeyword; index: number; isGithub?: boolean; isExpanded?: boolean;
  onToggle?: () => void; interestData?: InterestPoint[]; interestLoading?: boolean;
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
      {isExpanded && <DecisionPanel keyword={item.name} points={interestData || []} loading={!!interestLoading} />}
    </div>
  );
}

function DecisionPanel({ keyword, points, loading }: { keyword: string; points: InterestPoint[]; loading: boolean }) {
  return (
    <div className="border-t px-3 py-3" style={{ borderColor: "var(--border)" }}>
      {/* Chart */}
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
      {/* Links — 2x2 grid on mobile, single row on desktop */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2">
        <JumpLink href={googleAiUrl(keyword)} label="G AI" color="#8b5cf6" />
        <JumpLink href={googleSearchUrl(keyword)} label="Google" color="#4285f4" />
        <JumpLink href={googleTrendsUrl(keyword)} label="G Trends" color="#34a853" />
        <JumpLink href={semrushUrl(keyword)} label="Semrush" color="#ff642d" />
      </div>
    </div>
  );
}

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
