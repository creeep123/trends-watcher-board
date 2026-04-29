# Heatmap Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the heatmap to GitHub-style interactive contribution graph with month labels, rich tooltips, entrance animation, and a compact summary bar.

**Architecture:** Backend enriches heatmap data with per-type daily breakdowns (`by_type`). Frontend replaces native `title` tooltips with a positioned tooltip component, adds month labels above week columns, CSS-only column-by-column entrance animation, and replaces the 3-column stats card with a single-line summary.

**Tech Stack:** Next.js API route (Supabase query), React inline components with CSS-in-JS, no external deps.

---

### Task 1: Backend — add `by_type` to heatmap data

**Files:**
- Modify: `app/api/read-stats/route.ts:64-88`

- [ ] **Step 1: Change heatmap query to select `item_type` and `read_at`**

In `app/api/read-stats/route.ts`, change line 65-66 from:

```typescript
const { data: heatmapItems, error: heatmapErr } = await supabase
  .from("twb_read_items")
  .select("read_at")
  .gte("read_at", heatmapStart);
```

to:

```typescript
const { data: heatmapItems, error: heatmapErr } = await supabase
  .from("twb_read_items")
  .select("item_type, read_at")
  .gte("read_at", heatmapStart);
```

- [ ] **Step 2: Replace single-dimension grouping with dual-dimension grouping**

Replace lines 74-88 (the "Group by date" and "Build heatmap array" blocks) with:

```typescript
// Group by (date, item_type)
const dateTypeCounts: Record<string, Record<string, number>> = {};
for (const item of heatmapItems || []) {
  const key = toDateKey(item.read_at);
  if (!dateTypeCounts[key]) dateTypeCounts[key] = {};
  dateTypeCounts[key][item.item_type] = (dateTypeCounts[key][item.item_type] || 0) + 1;
}

// Build heatmap array for last 84 days
const heatmap: { date: string; count: number; by_type: Record<string, number> }[] = [];
for (let i = 83; i >= 0; i--) {
  const d = new Date();
  d.setDate(d.getDate() - i);
  const key = toDateKey(d.toISOString());
  const byType = dateTypeCounts[key] || {};
  const count = Object.values(byType).reduce((sum, n) => sum + n, 0);
  heatmap.push({ date: key, count, by_type: byType });
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/read-stats/route.ts
git commit -m "feat: add per-type breakdown to heatmap data"
```

---

### Task 2: Frontend — update ReadStats type and Heatmap props

**Files:**
- Modify: `lib/AchievementPanel.tsx:15` (ReadStats interface)
- Modify: `lib/AchievementPanel.tsx:136` (Heatmap component signature)

- [ ] **Step 1: Update the `heatmap` field in ReadStats interface**

Change line 15 from:

```typescript
heatmap: { date: string; count: number }[];
```

to:

```typescript
heatmap: { date: string; count: number; by_type: Record<string, number> }[];
```

- [ ] **Step 2: Update Heatmap component props and internal data type**

Change line 136 from:

```typescript
function Heatmap({ data, goal }: { data: { date: string; count: number }[]; goal: number }) {
  const weeks: { date: string; count: number; row: number }[][] = [];
  let cur: { date: string; count: number; row: number }[] = [];
  for (const entry of data) {
    const dow = new Date(entry.date + "T00:00:00").getDay();
    cur.push({ ...entry, row: dow === 0 ? 6 : dow - 1 });
```

to:

```typescript
type HeatmapDay = { date: string; count: number; by_type: Record<string, number> };

function Heatmap({ data, goal }: { data: HeatmapDay[]; goal: number }) {
  const weeks: (HeatmapDay & { row: number })[][] = [];
  let cur: (HeatmapDay & { row: number })[] = [];
  for (const entry of data) {
    const dow = new Date(entry.date + "T00:00:00").getDay();
    cur.push({ ...entry, row: dow === 0 ? 6 : dow - 1 });
```

- [ ] **Step 3: Commit**

```bash
git add lib/AchievementPanel.tsx
git commit -m "feat: update heatmap types for by_type breakdown"
```

---

### Task 3: Frontend — add month labels above heatmap

**Files:**
- Modify: `lib/AchievementPanel.tsx:146-178` (Heatmap component return)

- [ ] **Step 1: Add month label constants and helper**

Add after the `formatDateLabel` function (after line 134):

```typescript
const MONTH_NAMES = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
const WEEKDAY_NAMES = ["一", "", "三", "", "五", "", ""];
```

- [ ] **Step 2: Replace the Heatmap component return block**

Replace the entire Heatmap component return (lines 146-178) with:

