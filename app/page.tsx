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

  // Surge: rising >= 1000%
  if (val.startsWith("+")) {
    const num = parseInt(val.replace(/[+%,]/g, ""), 10);
    if (!isNaN(num) && num >= 1000) tags.push("surge");
  }

  return tags;
}

function tagLabel(tag: string): string {
  const map: Record<string, string> = {
    surge: "飙升",
    multi_geo: "多国",
    fresh: "极新",
  };
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

// Sort: items with tags first, then by tag count, then by value
function sortBySignal(items: TrendKeyword[]): TrendKeyword[] {
  return [...items].sort((a, b) => {
    const aTags = getTags(a).length;
    const bTags = getTags(b).length;
    if (aTags !== bTags) return bTags - aTags;
    // secondary: rising value
    const aVal = parseInt(a.value.replace(/[+%,]/g, ""), 10) || 0;
    const bVal = parseInt(b.value.replace(/[+%,]/g, ""), 10) || 0;
    return bVal - aVal;
  });
}

// --- Jump links ---

function googleSearchUrl(keyword: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(keyword)}`;
}
function googleTrendsUrl(keyword: string) {
  return `https://trends.google.com/trends/explore?q=${encodeURIComponent(keyword)}&date=now%207-d`;
}
function semrushUrl(keyword: string) {
  return `https://www.semrush.com/analytics/keywordoverview/?q=${encodeURIComponent(keyword)}`;
}

// --- Main ---

