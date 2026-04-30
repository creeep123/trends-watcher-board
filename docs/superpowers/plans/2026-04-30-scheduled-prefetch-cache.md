# Scheduled Prefetch Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-fetch all board data on a schedule (every 4 hours) into Supabase, so the frontend reads from DB instead of calling the Python backend every time.

**Architecture:** Python backend's existing `_warmup_loop` is enhanced to upsert fetched data into a new `twb_cache` Supabase table. Next.js API routes check Supabase first (instant response), fall back to Python backend on cache miss, and write back to Supabase on the way out.

**Tech Stack:** Python FastAPI + Supabase Python client (already imported), Next.js API routes + `@supabase/supabase-js` (already in `lib/supabase.ts`).

---

### Task 1: Create `twb_cache` table in Supabase

**Files:**
- Create: `supabase/migrations/20260430000000_create_twbcache.sql`

- [ ] **Step 1: Create the migration file**

```sql
CREATE TABLE IF NOT EXISTS twb_cache (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE twb_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon select twb_cache" ON twb_cache FOR SELECT USING (true);
CREATE POLICY "Allow anon insert twb_cache" ON twb_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update twb_cache" ON twb_cache FOR UPDATE USING (true);
```

- [ ] **Step 2: Apply migration**

Run: `cd /home/moses/claude_workspace/trends-watcher-board && npx supabase db push`

If `db push` doesn't work, apply manually via Supabase dashboard SQL editor.

- [ ] **Step 3: Verify table exists**

Run: `npx supabase db execute --sql "SELECT * FROM twb_cache LIMIT 0;"`
Expected: Empty result set (no error).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260430000000_create_twbcache.sql
git commit -m "feat: add twb_cache table for scheduled prefetch"
```

---

### Task 2: Python backend — add `prefetch_all()` that writes to Supabase

**Files:**
- Modify: `api-server/server.py` (add `prefetch_all` function, modify `_warmup_loop`)

- [ ] **Step 1: Add the `prefetch_all()` function**

Add after the `_warmup_once()` function (after line ~1853, before `_warmup_loop`):

```python
PREFETCH_INTERVAL = 4 * 3600  # 4 hours
_last_prefetch = 0.0


