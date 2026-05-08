# Implementation Plan: KGR Workbench + Keyword Compare + Layout Optimization

## Overview
Add three features to the Google Trends Watcher Board:
1. **KGR Workbench** - Standalone tool for calculating KGR with real search volumes
2. **Keyword Compare** - Generate Google Trends comparison URLs
3. **Layout Optimization** - Simplify button layout in expanded panels

## 1. Type Definitions (lib/types.ts)

### Add new interfaces:

```typescript
// KGR Workbench item
export interface KGRItem {
  keyword: string;
  allintitleCount: number | null;  // Auto-fetched
  allintitleTimestamp: string | null;  // When fetched
  searchVolume: number | null;  // Manual input from Semrush/Google Ads
  searchVolumeTimestamp: string | null;  // When entered
  kgr: number | null;  // Calculated: searchVolume / allintitleCount
  kgrStatus: 'good' | 'medium' | 'bad' | null;  // <0.025 good, 0.025-1 medium, >1 bad
  addedAt: string;  // ISO timestamp when added to workbench
}

// Workbench state
export interface KGRWorkbenchState {
  items: KGRItem[];
  isExpanded: boolean;
  lastUpdated: string;
}
```

## 2. Backend Changes (api-server/server.py)

### Option A: Create dedicated endpoint
```python
@app.get("/api/allintitle")
def get_allintitle(keyword: str = Query(description="Keyword to check")):
    """Get allintitle count for a single keyword."""
    count = _fetch_allintitle(keyword)
    return {
        "keyword": keyword,
        "count": count,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
```

### Option B: Reuse existing `/api/enrich`
- Already returns `allintitle_count` for each keyword
- Can POST single keywords: `{"keywords": [{"name": "AI tool", "value": "0"}]}`
- Returns `results[keyword].allintitle_count`

**Decision: Use Option B** - Reuse existing endpoint to avoid adding new API surface.

## 3. Frontend State Management (app/page.tsx)

### Add new state variables (around line 176):

```typescript
// KGR Workbench state
const [kgrItems, setKgrItems] = useState<KGRItem[]>([]);
const [kgrExpanded, setKgrExpanded] = useState(false);
const [kgrLoading, setKgrLoading] = useState<Record<string, boolean>>({});
```

### Add localStorage helpers (around line 98):

```typescript
// KGR Workbench localStorage
const KGR_WORKBENCH_KEY = "kgr_workbench_v2";

function loadKGRWorkbench(): KGRItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KGR_WORKBENCH_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data.items) ? data.items : [];
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

// Load on mount
useEffect(() => {
  setKgrItems(loadKGRWorkbench());
}, []);

// Save on change
useEffect(() => {
  saveKGRWorkbench(kgrItems);
}, [kgrItems]);
```

## 4. KGR Workbench Component

### Location: After header, before main content grid (line ~460)

