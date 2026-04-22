"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase, getRootKeywordsWithViewingRecords, addViewingRecord } from "@/lib/supabase";
import { generateGTCompareUrl } from "@/lib/types";

/* ─── Full-screen confetti shower ─── */
function FullConfetti({ onDone }: { onDone: () => void }) {
  const particles = useMemo(() =>
    Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      color: ["#10b981", "#7170ff", "#f59e0b", "#ef4444", "#a78bfa", "#5e6ad2", "#828fff", "#ffffff"][i % 8],
      size: 4 + Math.random() * 6,
      duration: 0.8 + Math.random() * 0.6,
      delay: Math.random() * 0.3,
      drift: (Math.random() - 0.5) * 60,
      shape: Math.random() > 0.5 ? "circle" : "rect",
      rotation: Math.random() * 720,
    })), []);

  useEffect(() => {
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 9999, overflow: "hidden" }}>
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute"
          style={{
            left: `${p.x}%`,
            top: "-10px",
            width: p.size,
            height: p.shape === "rect" ? p.size * 2.5 : p.size,
            borderRadius: p.shape === "circle" ? "50%" : "2px",
            background: p.color,
            opacity: 0,
            "--fall": "105vh",
            "--drift": `${p.drift}px`,
            "--rot": `${p.rotation}deg`,
            animation: `confettiFall ${p.duration}s ${p.delay}s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

/* ─── Floating +1 from position to counter ─── */
function FloatingPlusOne({ x, y, onDone }: { x: number; y: number; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      className="fixed pointer-events-none select-none"
      style={{
        left: x, top: y, zIndex: 10000,
        animation: "floatUp 1s cubic-bezier(0.22, 1, 0.36, 1) forwards",
      }}
    >
      <span className="text-2xl sm:text-3xl font-bold" style={{ color: "#10b981", textShadow: "0 0 12px rgba(16,185,129,0.5)" }}>+1</span>
    </div>
  );
}

type FilterType = "all" | "today_done" | "today_left" | "3d" | "7d" | "30d";

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
  { key: "today_done", label: "今天已看", days: 0 },
  { key: "today_left", label: "今天未看", days: 0 },
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
  const [flashId, setFlashId] = useState<string | null>(null);
  // Keep recently-viewed items visible for 1.5s before they filter out
  const [recentlyViewed, setRecentlyViewed] = useState<Set<string>>(new Set());
  // Full-screen effects
  const [showConfetti, setShowConfetti] = useState(false);
  const [floatingPlus, setFloatingPlus] = useState<{ id: number; x: number; y: number } | null>(null);
  // Track total checked in this session for milestone celebrations
  const [sessionChecked, setSessionChecked] = useState(0);

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

  const clearRecent = useCallback((id: string) => {
    setRecentlyViewed(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  async function markAsViewed(keywordId: string, evt?: React.MouseEvent) {
    setMarkingId(keywordId);
    setFlashId(keywordId);
    setRecentlyViewed(prev => new Set(prev).add(keywordId));

    // Trigger full-screen effects
    setShowConfetti(true);
    if (evt) {
      setFloatingPlus({ id: Date.now(), x: evt.clientX, y: evt.clientY });
    }
    setSessionChecked(prev => prev + 1);

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
      clearRecent(keywordId);
    } finally {
      setMarkingId(null);
      setTimeout(() => setFlashId(null), 600);
      setTimeout(() => clearRecent(keywordId), 1500);
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
    if (activeFilter === "today_done") return keywords.filter(k => k.latest_view && k.latest_view.startsWith(today));
    if (activeFilter === "today_left") return keywords.filter(k => !k.latest_view || !k.latest_view.startsWith(today));
    const days = FILTER_CONFIG.find(f => f.key === activeFilter)!.days;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return keywords.filter(k => {
      // Keep recently-viewed items visible even if they no longer match the filter
      if (recentlyViewed.has(k.id)) return true;
      if (!k.latest_view) return true;
      return new Date(k.latest_view).getTime() < cutoff;
    });
  }, [keywords, activeFilter, recentlyViewed]);

  const filterCounts = useMemo(() => {
    const counts: Record<FilterType, number> = { all: keywords.length, today_done: 0, today_left: 0, "3d": 0, "7d": 0, "30d": 0 };
    for (const kw of keywords) {
      const isToday = kw.latest_view && kw.latest_view.startsWith(today);
      if (isToday) counts.today_done++;
      else counts.today_left++;
      for (const f of FILTER_CONFIG) {
        if (f.key !== "3d" && f.key !== "7d" && f.key !== "30d") continue;
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
          <h1 className="text-2xl sm:text-3xl font-medium mb-2" style={{ color: "var(--text-secondary)", letterSpacing: "-0.02em" }}>批量 GT 浏览器</h1>
          <p className="text-sm sm:text-base" style={{ color: "var(--text-tertiary)" }}>
            今日已查看: <span className={flashId ? "batch-count-bounce" : ""}>{viewedToday}</span> / {keywords.length}
            <span className="hidden sm:inline"> | 快捷键: ↑↓ 切换, 空格标记已看</span>
          </p>
        </div>

        {/* Import Section */}
        <div className="mb-4 sm:mb-6 p-3 sm:p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-surface)" }}>
          <h2 className="text-base sm:text-lg font-medium mb-2" style={{ color: "var(--text-tertiary)" }}>导入词根</h2>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="每行一个词根，支持逗号分隔的类别"
            className="w-full h-20 sm:h-24 p-2 text-sm outline-none"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)", borderRadius: "var(--radius-md)" }}
          />
          <div className="mt-2 flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-4 py-2 disabled:opacity-50 text-sm transition-opacity"
              style={{ background: "var(--accent-blue)", color: "var(--text-primary)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-subtle)" }}
            >
              {importing ? "导入中..." : "导入"}
            </button>
            <button
              onClick={handleSyncFromSheets}
              disabled={syncing}
              className="px-4 py-2 disabled:opacity-50 text-sm transition-opacity"
              style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}
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
                color: activeFilter === f.key ? "var(--text-primary)" : "var(--text-tertiary)",
                borderRadius: "var(--radius-full)",
                border: activeFilter === f.key ? "1px solid var(--accent-blue)" : "1px solid var(--border)",
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
            const justChecked = recentlyViewed.has(kw.id) && markingId !== kw.id;
            const isSelected = selectedIndex === index;

            return (
              <div
                key={kw.id}
                onClick={() => setSelectedIndex(index)}
                className={`flex items-center justify-between p-3 sm:p-4 cursor-pointer ${flashId === kw.id ? "batch-row-flash" : ""} ${justChecked ? "batch-row-done" : ""}`}
                style={{
                  background: isSelected ? "rgba(94, 106, 210, 0.06)" : "var(--bg-card)",
                  border: `1px solid ${justChecked ? "var(--accent-green-bright)" : isSelected ? "var(--accent-blue-hover)" : "var(--border)"}`,
                  borderRadius: "var(--radius-lg)",
                  transition: "background 0.15s, border-color 0.15s, opacity 0.4s, transform 0.4s",
                }}
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (markingId !== kw.id) markAsViewed(kw.id, e);
                    }}
                    className={`batch-check-box flex-shrink-0 w-6 h-6 flex items-center justify-center ${!isViewedToday && markingId === kw.id ? "pop" : ""}`}
                    style={{
                      borderRadius: "var(--radius-sm)",
                      border: `2px solid ${isViewedToday || markingId === kw.id ? "var(--accent-green-bright)" : "var(--border)"}`,
                      background: isViewedToday || markingId === kw.id ? "var(--accent-green-bright)" : "transparent",
                    }}
                  >
                    {(isViewedToday || markingId === kw.id) && (
                      <svg className="batch-check-svg checked" width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path className="check-path" d="M2.5 7.5L5.5 10.5L11.5 3.5" stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>

                  <div className="min-w-0">
                    <div className="font-medium text-sm sm:text-base truncate" style={{ color: justChecked ? "var(--accent-green-bright)" : "var(--text-primary)" }}>{kw.keyword}</div>
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
                  className="flex-shrink-0 ml-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm transition-opacity hover:opacity-80"
                  style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}
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

      {/* Full-screen effects */}
      {showConfetti && (
        <FullConfetti onDone={() => setShowConfetti(false)} />
      )}
      {floatingPlus && (
        <FloatingPlusOne
          key={floatingPlus.id}
          x={floatingPlus.x}
          y={floatingPlus.y}
          onDone={() => setFloatingPlus(null)}
        />
      )}
    </div>
  );
}
