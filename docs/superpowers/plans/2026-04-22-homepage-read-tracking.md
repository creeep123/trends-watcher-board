# Homepage Read Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-item read tracking across all 6 homepage sections so users can see which items they've already viewed.

**Architecture:** New Supabase table `twb_read_items` with `(item_type, item_key)` unique constraint. Single API route `/api/read-items` handles batch GET (check status) and POST (mark read). Homepage loads read status in one batch call after data is ready, and marks items as read on click via optimistic update.

**Tech Stack:** Supabase (PostgreSQL), Next.js API Routes, React state

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/20260422000000_create_read_items.sql` | Create | New table |
| `app/api/read-items/route.ts` | Create | API route (GET + POST) |
| `lib/useReadItems.ts` | Create | Custom hook for read state management |
| `app/page.tsx` | Modify | Integrate read tracking into all 6 sections |

---

### Task 1: Create Supabase Migration

**Files:**
- Create: `supabase/migrations/20260422000000_create_read_items.sql`

- [ ] **Step 1: Write migration SQL**

```sql
CREATE TABLE IF NOT EXISTS twb_read_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type TEXT NOT NULL,
  item_key TEXT NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_read_items_unique ON twb_read_items (item_type, item_key);

-- Allow anonymous inserts (no RLS for read tracking — it's a personal preference feature)
ALTER TABLE twb_read_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon select" ON twb_read_items FOR SELECT USING (true);
CREATE POLICY "Allow anon insert" ON twb_read_items FOR INSERT WITH CHECK (true);
```

- [ ] **Step 2: Run migration via Supabase Dashboard or CLI**

Run the SQL in Supabase SQL Editor at `https://supabase.com/dashboard/project/roruthlntnpjtfardmte/sql`

- [ ] **Step 3: Verify table exists**

Run in SQL Editor: `SELECT count(*) FROM twb_read_items;` — should return 0.

- [ ] **Step 4: Commit migration**

```bash
git add supabase/migrations/20260422000000_create_read_items.sql
git commit -m "feat: add twb_read_items table for homepage read tracking"
```

---

### Task 2: Create API Route

**Files:**
- Create: `app/api/read-items/route.ts`

- [ ] **Step 1: Write the API route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const itemsParam = request.nextUrl.searchParams.get("items");
  if (!itemsParam) {
    return NextResponse.json({ read: [] });
  }

  // Parse "trending:ai,hn:12345,reddit:https://..." into array of {item_type, item_key}
  const pairs = itemsParam.split(",").map(pair => {
    const colonIdx = pair.indexOf(":");
    if (colonIdx === -1) return null;
    return {
      item_type: pair.slice(0, colonIdx),
      item_key: pair.slice(colonIdx + 1),
    };
  }).filter(Boolean) as { item_type: string; item_key: string }[];

  if (pairs.length === 0) {
    return NextResponse.json({ read: [] });
  }

  // Query: any row matching (item_type, item_key)
  const { data, error } = await supabase
    .from("twb_read_items")
    .select("item_type, item_key")
    .or(
      pairs.map(p => `item_type.eq.${p.item_type},item_key.eq.${encodeURIComponent(p.item_key)}`).join(",")
    );

  if (error) {
    console.error("Read items query error:", error);
    return NextResponse.json({ read: [] });
  }

  const readSet = new Set(
    (data || []).map(r => `${r.item_type}:${r.item_key}`)
  );

  return NextResponse.json({ read: Array.from(readSet) });
}