export default function Home() {
  const [timeframe, setTimeframe] = useState("now 1-d");
  const [geo, setGeo] = useState("");
  const [keywords, setKeywords] = useState(DEFAULT_KEYWORDS);
  const [keywordsInput, setKeywordsInput] = useState(DEFAULT_KEYWORDS);
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Trending Now
  const [trendingGeo, setTrendingGeo] = useState("US");
  const [trendingItems, setTrendingItems] = useState<TrendingItem[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);

  // Decision panel
  const [expandedKeyword, setExpandedKeyword] = useState<string | null>(null);
  const [interestData, setInterestData] = useState<InterestPoint[]>([]);
  const [interestLoading, setInterestLoading] = useState(false);

  // Fetch main trends
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
      setError(e instanceof Error ? e.message : "Failed to fetch trends");
    } finally {
      setLoading(false);
    }
  }, [timeframe, geo, keywords]);

  // Fetch trending now
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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchTrending();
  }, [fetchTrending]);

  // Fetch interest when keyword expanded
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
    if (trimmed && trimmed !== keywords) {
      setKeywords(trimmed);
    }
  };

  const toggleExpand = (name: string) => {
    setExpandedKeyword(expandedKeyword === name ? null : name);
  };

  const currentTimeframe = TIMEFRAME_OPTIONS.find((t) => t.value === timeframe);
  const currentGeo = GEO_OPTIONS.find((g) => g.value === geo);

  const sortedGoogle = data ? sortBySignal(data.google) : [];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-10 border-b backdrop-blur-md"
        style={{
          borderColor: "var(--border)",
          background: "rgba(10, 10, 15, 0.85)",
        }}
      >
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold tracking-tight">
              <span style={{ color: "var(--accent-blue)" }}>Trends</span>{" "}
              Watcher Board
            </h1>
            <button
              onClick={() => { fetchData(); fetchTrending(); }}
              disabled={loading}
              className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
              style={{
                background: loading ? "var(--border)" : "var(--accent-blue)",
                color: "#fff",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {/* Filters */}
          <div className="mt-3 flex flex-wrap items-end gap-4">
            {/* Timeframe */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>TIME</span>
              <div className="flex gap-1 rounded-lg p-1" style={{ background: "var(--bg-secondary)" }}>
                {TIMEFRAME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTimeframe(opt.value)}
                    className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
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
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>REGION</span>
              <div className="flex gap-1 rounded-lg p-1" style={{ background: "var(--bg-secondary)" }}>
                {GEO_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setGeo(opt.value)}
                    className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
                    style={{
                      background: geo === opt.value ? "var(--accent-blue)" : "transparent",
                      color: geo === opt.value ? "#fff" : "var(--text-secondary)",
                    }}
                  >
                    {opt.flag} {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Keywords input */}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>KEYWORDS</span>
            <div className="flex flex-1 gap-2">
              <input
                type="text"
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleKeywordsSubmit(); }}
                placeholder={DEFAULT_KEYWORDS}
                className="flex-1 rounded-lg border px-3 py-1.5 text-xs outline-none transition-colors focus:border-blue-500"
                style={{
                  background: "var(--bg-secondary)",
                  borderColor: "var(--border)",
                  color: "var(--text-primary)",
                }}
              />
              <button
                onClick={handleKeywordsSubmit}
                className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: "var(--bg-card)",
                  color: "var(--text-secondary)",
                  borderWidth: 1,
                  borderColor: "var(--border)",
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        {/* Status bar */}
        {data && !loading && (
          <div className="mb-4 flex flex-wrap items-center gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
            <span>{currentGeo?.flag || "🌍"} {currentGeo?.label || "Global"} · {currentTimeframe?.description}</span>
            <span>·</span>
            <span>Updated {new Date(data.timestamp).toLocaleTimeString()}</span>
            <span>·</span>
            <span>{data.google.length} Google + {data.github.length} GitHub</span>
          </div>
        )}

        {error && (
          <div
            className="mb-4 rounded-lg border p-4 text-sm"
            style={{ borderColor: "var(--accent-red)", background: "rgba(239, 68, 68, 0.1)", color: "var(--accent-red)" }}
          >
            Failed to load: {error}
          </div>
        )}

        {loading && (
          <div className="grid gap-6 lg:grid-cols-3">
            <SkeletonSection />
            <SkeletonSection />
            <SkeletonSection />
          </div>
        )}

        {data && !loading && (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Trending Now */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🔥</span>
                <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Trending Now</h2>
                <div className="flex gap-1 ml-auto rounded-lg p-0.5" style={{ background: "var(--bg-secondary)" }}>
                  {[
                    { label: "US", value: "US" },
                    { label: "ID", value: "ID" },
                    { label: "BR", value: "BR" },
                  ].map((opt) => (
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
              <div className="space-y-1.5" style={{ maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
                {trendingLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded-lg" style={{ background: "var(--bg-card)", opacity: 1 - i * 0.1 }} />
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

            {/* Google Trends (Related Queries) */}
            <section>
              <SectionHeader title="Related Queries" icon="📊" count={data.google.length} />
              <div className="mt-2 space-y-1.5" style={{ maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
                {sortedGoogle.length === 0 ? (
                  <EmptyState text="No Google Trends data for this selection" />
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

            {/* GitHub Trending */}
            <section>
              <SectionHeader title="GitHub Trending" icon="💻" count={data.github.length} />
              <div className="mt-2 space-y-1.5" style={{ maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
                {data.github.length === 0 ? (
                  <EmptyState text="No AI-related GitHub projects trending" />
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
        className="border-t py-4 text-center text-xs"
        style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
      >
        Trends Watcher Board · #trends_watcher
      </footer>
    </div>
  );
}

// --- Components ---

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
  item,
  index,
  isExpanded,
  onToggle,
  interestData,
  interestLoading,
}: {
  item: TrendingItem;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  interestData: InterestPoint[];
  interestLoading: boolean;
}) {
  return (
    <div
      className="rounded-lg border transition-all"
      style={{
        background: "var(--bg-card)",
        borderColor: isExpanded ? "var(--accent-blue)" : "var(--border)",
      }}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-2.5 text-left"
      >
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold"
          style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}
        >
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {item.name}
        </span>
        {item.traffic && (
          <span className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-mono" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#f87171" }}>
            {item.traffic}
          </span>
        )}
        <ChevronIcon expanded={isExpanded} />
      </button>
      {isExpanded && (
        <DecisionPanel
          keyword={item.name}
          points={interestData}
          loading={interestLoading}
        />
      )}
    </div>
  );
}

function KeywordCard({
  item,
  index,
  isGithub,
  isExpanded,
  onToggle,
  interestData,
  interestLoading,
}: {
  item: TrendKeyword;
  index: number;
  isGithub?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
  interestData?: InterestPoint[];
  interestLoading?: boolean;
}) {
  const tags = getTags(item);
  const hasSurge = tags.includes("surge");

  // GitHub cards just link out
  if (isGithub) {
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-3 rounded-lg border p-2.5 transition-all"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-purple)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>{item.name}</span>
        <span className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-mono font-medium" style={{ background: "rgba(163, 120, 250, 0.15)", color: "var(--accent-purple)" }}>
          {item.value}
        </span>
        <ExternalIcon />
      </a>
    );
  }

  return (
    <div
      className="rounded-lg border transition-all"
      style={{
        background: "var(--bg-card)",
        borderColor: isExpanded ? "var(--accent-blue)" : hasSurge ? "rgba(239, 68, 68, 0.3)" : "var(--border)",
      }}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-2.5 text-left"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {item.name}
        </span>
        {/* Tags */}
        {tags.map((tag) => {
          const c = tagColor(tag);
          return (
            <span key={tag} className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium" style={{ background: c.bg, color: c.color }}>
              {tagLabel(tag)}
            </span>
          );
        })}
        <span className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-mono font-medium" style={{ background: "rgba(52, 211, 153, 0.15)", color: "var(--accent-green)" }}>
          {item.value}
        </span>
        <ChevronIcon expanded={!!isExpanded} />
      </button>
      {isExpanded && (
        <DecisionPanel
          keyword={item.name}
          points={interestData || []}
          loading={!!interestLoading}
        />
      )}
    </div>
  );
}

function DecisionPanel({
  keyword,
  points,
  loading,
}: {
  keyword: string;
  points: InterestPoint[];
  loading: boolean;
}) {
  return (
    <div className="border-t px-3 py-3" style={{ borderColor: "var(--border)" }}>
      {/* Mini chart */}
      <div className="mb-3">
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          7-day trend
        </span>
        {loading ? (
          <div className="mt-1 h-16 animate-pulse rounded" style={{ background: "var(--bg-secondary)" }} />
        ) : points.length > 0 ? (
          <MiniChart points={points} />
        ) : (
          <div className="mt-1 flex h-16 items-center justify-center rounded text-xs" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
            No trend data
          </div>
        )}
      </div>

      {/* Jump links */}
      <div className="flex gap-2">
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

  const w = 300;
  const h = 56;
  const padding = 2;

  const pathPoints = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * (w - padding * 2);
    const y = h - padding - ((v - min) / range) * (h - padding * 2);
    return `${x},${y}`;
  });

  const lineD = `M${pathPoints.join(" L")}`;
  const areaD = `${lineD} L${w - padding},${h} L${padding},${h} Z`;

  // Determine trend direction
  const recent = values.slice(-Math.floor(values.length / 3));
  const earlier = values.slice(0, Math.floor(values.length / 3));
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
  const trending = recentAvg > earlierAvg * 1.1 ? "up" : recentAvg < earlierAvg * 0.9 ? "down" : "flat";

  const strokeColor = trending === "up" ? "#34d399" : trending === "down" ? "#f87171" : "#60a5fa";
  const fillColor = trending === "up" ? "rgba(52,211,153,0.1)" : trending === "down" ? "rgba(248,113,113,0.1)" : "rgba(96,165,250,0.1)";

  const trendLabel = trending === "up" ? "↗ Rising" : trending === "down" ? "↘ Declining" : "→ Stable";

  return (
    <div className="mt-1">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: "56px" }}>
        <path d={areaD} fill={fillColor} />
        <path d={lineD} fill="none" stroke={strokeColor} strokeWidth="2" />
      </svg>
      <div className="flex justify-between text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
        <span style={{ color: strokeColor }}>{trendLabel}</span>
        <span>Peak: {max}</span>
      </div>
    </div>
  );
}

function JumpLink({ href, label, color }: { href: string; label: string; color: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex-1 rounded-md px-2 py-1.5 text-center text-xs font-medium transition-opacity hover:opacity-80"
      style={{ background: `${color}20`, color }}
    >
      {label} ↗
    </a>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className="h-4 w-4 shrink-0 transition-transform"
      style={{ color: "var(--text-secondary)", transform: expanded ? "rotate(180deg)" : "rotate(0)" }}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
      style={{ color: "var(--text-secondary)" }}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
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
      <div className="mt-2 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg" style={{ background: "var(--bg-card)", opacity: 1 - i * 0.15 }} />
        ))}
      </div>
    </section>
  );
}
