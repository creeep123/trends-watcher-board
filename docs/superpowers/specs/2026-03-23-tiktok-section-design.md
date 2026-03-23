# TikTok Section Design

**Date:** 2026-03-23
**Status:** Revised - v2
**Author:** Claude (via Happy)

## Overview

Add a TikTok section to fetch trending videos related to default keywords (AI, LLM, maker, generator, creator, filter) as inspiration for building overseas tool sites.

## Purpose

Fetch trending/hot TikTok content related to specific keywords to inspire overseas tool site development.

## Technology Choice

**Selected: TikTok-Api (Python library)**

**Reasons:**
- Free and open-source (18.5k+ GitHub stars)
- Python native, easy to integrate with existing FastAPI backend
- Rich feature set (trending, hashtag search, user data)
- Active community support
- Quick implementation (1 day)

**Trade-offs:**
- Non-official API (scraping-based, violates TikTok ToS)
- Requires `ms_token` from browser cookies
- Potential anti-scraping blocking risk
- Dependency on Playwright (resource usage)

**Risk Mitigation:**
- Cache mechanism (30-minute TTL)
- Graceful degradation (return empty data on failure)
- Monitor library updates
- Fallback to cached data on errors

## Architecture

### Backend (FastAPI)

**Cache Configuration:**

Add to `CACHE_TTL_MAP` in server.py (line 35):
```python
CACHE_TTL_MAP = {
    "trends":    7200,
    "trending":  1800,
    "freshness": 14400,
    "interest":  7200,
    "multigeo":  21600,
    "reddit":    1800,
    "hackernews": 1800,
    "tiktok":    1800,   # 30min — NEW
    "enrich":    3600,
    "allintitle": 7200,
}
```

**Dependencies:**
```bash
pip install TikTokApi
python -m playwright install
```

**Environment Variables:**
```bash
# Add to api-server/.env or system environment
TIKTOK_MS_TOKEN=your_ms_token_here  # From browser cookies
```

**Implementation (server.py):**

```python
from TikTokApi import TikTokApi
import asyncio

# TikTok keywords - map DEFAULT_KEYWORDS to hashtags
TIKTOK_KEYWORDS = ["AI", "LLM", "maker", "generator", "creator", "filter"]

@app.get("/api/tiktok")
async def get_tiktok_videos():
    """Fetch trending TikTok videos for specified hashtags."""
    cache_key = "tiktok|videos"  # Use pipe notation for consistency
    cached = _get_cached(cache_key)
    if cached:
        return cached

    videos = []
    ms_token = os.environ.get("TIKTOK_MS_TOKEN", None)

    if not ms_token:
        print("[TikTok] TIKTOK_MS_TOKEN not set")
        return {"videos": [], "timestamp": datetime.now(timezone.utc).isoformat()}

    try:
        async with TikTokApi() as api:
            await api.create_sessions(
                ms_tokens=[ms_token],
                num_sessions=1,
                sleep_after=3,
                browser="chromium"
            )

            for keyword in TIKTOK_KEYWORDS:
                try:
                    tag = api.hashtag(name=keyword)
                    async for video in tag.videos(count=5):
                        # Extract thumbnail if available
                        thumbnail = ""
                        if hasattr(video, 'cover') and video.cover:
                            thumbnail = video.cover
                        elif hasattr(video, 'thumbnail') and video.thumbnail:
                            thumbnail = video.thumbnail

                        videos.append({
                            "id": video.id,
                            "title": video.desc or "",
                            "author": video.author.username if video.author else "",
                            "thumbnail": thumbnail,
                            "playCount": video.stats.play_count,
                            "likeCount": video.stats.digg_count,
                            "url": f"https://tiktok.com/@{video.author.username}/video/{video.id}",
                            "keyword": keyword
                        })
                except Exception as e:
                    print(f"[TikTok] Error fetching #{keyword}: {e}")
                    continue

            # Deduplicate by video ID
            seen = set()
            unique_videos = []
            for v in videos:
                if v["id"] not in seen:
                    seen.add(v["id"])
                    unique_videos.append(v)

            response = {
                "videos": unique_videos,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            _set_cache(cache_key, response)
            return response

    except Exception as e:
        print(f"[TikTok] API error: {e}")
        # Try stale cache as fallback
        stale = _get_stale(cache_key)
        if stale:
            return stale
        return {"videos": [], "timestamp": datetime.now(timezone.utc).isoformat()}
```

### Frontend (Next.js)

**TypeScript Types (lib/types.ts):**

```typescript
// Add to lib/types.ts after TechNewsResponse (line 72)

export interface TikTokVideo {
  id: string;
  title: string;
  author: string;
  thumbnail?: string;
  playCount: number;
  likeCount: number;
  url: string;
  keyword: string;
}

export interface TikTokResponse {
  videos: TikTokVideo[];
  timestamp: string;
}
```

**API Route (app/api/tiktok/route.ts):**

