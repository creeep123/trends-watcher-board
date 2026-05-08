# 新增数据源 (PH / HF / IH) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Product Hunt, HuggingFace, and Indie Hackers as new data source sections in the trends watcher board, with AI-powered summaries for each item.

**Architecture:** Three new endpoints in the Python FastAPI backend (server.py) fetch data from each platform's API and generate LLM summaries via OpenRouter. Next.js API routes proxy requests from the frontend to the backend. The frontend adds three new tab sections with expandable card components showing AI summaries.

**Tech Stack:** Python/FastAPI (backend), Next.js 15 (frontend), OpenRouter LLM API, Product Hunt GraphQL API v2, HuggingFace REST API, Indie Hackers Algolia Search API

**Design Doc:** `docs/superpowers/specs/2026-04-27-new-data-sources-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `api-server/server.py` | Modify | Add 3 API endpoints + LLM summary helper + cache TTLs + env var |
| `lib/types.ts` | Modify | Add TypeScript interfaces for 3 new data sources |
| `lib/useReadItems.ts` | Modify | Extend ItemType union with "ph" | "hf" | "ih" |
| `app/api/producthunt/route.ts` | Create | Next.js proxy to Python backend |
| `app/api/huggingface/route.ts` | Create | Next.js proxy to Python backend |
| `app/api/indiehackers/route.ts` | Create | Next.js proxy to Python backend |
| `app/page.tsx` | Modify | Add tabs, state, fetch hooks, 3 sections, card components, expandable summary |

---

### Task 1: Add TypeScript Types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add new interfaces to types.ts**

Append these interfaces at the end of `lib/types.ts` (before the final export):

```typescript
// Product Hunt
export interface ProductHuntProduct {
  name: string;
  tagline: string;
  votesCount: number;
  commentsCount: number;
  url: string;
  thumbnail: string;
  topics: string[];
  createdAt: string;
  summary?: string;
  tags?: string[];
}

export interface ProductHuntResponse {
  products: ProductHuntProduct[];
  timestamp: string;
}

// HuggingFace
export interface HuggingFaceModel {
  modelId: string;
  author: string;
  downloads: number;
  likes: number;
  tags: string[];
  pipelineTag: string;
  createdAt: string;
  url: string;
  summary?: string;
  aiTags?: string[];
}

export interface HuggingFaceResponse {
  models: HuggingFaceModel[];
  timestamp: string;
}

// Indie Hackers
export interface IndieHackersPost {
  title: string;
  url: string;
  votes: number;
  comments: number;
  author: string;
  groupName: string;
  type: "post" | "product";
  revenue?: string;
  summary?: string;
  tags?: string[];
}

