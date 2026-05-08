# Achievement Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily reading achievement panel with progress bars, heatmap, and cumulative stats to the homepage.

**Architecture:** Server-side stats aggregation via `/api/read-stats` (reads from `twb_read_items` + `twb_daily_goals`), client-side summary bar + detail panel rendered in `app/page.tsx`. The panel is extracted into `lib/AchievementPanel.tsx` to keep the large page file manageable.

**Tech Stack:** Next.js API routes, Supabase (PostgreSQL), SVG (progress rings), CSS Grid (heatmap), React hooks

---

### Task 1: Create `twb_daily_goals` table in Supabase

**Files:**
- Create: `supabase/migrations/20260423000000_create_daily_goals.sql`

- [ ] **Step 1: Write migration SQL**

```sql
CREATE TABLE IF NOT EXISTS twb_daily_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total_goal int NOT NULL DEFAULT 40,
  new_words_goal int NOT NULL DEFAULT 20,
  info_goal int NOT NULL DEFAULT 20,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default row
INSERT INTO twb_daily_goals (id, total_goal, new_words_goal, info_goal)
VALUES ('00000000-0000-0000-0000-000000000001', 40, 20, 20)
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Run migration via Supabase SQL editor**

Use the Supabase dashboard or API to execute the SQL. Verify the table exists.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260423000000_create_daily_goals.sql
git commit -m "feat: add twb_daily_goals migration"
```

---

### Task 2: Create `/api/read-stats` route (GET stats + PUT goals)

**Files:**
- Create: `app/api/read-stats/route.ts`
- Read: `app/api/read-items/route.ts` (reference for Supabase import pattern)
- Read: `lib/supabase.ts` (for `supabase` client)