```tsx
function Heatmap({ data, goal }: { data: HeatmapDay[]; goal: number }) {
  const weeks: (HeatmapDay & { row: number })[][] = [];
  let cur: (HeatmapDay & { row: number })[] = [];
  for (const entry of data) {
    const dow = new Date(entry.date + "T00:00:00").getDay();
    cur.push({ ...entry, row: dow === 0 ? 6 : dow - 1 });
    if (cur.length === 7) { weeks.push(cur); cur = []; }
  }
  if (cur.length > 0) weeks.push(cur);

  // Compute month labels: show label when month changes
  const monthLabels: (string | null)[] = [];
  let lastMonth = -1;
  for (const week of weeks) {
    // Use the first day of the week for month detection
    const firstDay = week.reduce((a, b) => a.row <= b.row ? a : b);
    const month = new Date(firstDay.date + "T00:00:00").getMonth();
    if (month !== lastMonth) {
      monthLabels.push(MONTH_NAMES[month]);
      lastMonth = month;
    } else {
      monthLabels.push(null);
    }
  }

  return (
    <div style={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginRight: 4 }}>
        {/* Spacer to align with month label row */}
        <span style={{ height: 12, lineHeight: "12px" }} />
        {WEEKDAY_NAMES.map((label, ri) => (
          <span key={ri} style={{ fontSize: 9, fontFamily: "monospace", color: "var(--text-quaternary)", lineHeight: "11px", height: 11, display: "flex", alignItems: "center" }}>
            {label}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 2 }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {/* Month label */}
            <div style={{ height: 12, lineHeight: "12px", fontSize: 9, color: "var(--text-quaternary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {monthLabels[wi]}
            </div>
            {Array.from({ length: 7 }).map((_, ri) => {
              const cell = week.find((c) => c.row === ri);
              const count = cell?.count ?? 0;
              const level = getHeatLevel(count, goal);
              return (
                <div
                  key={ri}
                  title={count > 0 ? `${cell ? formatDateLabel(cell.date) : ""} · ${count}条` : ""}
                  style={{
                    width: 11, height: 11, borderRadius: 2, background: level.color,
                    border: level.border ? `1px solid ${level.border}` : "1px solid transparent",
                    transition: "background 0.2s ease",
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/AchievementPanel.tsx
git commit -m "feat: add month labels above heatmap columns"
```

---

### Task 4: Frontend — add custom Tooltip component

**Files:**
- Modify: `lib/AchievementPanel.tsx` (add HeatmapTooltip component, update Heatmap)

- [ ] **Step 1: Add TYPE_LABELS constant and weekday helper**

Add after the `WEEKDAY_NAMES` line from Task 3:

```typescript
const TYPE_LABELS: Record<string, string> = {
  trending: "Trending", queries: "Queries", github: "GitHub",
  reddit: "Reddit", hn: "HN", technews: "TechNews",
  ph: "Product Hunt", hf: "HuggingFace", ih: "Indie Hackers",
};

const WEEKDAY_LABELS_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
```

- [ ] **Step 2: Add HeatmapTooltip component**

Add before the Heatmap component (before `function Heatmap`):