export interface IndieHackersResponse {
  posts: IndieHackersPost[];
  timestamp: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add TypeScript types for Product Hunt, HuggingFace, Indie Hackers"
```

---

### Task 1.5: Extend ItemType for Read Tracking

**Files:**
- Modify: `lib/useReadItems.ts:3` (ItemType union)

- [ ] **Step 1: Extend the ItemType union**

At line 3, change:

```typescript
export type ItemType = "trending" | "queries" | "reddit" | "hn" | "technews" | "github";
```

to:

```typescript
export type ItemType = "trending" | "queries" | "reddit" | "hn" | "technews" | "github" | "ph" | "hf" | "ih";
```

- [ ] **Step 2: Commit**

```bash
git add lib/useReadItems.ts
git commit -m "feat: extend ItemType union for PH, HF, IH read tracking"
```

---

### Task 2: Backend — Cache TTLs & Env Var

**Files:**
- Modify: `api-server/server.py:48-59` (CACHE_TTL_MAP)
- Modify: `api-server/server.py:31-44` (env vars)

- [ ] **Step 1: Add cache TTLs**

In `api-server/server.py`, add 3 new entries to `CACHE_TTL_MAP` (after `"allintitle": 7200,`):

```python
    "allintitle": 7200,  # 2h — competition changes slowly
    "producthunt": 21600,  # 6h — daily product launches
    "huggingface": 1800,  # 30min — trending models
    "indiehackers": 3600,  # 1h — community posts
}
```

- [ ] **Step 2: Add Product Hunt env var**

After the `LLM_MODEL` line (line 35), add:

```python
PRODUCT_HUNT_TOKEN = os.environ.get("PRODUCT_HUNT_TOKEN", "")
```

- [ ] **Step 3: Commit**

```bash
git add api-server/server.py
git commit -m "feat: add cache TTLs and PH token config for new data sources"
```

---

### Task 3: Backend — LLM Batch Summary Helper

**Files:**
- Modify: `api-server/server.py` (add function after `_extract_reddit_keywords` around line 750)

- [ ] **Step 1: Add `_generate_batch_summaries` function**

Insert this function after the `_extract_reddit_keywords` function (after line 750):

```python
def _generate_batch_summaries(source: str, items: list[dict]) -> list[dict]:
    """Generate AI summaries with tags for a batch of items.

    Args:
        source: "producthunt", "huggingface", or "indiehackers"
        items: list of dicts, each with fields relevant to the source

    Returns:
        list of dicts aligned by index: [{"summary": str, "tags": [str], "relevance": str}, ...]
    """
    if not items:
        return []

    prompts = {
        "producthunt": (
            "Below are Product Hunt launches. For each product, write a 2-3 sentence description "
            "of what it does and who it's for, plus 2-4 relevant tags.\n"
            "Reply ONLY with a JSON array of objects, each with:\n"
            '- "summary": 2-3 sentence description\n'
            '- "tags": array of 2-4 lowercase tags (e.g. ["ai", "saas", "productivity"])\n'
            '- "relevance": "high" or "medium" or "low" (relevance to AI/tech/startups)\n\n'
            "Products:\n"
        ),
        "huggingface": (
            "Below are trending AI models from HuggingFace. For each model, write a 2-3 sentence "
            "description of what the model does and its key capabilities, plus 2-4 relevant tags.\n"
            "Reply ONLY with a JSON array of objects, each with:\n"
            '- "summary": 2-3 sentence description\n'
            '- "tags": array of 2-4 lowercase tags (e.g. ["nlp", "vision", "open-source"])\n'
            '- "relevance": "high" or "medium" or "low" (relevance to AI/tech)\n\n'
            "Models:\n"
        ),
        "indiehackers": (
            "Below are Indie Hackers posts and products. For each item, write a 2-3 sentence "
            "summary of the key insight or product, plus 2-4 relevant tags.\n"
            "Reply ONLY with a JSON array of objects, each with:\n"
            '- "summary": 2-3 sentence summary\n'
            '- "tags": array of 2-4 lowercase tags (e.g. ["saas", "indie", "revenue"])\n'
            '- "relevance": "high" or "medium" or "low" (relevance to AI/tech/startups)\n\n'
            "Items:\n"
        ),
    }

    if source not in prompts:
        return [{} for _ in items]

    # Format items for the prompt based on source
    lines = []
    for item in items:
        if source == "producthunt":
            lines.append(f'- Name: {item.get("name", "")} | Tagline: {item.get("tagline", "")} | Topics: {", ".join(item.get("topics", []))}')
        elif source == "huggingface":
            lines.append(f'- Model: {item.get("modelId", "")} | Task: {item.get("pipelineTag", "")} | Tags: {", ".join(item.get("tags", [])[:5])}')
        elif source == "indiehackers":
            rev = f' | Revenue: {item.get("revenue", "")}' if item.get("revenue") else ""
            lines.append(f'- Title: {item.get("title", "")} | Author: {item.get("author", "")} | Votes: {item.get("votes", 0)}{rev}')

    prompt = prompts[source] + "\n".join(lines)

    # Process in batches of 8 to keep response size manageable
    batch_size = 8
    all_summaries = []

    for i in range(0, len(items), batch_size):
        batch_items = items[i:i + batch_size]
        batch_lines = lines[i:i + batch_size]
        batch_prompt = prompts[source] + "\n".join(batch_lines)

        try:
            resp = http_requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": LLM_MODEL,
                    "messages": [{"role": "user", "content": batch_prompt}],
                    "max_tokens": 1500,
                },
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"].strip()
            start = content.find("[")
            end = content.rfind("]")
            if start != -1 and end != -1:
                arr = json.loads(content[start:end + 1])
                for item in arr:
                    if isinstance(item, dict):
                        all_summaries.append({
                            "summary": item.get("summary", ""),
                            "tags": item.get("tags", []),
                            "relevance": item.get("relevance", "medium"),
                        })
                    else:
                        all_summaries.append({})
            else:
                all_summaries.extend([{} for _ in batch_items])
        except Exception as e:
            print(f"[LLM] batch summary error ({source}, batch {i//batch_size + 1}): {e}")
            all_summaries.extend([{} for _ in batch_items])

    # Pad if final batch was incomplete
    while len(all_summaries) < len(items):
        all_summaries.append({})

    return all_summaries
```

- [ ] **Step 2: Commit**

```bash
git add api-server/server.py
git commit -m "feat: add LLM batch summary helper for new data sources"
```

---

### Task 4: Backend — Product Hunt Endpoint

**Files:**
- Modify: `api-server/server.py` (add endpoint after existing endpoints, before line 810)

- [ ] **Step 1: Add Product Hunt endpoint**

Insert this after the `_generate_batch_summaries` function:

```python
# --- Product Hunt ---