export async function POST(request: NextRequest) {
  const { item_type, item_key } = await request.json();

  if (!item_type || !item_key) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { error } = await supabase
    .from("twb_read_items")
    .upsert({ item_type, item_key }, { onConflict: "item_type,item_key" });

  if (error) {
    console.error("Read items upsert error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

> **Note on GET query:** Supabase's `.or()` filter uses comma-separated conditions. Since item_keys can contain colons (URLs), we use `indexOf(":")` to split only on the first colon. The `encodeURIComponent` on item_key handles special characters in the filter.

- [ ] **Step 2: Test the API locally (optional, skip per user preference)**

Skip — deploy directly.

- [ ] **Step 3: Commit**

```bash
git add app/api/read-items/route.ts
git commit -m "feat: add /api/read-items endpoint for homepage read tracking"
```

---

### Task 3: Create useReadItems Hook

**Files:**
- Create: `lib/useReadItems.ts`

- [ ] **Step 1: Write the custom hook**

```typescript
import { useState, useEffect, useCallback } from "react";

type ItemType = "trending" | "queries" | "reddit" | "hn" | "technews" | "github";

interface ReadItem {
  item_type: ItemType;
  item_key: string;
}

export function useReadItems() {
  const [readSet, setReadSet] = useState<Set<string>>(new Set());

  // Batch fetch read status for a list of items
  const fetchReadStatus = useCallback(async (items: ReadItem[]) => {
    if (items.length === 0) return;
    try {
      const itemsParam = items
        .map(i => `${i.item_type}:${i.item_key}`)
        .join(",");
      const res = await fetch(`/api/read-items?items=${encodeURIComponent(itemsParam)}`);
      const { read } = await res.json();
      setReadSet(new Set(read));
    } catch (e) {
      console.error("Failed to fetch read status:", e);
    }
  }, []);

  // Mark a single item as read (optimistic)
  const markAsRead = useCallback((item_type: ItemType, item_key: string) => {
    const key = `${item_type}:${item_key}`;
    setReadSet(prev => new Set(prev).add(key));
    fetch("/api/read-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_type, item_key }),
    }).catch(console.error);
  }, []);

  // Check if a specific item is read
  const isRead = useCallback((item_type: ItemType, item_key: string): boolean => {
    return readSet.has(`${item_type}:${item_key}`);
  }, [readSet]);

  return { readSet, fetchReadStatus, markAsRead, isRead };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/useReadItems.ts
git commit -m "feat: add useReadItems hook for homepage read tracking"
```

---

### Task 4: Integrate into Homepage

**Files:**
- Modify: `app/page.tsx`

This is the largest task. The approach:
1. Add `useReadItems()` hook to the main component
2. After data loads, collect all visible `(type, key)` pairs and batch-fetch read status
3. Pass `isRead` + `markAsRead` to each card sub-component
4. Each sub-component applies dimming style when `isRead` is true

- [ ] **Step 1: Add hook to main component**

In `app/page.tsx`, at the top of `TrendsPage()` function (around line 225), add:

```typescript
import { useReadItems } from "@/lib/useReadItems";

// Inside TrendsPage():
const { fetchReadStatus, markAsRead, isRead } = useReadItems();
```

- [ ] **Step 2: Collect items and fetch read status after data loads**

Find the existing `useEffect` hooks that load each section's data. After all data is loaded (after the main trends fetch resolves), add a new effect that collects all visible items and fetches their read status.

Add after existing data-loading effects (find a good location — after the main data fetch, around line 400-500):

```typescript
// Fetch read status for all visible items
useEffect(() => {
  const items: { item_type: "trending" | "queries" | "reddit" | "hn" | "technews" | "github"; item_key: string }[] = [];

  // Trending keywords
  data?.trending?.forEach(k => items.push({ item_type: "trending", item_key: k.name }));
  // Queries
  data?.queries?.forEach(k => items.push({ item_type: "queries", item_key: k.name }));
  // Reddit
  redditPosts.forEach(p => { if (p.url) items.push({ item_type: "reddit", item_key: p.url }); });
  // HackerNews
  hnPosts.forEach(p => items.push({ item_type: "hn", item_key: String(p.id) }));
  // Tech News
  techNewsPosts.forEach(a => { if (a.url) items.push({ item_type: "technews", item_key: a.url }); });
  // GitHub
  data?.github?.forEach(g => items.push({ item_type: "github", item_key: g.name }));

  if (items.length > 0) fetchReadStatus(items);
}, [data, redditPosts, hnPosts, techNewsPosts, fetchReadStatus]);
```

- [ ] **Step 3: Update RedditCard to accept and use read props**

Change RedditCard signature and add read styling:

```typescript
function RedditCard({ post, index, isRead, onMarkRead }: {
  post: RedditPost; index: number; isRead: boolean; onMarkRead: () => void;
}) {
```

Change the outer `<a>` tag to use `<div>` + click handler (so we can mark as read AND open the URL):

```typescript
return (
  <div
    onClick={() => { onMarkRead(); window.open(url, "_blank"); }}
    style={{
      opacity: isRead ? 0.4 : 1,
      transition: "opacity 0.3s",
    }}
    className="group flex items-start gap-2.5 border p-4 cursor-pointer transition-all sm:gap-3 sm:p-2.5"
    // ... rest of existing styles
  >
```

Update the call site:
```typescript
<RedditCard key={`r-${i}`} post={post} index={i}
  isRead={isRead("reddit", post.url)} onMarkRead={() => markAsRead("reddit", post.url)} />
```

- [ ] **Step 4: Update HackerNewsCard similarly**

Same pattern: accept `isRead` + `onMarkRead`, wrap in `<div>` with click handler, apply `opacity: isRead ? 0.4 : 1`.

```typescript
function HackerNewsCard({ post, index, isRead, onMarkRead }: {
  post: HackerNewsPost; index: number; isRead: boolean; onMarkRead: () => void;
}) {
```

Call site:
```typescript
<HackerNewsCard key={`hn-${i}`} post={post} index={i}
  isRead={isRead("hn", String(post.id))} onMarkRead={() => markAsRead("hn", String(post.id))} />
```

- [ ] **Step 5: Update Tech News section (inline rendering)**

Tech News is rendered inline (not a separate component). Add read tracking directly:

```typescript
<div
  key={`tn-${i}`}
  onClick={() => { markAsRead("technews", article.url); }}
  style={{
    opacity: isRead("technews", article.url) ? 0.4 : 1,
    transition: "opacity 0.3s",
    cursor: "pointer",
  }}
  className="group border p-3 transition-colors"
  // ... existing styles
>
```

Wrap the `<a>` inside it or make the whole div clickable.

- [ ] **Step 6: Update GitHub section (KeywordCard with isGithub)**

KeywordCard is shared between Trending/Queries and GitHub. For GitHub cards, add read tracking:

Pass additional props to KeywordCard:
```typescript
<KeywordCard key={`gh-${i}`} item={item} index={i} isGithub
  isRead={isRead("github", item.name)} onMarkRead={() => markAsRead("github", item.name)} />
```

In KeywordCard, when `isGithub` is true and `isRead` is true, apply dimming:
```typescript
style={{
  opacity: isGithub && isRead ? 0.4 : 1,
  transition: "opacity 0.3s",
}}
```

- [ ] **Step 7: Update Trending and Queries KeywordCards**

For Trending section:
```typescript
<KeywordCard key={`t-${i}`} item={item} index={i}
  isRead={isRead("trending", item.name)} onMarkRead={() => markAsRead("trending", item.name)}
  // ... existing props
/>
```

For Queries section:
```typescript
<KeywordCard key={`q-${i}`} item={item} index={i}
  isRead={isRead("queries", item.name)} onMarkRead={() => markAsRead("queries", item.name)}
  // ... existing props
/>
```

- [ ] **Step 8: Push and verify**

```bash
git add app/page.tsx lib/useReadItems.ts
git commit -m "feat: integrate read tracking across all homepage sections"
git push origin main
```

Verify on https://trends-watcher-board.vercel.app — click a Reddit post, reload page, it should be dimmed.