Create new file `app/api/tiktok/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";

const API_BASE = process.env.PYTRENDS_API_URL || "http://43.165.126.121";

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const cacheKey = "tiktok|videos";
  const cached = getCached<unknown>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const res = await fetch(`${API_BASE}/api/tiktok`, {
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { videos: [], timestamp: new Date().toISOString() },
        { status: 200 }
      );
    }

    const data = await res.json();
    setCache(cacheKey, data);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { videos: [], timestamp: new Date().toISOString() },
      { status: 200 }
    );
  }
}
```

**State Management (app/page.tsx):**

Add state declarations (after line 226):

```typescript
const [tiktokVideos, setTiktokVideos] = useState<TikTokVideo[]>([]);
const [tiktokLoading, setTiktokLoading] = useState(true);
```

**Fetch Function (app/page.tsx):**

Add fetch callback (after fetchTechNews, around line 330):

```typescript
const fetchTikTok = useCallback(async () => {
  setTiktokLoading(true);
  try {
    const res = await fetch("/api/tiktok");
    if (res.ok) {
      const json = await res.json();
      setTiktokVideos(json.videos || []);
    }
  } catch {
    setTiktokVideos([]);
  } finally {
    setTiktokLoading(false);
  }
}, []);
```

**Use Effect Hook (app/page.tsx):**

Add to useEffect array (around line 345):

```typescript
useEffect(() => {
  fetchData();
  fetchTrending();
  fetchReddit();
  fetchHackerNews();
  fetchTechNews();
  fetchTikTok();  // Add this
}, [fetchData, fetchTrending, fetchReddit, fetchHackerNews, fetchTechNews, fetchTikTok]);
```

**Mobile Tab Configuration (app/page.tsx):**

Add to MOBILE_TABS array (line 791):

```typescript
const MOBILE_TABS: { key: MobileTab; label: string; icon: string }[] = [
  { key: "trending", label: "Trending", icon: "🔥" },
  { key: "queries", label: "Queries", icon: "📊" },
  { key: "reddit", label: "Reddit", icon: "💬" },
  { key: "hn", label: "HN", icon: "🍊" },
  { key: "technews", label: "Tech", icon: "📰" },
  { key: "tiktok", label: "TikTok", icon: "🎬" },  // NEW
  { key: "github", label: "GitHub", icon: "💻" },
];
```

**Refresh Button Integration (app/page.tsx):**

Add to refresh handler (around line 825):

```typescript
onClick={() => {
  fetchData();
  fetchTrending();
  fetchReddit();
  fetchHackerNews();
  fetchTechNews();
  fetchTikTok();  // Add this
}}
```

**Section Implementation (app/page.tsx):**

Add inline section after Tech News section (after line 1492):

```tsx
{/* --- TikTok --- */}
<section className={`${mobileTab !== "tiktok" ? "hidden" : ""} sm:block`}>
  <SectionHeader title="TikTok" icon="🎬" count={tiktokVideos.length} />
  <div className="mt-2 space-y-3 lg:max-h-[calc(100vh-240px)] lg:overflow-y-auto lg:space-y-1.5">
    {tiktokLoading ? (
      <div className="py-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
        Loading...
      </div>
    ) : tiktokVideos.length === 0 ? (
      <EmptyState text="No TikTok videos available" />
    ) : (
      tiktokVideos.map((video, i) => (
        <TikTokCard key={`tt-${i}`} video={video} index={i} />
      ))
    )}
  </div>
</section>
```

**TikTokCard Component (components/TikTokCard.tsx):**

Create new component file:

```tsx
import { TikTokVideo } from "@/lib/types";
import { ExternalLink } from "lucide-react";

interface TikTokCardProps {
  video: TikTokVideo;
  index: number;
}

export function TikTokCard({ video, index }: TikTokCardProps) {
  const formatCount = (count: number): string => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  return (
    <div
      className="group rounded-lg border p-3 transition-colors hover:border-pink-500/50"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--bg-secondary)" }}>
          <span className="text-xs">🎬</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{
              color: "white",
              background: "#000"
            }}>
              #{video.keyword}
            </span>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              @{video.author}
            </span>
          </div>
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm font-medium leading-snug transition-colors hover:text-pink-500"
            style={{ color: "var(--text-primary)" }}
          >
            {video.title || "(No title)"}
          </a>
          <div className="mt-1 flex items-center gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
            <span>▶ {formatCount(video.playCount)}</span>
            <span>❤️ {formatCount(video.likeCount)}</span>
          </div>
        </div>
        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 transition-colors hover:text-pink-500"
          style={{ color: "var(--text-secondary)" }}
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
```

**Import Statement (app/page.tsx):**

Add import at top of file:

```typescript
import { TikTokCard } from "@/components/TikTokCard";
```

## Data Flow