PH_API_URL = "https://api.producthunt.com/v2/api/graphql"
PH_QUERY = """
query {
  posts(order: VOTES, first: 20) {
    edges {
      node {
        name
        tagline
        votesCount
        commentsCount
        websiteUrl
        thumbnail {
          url
        }
        topics {
          edges {
            node {
              name
            }
          }
        }
        createdAt
      }
    }
  }
}
"""


def _fetch_producthunt() -> list[dict]:
    """Fetch today's top products from Product Hunt GraphQL API."""
    if not PRODUCT_HUNT_TOKEN:
        print("[PH] No PRODUCT_HUNT_TOKEN configured")
        return []

    try:
        resp = http_requests.post(
            PH_API_URL,
            headers={
                "Authorization": f"Bearer {PRODUCT_HUNT_TOKEN}",
                "Content-Type": "application/json",
            },
            json={"query": PH_QUERY},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()

        products = []
        edges = data.get("data", {}).get("posts", {}).get("edges", [])
        for edge in edges:
            node = edge.get("node", {})
            topics = [
                t.get("node", {}).get("name", "")
                for t in node.get("topics", {}).get("edges", [])
            ]
            thumbnail = node.get("thumbnail", {}).get("url", "")
            products.append({
                "name": node.get("name", ""),
                "tagline": node.get("tagline", ""),
                "votesCount": node.get("votesCount", 0),
                "commentsCount": node.get("commentsCount", 0),
                "url": node.get("websiteUrl", "") or f"https://www.producthunt.com/posts/{node.get('slug', node.get('name', '').lower().replace(' ', '-'))}",
                "thumbnail": thumbnail,
                "topics": topics,
                "createdAt": node.get("createdAt", ""),
            })

        return products

    except Exception as e:
        print(f"[PH] Fetch error: {e}")
        return []


@app.get("/api/producthunt")
def get_producthunt():
    """Fetch today's top products from Product Hunt with AI summaries."""
    cache_key = "producthunt|today"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    products = _fetch_producthunt()

    # Generate AI summaries
    if products:
        summaries = _generate_batch_summaries("producthunt", products)
        for i, summary in enumerate(summaries):
            if summary.get("summary"):
                products[i]["summary"] = summary["summary"]
            if summary.get("tags"):
                products[i]["tags"] = summary["tags"]

    response = {
        "products": products,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    _set_cache(cache_key, response)
    return response
```

- [ ] **Step 2: Commit**

```bash
git add api-server/server.py
git commit -m "feat: add Product Hunt API endpoint with AI summaries"
```

---

### Task 5: Backend — HuggingFace Endpoint

**Files:**
- Modify: `api-server/server.py` (add endpoint after PH endpoint)

- [ ] **Step 1: Add HuggingFace endpoint**

Insert after the Product Hunt endpoint:

```python
# --- HuggingFace ---

HF_API_URL = "https://huggingface.co/api/models"


def _fetch_huggingface() -> list[dict]:
    """Fetch trending models from HuggingFace public API."""
    try:
        resp = http_requests.get(
            f"{HF_API_URL}?sort=downloads&limit=20",
            headers={"User-Agent": "TrendsWatcherBoard/1.0"},
            timeout=15,
        )
        resp.raise_for_status()
        models = resp.json()

        result = []
        for m in models:
            model_id = m.get("id", "")
            parts = model_id.split("/", 1)
            author = parts[0] if len(parts) > 1 else ""

            result.append({
                "modelId": model_id,
                "author": author,
                "downloads": m.get("downloads", 0),
                "likes": m.get("likes", 0),
                "tags": m.get("tags", []),
                "pipelineTag": m.get("pipeline_tag", ""),
                "createdAt": m.get("createdAt", ""),
                "url": f"https://huggingface.co/{model_id}",
            })

        return result

    except Exception as e:
        print(f"[HF] Fetch error: {e}")
        return []


@app.get("/api/huggingface")
def get_huggingface():
    """Fetch trending models from HuggingFace with AI summaries."""
    cache_key = "huggingface|trending"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    models = _fetch_huggingface()

    # Generate AI summaries
    if models:
        summaries = _generate_batch_summaries("huggingface", models)
        for i, summary in enumerate(summaries):
            if summary.get("summary"):
                models[i]["summary"] = summary["summary"]
            if summary.get("tags"):
                models[i]["aiTags"] = summary["tags"]

    response = {
        "models": models,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    _set_cache(cache_key, response)
    return response
```

- [ ] **Step 2: Commit**

```bash
git add api-server/server.py
git commit -m "feat: add HuggingFace API endpoint with AI summaries"
```

---

### Task 6: Backend — Indie Hackers Endpoint

**Files:**
- Modify: `api-server/server.py` (add endpoint after HF endpoint)

- [ ] **Step 1: Add Indie Hackers endpoint**

Insert after the HuggingFace endpoint:

```python
# --- Indie Hackers ---

IH_ALGOLIA_APP_ID = "N86T1R3OWZ"
IH_ALGOLIA_API_KEY = "5140dac5e87f47346abbda1a34ee70c3"
IH_ALGOLIA_BASE = f"https://{IH_ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes"


def _algolia_search(index: str, query: str = "", hits_per_page: int = 15) -> list[dict]:
    """Search Indie Hackers via Algolia API."""
    try:
        payload: dict = {"hitsPerPage": hits_per_page}
        if query:
            payload["query"] = query
        else:
            # Empty query returns most popular/recent
            payload["filters"] = ""

        resp = http_requests.post(
            f"{IH_ALGOLIA_BASE}/{index}/search",
            headers={
                "X-Algolia-Application-Id": IH_ALGOLIA_APP_ID,
                "X-Algolia-API-Key": IH_ALGOLIA_API_KEY,
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("hits", [])

    except Exception as e:
        print(f"[IH] Algolia search error ({index}): {e}")
        return []


def _fetch_indiehackers() -> list[dict]:
    """Fetch posts and products from Indie Hackers."""
    items: list[dict] = []

    # Fetch posts
    post_hits = _algolia_search("Post_production", hits_per_page=12)
    for hit in post_hits:
        items.append({
            "title": hit.get("title", ""),
            "url": f"https://www.indiehackers.com/post/{hit.get('slug', '')}" if hit.get("slug") else "",
            "votes": hit.get("score", 0) or 0,
            "comments": hit.get("commentCount", 0) or 0,
            "author": hit.get("createdBy", {}).get("username", hit.get("createdByName", "")),
            "groupName": hit.get("groupName", ""),
            "type": "post",
            "revenue": None,
        })

    # Fetch products
    product_hits = _algolia_search("Product_production", hits_per_page=10)
    for hit in product_hits:
        revenue = hit.get("revenue", None)
        revenue_str = ""
        if revenue:
            revenue_str = f"${revenue:,}/mo" if revenue >= 1000 else f"${revenue}/mo"

        items.append({
            "title": hit.get("name", hit.get("productName", "")),
            "url": f"https://www.indiehackers.com/products/{hit.get('slug', '')}" if hit.get("slug") else "",
            "votes": hit.get("numberOfUpvotes", 0) or 0,
            "comments": hit.get("reviewCount", 0) or 0,
            "author": hit.get("maker", {}).get("username", hit.get("makerName", "")),
            "groupName": "Show IH",
            "type": "product",
            "revenue": revenue_str or None,
        })

    # Sort by votes descending
    items.sort(key=lambda x: x.get("votes", 0), reverse=True)

    return items


@app.get("/api/indiehackers")
def get_indiehackers():
    """Fetch Indie Hackers posts and products with AI summaries."""
    cache_key = "indiehackers|latest"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    posts = _fetch_indiehackers()

    # Generate AI summaries
    if posts:
        summaries = _generate_batch_summaries("indiehackers", posts)
        for i, summary in enumerate(summaries):
            if summary.get("summary"):
                posts[i]["summary"] = summary["summary"]
            if summary.get("tags"):
                posts[i]["tags"] = summary["tags"]

    response = {
        "posts": posts,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    _set_cache(cache_key, response)
    return response
```

- [ ] **Step 2: Commit**

```bash
git add api-server/server.py
git commit -m "feat: add Indie Hackers API endpoint with AI summaries"
```

---

### Task 7: Frontend — API Proxy Routes

**Files:**
- Create: `app/api/producthunt/route.ts`
- Create: `app/api/huggingface/route.ts`
- Create: `app/api/indiehackers/route.ts`

- [ ] **Step 1: Create Product Hunt proxy**

Create `app/api/producthunt/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";

const API_BASE = process.env.PYTRENDS_API_URL || "http://43.165.126.121";

export const maxDuration = 30;

export async function GET() {
  const cacheKey = "producthunt";
  const cached = getCached<unknown>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const res = await fetch(`${API_BASE}/api/producthunt`, {
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      return NextResponse.json({ products: [], timestamp: new Date().toISOString() }, { status: 200 });
    }
    const data = await res.json();
    setCache(cacheKey, data);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ products: [], timestamp: new Date().toISOString() }, { status: 200 });
  }
}
```

- [ ] **Step 2: Create HuggingFace proxy**

Create `app/api/huggingface/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";

const API_BASE = process.env.PYTRENDS_API_URL || "http://43.165.126.121";

export const maxDuration = 30;

export async function GET() {
  const cacheKey = "huggingface";
  const cached = getCached<unknown>(cacheKey);
  if (cached) {
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
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ models: [], timestamp: new Date().toISOString() }, { status: 200 });
  }
}
```

- [ ] **Step 3: Create Indie Hackers proxy**

Create `app/api/indiehackers/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/cache";

const API_BASE = process.env.PYTRENDS_API_URL || "http://43.165.126.121";

export const maxDuration = 30;

export async function GET() {
  const cacheKey = "indiehackers";
  const cached = getCached<unknown>(cacheKey);
  if (cached) {
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
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ posts: [], timestamp: new Date().toISOString() }, { status: 200 });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/producthunt/route.ts app/api/huggingface/route.ts app/api/indiehackers/route.ts
git commit -m "feat: add Next.js API proxy routes for PH, HF, IH"
```

---

### Task 8: Frontend — Types, State & Data Fetching

**Files:**
- Modify: `app/page.tsx:194` (MobileTab type)
- Modify: `app/page.tsx:930-937` (MOBILE_TABS)
- Modify: `app/page.tsx:1059-1075` (tab bar JSX)
- Modify: `app/page.tsx:199-260` (state declarations)
- Modify: `app/page.tsx:307-401` (fetch functions + useEffects)

- [ ] **Step 1: Expand MobileTab type**

At line 194, change:

```typescript
type MobileTab = "trending" | "queries" | "reddit" | "github" | "hn" | "technews";
```

to:

```typescript
type MobileTab = "trending" | "queries" | "reddit" | "github" | "hn" | "technews" | "ph" | "hf" | "ih";
```

- [ ] **Step 2: Add new tabs to MOBILE_TABS**

At line 937, after the `"technews"` entry, add:

```typescript
  { key: "ph", label: "PH", icon: "🚀" },
  { key: "hf", label: "HF", icon: "🤗" },
  { key: "ih", label: "IH", icon: "🏪" },
```

- [ ] **Step 3: Make tab bar horizontally scrollable on mobile**

At line 1059-1075, replace the tab bar JSX. Change:

```typescript
          {/* Mobile Tab Bar — inside header so it sticks together */}
          <div className="mt-1 sm:hidden">
            <div className="flex">
              {MOBILE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setMobileTab(tab.key)}
                  className="flex-1 py-2 text-center text-xs font-medium transition-colors"
                  style={{
                    color: mobileTab === tab.key ? "var(--accent-blue-hover)" : "var(--text-tertiary)",
                    borderBottom: mobileTab === tab.key ? "2px solid var(--accent-blue-hover)" : "2px solid transparent",
                  }}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          </div>
```

to:

```typescript
          {/* Mobile Tab Bar — inside header so it sticks together */}
          <div className="mt-1 sm:hidden">
            <div className="flex overflow-x-auto">
              {MOBILE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setMobileTab(tab.key)}
                  className="flex-shrink-0 px-3 py-2 text-center text-xs font-medium transition-colors"
                  style={{
                    color: mobileTab === tab.key ? "var(--accent-blue-hover)" : "var(--text-tertiary)",
                    borderBottom: mobileTab === tab.key ? "2px solid var(--accent-blue-hover)" : "2px solid transparent",
                  }}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          </div>
```

- [ ] **Step 4: Add state declarations**

After the `techNewsLoading` state (line 232), add:

```typescript
  const [phProducts, setPhProducts] = useState<ProductHuntProduct[]>([]);
  const [phLoading, setPhLoading] = useState(true);

  const [hfModels, setHfModels] = useState<HuggingFaceModel[]>([]);
  const [hfLoading, setHfLoading] = useState(true);

  const [ihPosts, setIhPosts] = useState<IndieHackersPost[]>([]);
  const [ihLoading, setIhLoading] = useState(true);
```

Also add the expanded state for each (for the expandable summary feature):

```typescript
  const [expandedPH, setExpandedPH] = useState<string | null>(null);
  const [expandedHF, setExpandedHF] = useState<string | null>(null);
  const [expandedIH, setExpandedIH] = useState<string | null>(null);
```

- [ ] **Step 5: Add import for new types**

At the top of the file, ensure these imports are added to the existing import from `@/lib/types`:

```typescript
import {
  // ... existing imports ...
  ProductHuntProduct,
  HuggingFaceModel,
  IndieHackersPost,
} from "@/lib/types";
```

- [ ] **Step 6: Add fetch functions**

After the `fetchTechNews` function (around line 370), add:

```typescript
  const fetchProductHunt = useCallback(async () => {
    setPhLoading(true);
    try {
      const res = await fetch("/api/producthunt");
      if (res.ok) {
        const json = await res.json();
        setPhProducts(json.products || []);
      }
    } catch {
      setPhProducts([]);
    } finally {
      setPhLoading(false);
    }
  }, []);

  const fetchHuggingFace = useCallback(async () => {
    setHfLoading(true);
    try {
      const res = await fetch("/api/huggingface");
      if (res.ok) {
        const json = await res.json();
        setHfModels(json.models || []);
      }
    } catch {
      setHfModels([]);
    } finally {
      setHfLoading(false);
    }
  }, []);

  const fetchIndieHackers = useCallback(async () => {
    setIhLoading(true);
    try {
      const res = await fetch("/api/indiehackers");
      if (res.ok) {
        const json = await res.json();
        setIhPosts(json.posts || []);
      }
    } catch {
      setIhPosts([]);
    } finally {
      setIhLoading(false);
    }
  }, []);
```

- [ ] **Step 7: Add useEffect hooks**

After the existing useEffect hooks (around line 401), add:

```typescript
  useEffect(() => { fetchProductHunt(); }, [fetchProductHunt]);
  useEffect(() => { fetchHuggingFace(); }, [fetchHuggingFace]);
  useEffect(() => { fetchIndieHackers(); }, [fetchIndieHackers]);
```

- [ ] **Step 7b: Extend fetchReadStatus to include new data sources**

Find the existing `fetchReadStatus` useEffect (around lines 404-413) and update it to include the new data sources. Change:

```typescript
  useEffect(() => {
    const items: { item_type: "trending" | "queries" | "reddit" | "hn" | "technews" | "github"; item_key: string }[] = [];
    trendingItems.forEach(k => items.push({ item_type: "trending", item_key: k.name }));
    data?.google?.forEach(k => items.push({ item_type: "queries", item_key: k.name }));
    redditPosts.forEach(p => { if (p.url) items.push({ item_type: "reddit", item_key: p.url }); });
    hnPosts.forEach(p => items.push({ item_type: "hn", item_key: String(p.id) }));
    techNewsPosts.forEach(a => { if (a.url) items.push({ item_type: "technews", item_key: a.url }); });
    data?.github?.forEach(g => items.push({ item_type: "github", item_key: g.name }));
    if (items.length > 0) fetchReadStatus(items);
  }, [data, trendingItems, redditPosts, hnPosts, techNewsPosts, fetchReadStatus]);
```

to:

```typescript
  useEffect(() => {
    const items: { item_type: "trending" | "queries" | "reddit" | "hn" | "technews" | "github" | "ph" | "hf" | "ih"; item_key: string }[] = [];
    trendingItems.forEach(k => items.push({ item_type: "trending", item_key: k.name }));
    data?.google?.forEach(k => items.push({ item_type: "queries", item_key: k.name }));
    redditPosts.forEach(p => { if (p.url) items.push({ item_type: "reddit", item_key: p.url }); });
    hnPosts.forEach(p => items.push({ item_type: "hn", item_key: String(p.id) }));
    techNewsPosts.forEach(a => { if (a.url) items.push({ item_type: "technews", item_key: a.url }); });
    data?.github?.forEach(g => items.push({ item_type: "github", item_key: g.name }));
    phProducts.forEach(p => items.push({ item_type: "ph", item_key: p.name }));
    hfModels.forEach(m => items.push({ item_type: "hf", item_key: m.modelId }));
    ihPosts.forEach(p => { if (p.url) items.push({ item_type: "ih", item_key: p.url }); });
    if (items.length > 0) fetchReadStatus(items);
  }, [data, trendingItems, redditPosts, hnPosts, techNewsPosts, phProducts, hfModels, ihPosts, fetchReadStatus]);
```

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add state, fetch hooks, and scrollable tabs for PH/HF/IH"
```

---

### Task 9: Frontend — Card Components

**Files:**
- Modify: `app/page.tsx` (add components before the existing `RedditCard` around line 1922)

- [ ] **Step 1: Add shared helper functions**

Before the card components, add a shared `formatNumber` and `timeAgo` utility (these are currently inline in RedditCard — extract for reuse):

```typescript
function formatNum(n: number | undefined): string {
  if (typeof n !== "number" || isNaN(n)) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
```

- [ ] **Step 2: Add ExpandableSummary component**

This is the new trial component for showing AI summaries:

```typescript
function ExpandableSummary({ summary, tags }: { summary?: string; tags?: string[] }) {
  if (!summary && (!tags || tags.length === 0)) return null;
  return (
    <div className="mt-2 border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>
      {summary && (
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {summary}
        </p>
      )}
      {tags && tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {tags.map((tag, i) => (
            <span
              key={i}
              className="rounded-md px-1.5 py-0.5 text-xs font-medium"
              style={{ background: "var(--bg-elevated)", color: "var(--text-tertiary)" }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add ProductHuntCard component**

```typescript
function ProductHuntCard({ product, index, isExpanded, onToggle, read, onRead }: {
  product: ProductHuntProduct;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  read: boolean;
  onRead: () => void;
}) {
  return (
    <div
      className="min-w-0 overflow-hidden border transition-all"
      style={{
        background: "var(--bg-card)",
        borderColor: isExpanded ? "var(--accent-blue-hover)" : "var(--border)",
        borderRadius: "var(--radius-lg)",
        opacity: read ? 0.4 : 1,
      }}
    >
      <button onClick={() => { onToggle(); if (isExpanded) onRead(); }} className="flex min-w-0 w-full items-center gap-2.5 p-2.5 text-left sm:gap-3">
        <Rank n={index + 1} />
        {product.thumbnail && (
          <img src={product.thumbnail} alt="" className="h-8 w-8 rounded object-cover flex-shrink-0" loading="lazy" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="min-w-0 truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {product.name}
            </span>
          </div>
          <div className="mt-0.5 truncate text-xs" style={{ color: "var(--text-tertiary)" }}>
            {product.tagline}
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
          <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            ▲ {formatNum(product.votesCount)}
          </span>
          <Chevron open={isExpanded} />
        </div>
      </button>
      {isExpanded && (
        <>
          <ExpandableSummary summary={product.summary} tags={product.tags} />
          <div className="border-t px-3 py-2 flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
            <div className="flex gap-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
              <span>💬 {product.commentsCount}</span>
              {product.topics.length > 0 && <span>{product.topics.slice(0, 3).join(", ")}</span>}
            </div>
            {product.url && (
              <a
                href={product.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium"
                style={{ color: "var(--accent)" }}
              >
                Visit →
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add HuggingFaceCard component**

```typescript
function HuggingFaceCard({ model, index, isExpanded, onToggle, read, onRead }: {
  model: HuggingFaceModel;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  read: boolean;
  onRead: () => void;
}) {
  return (
    <div
      className="min-w-0 overflow-hidden border transition-all"
      style={{
        background: "var(--bg-card)",
        borderColor: isExpanded ? "var(--accent-blue-hover)" : "var(--border)",
        borderRadius: "var(--radius-lg)",
        opacity: read ? 0.4 : 1,
      }}
    >
      <button onClick={() => { onToggle(); if (isExpanded) onRead(); }} className="flex min-w-0 w-full items-center gap-2.5 p-2.5 text-left sm:gap-3">
        <Rank n={index + 1} />
        <div className="min-w-0 flex-1">
          <div className="min-w-0 truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {model.modelId}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
            <span>{model.pipelineTag || "unknown"}</span>
            <span>·</span>
            <span>↓ {formatNum(model.downloads)}</span>
            <span>·</span>
            <span>♥ {formatNum(model.likes)}</span>
          </div>
        </div>
        <Chevron open={isExpanded} />
      </button>
      {isExpanded && (
        <>
          <ExpandableSummary summary={model.summary} tags={model.aiTags} />
          <div className="border-t px-3 py-2 flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              by {model.author}
            </span>
            <a
              href={model.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium"
              style={{ color: "var(--accent)" }}
            >
              View →
            </a>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Add IndieHackersCard component**

```typescript
function IndieHackersCard({ post, index, isExpanded, onToggle, read, onRead }: {
  post: IndieHackersPost;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  read: boolean;
  onRead: () => void;
}) {
  return (
    <div
      className="min-w-0 overflow-hidden border transition-all"
      style={{
        background: "var(--bg-card)",
        borderColor: isExpanded ? "var(--accent-blue-hover)" : "var(--border)",
        borderRadius: "var(--radius-lg)",
        opacity: read ? 0.4 : 1,
      }}
    >
      <button onClick={() => { onToggle(); if (isExpanded) onRead(); }} className="flex min-w-0 w-full items-center gap-2.5 p-2.5 text-left sm:gap-3">
        <Rank n={index + 1} />
        <div className="min-w-0 flex-1">
          <div className="min-w-0 truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {post.title}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
            <span
              className="rounded px-1 py-0.5"
              style={{
                background: post.type === "product" ? "rgba(52, 211, 153, 0.1)" : "var(--bg-elevated)",
                color: post.type === "product" ? "#34d399" : "var(--text-tertiary)",
              }}
            >
              {post.type === "product" ? "🛍️ Product" : post.groupName}
            </span>
            <span>by {post.author}</span>
            {post.revenue && (
              <>
                <span>·</span>
                <span style={{ color: "#34d399" }}>{post.revenue}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
          <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            ▲ {formatNum(post.votes)}
          </span>
          <Chevron open={isExpanded} />
        </div>
      </button>
      {isExpanded && (
        <>
          <ExpandableSummary summary={post.summary} tags={post.tags} />
          <div className="border-t px-3 py-2 flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              💬 {post.comments} comments
            </span>
            {post.url && (
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium"
                style={{ color: "var(--accent)" }}
              >
                Read →
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add card components (PH, HF, IH) with expandable AI summaries"
```

---

### Task 10: Frontend — Section Rendering

**Files:**
- Modify: `app/page.tsx` (add 3 new sections after all existing sections, before the closing of the sections container)

- [ ] **Step 1: Add Product Hunt section**

After all existing sections (TechNews, GitHub, etc.), add the Product Hunt section:

```tsx
        {/* --- Product Hunt --- */}
        <section className={`${mobileTab !== "ph" ? "hidden" : ""} sm:block`}>
          <SectionHeader title="Product Hunt" icon="🚀" count={phProducts.length} />
          <div className="min-w-0 mt-2 space-y-2 lg:max-h-[calc(100vh-240px)] lg:overflow-y-auto lg:space-y-1.5">
            {phLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg" style={{ background: "var(--bg-card)", opacity: 1 - i * 0.12 }} />
              ))
            ) : phProducts.length === 0 ? (
              <EmptyState text="No Product Hunt data" />
            ) : (
              phProducts.map((product, i) => (
                <ProductHuntCard
                  key={`ph-${i}`}
                  product={product}
                  index={i}
                  isExpanded={expandedPH === product.name}
                  onToggle={() => setExpandedPH(expandedPH === product.name ? null : product.name)}
                  read={isRead("ph", product.name)}
                  onRead={() => markAsRead("ph", product.name)}
                />
              ))
            )}
          </div>
        </section>
```

- [ ] **Step 2: Add HuggingFace section**

```tsx
        {/* --- HuggingFace --- */}
        <section className={`${mobileTab !== "hf" ? "hidden" : ""} sm:block`}>
          <SectionHeader title="HuggingFace" icon="🤗" count={hfModels.length} />
          <div className="min-w-0 mt-2 space-y-2 lg:max-h-[calc(100vh-240px)] lg:overflow-y-auto lg:space-y-1.5">
            {hfLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg" style={{ background: "var(--bg-card)", opacity: 1 - i * 0.12 }} />
              ))
            ) : hfModels.length === 0 ? (
              <EmptyState text="No HuggingFace data" />
            ) : (
              hfModels.map((model, i) => (
                <HuggingFaceCard
                  key={`hf-${i}`}
                  model={model}
                  index={i}
                  isExpanded={expandedHF === model.modelId}
                  onToggle={() => setExpandedHF(expandedHF === model.modelId ? null : model.modelId)}
                  read={isRead("hf", model.modelId)}
                  onRead={() => markAsRead("hf", model.modelId)}
                />
              ))
            )}
          </div>
        </section>
```

- [ ] **Step 3: Add Indie Hackers section**

```tsx
        {/* --- Indie Hackers --- */}
        <section className={`${mobileTab !== "ih" ? "hidden" : ""} sm:block`}>
          <SectionHeader title="Indie Hackers" icon="🏪" count={ihPosts.length} />
          <div className="min-w-0 mt-2 space-y-2 lg:max-h-[calc(100vh-240px)] lg:overflow-y-auto lg:space-y-1.5">
            {ihLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg" style={{ background: "var(--bg-card)", opacity: 1 - i * 0.12 }} />
              ))
            ) : ihPosts.length === 0 ? (
              <EmptyState text="No Indie Hackers data" />
            ) : (
              ihPosts.map((post, i) => (
                <IndieHackersCard
                  key={`ih-${i}`}
                  post={post}
                  index={i}
                  isExpanded={expandedIH === post.url}
                  onToggle={() => setExpandedIH(expandedIH === post.url ? null : post.url)}
                  read={isRead("ih", post.url)}
                  onRead={() => markAsRead("ih", post.url)}
                />
              ))
            )}
          </div>
        </section>
```

- [ ] **Step 4: Verify the Chevron component exists**

Check that a `Chevron` component is available in page.tsx. If not, add:

```typescript
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className="h-4 w-4 flex-shrink-0 transition-transform"
      style={{ transform: open ? "rotate(180deg)" : "none", color: "var(--text-tertiary)" }}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
```

- [ ] **Step 5: Build verification**

Run: `pnpm build`
Expected: Build succeeds without TypeScript or compilation errors.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add PH, HF, IH sections with expandable cards to dashboard"
```

---

### Task 11: Deploy & Verify

- [ ] **Step 1: Push to feature branch**

```bash
git checkout -b feat/new-data-sources
git push -u origin feat/new-data-sources
```

- [ ] **Step 2: Deploy preview**

```bash
vercel --yes
```

- [ ] **Step 3: Verify all 3 sections load**

Open the preview URL and check:
1. Three new tabs (PH, HF, IH) appear in the mobile tab bar and are scrollable
2. Product Hunt section shows products with vote counts (may be empty if PH token not set)
3. HuggingFace section shows models with download counts
4. Indie Hackers section shows posts and products
5. Clicking a card expands to show AI summary and tags
6. Read tracking works (expanded items dim on collapse)
7. Desktop layout shows all sections in grid

- [ ] **Step 4: Merge to main**

```bash
git checkout main
git merge feat/new-data-sources
git push
```