def prefetch_all():
    """Fetch all board data and persist to Supabase twb_cache."""
    global _last_prefetch
    if not supabase_client:
        print("[prefetch] No Supabase client, skipping")
        return

    print(f"[prefetch] Starting at {datetime.now(timezone.utc).isoformat()}")
    written = 0

    # 1. Trending for default geos
    for geo in WARMUP_TRENDING_GEOS:
        cache_key = f"trending|{geo}"
        try:
            resp = http_requests.get(
                f"https://trends.google.com/trending/rss?geo={geo}",
                timeout=10, headers={"User-Agent": "Mozilla/5.0"},
            )
            resp.raise_for_status()
            root = ET.fromstring(resp.text)
            items = []
            for item in root.iter("item"):
                title_el = item.find("title")
                traffic_el = item.find("{https://trends.google.com/trending/rss}approx_traffic")
                if title_el is not None and title_el.text:
                    name = title_el.text.strip()
                    traffic = traffic_el.text.strip() if traffic_el is not None and traffic_el.text else ""
                    items.append({"name": name, "traffic": traffic, "url": f"https://www.google.com/search?q={quote_plus(name)}&udm=50", "is_tech": False})
            data = {"trending": items, "timestamp": datetime.now(timezone.utc).isoformat(), "geo": geo}
            supabase_client.table("twb_cache").upsert({
                "key": cache_key,
                "data": data,
                "expires_at": (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat(),
            }).execute()
            # Also update in-memory cache
            _set_cache(cache_key, data)
            written += 1
            print(f"[prefetch] {cache_key}: {len(items)} items → Supabase")
            time.sleep(0.5)
        except Exception as e:
            print(f"[prefetch] {cache_key} error: {e}")

    # 2. Reddit hot
    try:
        cache_key = "reddit|hot"
        all_posts = []
        seen_titles = set()
        for sub in REDDIT_SUB_NAMES:
            posts = _fetch_subreddit_rss(sub, sort="hot", limit=15)
            for p in posts:
                k = p["title"].lower().strip()
                if k not in seen_titles:
                    seen_titles.add(k)
                    all_posts.append(p)
            time.sleep(0.3)
        all_posts.sort(key=lambda p: p.get("score", 50), reverse=True)
        data = {
            "posts": all_posts[:50], "keywords": [], "subreddits": REDDIT_SUB_NAMES,
            "sort": "hot", "total_posts": len(all_posts),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        supabase_client.table("twb_cache").upsert({
            "key": cache_key,
            "data": data,
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat(),
        }).execute()
        _set_cache(cache_key, data)
        written += 1
        print(f"[prefetch] {cache_key}: {len(all_posts)} posts → Supabase")
    except Exception as e:
        print(f"[prefetch] reddit error: {e}")

    # 3. HackerNews
    try:
        cache_key = "hackernews|top"
        resp = http_requests.get("https://hacker-news.firebaseio.com/v0/topstories.json", timeout=10)
        resp.raise_for_status()
        ids = resp.json()[:30]
        posts = []
        for sid in ids:
            try:
                item_resp = http_requests.get(f"https://hacker-news.firebaseio.com/v0/item/{sid}.json", timeout=5)
                item_resp.raise_for_status()
                item = item_resp.json()
                if item and item.get("type") == "story" and item.get("url"):
                    posts.append({
                        "title": item.get("title", ""),
                        "url": item.get("url", ""),
                        "score": item.get("score", 0),
                        "by": item.get("by", ""),
                        "time": item.get("time", 0),
                        "descendants": item.get("descendants", 0),
                        "id": item.get("id"),
                    })
            except Exception:
                continue
        data = {"posts": posts, "timestamp": datetime.now(timezone.utc).isoformat()}
        supabase_client.table("twb_cache").upsert({
            "key": cache_key,
            "data": data,
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat(),
        }).execute()
        _set_cache(cache_key, data)
        written += 1
        print(f"[prefetch] {cache_key}: {len(posts)} posts → Supabase")
    except Exception as e:
        print(f"[prefetch] hackernews error: {e}")

    # 4. TechNews
    try:
        cache_key = "technews|latest"
        all_articles = []
        for feed_url in TECHNEWS_FEEDS:
            try:
                resp = http_requests.get(feed_url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
                resp.raise_for_status()
                root = ET.fromstring(resp.text)
                for item in root.iter("item"):
                    title = (item.findtext("title") or "").strip()
                    link = (item.findtext("link") or "").strip()
                    pub_date = (item.findtext("pubDate") or "").strip()
                    desc = (item.findtext("description") or "").strip()
                    if title and link:
                        source = feed_url.split("//")[1].split("/")[0] if "//" in feed_url else ""
                        all_articles.append({"title": title, "url": link, "source": source, "published": pub_date, "summary": desc})
            except Exception:
                continue
        all_articles = all_articles[:40]
        data = {"articles": all_articles, "total": len(all_articles), "timestamp": datetime.now(timezone.utc).isoformat()}
        supabase_client.table("twb_cache").upsert({
            "key": cache_key,
            "data": data,
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat(),
        }).execute()
        _set_cache(cache_key, data)
        written += 1
        print(f"[prefetch] {cache_key}: {len(all_articles)} articles → Supabase")
    except Exception as e:
        print(f"[prefetch] technews error: {e}")

    # 5. Product Hunt (daily + weekly + monthly)
    for period in ["daily", "weekly", "monthly"]:
        cache_key = f"ph|{period}"
        try:
            # Use existing endpoint handler via internal call
            result = get_producthunt(period=period)
            if hasattr(result, "body"):
                # FastAPI returns a Response object when called directly
                pass
            # Re-fetch via HTTP to get the actual JSON
            resp = http_requests.get(f"http://127.0.0.1:8765/api/producthunt?period={period}", timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                ttl_hours = 8 if period == "daily" else 4
                supabase_client.table("twb_cache").upsert({
                    "key": cache_key,
                    "data": data,
                    "expires_at": (datetime.now(timezone.utc) + timedelta(hours=ttl_hours)).isoformat(),
                }).execute()
                _set_cache(cache_key, data)
                written += 1
                products = data.get("products", [])
                print(f"[prefetch] {cache_key}: {len(products)} products → Supabase")
        except Exception as e:
            print(f"[prefetch] {cache_key} error: {e}")

    # 6. HuggingFace
    try:
        cache_key = "huggingface"
        resp = http_requests.get("http://127.0.0.1:8765/api/huggingface", timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            supabase_client.table("twb_cache").upsert({
                "key": cache_key,
                "data": data,
                "expires_at": (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat(),
            }).execute()
            _set_cache(cache_key, data)
            written += 1
            models = data.get("models", [])
            print(f"[prefetch] {cache_key}: {len(models)} models → Supabase")
    except Exception as e:
        print(f"[prefetch] huggingface error: {e}")

    # 7. IndieHackers
    try:
        cache_key = "indiehackers"
        resp = http_requests.get("http://127.0.0.1:8765/api/indiehackers", timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            supabase_client.table("twb_cache").upsert({
                "key": cache_key,
                "data": data,
                "expires_at": (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat(),
            }).execute()
            _set_cache(cache_key, data)
            written += 1
            posts = data.get("posts", [])
            print(f"[prefetch] {cache_key}: {len(posts)} posts → Supabase")
    except Exception as e:
        print(f"[prefetch] indiehackers error: {e}")

    _last_prefetch = time.time()
    print(f"[prefetch] Done: {written} keys written to Supabase")


@app.get("/api/refresh-all")
def refresh_all():
    """Manual trigger for full prefetch."""
    t = threading.Thread(target=prefetch_all, daemon=True)
    t.start()
    return {"status": "started"}
```

Note: The PH/HF/IH endpoints use `http://127.0.0.1:8765` to call themselves because their handler functions return FastAPI Response objects, not plain dicts, when called directly. Self-call via HTTP is simpler and uses the existing in-memory cache path.

- [ ] **Step 2: Modify `_warmup_loop` to include prefetch**

Replace the `_warmup_loop` function with:

```python
def _warmup_loop():
    """Run warmup and schedule next run. Also run prefetch if interval elapsed."""
    global _warmup_timer
    try:
        _warmup_once()
        # Run prefetch every PREFETCH_INTERVAL (4h), separate from warmup (1h)
        if time.time() - _last_prefetch >= PREFETCH_INTERVAL:
            prefetch_all()
    except Exception as e:
        print(f"[warmup] Unexpected error: {e}")
    _warmup_timer = threading.Timer(WARMUP_INTERVAL, _warmup_loop)
    _warmup_timer.daemon = True
    _warmup_timer.start()
```

- [ ] **Step 3: Add `TECHNEWS_FEEDS` constant if not present**

Search for `TECHNEWS_FEEDS` in `server.py`. If it exists, skip this step. If not, add near the other constants (around line 82):

```python
TECHNEWS_FEEDS = [
    "https://techcrunch.com/feed/",
    "https://www.theverge.com/rss/index.xml",
    "https://feeds.arstechnica.com/arstechnica/index",
]
```

Check by searching: the existing `get_technews` handler already uses this list. If it's defined inline in that handler, extract it to module level.

- [ ] **Step 4: Restart the backend service**

Run: `sudo systemctl restart pytrends-api.service`

- [ ] **Step 5: Verify prefetch runs**

Run: `sleep 10 && journalctl -u pytrends-api --since "1 min ago" --no-pager | grep prefetch`
Expected: `[prefetch] Starting at ...` followed by per-source lines.

- [ ] **Step 6: Commit**

```bash
git add api-server/server.py
git commit -m "feat: add prefetch_all() to persist board data into Supabase twb_cache"
```

---

### Task 3: Create shared Supabase cache helper for Next.js routes

**Files:**
- Create: `lib/supabase-cache.ts`

- [ ] **Step 1: Create the cache helper**

```typescript
import { supabase } from "./supabase";

interface CacheRow {
  key: string;
  data: unknown;
  fetched_at: string;
  expires_at: string;
}

/**
 * Read from Supabase twb_cache. Returns null if miss or expired.
 */
export async function getSupabaseCache<T>(key: string): Promise<T | null> {
  try {
    const { data, error } = await supabase
      .from("twb_cache")
      .select("data")
      .eq("key", key)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (error || !data) return null;
    return data.data as T;
  } catch {
    return null;
  }
}

/**
 * Write to Supabase twb_cache (fire-and-forget).
 */
export async function setSupabaseCache(key: string, data: unknown, ttlMs: number): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  supabase
    .from("twb_cache")
    .upsert({ key, data, expires_at: expiresAt })
    .then()
    .catch(() => {});
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/supabase-cache.ts
git commit -m "feat: add Supabase cache helper for Next.js API routes"
```

---

### Task 4: Update Next.js API routes to read from Supabase cache

Each route follows the same pattern. The changes are mechanical: before the existing `getCached` check, add a `getSupabaseCache` check. After the backend fetch, add a `setSupabaseCache` write.

**Files to modify (8 routes):**
- `app/api/trending/route.ts`
- `app/api/reddit/route.ts`
- `app/api/hackernews/route.ts`
- `app/api/technews/route.ts`
- `app/api/producthunt/route.ts`
- `app/api/huggingface/route.ts`
- `app/api/indiehackers/route.ts`
- `app/api/trends/route.ts`

Each route change follows this pattern:

```typescript
// Add import
import { getSupabaseCache, setSupabaseCache } from "@/lib/supabase-cache";

// In GET handler, BEFORE the existing getCached check:
const forceRefresh = request.nextUrl.searchParams.has("refresh");

if (!forceRefresh) {
  const supabaseCached = await getSupabaseCache<unknown>(cacheKey);
  if (supabaseCached) {
    return NextResponse.json(supabaseCached);
  }
}

// After the backend fetch + setCache, add:
setSupabaseCache(cacheKey, data, TTL_MS);
```

The TTL values per route (matching the Python backend's CACHE_TTL_MAP):

| Route | TTL |
|---|---|
| trending | 4h (14400000) |
| reddit | 4h (14400000) |
| hackernews | 4h (14400000) |
| technews | 4h (14400000) |
| producthunt | 8h (28800000) |
| huggingface | 4h (14400000) |
| indiehackers | 4h (14400000) |
| trends | 4h (14400000) |

- [ ] **Step 1: Update `app/api/trending/route.ts`**

Replace the full file with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import { getSupabaseCache, setSupabaseCache } from "@/lib/supabase-cache";

const API_BASE = process.env.PYTRENDS_API_URL || "http://43.165.126.121";
const TTL_MS = 4 * 3600_000; // 4h

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const geo = request.nextUrl.searchParams.get("geo") || "US";
  const forceRefresh = request.nextUrl.searchParams.has("refresh");

  const cacheKey = `trending|${geo}`;

  // 1. Check Supabase persistent cache (unless refresh forced)
  if (!forceRefresh) {
    const supabaseCached = await getSupabaseCache<unknown>(cacheKey);
    if (supabaseCached) {
      return NextResponse.json(supabaseCached);
    }
  }

  // 2. Check in-memory cache
  const cached = getCached<unknown>(cacheKey);
  if (cached && !forceRefresh) {
    return NextResponse.json(cached);
  }

  // 3. Fallback: fetch from Python backend
  try {
    const res = await fetch(`${API_BASE}/api/trending?geo=${geo}`, {
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      return NextResponse.json({ trending: [], geo }, { status: 200 });
    }
    const data = await res.json();
    setCache(cacheKey, data);
    setSupabaseCache(cacheKey, data, TTL_MS);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ trending: [], geo }, { status: 200 });
  }
}
```

- [ ] **Step 2: Update `app/api/reddit/route.ts`**

Replace the full file with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import { getSupabaseCache, setSupabaseCache } from "@/lib/supabase-cache";

const API_BASE = process.env.PYTRENDS_API_URL || "http://43.165.126.121";
const TTL_MS = 4 * 3600_000;

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const sort = request.nextUrl.searchParams.get("sort") || "hot";
  const forceRefresh = request.nextUrl.searchParams.has("refresh");

  const cacheKey = `reddit|${sort}`;

  if (!forceRefresh) {
    const supabaseCached = await getSupabaseCache<unknown>(cacheKey);
    if (supabaseCached) {
      return NextResponse.json(supabaseCached);
    }
  }

  const cached = getCached<unknown>(cacheKey);
  if (cached && !forceRefresh) {
    return NextResponse.json(cached);
  }

  try {
    const res = await fetch(`${API_BASE}/api/reddit?sort=${sort}`, {
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { posts: [], keywords: [], subreddits: [], sort, total_posts: 0 },
        { status: 200 },
      );
    }
    const data = await res.json();
    setCache(cacheKey, data);
    setSupabaseCache(cacheKey, data, TTL_MS);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { posts: [], keywords: [], subreddits: [], sort, total_posts: 0 },
      { status: 200 },
    );
  }
}
```

- [ ] **Step 3: Update `app/api/hackernews/route.ts`**

Replace the full file with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import { getSupabaseCache, setSupabaseCache } from "@/lib/supabase-cache";

const API_BASE = process.env.PYTRENDS_API_URL || "http://43.165.126.121";
const TTL_MS = 4 * 3600_000;

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const forceRefresh = request.nextUrl.searchParams.has("refresh");
  const cacheKey = "hackernews|top";

  if (!forceRefresh) {
    const supabaseCached = await getSupabaseCache<unknown>(cacheKey);
    if (supabaseCached) {
      return NextResponse.json(supabaseCached);
    }
  }

  const cached = getCached<unknown>(cacheKey);
  if (cached && !forceRefresh) {
    return NextResponse.json(cached);
  }

  try {
    const res = await fetch(`${API_BASE}/api/hackernews`, {
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { posts: [], timestamp: new Date().toISOString() },
        { status: 200 },
      );
    }
    const data = await res.json();
    setCache(cacheKey, data);
    setSupabaseCache(cacheKey, data, TTL_MS);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { posts: [], timestamp: new Date().toISOString() },
      { status: 200 },
    );
  }
}
```

- [ ] **Step 4: Update `app/api/technews/route.ts`**

Replace the full file with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import { getSupabaseCache, setSupabaseCache } from "@/lib/supabase-cache";

const API_BASE = process.env.PYTRENDS_API_URL || "http://43.165.126.121";
const TTL_MS = 4 * 3600_000;

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const forceRefresh = request.nextUrl.searchParams.has("refresh");
  const cacheKey = "technews|latest";

  if (!forceRefresh) {
    const supabaseCached = await getSupabaseCache<unknown>(cacheKey);
    if (supabaseCached) {
      return NextResponse.json(supabaseCached);
    }
  }

  const cached = getCached<unknown>(cacheKey);
  if (cached && !forceRefresh) {
    return NextResponse.json(cached);
  }

  try {
    const res = await fetch(`${API_BASE}/api/technews`, {
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { articles: [], total: 0, timestamp: new Date().toISOString() },
        { status: 200 },
      );
    }
    const data = await res.json();
    setCache(cacheKey, data);
    setSupabaseCache(cacheKey, data, TTL_MS);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { articles: [], total: 0, timestamp: new Date().toISOString() },
      { status: 200 },
    );
  }
}
```

- [ ] **Step 5: Update `app/api/producthunt/route.ts`**

Replace the full file with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import { getSupabaseCache, setSupabaseCache } from "@/lib/supabase-cache";

const API_BASE = process.env.PYTRENDS_API_URL || "http://43.165.126.121";
const TTL_MS = 8 * 3600_000; // 8h for PH

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const period = searchParams.get("period") || "daily";
  const forceRefresh = searchParams.has("refresh");

  const cacheKey = `ph|${period}`;

  if (!forceRefresh) {
    const supabaseCached = await getSupabaseCache<unknown>(cacheKey);
    if (supabaseCached) {
      return NextResponse.json(supabaseCached);
    }
  }

  const cached = getCached<unknown>(cacheKey);
  if (cached && !forceRefresh) {
    return NextResponse.json(cached);
  }

  try {
    const res = await fetch(`${API_BASE}/api/producthunt?period=${encodeURIComponent(period)}`, {
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      return NextResponse.json({ products: [], timestamp: new Date().toISOString() }, { status: 200 });
    }
    const data = await res.json();
    setCache(cacheKey, data);
    setSupabaseCache(cacheKey, data, TTL_MS);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ products: [], timestamp: new Date().toISOString() }, { status: 200 });
  }
}
```

- [ ] **Step 6: Update `app/api/huggingface/route.ts`**

Replace the full file with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import { getSupabaseCache, setSupabaseCache } from "@/lib/supabase-cache";

const API_BASE = process.env.PYTRENDS_API_URL || "http://43.165.126.121";
const TTL_MS = 4 * 3600_000;

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const forceRefresh = request.nextUrl.searchParams.has("refresh");
  const cacheKey = "huggingface";

  if (!forceRefresh) {
    const supabaseCached = await getSupabaseCache<unknown>(cacheKey);
    if (supabaseCached) {
      return NextResponse.json(supabaseCached);
    }
  }

  const cached = getCached<unknown>(cacheKey);
  if (cached && !forceRefresh) {
    return NextResponse.json(cached);
  }

  try {
    const res = await fetch(`${API_BASE}/api/huggingface`, {
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      return NextResponse.json({ models: [], timestamp: new Date().toISOString() }, { status: 200 });
    }
    const data = await res.json();
    setCache(cacheKey, data);
    setSupabaseCache(cacheKey, data, TTL_MS);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ models: [], timestamp: new Date().toISOString() }, { status: 200 });
  }
}
```

- [ ] **Step 7: Update `app/api/indiehackers/route.ts`**

Replace the full file with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import { getSupabaseCache, setSupabaseCache } from "@/lib/supabase-cache";

const API_BASE = process.env.PYTRENDS_API_URL || "http://43.165.126.121";
const TTL_MS = 4 * 3600_000;

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const forceRefresh = request.nextUrl.searchParams.has("refresh");
  const cacheKey = "indiehackers";

  if (!forceRefresh) {
    const supabaseCached = await getSupabaseCache<unknown>(cacheKey);
    if (supabaseCached) {
      return NextResponse.json(supabaseCached);
    }
  }

  const cached = getCached<unknown>(cacheKey);
  if (cached && !forceRefresh) {
    return NextResponse.json(cached);
  }

  try {
    const res = await fetch(`${API_BASE}/api/indiehackers`, {
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      return NextResponse.json({ posts: [], timestamp: new Date().toISOString() }, { status: 200 });
    }
    const data = await res.json();
    setCache(cacheKey, data);
    setSupabaseCache(cacheKey, data, TTL_MS);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ posts: [], timestamp: new Date().toISOString() }, { status: 200 });
  }
}
```

- [ ] **Step 8: Update `app/api/trends/route.ts`**

This route is different — it uses `fetchGoogleTrends` and `fetchGithubTrends` directly. Only cache the default combination. Read the current file first to understand the full structure.

Add the import and Supabase cache check after the `cacheKey` construction:

```typescript
import { getSupabaseCache, setSupabaseCache } from "@/lib/supabase-cache";

// In the GET handler, after building cacheKey:
const forceRefresh = searchParams.has("refresh");

// Only check Supabase cache for the default combination
if (!forceRefresh && !bypassCache) {
  const supabaseCached = await getSupabaseCache<TrendsResponse>(cacheKey);
  if (supabaseCached) {
    return NextResponse.json({ ...supabaseCached, _cached: true });
  }
}

// After setCache(cacheKey, response) and before the return:
setSupabaseCache(cacheKey, response, 4 * 3600_000);

return NextResponse.json(response);
```

- [ ] **Step 9: Commit all route changes**

```bash
git add app/api/trending/route.ts app/api/reddit/route.ts app/api/hackernews/route.ts app/api/technews/route.ts app/api/producthunt/route.ts app/api/huggingface/route.ts app/api/indiehackers/route.ts app/api/trends/route.ts
git commit -m "feat: add Supabase cache layer to all board API routes"
```

---

### Task 5: Frontend — pass `refresh=1` on manual refresh actions

**Files:**
- Modify: `app/page.tsx` (find refresh buttons / pull-to-refresh / refetch calls)

- [ ] **Step 1: Find all frontend refresh triggers**

Search `app/page.tsx` for all `fetch(` calls that go to board API routes. For each one, identify where a user-initiated refresh should pass `refresh=1`.

Key places to add `refresh=1`:
- Any "refresh" or "reload" button click handler
- Pull-to-refresh on mobile
- Tab switch that triggers a re-fetch (but only if user explicitly pulled/refreshed, not passive tab switch)

Look for patterns like:
```typescript
const fetchTrending = useCallback(async (geo: string = currentGeo?.value || "US") => {
  const res = await fetch(`/api/trending?geo=${geo}`);
```

Add a `forceRefresh` parameter:
```typescript
const fetchTrending = useCallback(async (geo: string = currentGeo?.value || "US", forceRefresh = false) => {
  const res = await fetch(`/api/trending?geo=${geo}${forceRefresh ? "&refresh=1" : ""}`);
```

Then update any refresh button to pass `forceRefresh: true`.

- [ ] **Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "feat: pass refresh=1 on manual refresh to bypass Supabase cache"
```

---

### Task 6: Build, verify, and deploy

- [ ] **Step 1: Build the project**

Run: `pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Fix any type errors if present**

Address issues and rebuild.

- [ ] **Step 3: Deploy to Vercel**

Run: `VERCEL_TOKEN=$(jq -r '.vercel.token' ~/.claude/credentials.json) npx vercel --prod --yes`
Expected: Production URL.

- [ ] **Step 4: Verify end-to-end**

1. Open the deployed site
2. Board should load instantly (from Supabase cache if prefetch has run)
3. Check browser DevTools Network tab: API responses should come back fast (< 200ms for cached routes)
4. Hit a refresh button: should show loading state, fetch fresh data, and update
5. Check Supabase dashboard `twb_cache` table: should have rows for all cached endpoints

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "fix: address build/deploy issues for prefetch cache"
```