```
User visits page
    ↓
useEffect triggers fetchTikTok()
    ↓
Next.js calls /api/tiktok (app route)
    ↓
FastAPI backend checks cache: _get_cached("tiktok|videos")
    ↓ (cache miss)
TikTok-Api initializes Playwright with ms_token
    ↓
For each keyword in TIKTOK_KEYWORDS:
    - api.hashtag(name=keyword)
    - Fetch 5 videos from hashtag
    - Extract: id, title, author, thumbnail, stats
    - Tag with keyword source
    ↓
Merge results and deduplicate by video.id
    ↓
Cache via _set_cache("tiktok|videos", response)
    ↓
Return to frontend
    ↓
setTiktokVideos(json.videos)
    ↓
Render tiktokVideos.map() → TikTokCard components
```

## Error Handling & Degradation

| Scenario | Backend Handling | Frontend Handling |
|----------|------------------|-------------------|
| TikTok anti-scraping | `try/except` → return stale cache or empty | `setTiktokVideos([])` |
| Playwright timeout | Exception → fallback to `_get_stale()` | Continue with cached/empty |
| ms_token expired | Print warning → return empty data | Show empty state |
| Network error | Exception → fallback to stale cache | `catch` → `setTiktokVideos([])` |
| Any exception | Never throw, always return valid response | Never block rendering |

**Principle:** Always return valid response structure, never block page rendering.

## Configuration

### ms_token Acquisition

1. Open TikTok.com in browser (logged in)
2. Open DevTools (F12)
3. Application → Cookies → tiktok.com
4. Find `msToken` cookie (long base64 string)
5. Copy value and add to environment:
   ```bash
   export TIKTOK_MS_TOKEN="your_token_here"
   ```

### Token Refresh

- `msToken` expires periodically (weeks/months)
- When TikTok-Api starts returning empty data:
  1. Repeat acquisition steps above
  2. Update environment variable
  3. Restart FastAPI service: `systemctl restart pytrends-api`

### Keyword Mapping

| TIKTOK_KEYWORDS | Hashtag Format | Example Content |
|-----------------|----------------|------------------|
| AI | `#AI` | AI tools, ChatGPT tips |
| LLM | `#LLM` | LLM workflows, fine-tuning |
| maker | `#maker` | No-code tools, builders |
| generator | `#generator` | Content generators |
| creator | `#creator` | Creator economy tools |
| filter | `#filter` | Photo/video filters |

## Cache Strategy

- **TTL:** 30 minutes (1800 seconds) - via `CACHE_TTL_MAP["tiktok"]`
- **Key Format:** `"tiktok|videos"` (pipe notation for consistency)
- **Functions:** `_get_cached()`, `_set_cache()`, `_get_stale()`
- **Fallback:** Stale cache on upstream errors
- **Reason:** Reduce API call frequency, avoid rate limiting, minimize Playwright overhead

## Dependencies

```
TikTok-Api (Python package)
  ├── Playwright (headless browser)
  │   └── Chromium binary
  ├── ms_token (from browser cookies)
  └── TikTok Web API (unofficial, reverse-engineered)
```

## Implementation Checklist

### Backend
- [ ] Install TikTokApi: `pip install TikTokApi`
- [ ] Install Playwright: `python -m playwright install`
- [ ] Add `"tiktok": 1800` to CACHE_TTL_MAP (server.py line 35)
- [ ] Set TIKTOK_MS_TOKEN environment variable
- [ ] Implement `/api/tiktok` endpoint in server.py
- [ ] Test endpoint with curl: `curl localhost:8765/api/tiktok`

### Frontend
- [ ] Add TikTokVideo and TikTokResponse types to lib/types.ts
- [ ] Create app/api/tiktok/route.ts
- [ ] Create components/TikTokCard.tsx
- [ ] Add state: tiktokVideos, tiktokLoading (page.tsx)
- [ ] Add fetchTikTok callback (page.tsx)
- [ ] Add to useEffect (page.tsx)
- [ ] Add to MOBILE_TABS (page.tsx line 791)
- [ ] Add to refresh handler (page.tsx)
- [ ] Add TikTok section JSX (page.tsx)
- [ ] Add TikTokCard import (page.tsx)

### Testing & Deployment
- [ ] Test locally: verify videos load correctly
- [ ] Test error handling: remove ms_token, verify graceful degradation
- [ ] Test mobile: verify tab switching works
- [ ] Test desktop: verify section displays correctly
- [ ] Commit and push to GitHub
- [ ] Deploy to Vercel: `vercel --prod`
- [ ] Verify production deployment

## Future Considerations

**If TikTok-Api becomes unreliable:**
1. Switch to official TikTok Creative Center API
2. Use third-party API (TikAPI, EnsembleData, TikHub)
3. Remove section if no viable options

**Performance optimization:**
- Parallel hashtag requests (currently sequential)
- Incremental loading (load keywords on-demand)
- Pre-fetch during off-peak hours

**Feature enhancements:**
- Video duration display (if available)
- Comment count preview
- Related hashtags suggestions
- Keyword-based filtering in UI

## References

- TikTok-Api GitHub: https://github.com/davidteather/TikTok-Api
- TikTok-Api Documentation: https://davidteather.github.io/TikTok-Api
- Playwright Python: https://playwright.dev/python/
- Project patterns: Reddit (line 691), HackerNews (line 967) in server.py
