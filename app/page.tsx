"use client";

import { useState, useEffect, useCallback } from "react";
import type { TrendsResponse, TrendKeyword } from "@/lib/types";
import { TIMEFRAME_OPTIONS, GEO_OPTIONS, DEFAULT_KEYWORDS } from "@/lib/types";

export default function Home() {
  const [timeframe, setTimeframe] = useState("now 1-d");
  const [geo, setGeo] = useState("");
  const [keywords, setKeywords] = useState(DEFAULT_KEYWORDS);
  const [keywordsInput, setKeywordsInput] = useState(DEFAULT_KEYWORDS);
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleKeywordsSubmit = () => {
    const trimmed = keywordsInput.trim();
    if (trimmed && trimmed !== keywords) {
      setKeywords(trimmed);
    }
  };

  const currentTimeframe = TIMEFRAME_OPTIONS.find((t) => t.value === timeframe);
  const currentGeo = GEO_OPTIONS.find((g) => g.value === geo);

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
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold tracking-tight">
              <span style={{ color: "var(--accent-blue)" }}>Trends</span>{" "}
              Watcher Board
            </h1>
            <button
              onClick={fetchData}
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
              <span
                className="text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                TIME
              </span>
              <div
                className="flex gap-1 rounded-lg p-1"
                style={{ background: "var(--bg-secondary)" }}
              >
                {TIMEFRAME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTimeframe(opt.value)}
                    className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
                    style={{
                      background:
                        timeframe === opt.value
                          ? "var(--accent-blue)"
                          : "transparent",
                      color:
                        timeframe === opt.value
                          ? "#fff"
                          : "var(--text-secondary)",
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
              <span
                className="text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                REGION
              </span>
              <div
                className="flex gap-1 rounded-lg p-1"
                style={{ background: "var(--bg-secondary)" }}
              >
                {GEO_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setGeo(opt.value)}
                    className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
                    style={{
                      background:
                        geo === opt.value
                          ? "var(--accent-blue)"
                          : "transparent",
                      color:
                        geo === opt.value ? "#fff" : "var(--text-secondary)",
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
            <span
              className="text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              KEYWORDS
            </span>
            <div className="flex flex-1 gap-2">
              <input
                type="text"
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleKeywordsSubmit();
                }}
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
      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Status bar */}
        {data && !loading && (
          <div
            className="mb-4 flex flex-wrap items-center gap-3 text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            <span>
              {currentGeo?.flag || "🌍"} {currentGeo?.label || "Global"} ·{" "}
              {currentTimeframe?.description}
            </span>
            <span>·</span>
            <span>
              Updated {new Date(data.timestamp).toLocaleTimeString()}
            </span>
            <span>·</span>
            <span>
              {data.google.length} Google + {data.github.length} GitHub
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="mb-4 rounded-lg border p-4 text-sm"
            style={{
              borderColor: "var(--accent-red)",
              background: "rgba(239, 68, 68, 0.1)",
              color: "var(--accent-red)",
            }}
          >
            Failed to load: {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid gap-6 md:grid-cols-2">
            <SkeletonSection />
            <SkeletonSection />
          </div>
        )}

        {/* Data */}
        {data && !loading && (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Google Trends */}
            <section>
              <SectionHeader
                title="Google Trends"
                icon="📊"
                count={data.google.length}
              />
              <div className="mt-2 space-y-2">
                {data.google.length === 0 ? (
                  <EmptyState text="No Google Trends data for this selection" />
                ) : (
                  data.google.map((item, i) => (
                    <KeywordCard key={`g-${i}`} item={item} index={i} />
                  ))
                )}
              </div>
            </section>

            {/* GitHub Trending */}
            <section>
              <SectionHeader
                title="GitHub Trending"
                icon="💻"
                count={data.github.length}
              />
              <div className="mt-2 space-y-2">
                {data.github.length === 0 ? (
                  <EmptyState text="No AI-related GitHub projects trending" />
                ) : (
                  data.github.map((item, i) => (
                    <KeywordCard
                      key={`gh-${i}`}
                      item={item}
                      index={i}
                      isGithub
                    />
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        className="border-t py-4 text-center text-xs"
        style={{
          borderColor: "var(--border)",
          color: "var(--text-secondary)",
        }}
      >
        Trends Watcher Board · #trends_watcher
      </footer>
    </div>
  );
}

function SectionHeader({
  title,
  icon,
  count,
}: {
  title: string;
  icon: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-lg">{icon}</span>
      <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
        {title}
      </h2>
      <span
        className="rounded-full px-2 py-0.5 text-xs font-medium"
        style={{
          background: "var(--bg-card)",
          color: "var(--text-secondary)",
        }}
      >
        {count}
      </span>
    </div>
  );
}

function KeywordCard({
  item,
  index,
  isGithub,
}: {
  item: TrendKeyword;
  index: number;
  isGithub?: boolean;
}) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-lg border p-3 transition-all"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-card-hover)";
        e.currentTarget.style.borderColor = "var(--accent-blue)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--bg-card)";
        e.currentTarget.style.borderColor = "var(--border)";
      }}
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold"
        style={{
          background: "var(--bg-secondary)",
          color: "var(--text-secondary)",
        }}
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {item.name}
        </div>
      </div>
      <span
        className="shrink-0 rounded-md px-2 py-0.5 text-xs font-mono font-medium"
        style={{
          background: isGithub
            ? "rgba(163, 120, 250, 0.15)"
            : "rgba(52, 211, 153, 0.15)",
          color: isGithub ? "var(--accent-purple)" : "var(--accent-green)",
        }}
      >
        {item.value}
      </span>
      <svg
        className="h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        style={{ color: "var(--text-secondary)" }}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        />
      </svg>
    </a>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      className="rounded-lg border border-dashed p-8 text-center text-sm"
      style={{
        borderColor: "var(--border)",
        color: "var(--text-secondary)",
      }}
    >
      {text}
    </div>
  );
}

function SkeletonSection() {
  return (
    <section>
      <div className="flex items-center gap-2">
        <div
          className="h-5 w-5 animate-pulse rounded"
          style={{ background: "var(--bg-card)" }}
        />
        <div
          className="h-4 w-28 animate-pulse rounded"
          style={{ background: "var(--bg-card)" }}
        />
      </div>
      <div className="mt-2 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-lg"
            style={{
              background: "var(--bg-card)",
              opacity: 1 - i * 0.15,
            }}
          />
        ))}
      </div>
    </section>
  );
}