```tsx
{/* KGR Workbench Panel */}
{kgrExpanded && (
  <div className="mx-auto max-w-7xl px-3 py-3 sm:px-4">
    <div className="rounded-lg border" style={{
      background: "var(--bg-card)",
      borderColor: "var(--border)"
    }}>
      <div className="border-b p-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎯</span>
            <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              KGR 决策工作台
            </h2>
            <span className="rounded-full px-2 py-0.5 text-xs"
              style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
              {kgrItems.length}
            </span>
          </div>
          <div className="flex gap-2">
            {kgrItems.length > 0 && (
              <button onClick={handleCompareTrends}
                className="rounded-lg px-3 py-1.5 text-xs font-medium"
                style={{ background: "var(--accent-green)", color: "#fff" }}>
                📊 对比趋势
              </button>
            )}
            <button onClick={() => setKgrExpanded(false)}
              className="rounded-lg px-2 py-1 text-xs"
              style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
              收起
              </button>
          </div>
        </div>
      </div>

      {/* Manual keyword input */}
      <div className="border-b p-3" style={{ borderColor: "var(--border)" }}>
        <input type="text" placeholder="手动添加关键词..."
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.currentTarget.value) {
              handleAddToKGR(e.currentTarget.value);
              e.currentTarget.value = "";
            }
          }}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b text-xs" style={{ borderColor: "var(--border)" }}>
              <th className="p-3 text-left">关键词</th>
              <th className="p-3 text-right">allintitle</th>
              <th className="p-3 text-right">真实搜索量</th>
              <th className="p-3 text-right">KGR</th>
              <th className="p-3 text-center">状态</th>
              <th className="p-3 text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {kgrItems.map((item) => (
              <KGRRow key={item.keyword} item={item}
                onUpdate={handleUpdateKGR}
                onRemove={handleRemoveFromKGR}
                loading={kgrLoading[item.keyword]}
              />
            ))}
          </tbody>
        </table>
        {kgrItems.length === 0 && (
          <div className="p-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            从下方列表添加关键词，或手动输入
          </div>
        )}
      </div>

      {/* Help text */}
      <div className="border-t p-3 text-xs" style={{
        borderColor: "var(--border)",
        color: "var(--text-secondary)"
      }}>
        💡 KGR = 真实搜索量 / allintitle数量。小于 0.025 是黄金关键词（低竞争高价值）。
        搜索量请从 Semrush 或 Google Ads 查询后填入。
      </div>
    </div>
  </div>
)}

{/* Toggle button when collapsed */}
{!kgrExpanded && (
  <div className="mx-auto max-w-7xl px-3 pb-3 sm:px-4">
    <button onClick={() => setKgrExpanded(true)}
      className="rounded-lg border px-3 py-1.5 text-xs font-medium"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border)",
        color: "var(--text-secondary)"
      }}>
      🎯 KGR 工作台 ({kgrItems.length})
    </button>
  </div>
)}
```

### KGRRow Component:

```tsx
function KGRRow({ item, onUpdate, onRemove, loading }: {
  item: KGRItem;
  onUpdate: (keyword: string, updates: Partial<KGRItem>) => void;
  onRemove: (keyword: string) => void;
  loading?: boolean;
}) {
  const [volumeInput, setVolumeInput] = useState(
    item.searchVolume !== null ? String(item.searchVolume) : ""
  );

  const handleVolumeSubmit = () => {
    const vol = parseInt(volumeInput.replace(/[,\s]/g, ""), 10);
    if (!isNaN(vol) && vol >= 0) {
      const kgr = item.allintitleCount && item.allintitleCount > 0
        ? vol / item.allintitleCount : null;
      const status = kgr !== null
        ? kgr < 0.025 ? 'good' : kgr < 1 ? 'medium' : 'bad'
        : null;
      onUpdate(item.keyword, {
        searchVolume: vol,
        searchVolumeTimestamp: new Date().toISOString(),
        kgr,
        kgrStatus: status
      });
    }
  };

  const timeAgo = (timestamp: string | null) => {
    if (!timestamp) return "";
    const diff = Date.now() - new Date(timestamp).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "刚刚";
    if (hours < 24) return `${hours}小时前`;
    return `${Math.floor(hours / 24)}天前`;
  };

  const statusColor = {
    good: { bg: "rgba(52,211,153,0.15)", color: "#34d399", label: "✅ 黄金" },
    medium: { bg: "rgba(251,191,36,0.15)", color: "#fbbf24", label: "⚠️ 谨慎" },
    bad: { bg: "rgba(239,68,68,0.15)", color: "#f87171", label: "❌ 饱和" },
  };

  return (
    <tr className="border-b" style={{ borderColor: "var(--border)" }}>
      <td className="p-3">
        <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {item.keyword}
        </div>
      </td>
      <td className="p-3 text-right">
        {loading ? (
          <span className="animate-pulse">...</span>
        ) : item.allintitleCount !== null ? (
          <div>
            <span className="font-mono text-sm">{item.allintitleCount.toLocaleString()}</span>
            {item.allintitleTimestamp && (
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {timeAgo(item.allintitleTimestamp)}
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => fetchAllintitle(item.keyword)}
            className="text-xs underline" style={{ color: "var(--accent-blue)" }}>
            获取
          </button>
        )}
      </td>
      <td className="p-3">
        <input type="text" value={volumeInput}
          onChange={(e) => setVolumeInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleVolumeSubmit(); }}
          onBlur={handleVolumeSubmit}
          placeholder="填入"
          className="w-24 rounded border px-2 py-1 text-right text-sm"
          style={{
            background: "var(--bg-secondary)",
            borderColor: "var(--border)"
          }}
        />
        {item.searchVolumeTimestamp && (
          <div className="text-right text-xs" style={{ color: "var(--text-secondary)" }}>
            {timeAgo(item.searchVolumeTimestamp)}
          </div>
        )}
      </td>
      <td className="p-3 text-right">
        {item.kgr !== null && (
          <span className="font-mono text-sm font-bold">
            {item.kgr.toFixed(4)}
          </span>
        )}
      </td>
      <td className="p-3 text-center">
        {item.kgrStatus && (
          <span className="rounded px-2 py-1 text-xs font-medium"
            style={statusColor[item.kgrStatus]}>
            {statusColor[item.kgrStatus].label}
          </span>
        )}
      </td>
      <td className="p-3 text-center">
        <button onClick={() => onRemove(item.keyword)}
          className="text-xs" style={{ color: "var(--accent-red)" }}>
          移除
        </button>
      </td>
    </tr>
  );
}
```

