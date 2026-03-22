"use client";

import { useState, useEffect } from "react";
import { supabase, getRootKeywordsWithViewingRecords, addViewingRecord } from "@/lib/supabase";
import { generateGTCompareUrl } from "@/lib/types";

interface KeywordWithRecords {
  id: string;
  keyword: string;
  category?: string;
  priority: string;
  records: Array<{ viewed_at: string; notes?: string }>;
  latest_view?: string;
}

export default function BatchGTPage() {
  const [keywords, setKeywords] = useState<KeywordWithRecords[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadKeywords();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedIndex === null) return;
      if (e.key === "ArrowUp" && selectedIndex > 0) {
        setSelectedIndex(selectedIndex - 1);
      } else if (e.key === "ArrowDown" && selectedIndex < keywords.length - 1) {
        setSelectedIndex(selectedIndex + 1);
      } else if (e.key === " ") {
        e.preventDefault();
        markAsViewed(keywords[selectedIndex].id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndex, keywords]);

  async function loadKeywords() {
    try {
      const data = await getRootKeywordsWithViewingRecords();
      setKeywords(data.map(k => ({
        ...k,
        records: k.records || []
      })));
    } catch (error) {
      console.error("Failed to load keywords:", error);
    } finally {
      setLoading(false);
    }
  }

  async function markAsViewed(keywordId: string) {
    try {
      await addViewingRecord(keywordId);
      await loadKeywords();
    } catch (error) {
      console.error("Failed to mark as viewed:", error);
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
      for (const line of lines) {
        const keyword = line.split(",")[0].trim();
        await supabase
          .from("twb_root_keywords")
          .upsert({ keyword }, { onConflict: "keyword" });
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">批量 GT 浏览器</h1>
          <p className="text-gray-400">
            今日已查看: {viewedToday} / {keywords.length} |
            快捷键: ↑↓ 切换, 空格标记已看
          </p>
        </div>

        {/* Import Section */}
        <div className="mb-6 bg-gray-900 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">导入词根</h2>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="每行一个词根，支持逗号分隔的类别"
            className="w-full h-24 bg-gray-800 border border-gray-700 rounded p-2 text-sm"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
            >
              {importing ? "导入中..." : "导入"}
            </button>
            <button
              onClick={handleSyncFromSheets}
              disabled={syncing}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded disabled:opacity-50"
            >
              {syncing ? "同步中..." : "从 Google Sheets 同步"}
            </button>
          </div>
        </div>

        {/* Keywords List */}
        <div className="grid gap-2">
          {keywords.map((kw, index) => {
            const isViewedToday = kw.latest_view && kw.latest_view.startsWith(today);
            const isSelected = selectedIndex === index;

            return (
              <div
                key={kw.id}
                onClick={() => setSelectedIndex(index)}
                className={`
                  flex items-center justify-between p-4 rounded-lg cursor-pointer
                  ${isSelected ? "bg-blue-900/30 ring-2 ring-blue-500" : "bg-gray-900"}
                  hover:bg-gray-800
                `}
              >
                <div className="flex items-center gap-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      markAsViewed(kw.id);
                    }}
                    className={`
                      w-6 h-6 rounded border-2 flex items-center justify-center
                      ${isViewedToday
                        ? "bg-green-500 border-green-500 text-white"
                        : "border-gray-600"
                      }
                    `}
                  >
                    {isViewedToday && "✓"}
                  </button>

                  <div>
                    <div className="font-semibold">{kw.keyword}</div>
                    {kw.latest_view && (
                      <div className="text-xs text-gray-500">
                        上次查看: {new Date(kw.latest_view).toLocaleString("zh-CN")}
                      </div>
                    )}
                  </div>
                </div>

                <a
                  href={generateGTCompareUrl(kw.keyword)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-sm"
                >
                  GT 对比
                </a>
              </div>
            );
          })}

          {keywords.length === 0 && (
            <div className="text-center text-gray-500 py-12">
              还没有词根，请先导入
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
