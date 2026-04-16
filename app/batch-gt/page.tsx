"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase, getRootKeywordsWithViewingRecords, addViewingRecord } from "@/lib/supabase";
import { generateGTCompareUrl } from "@/lib/types";

type FilterType = "all" | "3d" | "7d" | "30d";

interface KeywordWithRecords {
  id: string;
  keyword: string;
  category?: string;
  priority: string;
  records: Array<{ viewed_at: string; notes?: string }>;
  latest_view?: string;
}

const FILTER_CONFIG: { key: FilterType; label: string; days: number }[] = [
  { key: "all", label: "全部", days: 0 },
  { key: "3d", label: "3天未看", days: 3 },
  { key: "7d", label: "7天未看", days: 7 },
  { key: "30d", label: "30天未看", days: 30 },
];

export default function BatchGTPage() {
  const [keywords, setKeywords] = useState<KeywordWithRecords[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [markingId, setMarkingId] = useState<string | null>(null);

  useEffect(() => {
    loadKeywords();
  }, []);

  async function loadKeywords() {
    try {
      const data = await getRootKeywordsWithViewingRecords();
      setKeywords(data.map(k => ({
        ...k,
        records: k.records || []
      })).filter(k => k.keyword?.trim()));
    } catch (error) {
      console.error("Failed to load keywords:", error);
    } finally {
      setLoading(false);
    }
  }

  async function markAsViewed(keywordId: string) {
    setMarkingId(keywordId);
    const now = new Date().toISOString();
    setKeywords(prev => prev.map(k =>
      k.id === keywordId ? { ...k, latest_view: now } : k
    ));
    try {
      await addViewingRecord(keywordId);
    } catch (error) {
      console.error("Failed to mark as viewed:", error);
      setKeywords(prev => prev.map(k =>
        k.id === keywordId ? { ...k, latest_view: undefined } : k
      ));
    } finally {
      setMarkingId(null);
    }
  }

  async function handleImport() {
    if (!importText.trim()) return;
    setImporting(true);

    const lines = importText
      .split("\n")
      .map(l => l.trim())
      .filter(l => l && !l.startsWith("#"));

    try {
      const newKeywords: string[] = [];
      for (const line of lines) {
        const keyword = line.split(",")[0].trim();
        if (!keyword) continue;
        newKeywords.push(keyword);
        await supabase
          .from("twb_root_keywords")
          .upsert({ keyword }, { onConflict: "keyword" });
      }
      if (newKeywords.length > 0) {
        await fetch("/api/sync-sheets", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keywords: newKeywords }),
        });
      }
      await loadKeywords();
      setImportText("");
    } catch (error) {
      console.error("Failed to import:", error);
    } finally {
      setImporting(false);
    }
  }

  async function handleSyncFromSheets() {
    setSyncing(true);
    try {
      const response = await fetch("/api/sync-sheets");
      const result = await response.json();

      if (result.success) {
        await loadKeywords();
        alert(`同步成功！导入 ${result.synced} 个词根`);
      } else {
        alert(`同步失败: ${result.error}`);
      }
    } catch (error) {
      console.error("Sync error:", error);
      alert("同步失败，请检查配置");
    } finally {
      setSyncing(false);
    }
  }

  const today = new Date().toISOString().split("T")[0];
  const viewedToday = keywords.filter(k =>
    k.latest_view && k.latest_view.startsWith(today)
  ).length;

  const filteredKeywords = useMemo(() => {
    if (activeFilter === "all") return keywords;
    const days = FILTER_CONFIG.find(f => f.key === activeFilter)!.days;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return keywords.filter(k => {
      if (!k.latest_view) return true;
      return new Date(k.latest_view).getTime() < cutoff;
    });
  }, [keywords, activeFilter]);

  const filterCounts = useMemo(() => {
    const counts: Record<FilterType, number> = { all: keywords.length, "3d": 0, "7d": 0, "30d": 0 };
    for (const kw of keywords) {
      for (const f of FILTER_CONFIG) {
        if (f.key === "all") continue;
        const cutoff = Date.now() - f.days * 24 * 60 * 60 * 1000;
        if (!kw.latest_view || new Date(kw.latest_view).getTime() < cutoff) {
          counts[f.key]++;
        }
      }
    }
    return counts;
  }, [keywords]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedIndex === null) return;
      if (e.key === "ArrowUp" && selectedIndex > 0) {
        setSelectedIndex(selectedIndex - 1);
      } else if (e.key === "ArrowDown" && selectedIndex < filteredKeywords.length - 1) {
        setSelectedIndex(selectedIndex + 1);
      } else if (e.key === " ") {
        e.preventDefault();
        markAsViewed(filteredKeywords[selectedIndex].id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndex, filteredKeywords]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl" style={{ color: "var(--text-tertiary)" }}>Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-3 py-4 sm:p-6" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-medium mb-2" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>批量 GT 浏览器</h1>
          <p className="text-sm sm:text-base" style={{ color: "var(--text-tertiary)" }}>
            今日已查看: {viewedToday} / {keywords.length}
            <span className="hidden sm:inline"> | 快捷键: ↑↓ 切换, 空格标记已看</span>
          </p>
        </div>

        {/* Import Section */}
        <div className="mb-4 sm:mb-6 p-3 sm:p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
          <h2 className="text-base sm:text-lg font-medium mb-2" style={{ color: "var(--text-secondary)" }}>导入词根</h2>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="每行一个词根，支持逗号分隔的类别"
            className="w-full h-20 sm:h-24 p-2 text-sm"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)", borderRadius: "var(--radius-md)" }}
          />
          <div className="mt-2 flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-4 py-2 disabled:opacity-50 text-sm"
              style={{ background: "var(--accent-blue)", color: "var(--text-primary)" }}
            >
              {importing ? "导入中..." : "导入"}
            </button>
            <button
              onClick={handleSyncFromSheets}
              disabled={syncing}
              className="px-4 py-2 disabled:opacity-50 text-sm"
              style={{ background: "var(--accent-green)", color: "var(--text-primary)" }}
            >
              {syncing ? "同步中..." : "从 Google Sheets 同步"}
            </button>
          </div>
        </div>

        {/* Filter Chips */}
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:mx-0 sm:px-0">
          {FILTER_CONFIG.map(f => (
            <button
              key={f.key}
              onClick={() => { setActiveFilter(f.key); setSelectedIndex(null); }}
              className="flex-shrink-0 px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap"
              style={{
                background: activeFilter === f.key ? "var(--accent-blue)" : "var(--bg-elevated)",
                color: activeFilter ? "var(--text-primary)" : "var(--text-tertiary)",
                borderRadius: "var(--radius-full)",
                border: activeFilter ? "1px solid var(--accent-blue)" : "1px solid var(--border)",
              }}
            >
              {f.label} ({filterCounts[f.key]})
            </button>
          ))}
        </div>

        {/* Keywords List */}
        <div className="grid gap-2">
          {filteredKeywords.map((kw, index) => {
            const isViewedToday = kw.latest_view && kw.latest_view.startsWith(today);
            const isSelected = selectedIndex === index;

            return (
              <div
                key={kw.id}
                onClick={() => setSelectedIndex(index)}
                className="flex items-center justify-between p-3 sm:p-4 cursor-pointer"
                style={{
                  background: isSelected ? "rgba(94, 106, 210, 0.08)" : "var(--bg-card)",
                  border: `1px solid ${isSelected ? "var(--accent-blue-hover)" : "var(--border)"}`,
                  borderRadius: "var(--radius-lg)",
                }}
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (markingId !== kw.id) markAsViewed(kw.id);
                    }}
                    className={`flex-shrink-0 w-6 h-6 flex items-center justify-center ${markingId === kw.id ? "animate-pulse" : ""}`}
                    style={{
                      borderRadius: "var(--radius-sm)",
                      border: `2px solid ${isViewedToday || markingId === kw.id ? "var(--accent-green-bright)" : "var(--border)"}`,
                      background: isViewedToday || markingId === kw.id ? "var(--accent-green-bright)" : "transparent",
                      color: isViewedToday || markingId === kw.id ? "var(--text-primary)" : "transparent",
                    }}
                  >
                    {(isViewedToday || markingId === kw.id) && "✓"}
                  </button>

                  <div className="min-w-0">
                    <div className="font-medium text-sm sm:text-base truncate" style={{ color: "var(--text-primary)" }}>{kw.keyword}</div>
                    {kw.latest_view && (
                      <div className="text-xs" style={{ color: "var(--text-quaternary)" }}>
                        上次查看: {new Date(kw.latest_view).toLocaleString("zh-CN")}
                      </div>
                    )}
                  </div>
                </div>

                <a
                  href={generateGTCompareUrl(kw.keyword, "now 7-d")}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex-shrink-0 ml-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm"
                  style={{ background: "var(--accent-green)", color: "var(--text-primary)", borderRadius: "var(--radius-md)" }}
                >
                  GT 对比
                </a>
              </div>
            );
          })}

          {filteredKeywords.length === 0 && (
            <div className="text-center py-12" style={{ color: "var(--text-quaternary)" }}>
              {keywords.length === 0 ? "还没有词根，请先导入" : "当前筛选条件下没有结果"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