## 5. Adding Keywords from Lists

### Modify KeywordCard to add "+" button (line ~757):

```tsx
// In KeywordCard, add after the keyword name:
<button onClick={() => handleAddToKGR(item.name)}
  className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium hover:opacity-80"
  style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa" }}
  title="添加到 KGR 工作台">
  +
</button>
```

### Handler functions:

```typescript
const handleAddToKGR = useCallback((keyword: string) => {
  // Check if already exists
  if (kgrItems.some(item => item.keyword === keyword)) {
    return; // Already in workbench
  }

  const newItem: KGRItem = {
    keyword,
    allintitleCount: null,
    allintitleTimestamp: null,
    searchVolume: null,
    searchVolumeTimestamp: null,
    kgr: null,
    kgrStatus: null,
    addedAt: new Date().toISOString(),
  };

  setKgrItems(prev => [...prev, newItem]);

  // Auto-fetch allintitle
  fetchAllintitleForKGR(keyword);
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
  setKgrItems(prev => prev.map(item =>
    item.keyword === keyword ? { ...item, ...updates } : item
  ));
};

const handleRemoveFromKGR = (keyword: string) => {
  setKgrItems(prev => prev.filter(item => item.keyword !== keyword));
};

const handleCompareTrends = () => {
  const keywords = kgrItems.map(item => item.keyword);
  if (keywords.length === 0) return;

  const url = `https://trends.google.com/trends/explore?date=today%201-m&q=${
    keywords.map(k => encodeURIComponent(k)).join(",")
  }`;
  window.open(url, "_blank");
};
```

## 6. Button Layout Optimization

### Simplify EnrichedDecisionPanel (line 803-1066):

**Changes:**
1. Remove "竞争快查" section (lines 1026-1054) - redundant with links
2. Remove "G AI" from links (line 1058)
3. Convert "怎么查?" to tooltip icon
4. Make allintitle count clickable to copy
5. Reduce grid to 5 buttons in single row