- [ ] **Step 1: Write the GET handler**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    // --- Today counts ---
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0).toISOString();

    const { data: todayRows } = await supabase
      .from("twb_read_items")
      .select("item_type")
      .gte("read_at", todayStart);

    const todayCounts: Record<string, number> = {};
    for (const r of todayRows || []) {
      todayCounts[r.item_type] = (todayCounts[r.item_type] || 0) + 1;
    }

    const nw = {
      total: (todayCounts["trending"] || 0) + (todayCounts["queries"] || 0) + (todayCounts["github"] || 0),
      trending: todayCounts["trending"] || 0,
      queries: todayCounts["queries"] || 0,
      github: todayCounts["github"] || 0,
    };
    const info = {
      total: (todayCounts["reddit"] || 0) + (todayCounts["hn"] || 0) + (todayCounts["technews"] || 0),
      reddit: todayCounts["reddit"] || 0,
      hn: todayCounts["hn"] || 0,
      technews: todayCounts["technews"] || 0,
    };

    // --- Heatmap (last 84 days) ---
    const heatmapStart = new Date();
    heatmapStart.setDate(heatmapStart.getDate() - 83);
    heatmapStart.setHours(0, 0, 0, 0).toISOString();

    const { data: heatmapRows } = await supabase
      .from("twb_read_items")
      .select("read_at")
      .gte("read_at", heatmapStart);

    const heatmapMap: Record<string, number> = {};
    for (const r of heatmapRows || []) {
      const day = r.read_at.slice(0, 10);
      heatmapMap[day] = (heatmapMap[day] || 0) + 1;
    }

    const heatmap: { date: string; count: number }[] = [];
    for (let i = 83; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      heatmap.push({ date: key, count: heatmapMap[key] || 0 });
    }

    // --- Cumulative stats ---
    const { count: totalReads } = await supabase
      .from("twb_read_items")
      .select("*", { count: "exact", head: true });

    // Best day
    const { data: bestDayRows } = await supabase.rpc("get_best_day", {})
      || await supabase
        .from("twb_read_items")
        .select("read_at");
    // Fallback: compute in JS
    const dayCounts: Record<string, number> = {};
    for (const r of bestDayRows || []) {
      const day = (r.read_at || "").slice(0, 10);
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    }
    const bestDay = Math.max(0, ...Object.values(dayCounts));

    // Streak
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      if ((heatmapMap[key] || 0) > 0) streak++;
      else break;
    }

    // --- Goals ---
    const { data: goalsRow } = await supabase
      .from("twb_daily_goals")
      .select("total_goal, new_words_goal, info_goal")
      .limit(1)
      .single();

    const goals = {
      total: goalsRow?.total_goal ?? 40,
      new_words: goalsRow?.new_words_goal ?? 20,
      info: goalsRow?.info_goal ?? 20,
    };

    return NextResponse.json({
      today: { total: nw.total + info.total, new_words: nw, info },
      heatmap,
      cumulative: { total_reads: totalReads || 0, streak, best_day: bestDay },
      goals,
    });
  } catch (error: any) {
    console.error("Read stats error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const updates: Record<string, number> = {};
    if (typeof body.total_goal === "number") updates.total_goal = body.total_goal;
    if (typeof body.new_words_goal === "number") updates.new_words_goal = body.new_words_goal;
    if (typeof body.info_goal === "number") updates.info_goal = body.info_goal;
    updates.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from("twb_daily_goals")
      .update(updates)
      .eq("id", "00000000-0000-0000-0000-000000000001");

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit 2>&1 | grep read-stats`
Expected: no output (no errors)

- [ ] **Step 3: Commit**

```bash
git add app/api/read-stats/route.ts
git commit -m "feat: add read-stats API route"
```

---

### Task 3: Create `lib/AchievementPanel.tsx` — summary bar + detail panel

**Files:**
- Create: `lib/AchievementPanel.tsx`
- Read: `app/globals.css` (for existing CSS variables)
- Read: `DESIGN.md` (for Linear design tokens)

- [ ] **Step 1: Create the AchievementPanel component**

This is a large component. It includes:
1. A `SummaryBar` — small pill with progress ring, always visible
2. A `DetailPanel` — modal overlay with 3 sections (progress, heatmap, stats)
3. A `StackedBar` — segmented progress bar for 新词/资讯 categories
4. A `Heatmap` — 12-week contribution grid

The component fetches `/api/read-stats` on mount and when the panel opens.

```typescript
"use client";

import { useState, useEffect, useMemo } from "react";

// --- Types ---
interface ReadStats {
  today: {
    total: number;
    new_words: { total: number; trending: number; queries: number; github: number };
    info: { total: number; reddit: number; hn: number; technews: number };
  };
  heatmap: { date: string; count: number }[];
  cumulative: { total_reads: number; streak: number; best_day: number };
  goals: { total: number; new_words: number; info: number };
}

// --- SVG Progress Ring ---
function ProgressRing({ value, max, size = 24, strokeWidth = 3, reached = false }: {
  value: number; max: number; size?: number; strokeWidth?: number; reached?: boolean;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(value / max, 1);
  const offset = circumference * (1 - pct);
  const color = reached ? "var(--accent-green-bright)" : "var(--accent-blue)";

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke="var(--border-subtle)" strokeWidth={strokeWidth} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.22, 1, 0.36, 1), stroke 0.3s" }} />
    </svg>
  );
}

// --- Stacked Progress Bar ---
function StackedBar({ segments, goal, label }: {
  segments: { name: string; value: number; color: string }[];
  goal: number;
  label: string;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const pct = goal > 0 ? Math.min(total / goal, 1) : 0;
  const reached = total >= goal;

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)", letterSpacing: "0.02em" }}>{label}</span>
        <span className="text-xs font-medium" style={{
          color: reached ? "var(--accent-green-bright)" : "var(--text-secondary)",
          transition: "color 0.3s",
        }}>{total}/{goal}</span>
      </div>
      <div className="relative h-2 w-full" style={{
        background: "var(--bg-elevated)",
        borderRadius: "var(--radius-full)",
        overflow: "hidden",
      }}>
        <div className="flex h-full" style={{
          width: `${pct * 100}%`,
          borderRadius: "var(--radius-full)",
          transition: "width 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
        }}>
          {segments.filter(s => s.value > 0).map((seg, i) => (
            <div key={seg.name} title={`${seg.name}: ${seg.value}`}
              style={{
                flex: seg.value,
                background: reached ? "var(--accent-green-bright)" : seg.color,
                transition: "background 0.3s",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Heatmap ---
function Heatmap({ data, goal }: { data: { date: string; count: number }[]; goal: number }) {
  const levels = [
    "var(--bg-elevated)",
    "rgba(94, 106, 210, 0.15)",
    "rgba(94, 106, 210, 0.35)",
    "rgba(94, 106, 210, 0.6)",
    "var(--accent-blue)",
  ];

  function getLevel(count: number): number {
    if (count === 0) return 0;
    const ratio = count / Math.max(goal, 1);
    if (ratio >= 1) return 4;
    if (ratio >= 0.5) return 3;
    if (ratio >= 0.25) return 2;
    return 1;
  }

  const days = ["一", "", "三", "", "五", "", "日"];
  // Reorganize into weeks (columns)
  const weeks: typeof data[] = [];
  for (let i = 0; i < data.length; i += 7) {
    weeks.push(data.slice(i, i + 7));
  }

  return (
    <div>
      <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-tertiary)", letterSpacing: "0.02em" }}>
        近 12 周
      </h3>
      <div className="flex gap-0.5 overflow-x-auto pb-1">
        {/* Day labels */}
        <div className="flex flex-col gap-0.5 mr-1">
          {days.map((d, i) => (
            <div key={i} className="text-center" style={{
              width: 16, height: 11,
              fontSize: 9, lineHeight: "11px",
              color: d ? "var(--text-quaternary)" : "transparent",
              fontFamily: "monospace",
            }}>{d}</div>
          ))}
        </div>
        {/* Week columns */}
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-0.5">
            {week.map((day) => {
              const level = getLevel(day.count);
              return (
                <div key={day.date} title={`${day.date} · ${day.count}条`}
                  style={{
                    width: 11, height: 11,
                    borderRadius: 2,
                    background: levels[level],
                    border: level === 0 ? "1px solid var(--border-subtle)" : "none",
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

// --- Main Achievement Panel ---
export function AchievementSummary() {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<ReadStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/read-stats");
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error("Failed to fetch stats:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  const toggle = () => {
    if (!open && stats) fetchStats(); // refresh on open
    setOpen(!open);
  };

  if (loading) return null;

  if (!stats) return null;

  const { today, goals, heatmap, cumulative } = stats;
  const reached = today.total >= goals.total;

  return (
    <>
      {/* Summary Bar */}
      <button onClick={toggle} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-full)",
          transition: "background 0.15s",
        }}>
        <ProgressRing value={today.total} max={goals.total} size={22} strokeWidth={3} reached={reached} />
        <span className="text-xs font-medium whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>
          今日 <span style={{ color: reached ? "var(--accent-green-bright)" : "var(--text-secondary)" }}>
            {today.total}/{goals.total}
          </span>
        </span>
      </button>

      {/* Detail Panel */}
      {open && (
        <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 9998 }}
          onClick={toggle}>
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.7)" }} />
          <div className="relative w-full max-w-md mx-4 p-5 overflow-y-auto max-h-[85vh]"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-xl)",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
            }}
            onClick={e => e.stopPropagation()}>
            {/* Close button */}
            <button onClick={toggle} className="absolute top-3 right-3 p-1"
              style={{ color: "var(--text-quaternary)" }}>✕</button>

            {/* Section A: Today's Progress */}
            <div className="flex flex-col items-center mb-6">
              <ProgressRing value={today.total} max={goals.total} size={72} strokeWidth={5} reached={reached} />
              <div className="text-2xl font-semibold mt-1" style={{
                color: reached ? "var(--accent-green-bright)" : "var(--text-primary)",
                letterSpacing: "-0.02em",
                transition: "color 0.3s",
              }}>
                {today.total}
              </div>
              <div className="text-xs" style={{ color: "var(--text-quaternary)" }}>
                / {goals.total} 今日已读
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <StackedBar
                label="新词"
                segments={[
                  { name: "trending", value: today.new_words.trending, color: "var(--accent-blue)" },
                  { name: "queries", value: today.new_words.queries, color: "var(--accent-blue-hover)" },
                  { name: "github", value: today.new_words.github, color: "var(--accent-blue-muted)" },
                ]}
                goal={goals.new_words}
              />
              <StackedBar
                label="资讯"
                segments={[
                  { name: "reddit", value: today.info.reddit, color: "var(--accent-blue)" },
                  { name: "hn", value: today.info.hn, color: "var(--accent-blue-hover)" },
                  { name: "technews", value: today.info.technews, color: "var(--accent-blue-muted)" },
                ]}
                goal={goals.info}
              />
            </div>

            {/* Section B: Heatmap */}
            <div className="mb-6">
              <Heatmap data={heatmap} goal={goals.total} />
            </div>

            {/* Section C: Cumulative Stats */}
            <div className="flex justify-around py-4"
              style={{ borderTop: "1px solid var(--border)" }}>
              {[
                { value: cumulative.total_reads, label: "总已读" },
                { value: cumulative.streak, label: "连续天数" },
                { value: cumulative.best_day, label: "最高单日" },
              ].map((m) => (
                <div key={m.label} className="text-center">
                  <div className="text-xl font-semibold" style={{
                    color: "var(--text-primary)",
                    letterSpacing: "-0.02em",
                  }}>{m.value}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-quaternary)" }}>
                    {m.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit 2>&1 | grep AchievementPanel`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add lib/AchievementPanel.tsx
git commit -m "feat: add AchievementPanel component with progress bars, heatmap, and stats"
```

---

### Task 4: Integrate AchievementSummary into homepage

**Files:**
- Modify: `app/page.tsx` (import + render in header area)

- [ ] **Step 1: Add import**

At the top of `app/page.tsx`, add:

```typescript
import { AchievementSummary } from "@/lib/AchievementPanel";
```

- [ ] **Step 2: Render in the header**

Find the header section in `app/page.tsx` (around the `<h1>` title area) and add the `<AchievementSummary />` component. Place it in the header bar alongside the existing title/nav, aligned to the right on desktop, below the title on mobile.

Look for a `<header>` or navigation div. If none exists, place it next to the mobile tabs. The exact location depends on the current layout — read the surrounding code to find the best insertion point. Use a flex container with `justify-between` to separate title and summary.

- [ ] **Step 3: Verify build passes**

Run: `npx next build 2>&1 | tail -5`
Expected: "Compiled successfully" and no type errors

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: integrate achievement panel into homepage header"
```

---

### Task 5: Push and verify deployment

- [ ] **Step 1: Push to main**

```bash
git push origin main
```

- [ ] **Step 2: Monitor Vercel deployment**

Wait for Vercel to build and deploy. Check:

```bash
VERCEL_TOKEN="<your-token>"
curl -s "https://api.vercel.com/v6/deployments?projectId=<your-project>&limit=1" \
  -H "Authorization: Bearer $VERCEL_TOKEN" | jq '.deployments[0] | {state, readyState}'
```

Expected: `"state": "READY"`

- [ ] **Step 3: Verify on live site**

Check https://trends-watcher-board.vercel.app/ and confirm:
- Summary bar visible in header
- Clicking opens detail panel
- Progress bars show today's read counts
- Heatmap renders
- Cumulative stats display
