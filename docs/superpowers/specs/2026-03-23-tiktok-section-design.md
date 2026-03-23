# TikTok Section Design

**Date:** 2026-03-23
**Status:** Approved
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

**Endpoint:** `/api/tiktok`

**Dependencies:**
```python
pip install TikTokApi
python -m playwright install
```

**Environment Variables:**
```bash
TIKTOK_MS_TOKEN=your_ms_token_here  # From browser cookies
```

**Implementation:**

```python
from TikTokApi import TikTokApi
import asyncio
import os

DEFAULT_KEYWORDS = ["AI", "LLM", "maker", "generator", "creator", "filter"]

@app.get("/api/tiktok")
async def get_tiktok_videos():
    cache_key = "tiktok:videos"
    cached = cache.get(cache_key)
    if cached:
        return cached

    videos = []
    ms_token = os.environ.get("TIKTOK_MS_TOKEN", None)

    if not ms_token:
        logger.warning("TIKTOK_MS_TOKEN not set")
        return {"videos": [], "timestamp": now()}

    try:
        async with TikTokApi() as api:
            await api.create_sessions(
                ms_tokens=[ms_token],
                num_sessions=1,
                sleep_after=3,
                browser="chromium"
            )

            for keyword in DEFAULT_KEYWORDS:
                try:
                    tag = api.hashtag(name=keyword)
                    async for video in tag.videos(count=5):
                        videos.append({
                            "id": video.id,
                            "title": video.desc or "",
                            "author": video.author.username if video.author else "",
                            "playCount": video.stats.play_count,
                            "likeCount": video.stats.digg_count,
                            "url": f"https://tiktok.com/@{video.author.username}/video/{video.id}",
                            "keyword": keyword
                        })
                except Exception as e:
                    logger.error(f"Error fetching #{keyword}: {e}")
                    continue

            # Deduplicate by video ID
            seen = set()
            unique_videos = []
            for v in videos:
                if v["id"] not in seen:
                    seen.add(v["id"])
                    unique_videos.append(v)

            data = {
                "videos": unique_videos,
                "timestamp": now()
            }
            cache.set(cache_key, data, expire=1800)  # 30 minutes
            return data

    except Exception as e:
        logger.error(f"TikTok API error: {e}")
        return {"videos": [], "timestamp": now()}
```

### Frontend (Next.js)

**TypeScript Types (lib/types.ts):**

```typescript
export interface TikTokVideo {
  id: string;
  title: string;
  author: string;
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

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";

const API_BASE = process.env.PYTRENDS_API_URL || "http://43.165.126.121";

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const cacheKey = "tiktok:videos";
  const cached = getCached<TikTokResponse>(cacheKey);
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

**Component (app/page.tsx):**

```tsx
// Add TikTokSection component
<TikTokSection
  videos={tiktokData?.videos || []}
  loading={isLoading}
  error={error}
/>
```

**Card Layout:**

```
┌─────────────────────────────────────┐
│ 🎬 TikTok                          │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ 🎥 AI Generated Tool Showcase   │ │
│ │ @techmaker  •  2.3M 播放  ❤️ 150K│ │
│ │ [▶ TikTok]                     │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 🎥 My LLM Workflow in 2026     │ │
│ │ @airesearcher  •  890K 播放 ❤️ 45K│ │
│ │ [▶ TikTok]                     │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

## Data Flow

```
User visits page
    ↓
Next.js calls /api/tiktok (app route)
    ↓
FastAPI backend checks cache
    ↓ (cache miss)
TikTok-Api initializes Playwright
    ↓
For each keyword in DEFAULT_KEYWORDS:
    - Fetch hashtag videos (count=5)
    - Extract: id, title, author, playCount, likeCount
    - Tag with keyword source
    ↓
Merge and deduplicate by video.id
    ↓
Cache result (30-minute TTL)
    ↓
Return to frontend
```

## Error Handling & Degradation

| Scenario | Handling |
|----------|----------|
| TikTok anti-scraping | Return empty array `{videos: []}` |
| Playwright timeout | Return stale cache if available |
| ms_token expired | Log warning, return empty data |
| Network error | Fallback to empty data |
| Any exception | Never throw, always return valid response |

**Principle:** Always return valid response structure, never block page rendering.

## Configuration

### ms_token Acquisition

1. Open TikTok.com in browser
2. Open DevTools (F12)
3. Application → Cookies → tiktok.com
4. Find `msToken` cookie
5. Copy value to `.env`: `TIKTOK_MS_TOKEN=...`

### Keyword Mapping

| Default Keyword | Hashtag Format |
|-----------------|----------------|
| AI | `#AI` |
| LLM | `#LLM` |
| maker | `#maker` |
| generator | `#generator` |
| creator | `#creator` |
| filter | `#filter` |

## Cache Strategy

- **TTL:** 30 minutes (1800 seconds)
- **Invalidation:** Time-based
- **Fallback:** Serve stale cache on backend error
- **Reason:** Reduce API call frequency, avoid rate limiting

## Dependencies

```
TikTok-Api (Python package)
  ├── Playwright (headless browser)
  │   └── Chromium/Firefox/WebKit
  ├── ms_token (from browser cookies)
  └── TikTok Web API (unofficial, reverse-engineered)
```

## Implementation Checklist

- [ ] Install TikTokApi and Playwright in api-server/
- [ ] Add `/api/tiktok` endpoint to FastAPI server.py
- [ ] Configure TIKTOK_MS_TOKEN environment variable
- [ ] Add TypeScript types to lib/types.ts
- [ ] Create Next.js API route app/api/tiktok/route.ts
- [ ] Create TikTokSection component
- [ ] Integrate TikTokSection into app/page.tsx
- [ ] Test with real data
- [ ] Deploy and verify

## Future Considerations

**If TikTok-Api becomes unreliable:**
1. Switch to official TikTok Creative Center API
2. Use third-party API (TikAPI, EnsembleData)
3. Remove section if no viable options

**Performance optimization:**
- Parallel hashtag requests (currently sequential)
- Incremental loading (load keywords on-demand)
- Pre-fetch during off-peak hours

## References

- TikTok-Api GitHub: https://github.com/davidteather/TikTok-Api
- TikTok-Api Documentation: https://davidteather.github.io/TikTok-Api
- Playwright Python: https://playwright.dev/python/