```tsx
// Simplified layout:
function EnrichedDecisionPanel({ ... }) {
  // ... existing state ...

  return (
    <div className="border-t px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
      {/* 7-day trend chart - keep as is */}

      {/* Score breakdown - keep as is */}

      {/* Assessment section - simplified */}
      <div className="mb-2.5 rounded-lg p-2" style={{ background: "var(--bg-secondary)" }}>
        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-xs font-bold">上站评估</span>
          <Tooltip content="KGR = 搜索量/allintitle。<0.025 值得做">
            <InfoIcon className="h-3 w-3" />
          </Tooltip>
        </div>

        {/* Freshness + Multi-geo row - keep as is */}

        {/* Supply input + KGR - simplified */}
        <div className="rounded-md p-2" style={{ background: "var(--bg-card)" }}>
          <div className="mb-1 text-xs">页面供给量</div>
          <div className="flex items-center gap-1.5">
            <input type="text" value={supplyInput}
              onChange={(e) => setSupplyInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSupplySubmit(); }}
              placeholder="allintitle 结果数"
              className="flex-1 rounded border px-2 py-1 text-xs"
            />
            <a href={allintitleUrl(keyword)} target="_blank"
              className="rounded px-2 py-1 text-xs font-medium"
              style={{ background: "rgba(66,133,244,0.15)", color: "#4285f4" }}>
              查询
            </a>
          </div>
          {/* KGR result - keep as is */}
        </div>
      </div>

      {/* Simplified links - 5 buttons in row */}
      <div className="flex gap-1.5">
        <JumpLink href={googleSearchUrl(keyword)} label="Google" color="#4285f4" />
        <JumpLink href={googleTrendsUrl(keyword)} label="Trends" color="#34a853" />
        <JumpLink href={semrushUrl(keyword)} label="Semrush" color="#ff642d" />
        <JumpLink href={allintitleUrl(keyword)} label="allintitle" color="#ea4335" />
        <JumpLink href={domainSearchUrl(keyword)} label="域名" color="#de5833" />
      </div>
    </div>
  );
}

// Update JumpLink to be more compact:
function JumpLink({ href, label, color }: { href: string; label: string; color: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="flex-1 rounded-md py-1.5 text-center text-xs font-medium hover:opacity-80"
      style={{ background: `${color}20`, color }}>
      {label}
    </a>
  );
}
```

## 7. Mobile Responsiveness

- KGR Workbench table scrolls horizontally on mobile
- "+" buttons visible on mobile keyword cards
- Workbench toggle button sticks to viewport on mobile
- Table columns stack on very small screens (<640px)

## 8. localStorage Schema

```typescript
// KGR Workbench
localStorage["kgr_workbench_v2"] = {
  items: KGRItem[],
  lastUpdated: string (ISO)
}

// Existing per-keyword KGR (keep for backward compatibility)
localStorage["kgr::{keyword}"] = {
  supply: number,
  ts: number (timestamp)
}
```

## Implementation Order

1. **Phase 1: Types & State** (30 min)
   - Add interfaces to types.ts
   - Add state variables to page.tsx
   - Add localStorage helpers

2. **Phase 2: KGR Workbench UI** (45 min)
   - Build workbench panel component
   - Build KGRRow component
   - Add expand/collapse logic
   - Wire up manual keyword input

3. **Phase 3: Integration** (30 min)
   - Add "+" buttons to keyword cards
   - Implement fetchAllintitleForKGR
   - Add compare trends button
   - Test data persistence

4. **Phase 4: Layout Cleanup** (20 min)
   - Simplify EnrichedDecisionPanel
   - Remove redundant buttons
   - Tighten padding
   - Test mobile view

5. **Phase 5: Testing** (15 min)
   - Test adding keywords from different sources
   - Test KGR calculations
   - Test localStorage persistence
   - Test mobile responsiveness

## Notes

- Keep all changes in the single page.tsx file (current pattern)
- Reuse existing API endpoints (don't add new backend routes)
- Preserve existing functionality while adding new features
- Use consistent styling variables (var(--bg-card), etc.)
- Consider performance: batch allintitle requests if multiple keywords added quickly