```tsx
function HeatmapTooltip({ cell, goal, x, y }: {
  cell: HeatmapDay & { row: number } | undefined;
  goal: number;
  x: number;
  y: number;
}) {
  if (!cell || cell.count === 0) return null;

  const d = new Date(cell.date + "T00:00:00");
  const dateStr = `${d.getMonth() + 1}月${d.getDate()}日`;
  const weekday = WEEKDAY_LABELS_CN[d.getDay()];

  const activeTypes = Object.entries(cell.by_type)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${TYPE_LABELS[k] || k}: ${v}`)
    .join(" · ");

  return (
    <div
      style={{
        position: "fixed",
        left: x,
        top: y - 8,
        transform: "translate(-50%, -100%)",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "6px 10px",
        fontSize: 12,
        lineHeight: 1.5,
        color: "var(--text-primary)",
        pointerEvents: "none",
        whiteSpace: "nowrap",
        zIndex: 1002,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ fontWeight: 500, marginBottom: 2 }}>
        {dateStr} {weekday} · <span style={{ color: cell.count >= goal ? "var(--accent-green-bright)" : "var(--text-secondary)" }}>{cell.count} 条已读</span>
      </div>
      {activeTypes && (
        <div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>{activeTypes}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add tooltip state and handlers to Heatmap component**

In the Heatmap component, add state and wrap the grid container with tooltip rendering. Replace the Heatmap component with this version (full replacement, keeping month labels from Task 3):

```tsx
function Heatmap({ data, goal }: { data: HeatmapDay[]; goal: number }) {
  const [tooltip, setTooltip] = useState<{ cell: HeatmapDay & { row: number }; x: number; y: number } | null>(null);

  const weeks: (HeatmapDay & { row: number })[][] = [];
  let cur: (HeatmapDay & { row: number })[] = [];
  for (const entry of data) {
    const dow = new Date(entry.date + "T00:00:00").getDay();
    cur.push({ ...entry, row: dow === 0 ? 6 : dow - 1 });
    if (cur.length === 7) { weeks.push(cur); cur = []; }
  }
  if (cur.length > 0) weeks.push(cur);

  // Compute month labels
  const monthLabels: (string | null)[] = [];
  let lastMonth = -1;
  for (const week of weeks) {
    const firstDay = week.reduce((a, b) => a.row <= b.row ? a : b);
    const month = new Date(firstDay.date + "T00:00:00").getMonth();
    if (month !== lastMonth) {
      monthLabels.push(MONTH_NAMES[month]);
      lastMonth = month;
    } else {
      monthLabels.push(null);
    }
  }

  return (
    <div style={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginRight: 4 }}>
        <span style={{ height: 12, lineHeight: "12px" }} />
        {WEEKDAY_NAMES.map((label, ri) => (
          <span key={ri} style={{ fontSize: 9, fontFamily: "monospace", color: "var(--text-quaternary)", lineHeight: "11px", height: 11, display: "flex", alignItems: "center" }}>
            {label}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 2 }} onMouseLeave={() => setTooltip(null)}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ height: 12, lineHeight: "12px", fontSize: 9, color: "var(--text-quaternary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {monthLabels[wi]}
            </div>
            {Array.from({ length: 7 }).map((_, ri) => {
              const cell = week.find((c) => c.row === ri);
              const count = cell?.count ?? 0;
              const level = getHeatLevel(count, goal);
              return (
                <div
                  key={ri}
                  onMouseEnter={(e) => {
                    if (cell) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({ cell, x: rect.left + rect.width / 2, y: rect.top });
                    }
                  }}
                  style={{
                    width: 11, height: 11, borderRadius: 2, background: level.color,
                    border: level.border ? `1px solid ${level.border}` : "1px solid transparent",
                    transition: "background 0.2s ease",
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      {tooltip && <HeatmapTooltip cell={tooltip.cell} goal={goal} x={tooltip.x} y={tooltip.y} />}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/AchievementPanel.tsx
git commit -m "feat: add custom heatmap tooltip with source breakdown"
```

---

### Task 5: Frontend — add entrance animation

**Files:**
- Modify: `lib/AchievementPanel.tsx` (Heatmap component cell styles)

- [ ] **Step 1: Add CSS keyframes injection**

Add after the imports (after line 6), a keyframes injection:

```typescript
// Inject heatmap entrance animation keyframes
if (typeof document !== "undefined" && !document.getElementById("heatmap-keyframes")) {
  const style = document.createElement("style");
  style.id = "heatmap-keyframes";
  style.textContent = `
    @keyframes heatmapFadeIn {
      from { opacity: 0; transform: scale(0.8); }
      to { opacity: 1; transform: scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .heatmap-cell { animation: none !important; opacity: 1 !important; }
    }
  `;
  document.head.appendChild(style);
}
```

- [ ] **Step 2: Add animation class and delay to cells**

In the Heatmap component cell `<div>` (inside the `Array.from({ length: 7 }).map` block), add the `className` and `animationDelay` style:

Change the cell `<div>` style to include:

```typescript
style={{
  width: 11, height: 11, borderRadius: 2, background: level.color,
  border: level.border ? `1px solid ${level.border}` : "1px solid transparent",
  transition: "background 0.2s ease",
  animation: "heatmapFadeIn 0.3s ease forwards",
  animationDelay: `${wi * 20}ms`,
  opacity: 0,
}}
className="heatmap-cell"
```

- [ ] **Step 3: Commit**

```bash
git add lib/AchievementPanel.tsx
git commit -m "feat: add heatmap column-by-column entrance animation"
```

---

### Task 6: Frontend — replace 3-column stats with compact summary

**Files:**
- Modify: `lib/AchievementPanel.tsx:320-331` (cumulative stats section in DetailPanel)

- [ ] **Step 1: Replace the 3-column stats block**

Replace lines 318-331 (the separator + flex stats block) with:

```tsx
<div style={{ height: 1, background: "var(--border-subtle)", margin: "0 0 16px 0" }} />

<div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
  过去 12 周共阅读 <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{cumulative?.total_reads ?? 0}</span> 条
  {" · "}最长连续 <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{cumulative?.streak ?? 0}</span> 天
  {" · "}最高单日 <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{cumulative?.best_day ?? 0}</span> 条
</div>
```

- [ ] **Step 2: Commit**

```bash
git add lib/AchievementPanel.tsx
git commit -m "feat: replace 3-column stats with compact summary line"
```

---

### Task 7: Build verification and deploy

- [ ] **Step 1: Build the project**

Run: `pnpm build`
Expected: Build succeeds with no type errors.

- [ ] **Step 2: Fix any build errors if present**

Address TypeScript errors, import issues, or missing references.

- [ ] **Step 3: Deploy to Vercel**

Run: `npx vercel --prod --token $(jq -r .vercelToken ~/.claude/credentials.json)`
Expected: Production deployment URL.

- [ ] **Step 4: Visual verification**

Open the deployed URL, click the achievement pill to open the panel, verify:
- Month labels appear above correct week columns
- Hovering over a cell shows tooltip with date + total + source breakdown
- Cells animate in left-to-right on panel open
- Summary line shows "过去 12 周共阅读 X 条 · 最长连续 Y 天 · 最高单日 Z 条"
