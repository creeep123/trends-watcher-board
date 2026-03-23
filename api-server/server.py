"""
pytrends API Server
Provides Google Trends related queries via FastAPI.
Board (Vercel) proxies requests here.
"""

import json
import math
import os
import re
import time
import random
import hashlib
import threading
import xml.etree.ElementTree as ET
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote_plus

from pydantic import BaseModel
import asyncio

import requests as http_requests
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pytrends.request import TrendReq
from TikTokApi import TikTokApi

OPENROUTER_API_KEY = os.environ.get(
    "OPENROUTER_API_KEY",
    "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",
)
LLM_MODEL = "z-ai/glm-4.5-air:free"

# --- Tiered cache TTL (seconds) ---
CACHE_TTL_MAP = {
    "trends":    7200,   # 2h — related queries change slowly
    "trending":  1800,   # 30min — RSS-based, low cost
    "freshness": 14400,  # 4h — freshness doesn't shift fast
    "interest":  7200,   # 2h — 7-day chart, hourly data
    "multigeo":  21600,  # 6h — multi-country check is heavy
    "reddit":    1800,   # 30min — JSON API, low cost
    "hackernews": 1800,  # 30min — JSON API, low cost
    "tiktok":    1800,   # 30min — TikTok videos
    "enrich":    3600,   # 1h — composite scoring
    "allintitle": 7200,  # 2h — competition changes slowly
}
DEFAULT_TTL = 3600  # 1h fallback

# --- Rate limiting for pytrends ---
_last_request_time = 0
_MIN_REQUEST_INTERVAL = 2.0  # Minimum seconds between pytrends requests
_rate_limit_lock = threading.Lock()

def _rate_limit_pytrends():
    """Ensure minimum time between pytrends requests to avoid rate limiting."""
    global _last_request_time
    with _rate_limit_lock:
        now = time.time()
        time_since_last = now - _last_request_time
        if time_since_last < _MIN_REQUEST_INTERVAL:
            time.sleep(_MIN_REQUEST_INTERVAL - time_since_last)
        # Add small random jitter (0-0.5s) to make requests look more natural
        time.sleep(random.uniform(0, 0.5))
        _last_request_time = time.time()


# --- Cache with stale fallback ---
# _cache[key] = {"data": dict, "timestamp": float}
_cache: dict[str, dict] = {}


def _cache_key(keywords: list[str], timeframe: str, geo: str) -> str:
    raw = f"{','.join(sorted(keywords))}|{timeframe}|{geo}"
    return hashlib.md5(raw.encode()).hexdigest()


def _ttl_for(key: str) -> int:
    """Resolve TTL based on cache key prefix."""
    for prefix, ttl in CACHE_TTL_MAP.items():
        if key.startswith(prefix) or prefix in key:
            return ttl
    return DEFAULT_TTL


def _get_cached(key: str) -> Optional[dict]:
    """Return cached data if fresh (within TTL)."""
    entry = _cache.get(key)
    if not entry:
        return None
    if time.time() - entry["timestamp"] > _ttl_for(key):
        return None  # Expired — but DON'T delete, keep for stale fallback
    return entry["data"]


def _get_stale(key: str) -> Optional[dict]:
    """Return cached data even if expired. Used as fallback when upstream fails."""
    entry = _cache.get(key)
    if not entry:
        return None
    return entry["data"]


def _set_cache(key: str, data: dict) -> None:
    _cache[key] = {"data": data, "timestamp": time.time()}


def _is_empty_response(data: dict) -> bool:
    """Check if a response is effectively empty (pytrends returned no data)."""
    if not data:
        return True
    # trends endpoint
    if "google" in data and len(data["google"]) == 0:
        return True
    # freshness with zero score and zero averages
    if "freshness" in data and data.get("freshness") == 0 and data.get("recent_avg") == 0:
        return True
    # interest with no points
    if "points" in data and len(data["points"]) == 0:
        return True
    # multi-geo with no found countries
    if "found_in" in data and len(data["found_in"]) == 0:
        return True
    return False


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def fetch_related_queries(keyword: str, timeframe: str, geo: str, use_proxy: bool = False) -> list[dict]:
    """Fetch rising + top related queries for a single keyword."""
    items = []
    rate_limited = False

    def try_fetch(proxy_url: Optional[str] = None) -> bool:
        """Try to fetch with optional proxy. Returns True if successful."""
        nonlocal items
        try:
            _rate_limit_pytrends()  # Rate limit before pytrends request

            # Build kwargs for TrendReq
            kwargs = {"hl": "en-US", "tz": 360, "timeout": (5, 15)}
            if proxy_url:
                # Convert http://IP:PORT to proxies dict format
                kwargs["proxies"] = {"https": proxy_url, "http": proxy_url}
                print(f"[pytrends] Trying proxy {proxy_url} for '{keyword}'")

            pytrends = TrendReq(**kwargs)
            pytrends.build_payload([keyword], cat=0, timeframe=timeframe, geo=geo, gprop="")
            related = pytrends.related_queries()

            if keyword not in related or related[keyword] is None:
                return False

            rising = related[keyword].get("rising")
            top = related[keyword].get("top")

            seen = set()

            # Rising queries first
            if rising is not None and not rising.empty:
                for _, row in rising.head(15).iterrows():
                    name = row.get("query", "")
                    if not name or name.lower() == keyword.lower():
                        continue
                    if name.lower() in seen:
                        continue
                    seen.add(name.lower())

                    value = row.get("value", 0)
                    growth = f"+{value}%" if isinstance(value, (int, float)) else str(value)

                    items.append({
                        "name": name,
                        "value": growth,
                        "source": "Google Trends (Rising)",
                        "url": f"https://www.google.com/search?q={quote_plus(name)}&udm=50",
                    })

            # Top queries to fill up
            if top is not None and not top.empty and len(items) < 15:
                needed = 15 - len(items)
                for _, row in top.head(needed * 2).iterrows():
                    if len(items) >= 15:
                        break
                    name = row.get("query", "")
                    if not name or name.lower() == keyword.lower():
                        continue
                    if name.lower() in seen:
                        continue
                    seen.add(name.lower())

                    value = row.get("value", 0)
                    popularity = f"{int(value)}%" if isinstance(value, (int, float)) else str(value)

                    items.append({
                        "name": name,
                        "value": popularity,
                        "source": "Google Trends (Top)",
                        "url": f"https://www.google.com/search?q={quote_plus(name)}&udm=50",
                    })

            return len(items) > 0

        except Exception as e:
            error_msg = str(e)
            if "429" in error_msg:
                print(f"[pytrends] Rate limited for '{keyword}'")
                return "rate_limited"  # Special return value for 429
            print(f"[pytrends] Error for '{keyword}': {e}")
            return False

    # Try direct connection
    result = try_fetch()
    if result is True:
        return items
    elif result == "rate_limited":
        print(f"[pytrends] Rate limited for '{keyword}' - returning empty")
    else:
        print(f"[pytrends] Direct connection failed for '{keyword}'")

    # Return empty on failure (relying on cache)
    return items


@app.get("/api/trends")
def get_trends(
    keywords: str = Query(default="AI,ai video,ai tool,LLM", description="Comma-separated keyword roots"),
    timeframe: str = Query(default="now 1-d", description="pytrends timeframe"),
    geo: str = Query(default="", description="Country code, empty = global"),
    bypassCache: bool = Query(default=False, description="Bypass cache and force refresh"),
):
    keyword_list = [k.strip() for k in keywords.split(",") if k.strip()]
    if not keyword_list:
        keyword_list = ["AI"]

    key = f"trends|{_cache_key(keyword_list, timeframe, geo)}"

    # Always try cache first for speed
    cached = _get_cached(key)
    if cached and not bypassCache:
        return cached

    # If bypassing cache or no cache, try fetching
    # Fetch for each keyword (sequential, 2s delay between to avoid 429)
    all_items: list[dict] = []
    seen_names: set[str] = set()
    rate_limited = False

    for kw in keyword_list:
        results = fetch_related_queries(kw, timeframe, geo)
        for item in results:
            if item["name"].lower() not in seen_names:
                seen_names.add(item["name"].lower())
                all_items.append(item)
        if kw != keyword_list[-1]:
            time.sleep(2)

    # If no data and we have cached data (even stale), return it
    if len(all_items) == 0 and cached:
        print("[trends] No fresh data, returning stale cache")
        return {**cached, "_stale": True}

    # If bypassCache or got fresh data, update cache
    # Determine status message
    status_msg = None
    if len(all_items) == 0:
        status_msg = "Google Trends 暂时不可用（可能限频）"

    response = {
        "google": all_items,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "params": {"timeframe": timeframe, "geo": geo},
        "_stale": False,
        "_cached": False,
        "_status": status_msg,
    }

    _set_cache(key, response)
    return response


def _classify_tech_terms(names: list[str]) -> set[str]:
    """Use LLM to classify which trending terms are tech/AI related."""
    if not names:
        return set()

    prompt = (
        "I will give you a list of trending search terms. "
        "Reply ONLY with a JSON array containing the EXACT terms that are related to: "
        "AI, tech, software, apps, programming, crypto, digital tools, startups, or internet products. "
        "Be strict: exclude sports, entertainment, politics, weather unless they directly involve tech. "
        "If none match, reply []. No explanation, just the JSON array.\n\n"
        "Terms:\n" + "\n".join(f"- {n}" for n in names)
    )

    try:
        resp = http_requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": LLM_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 500,
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"].strip()
        # Extract JSON array from response
        start = content.find("[")
        end = content.rfind("]")
        if start != -1 and end != -1:
            arr = json.loads(content[start:end + 1])
            return {t.lower().strip() for t in arr if isinstance(t, str)}
    except Exception as e:
        print(f"[LLM] classification error: {e}")

    return set()


@app.get("/api/trending")
def get_trending(
    geo: str = Query(default="US", description="Country code (e.g. US, ID, BR)"),
):
    """Get Trending Now via Google Trends RSS feed, with LLM tech classification."""
    cache_key = f"trending|{geo}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    items: list[dict] = []
    try:
        rss_url = f"https://trends.google.com/trending/rss?geo={geo}"
        resp = http_requests.get(rss_url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
        root = ET.fromstring(resp.text)

        for item in root.iter("item"):
            title_el = item.find("title")
            traffic_el = item.find("{https://trends.google.com/trending/rss}approx_traffic")
            if title_el is not None and title_el.text:
                name = title_el.text.strip()
                traffic = traffic_el.text.strip() if traffic_el is not None and traffic_el.text else ""
                items.append({
                    "name": name,
                    "traffic": traffic,
                    "url": f"https://www.google.com/search?q={quote_plus(name)}&udm=50",
                    "is_tech": False,
                })
    except Exception as e:
        print(f"[RSS] trending error for geo={geo}: {e}")

    # LLM classification
    if items:
        names = [it["name"] for it in items]
        tech_set = _classify_tech_terms(names)
        for it in items:
            if it["name"].lower().strip() in tech_set:
                it["is_tech"] = True
        # Sort: tech items first, then by original order
        tech_items = [it for it in items if it["is_tech"]]
        other_items = [it for it in items if not it["is_tech"]]
        items = tech_items + other_items

    response = {
        "trending": items,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "geo": geo,
    }
    _set_cache(cache_key, response)
    return response


@app.get("/api/freshness")
def get_freshness(
    keyword: str = Query(description="Single keyword to check"),
    geo: str = Query(default="", description="Country code, empty = global"),
):
    """Calculate freshness score: how 'new' a keyword is based on recent vs historical interest."""
    cache_key = f"freshness|{keyword.lower()}|{geo}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    recent_avg = 0.0
    baseline_avg = 0.0
    fetch_failed = False

    try:
        _rate_limit_pytrends()  # Rate limit before pytrends request
        pytrends = TrendReq(hl="en-US", tz=360, timeout=(10, 25))

        pytrends.build_payload([keyword], cat=0, timeframe="now 1-d", geo=geo, gprop="")
        df_recent = pytrends.interest_over_time()
        if df_recent is not None and not df_recent.empty and keyword in df_recent.columns:
            recent_avg = float(df_recent[keyword].mean())

        time.sleep(1)

        pytrends.build_payload([keyword], cat=0, timeframe="today 1-m", geo=geo, gprop="")
        df_baseline = pytrends.interest_over_time()
        if df_baseline is not None and not df_baseline.empty and keyword in df_baseline.columns:
            baseline_avg = float(df_baseline[keyword].mean())

    except Exception as e:
        print(f"[pytrends] freshness error for '{keyword}': {e}")
        fetch_failed = True

    if recent_avg <= 0:
        score = 0
    elif baseline_avg <= 1:
        score = 100
    else:
        ratio = recent_avg / baseline_avg
        score = min(100, max(0, round((ratio - 0.5) / 2.5 * 100)))

    response = {
        "keyword": keyword,
        "geo": geo,
        "freshness": score,
        "recent_avg": round(recent_avg, 1),
        "baseline_avg": round(baseline_avg, 1),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    if fetch_failed or (recent_avg <= 0 and baseline_avg <= 0):
        stale = _get_stale(cache_key)
        if stale:
            print(f"[cache] freshness '{keyword}': pytrends failed, serving stale")
            stale["_stale"] = True
            return stale

    _set_cache(cache_key, response)
    return response


@app.get("/api/interest")
def get_interest(
    keyword: str = Query(description="Single keyword to check"),
    geo: str = Query(default="", description="Country code, empty = global"),
):
    """Get interest over time (past 7 days) for a single keyword."""
    cache_key = f"interest|{keyword.lower()}|{geo}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    points: list[dict] = []
    try:
        _rate_limit_pytrends()  # Rate limit before pytrends request
        pytrends = TrendReq(hl="en-US", tz=360, timeout=(10, 25))
        pytrends.build_payload([keyword], cat=0, timeframe="now 7-d", geo=geo, gprop="")
        df = pytrends.interest_over_time()
        if df is not None and not df.empty and keyword in df.columns:
            for ts, row in df.iterrows():
                points.append({
                    "time": ts.isoformat(),
                    "value": int(row[keyword]),
                })
    except Exception as e:
        print(f"[pytrends] interest_over_time error for '{keyword}': {e}")

    response = {
        "keyword": keyword,
        "geo": geo,
        "points": points,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    if _is_empty_response(response):
        stale = _get_stale(cache_key)
        if stale:
            print(f"[cache] interest '{keyword}': empty, serving stale")
            stale["_stale"] = True
            return stale
        # Don't cache empty — let next request retry
        return response

    _set_cache(cache_key, response)
    return response


@app.get("/api/multi-geo")
def get_multi_geo(
    keyword: str = Query(description="Single keyword to check"),
    geos: str = Query(default="US,ID,BR,GB,DE,JP", description="Comma-separated country codes"),
):
    """Check if a keyword appears in trending/related queries across multiple countries."""
    cache_key = f"multigeo|{keyword.lower()}|{geos}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    geo_list = [g.strip() for g in geos.split(",") if g.strip()]
    found_in: list[str] = []
    fetch_failed = False

    for geo in geo_list:
        try:
            _rate_limit_pytrends()  # Rate limit before pytrends request
            pytrends = TrendReq(hl="en-US", tz=360, timeout=(10, 25))
            pytrends.build_payload([keyword], cat=0, timeframe="now 1-d", geo=geo, gprop="")
            df = pytrends.interest_over_time()
            if df is not None and not df.empty and keyword in df.columns:
                avg = df[keyword].mean()
                if avg > 0:
                    found_in.append(geo)
            time.sleep(0.5)
        except Exception as e:
            print(f"[pytrends] multi-geo error for '{keyword}' in {geo}: {e}")
            fetch_failed = True

    response = {
        "keyword": keyword,
        "found_in": found_in,
        "total_geos": len(geo_list),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    if fetch_failed and len(found_in) == 0:
        stale = _get_stale(cache_key)
        if stale:
            print(f"[cache] multi-geo '{keyword}': failed, serving stale")
            stale["_stale"] = True
            return stale

    _set_cache(cache_key, response)
    return response


def _geo_to_pn(geo: str) -> str:
    """Convert ISO country code to pytrends pn parameter for trending_searches."""
    mapping = {
        "US": "united_states",
        "GB": "united_kingdom",
        "DE": "germany",
        "FR": "france",
        "JP": "japan",
        "BR": "brazil",
        "ID": "indonesia",
        "CN": "china",
        "IN": "india",
        "KR": "south_korea",
    }
    return mapping.get(geo.upper(), "united_states")


# --- Reddit signals ---

REDDIT_SUBREDDITS = [
    # AI 模型 & 工具 (热度最高)
    ("artificial", 100),
    ("MachineLearning", 95),
    ("ChatGPT", 100),
    ("LocalLLaMA", 95),
    ("OpenAI", 100),
    ("singularity", 90),

    # AI 图像/视频
    ("StableDiffusion", 85),
    ("midjourney", 90),
    ("CharacterAI", 85),
    ("comfyui", 80),

    # AI 开发
    ("localai", 75),
    ("Ollama", 85),
    ("langchain", 80),
    ("Anthropic", 85),

    # 需求发现 - SaaS/产品相关
    ("SaaS", 90),
    ("Entrepreneur", 85),
    ("SideProject", 80),
    ("MicroSaaS", 75),
    ("lowlevel", 70),
]

REDDIT_SUB_NAMES = [s[0] for s in REDDIT_SUBREDDITS]
REDDIT_SUB_HEAT = {s[0]: s[1] for s in REDDIT_SUBREDDITS}
REDDIT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
REDDIT_ATOM_NS = {"a": "http://www.w3.org/2005/Atom"}


def _fetch_subreddit_rss(subreddit: str, sort: str = "hot", limit: int = 15) -> list[dict]:
    """Fetch posts from a subreddit via RSS (more reliable than JSON API)."""
    posts = []
    try:
        # Use RSS instead of JSON to avoid 403 errors
        url = f"https://www.reddit.com/r/{subreddit}/{sort}/.rss?limit={limit}"
        if sort == "top":
            url += "&t=day"

        resp = http_requests.get(url, timeout=10, headers={"User-Agent": REDDIT_UA})
        if resp.status_code != 200:
            print(f"[Reddit] {subreddit} returned {resp.status_code}")
            return posts

        root = ET.fromstring(resp.text)
        for entry in root.findall(".//a:entry", REDDIT_ATOM_NS):
            title_el = entry.find("a:title", REDDIT_ATOM_NS)
            link_el = entry.find("a:link", REDDIT_ATOM_NS)
            published_el = entry.find("a:published", REDDIT_ATOM_NS)

            if title_el is not None and title_el.text:
                title = title_el.text.strip()
                # Skip meta posts
                if title.startswith("[D]") or title.startswith("[P]") or "megathread" in title.lower():
                    continue

                posts.append({
                    "title": title,
                    "url": link_el.get("href", "") if link_el is not None else "",
                    "subreddit": subreddit,
                    "ups": 0,  # RSS doesn't provide upvotes
                    "num_comments": 0,  # RSS doesn't provide comment count
                    "score": REDDIT_SUB_HEAT.get(subreddit, 50),
                    "published": published_el.text.strip() if published_el is not None and published_el.text else "",
                })
    except Exception as e:
        print(f"[Reddit] RSS error for r/{subreddit}: {e}")
    return posts


def _extract_reddit_keywords(posts: list[dict]) -> list[dict]:
    """Use LLM to extract trending tech/AI product names and keywords from Reddit post titles."""
    if not posts:
        return []

    titles = [p["title"] for p in posts]
    prompt = (
        "Below are Reddit post titles from AI/tech subreddits. "
        "Extract specific product names, tools, models, or technologies mentioned. "
        "Reply ONLY with a JSON array of objects, each with:\n"
        '- "keyword": the product/tool/model name (e.g. "Ollama", "GPT-5", "Stable Diffusion 4")\n'
        '- "context": one-line summary of why it\'s trending (max 15 words)\n'
        '- "posts": how many titles mention it\n\n'
        "Rules:\n"
        "- Only include specific named products/tools/models, NOT generic terms like 'AI' or 'machine learning'\n"
        "- Merge similar mentions (e.g. 'GPT-5' and 'gpt5' → 'GPT-5')\n"
        "- Max 15 keywords, sorted by mention count descending\n"
        "- If nothing specific found, reply []\n\n"
        "Titles:\n" + "\n".join(f"- {t}" for t in titles)
    )

    try:
        resp = http_requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": LLM_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 800,
            },
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"].strip()
        start = content.find("[")
        end = content.rfind("]")
        if start != -1 and end != -1:
            arr = json.loads(content[start:end + 1])
            return [
                {
                    "keyword": item.get("keyword", ""),
                    "context": item.get("context", ""),
                    "posts": item.get("posts", 1),
                }
                for item in arr
                if isinstance(item, dict) and item.get("keyword")
            ]
    except Exception as e:
        print(f"[LLM] Reddit keyword extraction error: {e}")

    return []


@app.get("/api/reddit")
def get_reddit(
    sort: str = Query(default="hot", description="Sort: hot or top"),
):
    """Fetch AI/tech Reddit posts and extract trending keywords via LLM."""
    cache_key = f"reddit|{sort}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    all_posts: list[dict] = []
    seen_titles: set[str] = set()

    # Fetch from top 8 subreddits to avoid timeout (20 would take 6+ seconds)
    for sub in REDDIT_SUB_NAMES[:8]:
        posts = _fetch_subreddit_rss(sub, sort=sort, limit=15)
        for p in posts:
            key = p["title"].lower().strip()
            if key not in seen_titles:
                seen_titles.add(key)
                all_posts.append(p)
        time.sleep(0.2)  # Rate limit between subreddits

    # 按热度分数排序
    all_posts.sort(key=lambda p: p.get("score", 50), reverse=True)

    # Extract keywords via LLM
    keywords = _extract_reddit_keywords(all_posts)

    response = {
        "posts": all_posts[:50],  # Cap at 50 posts
        "keywords": keywords,
        "subreddits": REDDIT_SUB_NAMES,
        "sort": sort,
        "total_posts": len(all_posts),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    _set_cache(cache_key, response)
    return response


# --- X/Twitter Signals ---

TWITTER_ACCOUNTS = [
    # AI/ML researchers and companies
    "OpenAI", "AnthropicAI", "GoogleDeepMind",
    "nvidia", "HuggingFace",
    "sama", "ylecun", "AndrewNgYates",

    # Tech news
    "verge", "techcrunch", "wired",
    "Stratechery",

    # Indie hackers
    "levelsio", "pg", "naval",
]

TWITTER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"


@app.get("/api/twitter")
def get_twitter():
    """Fetch latest tweets from tech/AI accounts via RSS."""
    cache_key = "twitter|latest"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    all_tweets: list[dict] = []

    for username in TWITTER_ACCOUNTS[:5]:  # Limit to 5 accounts for now
        try:
            # Use twitrss.me for RSS feed
            url = f"https://twitrss.me/twitter_user_to_rss/?user={username}"
            resp = http_requests.get(url, timeout=5, headers={"User-Agent": TWITTER_UA})

            if resp.status_code != 200:
                print(f"[Twitter] @{username} returned {resp.status_code}")
                continue

            root = ET.fromstring(resp.text)

            for item in root.findall(".//item"):
                title_el = item.find("title")
                link_el = item.find("link")
                pub_date_el = item.find("pubDate")

                if title_el is not None and title_el.text:
                    title = title_el.text.strip()

                    # Clean up title (remove "username: " prefix if present)
                    if title.startswith(f"{username}: "):
                        title = title[len(f"{username}: "):]

                    # Skip retweets
                    if title.startswith("RT "):
                        continue

                    # Parse publication date
                    published = ""
                    if pub_date_el is not None and pub_date_el.text:
                        try:
                            import email.utils
                            timestamp = email.utils.parsedate_to_datetime(pub_date_el.text)
                            published = timestamp.isoformat()
                        except:
                            pass

                    all_tweets.append({
                        "title": title[:280],  # Max tweet length
                        "url": link_el.text if link_el is not None else "",
                        "username": username,
                        "published": published,
                    })

                    # Get top 3 tweets per account
                    if len([t for t in all_tweets if t["username"] == username]) >= 3:
                        break

            time.sleep(0.3)  # Rate limit

        except Exception as e:
            print(f"[Twitter] Error fetching @{username}: {e}")
            continue

    # Sort by recent (if we have dates)
    all_tweets.sort(key=lambda t: t.get("published", ""), reverse=True)

    response = {
        "tweets": all_tweets[:30],  # Cap at 30 tweets
        "total": len(all_tweets),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    _set_cache(cache_key, response)
    return response


# --- Tech News (replacing Twitter) ---

TECH_NEWS_SOURCES = [
    {"name": "TechCrunch", "url": "https://techcrunch.com/feed/", "rss_format": "rss"},
    {"name": "The Verge", "url": "https://www.theverge.com/rss/index.xml", "rss_format": "atom"},
    {"name": "Ars Technica", "url": "https://feeds.arstechnica.com/arstechnica/index", "rss_format": "rss"},
]

TECHNEWS_ATOM_NS = {"a": "http://www.w3.org/2005/Atom"}


@app.get("/api/technews")
def get_technews():
    """Fetch latest tech news from major publications via RSS."""
    cache_key = "technews|latest"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    all_articles: list[dict] = []

    for source in TECH_NEWS_SOURCES:
        try:
            resp = http_requests.get(source["url"], timeout=10, headers={"User-Agent": REDDIT_UA})

            if resp.status_code != 200:
                print(f"[TechNews] {source['name']} returned {resp.status_code}")
                continue

            root = ET.fromstring(resp.text)

            # Handle both RSS and Atom formats
            if source["rss_format"] == "atom":
                entries = root.findall("./a:entry", TECHNEWS_ATOM_NS)
                for entry in entries:
                    title_el = entry.find("a:title", TECHNEWS_ATOM_NS)
                    link_el = entry.find("a:link", TECHNEWS_ATOM_NS)
                    published_el = entry.find("a:published", TECHNEWS_ATOM_NS)
                    # Also try without namespace prefix (some feeds use default namespace)
                    published_el_no_ns = entry.find("published")
                    updated_el = entry.find("a:updated", TECHNEWS_ATOM_NS)
                    updated_el_no_ns = entry.find("updated")
                    author_el = entry.find("a:author", TECHNEWS_ATOM_NS)

                    if title_el is not None and title_el.text:
                        title = title_el.text.strip()

                        # Get URL from link attribute or element
                        url = ""
                        if link_el is not None:
                            url = link_el.get("href", "")
                            if not url and link_el.text:
                                url = link_el.text

                        # Parse publication date
                        published = ""
                        date_to_parse = None

                        # Try published first (with and without namespace), then updated
                        if published_el is not None and published_el.text:
                            date_to_parse = published_el.text
                        elif published_el_no_ns is not None and published_el_no_ns.text:
                            date_to_parse = published_el_no_ns.text
                        elif updated_el is not None and updated_el.text:
                            date_to_parse = updated_el.text
                        elif updated_el_no_ns is not None and updated_el_no_ns.text:
                            date_to_parse = updated_el_no_ns.text

                        if date_to_parse:
                            try:
                                import email.utils
                                timestamp = email.utils.parsedate_to_datetime(date_to_parse)
                                published = timestamp.isoformat()
                            except:
                                pass

                        # Get author name
                        author = source["name"]
                        if author_el is not None:
                            name_el = author_el.find("a:name", TECHNEWS_ATOM_NS)
                            if name_el is not None and name_el.text:
                                author = name_el.text

                        all_articles.append({
                            "title": title[:200],
                            "url": url,
                            "source": source["name"],
                            "author": author,
                            "published": published,
                        })

                        # Get top 5 articles per source
                        if len([a for a in all_articles if a["source"] == source["name"]]) >= 5:
                            break

            else:  # RSS format
                items = root.findall("./channel/item") or root.findall("./item")
                for item in items:
                    title_el = item.find("title")
                    link_el = item.find("link")
                    pub_date_el = item.find("pubDate")
                    creator_el = item.find("{http://purl.org/dc/elements/1.1/}creator")

                    if title_el is not None and title_el.text:
                        title = title_el.text.strip()

                        # Parse publication date
                        published = ""
                        if pub_date_el is not None and pub_date_el.text:
                            try:
                                import email.utils
                                timestamp = email.utils.parsedate_to_datetime(pub_date_el.text)
                                published = timestamp.isoformat()
                            except:
                                pass

                        all_articles.append({
                            "title": title[:200],
                            "url": link_el.text if link_el is not None else "",
                            "source": source["name"],
                            "author": creator_el.text if creator_el is not None and creator_el.text else source["name"],
                            "published": published,
                        })

                        # Get top 5 articles per source
                        if len([a for a in all_articles if a["source"] == source["name"]]) >= 5:
                            break

            time.sleep(0.3)  # Rate limit between sources

        except Exception as e:
            print(f"[TechNews] Error fetching {source['name']}: {e}")
            continue

    # Sort by source and return
    all_articles.sort(key=lambda a: (a["source"], a.get("published", "")), reverse=True)

    response = {
        "articles": all_articles[:20],  # Cap at 20 articles total
        "total": len(all_articles),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    _set_cache(cache_key, response)
    return response


# --- HackerNews ---

HN_API_BASE = "https://hacker-news.firebaseio.com/v0"


def _extract_domain(url: str) -> str:
    """Extract domain from URL."""
    if not url or url.startswith("HN:"):
        return "news.ycombinator.com"
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        return parsed.netloc or "unknown"
    except:
        return "unknown"


@app.get("/api/hackernews")
def get_hackernews():
    """Fetch top stories from HackerNews API."""
    cache_key = "hackernews|top"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    posts: list[dict] = []

    try:
        # Get top story IDs
        resp = http_requests.get(f"{HN_API_BASE}/topstories.json", timeout=10)
        if resp.status_code != 200:
            print(f"[HN] topstories returned {resp.status_code}")
            return {"posts": [], "timestamp": datetime.now(timezone.utc).isoformat()}

        story_ids = resp.json()[:50]  # Top 50 stories

        # Fetch details for each story
        for story_id in story_ids:
            try:
                story_resp = http_requests.get(f"{HN_API_BASE}/item/{story_id}.json", timeout=5)
                if story_resp.status_code == 200:
                    story = story_resp.json()
                    title = story.get("title", "")
                    if not title:
                        continue

                    url = story.get("url", "")
                    if not url:
                        # HN internal link, use HN discuss page
                        url = f"https://news.ycombinator.com/item?id={story_id}"

                    points = story.get("score", 0)
                    comments = story.get("descendants", 0)
                    score = points + comments * 0.5  # 综合热度

                    posts.append({
                        "id": story_id,
                        "title": title,
                        "url": url,
                        "domain": _extract_domain(url),
                        "points": points,
                        "comments": comments,
                        "score": score,
                        "time": datetime.fromtimestamp(story.get("time", 0), tz=timezone.utc).isoformat(),
                    })
            except Exception as e:
                print(f"[HN] Error fetching story {story_id}: {e}")
                continue

        # Sort by score
        posts.sort(key=lambda p: p.get("score", 0), reverse=True)

    except Exception as e:
        print(f"[HN] Error: {e}")

    response = {
        "posts": posts,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    _set_cache(cache_key, response)
    return response


# --- TikTok Videos ---
TIKTOK_KEYWORDS = ["AI", "LLM", "maker", "generator", "creator", "filter"]


@app.get("/api/tiktok")
async def get_tiktok_videos():
    """Fetch trending TikTok videos for specified hashtags."""
    cache_key = "tiktok|videos"
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
        stale = _get_stale(cache_key)
        if stale:
            return stale
        return {"videos": [], "timestamp": datetime.now(timezone.utc).isoformat()}


# --- Enrich: scoring system ---

_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
]


def _fetch_allintitle(keyword: str) -> int:
    """Query Google for allintitle:keyword and return approximate result count."""
    cache_key = f"allintitle|{keyword.lower()}"
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached.get("count", -1)

    try:
        query = f"allintitle:{keyword}"
        resp = http_requests.get(
            "https://www.google.com/search",
            params={"q": query},
            headers={
                "User-Agent": random.choice(_USER_AGENTS),
                "Accept-Language": "en-US,en;q=0.9",
            },
            timeout=10,
        )
        if resp.status_code == 429:
            print(f"[allintitle] Rate limited for '{keyword}'")
            return -1
        resp.raise_for_status()

        # Parse "About X results" or "X results"
        text = resp.text
        match = re.search(r'(?:About\s+)?([\d,]+)\s+results?', text)
        count = int(match.group(1).replace(",", "")) if match else -1

        _set_cache(cache_key, {"count": count})
        print(f"[allintitle] '{keyword}': {count}")
        return count
    except Exception as e:
        print(f"[allintitle] Error for '{keyword}': {e}")
        return -1


def _score_growth(value_str: str) -> int:
    """Map growth percentage to 0-100 score using log curve.

    log10(val) * 27 - 24 produces:
      100% → 30,  500% → 49,  1000% → 57,  5000% → 76,
      10000% → 84,  50000% → 100
    """
    cleaned = value_str.replace("+", "").replace("%", "").replace(",", "").strip()
    try:
        val = int(cleaned)
    except (ValueError, TypeError):
        return 50  # non-numeric (e.g. "Breakout") gets moderate-high score
    if val <= 0:
        return 0
    score = round(math.log10(max(val, 1)) * 27 - 24)
    return max(0, min(100, score))


def _score_competition(allintitle_count: int) -> tuple[int, str]:
    """Map allintitle count to competition score (higher = less competitive = better)."""
    if allintitle_count < 0:
        return 50, "unknown"  # couldn't fetch, neutral score
    if allintitle_count <= 50:
        return 100, "very_low"
    if allintitle_count <= 200:
        return 80, "low"
    if allintitle_count <= 1000:
        return 55, "medium"
    if allintitle_count <= 5000:
        return 25, "high"
    return 0, "high"


def _score_multi_geo(found_count: int, total: int) -> int:
    """Map multi-geo presence to 0-100 score."""
    if total == 0:
        return 0
    return min(100, round(found_count / total * 100))


def _score_acceleration(points: list[dict]) -> int:
    """Calculate acceleration from interest over time points."""
    if len(points) < 5:
        return 50  # not enough data, neutral
    values = [p["value"] for p in points]
    recent = values[-len(values) // 3:]  # last third
    earlier = values[:len(values) * 2 // 3]  # first two-thirds
    avg_recent = sum(recent) / len(recent) if recent else 0
    avg_earlier = sum(earlier) / len(earlier) if earlier else 0
    if avg_earlier <= 0:
        return 90 if avg_recent > 0 else 50
    ratio = avg_recent / avg_earlier
    if ratio >= 2.0:
        return 100
    if ratio >= 1.5:
        return 80
    if ratio >= 1.0:
        return 55
    if ratio >= 0.5:
        return 25
    return 0


def _enrich_single(keyword: str, growth_value: str) -> dict:
    """Compute enrichment for a single keyword.

    LIGHTWEIGHT: only uses growth value (already known) + allintitle (1 HTTP call).
    Multi-geo and acceleration are computed client-side from existing
    /api/multi-geo and /api/interest endpoints to avoid pytrends rate limiting.
    """
    # 1. Growth score (from value string, no API call needed)
    growth_score = _score_growth(growth_value)

    # 2. Competition (allintitle) — single HTTP call to Google, not pytrends
    allintitle_count = _fetch_allintitle(keyword)
    comp_score, comp_level = _score_competition(allintitle_count)

    # Base score: growth + competition (2 dimensions)
    # Always blend — when allintitle fails, comp_score is 50 (neutral)
    # This preserves differentiation via growth_score differences
    base_score = round(growth_score * 0.55 + comp_score * 0.45)

    return {
        "growth_score": growth_score,
        "allintitle_count": allintitle_count,
        "competition_score": comp_score,
        "competition_level": comp_level,
        "base_score": base_score,
        "score": base_score,
        "has_full_score": False,
    }


class EnrichRequest(BaseModel):
    keywords: list[dict]  # [{"name": "...", "value": "+5000%"}, ...]


@app.post("/api/enrich")
def enrich_keywords(req: EnrichRequest):
    """Compute enrichment scores for a list of keywords.

    Lightweight: only allintitle HTTP calls (no pytrends), so won't trigger 429.
    """
    items = req.keywords[:10]  # Limit to 10

    # Check if entire batch is cached
    names_key = "|".join(sorted(k["name"].lower() for k in items))
    batch_key = f"enrich|{hashlib.md5(names_key.encode()).hexdigest()}"
    cached = _get_cached(batch_key)
    if cached:
        return cached

    results: dict[str, dict] = {}
    for item in items:
        kw_name = item.get("name", "")
        kw_value = item.get("value", "0%")
        if not kw_name:
            continue

        # Per-keyword cache
        single_key = f"enrich_single|{kw_name.lower()}"
        single_cached = _get_cached(single_key)
        if single_cached:
            results[kw_name] = single_cached
            continue

        enriched = _enrich_single(kw_name, kw_value)
        results[kw_name] = enriched
        _set_cache(single_key, enriched)

        # Small delay between allintitle requests
        time.sleep(random.uniform(1, 2))

    response = {
        "results": results,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    _set_cache(batch_key, response)
    return response


# --- Background warmup ---

WARMUP_KEYWORDS = ["AI", "ai video", "ai tool", "LLM"]
WARMUP_TIMEFRAME = "now 1-d"
WARMUP_TRENDING_GEOS = ["US", "ID", "BR"]
WARMUP_INTERVAL = 7200  # 2 hours

_warmup_timer: Optional[threading.Timer] = None


def _warmup_once():
    """Pre-fetch default keyword data so first user request hits cache.

    Order: trending (RSS) → reddit (RSS) → trends (pytrends) — pytrends last
    because it may be rate-limited and we want the other data available ASAP.
    """
    print(f"[warmup] Starting at {datetime.now(timezone.utc).isoformat()}")

    # 1. Warm up Trending Now for default geos (RSS, fast, no rate limit)
    for geo in WARMUP_TRENDING_GEOS:
        try:
            cache_key = f"trending|{geo}"
            if not _get_cached(cache_key):
                rss_url = f"https://trends.google.com/trending/rss?geo={geo}"
                resp = http_requests.get(rss_url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
                resp.raise_for_status()
                root = ET.fromstring(resp.text)
                items: list[dict] = []
                for item in root.iter("item"):
                    title_el = item.find("title")
                    traffic_el = item.find("{https://trends.google.com/trending/rss}approx_traffic")
                    if title_el is not None and title_el.text:
                        name = title_el.text.strip()
                        traffic = traffic_el.text.strip() if traffic_el is not None and traffic_el.text else ""
                        items.append({"name": name, "traffic": traffic, "url": f"https://www.google.com/search?q={quote_plus(name)}&udm=50", "is_tech": False})
                # LLM classification
                if items:
                    names = [it["name"] for it in items]
                    tech_set = _classify_tech_terms(names)
                    for it in items:
                        if it["name"].lower().strip() in tech_set:
                            it["is_tech"] = True
                    tech_items = [it for it in items if it["is_tech"]]
                    other_items = [it for it in items if not it["is_tech"]]
                    items = tech_items + other_items
                result = {"trending": items, "timestamp": datetime.now(timezone.utc).isoformat(), "geo": geo}
                _set_cache(cache_key, result)
                print(f"[warmup] trending {geo}: {len(items)} items")
                time.sleep(0.5)
        except Exception as e:
            print(f"[warmup] trending {geo} error: {e}")

    # 2. Warm up Reddit (RSS, fast, no rate limit)
    try:
        cache_key = "reddit|hot"
        if not _get_cached(cache_key):
            all_posts: list[dict] = []
            seen_titles: set[str] = set()
            for sub in REDDIT_SUB_NAMES:
                posts = _fetch_subreddit_rss(sub, sort="hot", limit=15)
                for p in posts:
                    k = p["title"].lower().strip()
                    if k not in seen_titles:
                        seen_titles.add(k)
                        all_posts.append(p)
                time.sleep(0.3)
            all_posts.sort(key=lambda p: p.get("score", 50), reverse=True)
            kws = _extract_reddit_keywords(all_posts)
            result = {
                "posts": all_posts[:50], "keywords": kws, "subreddits": REDDIT_SUB_NAMES,
                "sort": "hot", "total_posts": len(all_posts),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            _set_cache(cache_key, result)
            print(f"[warmup] reddit: {len(all_posts)} posts")
    except Exception as e:
        print(f"[warmup] reddit error: {e}")

    # 3. Warm up related queries for default keywords (pytrends, may be rate-limited)
    try:
        key = f"trends|{_cache_key(WARMUP_KEYWORDS, WARMUP_TIMEFRAME, '')}"
        if not _get_cached(key):
            all_items: list[dict] = []
            seen_names: set[str] = set()
            for kw in WARMUP_KEYWORDS:
                results = fetch_related_queries(kw, WARMUP_TIMEFRAME, "")
                for item in results:
                    if item["name"].lower() not in seen_names:
                        seen_names.add(item["name"].lower())
                        all_items.append(item)
                time.sleep(2)  # Longer delay to avoid rate limiting
            response = {
                "google": all_items,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "params": {"keywords": WARMUP_KEYWORDS, "timeframe": WARMUP_TIMEFRAME, "geo": ""},
            }
            if all_items:  # Only cache non-empty
                _set_cache(key, response)
                print(f"[warmup] trends: {len(all_items)} items cached")
            else:
                print("[warmup] trends: pytrends returned empty (rate limited?)")
    except Exception as e:
        print(f"[warmup] trends error: {e}")

    print(f"[warmup] Done at {datetime.now(timezone.utc).isoformat()}")


def _warmup_loop():
    """Run warmup and schedule next run."""
    global _warmup_timer
    try:
        _warmup_once()
    except Exception as e:
        print(f"[warmup] Unexpected error: {e}")
    _warmup_timer = threading.Timer(WARMUP_INTERVAL, _warmup_loop)
    _warmup_timer.daemon = True
    _warmup_timer.start()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start warmup on server boot, stop on shutdown."""
    # Startup: run first warmup after a short delay (let server bind first)
    t = threading.Timer(3, _warmup_loop)
    t.daemon = True
    t.start()
    print("[warmup] Scheduled initial warmup in 3s")
    yield
    # Shutdown: cancel pending timer
    if _warmup_timer:
        _warmup_timer.cancel()


app.router.lifespan_context = lifespan


# --- Root Keyword Monitoring ---

# 词根存储（生产环境应使用数据库）
_root_keywords: dict[str, dict] = {}
_root_keywords_lock = threading.Lock()

# 词根扫描队列和状态
_scan_queue: list[str] = []
_scan_progress: dict[str, dict] = {}  # {keyword: {"status": "pending"|"scanning"|"done"|"error", "timestamp": float}}
_scan_lock = threading.Lock()


def _generate_root_id(keyword: str) -> str:
    """生成词根 ID"""
    return hashlib.md5(keyword.lower().encode()).hexdigest()[:12]


@app.get("/api/roots")
def get_root_keywords():
    """获取所有词根"""
    with _root_keywords_lock:
        return {
            "keywords": list(_root_keywords.values()),
            "total": len(_root_keywords),
            "lastUpdated": datetime.now().isoformat()
        }


@app.post("/api/roots")
def add_root_keyword(keyword: str = Query(..., description="关键词")):
    """添加单个词根"""
    if not keyword or not keyword.strip():
        raise HTTPException(status_code=400, detail="关键词不能为空")

    keyword = keyword.strip()
    root_id = _generate_root_id(keyword)

    with _root_keywords_lock:
        if root_id in _root_keywords:
            raise HTTPException(status_code=400, detail="词根已存在")

        _root_keywords[root_id] = {
            "id": root_id,
            "keyword": keyword,
            "priority": "medium",
            "addedAt": datetime.now().isoformat(),
            "lastChecked": None,
            "nextCheckTime": None,
            "checkFrequency": 12,
            "latestData": {
                "trendValue": None,
                "changePercent": None,
                "status": "unknown",
                "relatedKeywords": [],
                "newKeywords": [],
                "timestamp": None
            },
            "history": []
        }

    return {"success": True, "id": root_id}


@app.delete("/api/roots/{keyword}")
def delete_root_keyword(keyword: str):
    """删除词根"""
    keyword_id = _generate_root_id(keyword)

    with _root_keywords_lock:
        if keyword_id not in _root_keywords:
            raise HTTPException(status_code=404, detail="词根不存在")

        del _root_keywords[key_id]

    return {"success": True}


@app.post("/api/roots/import")
def import_root_keywords(keywords: list[str]):
    """批量导入词根"""
    if not keywords:
        raise HTTPException(status_code=400, detail="关键词列表不能为空")

    added = []
    skipped = []

    with _root_keywords_lock:
        for kw in keywords:
            keyword = kw.strip()
            if not keyword:
                continue

            root_id = _generate_root_id(keyword)

            if root_id in _root_keywords:
                skipped.append(keyword)
            else:
                _root_keywords[root_id] = {
                    "id": root_id,
                    "keyword": keyword,
                    "priority": "medium",
                    "addedAt": datetime.now().isoformat(),
                    "lastChecked": None,
                    "nextCheckTime": None,
                    "checkFrequency": 12,
                    "latestData": {
                        "trendValue": None,
                        "changePercent": None,
                        "status": "unknown",
                        "relatedKeywords": [],
                        "newKeywords": [],
                        "timestamp": None
                    },
                    "history": []
                }
                added.append(keyword)

    return {
        "success": True,
        "added": added,
        "skipped": skipped,
        "total": len(added)
    }


@app.post("/api/roots/scan")
def scan_root_keywords(limit: int = Query(5, description="每次扫描数量")):
    """扫描词根（渐进式）"""
    # 获取需要扫描的词根
    with _root_keywords_lock:
        all_keywords = list(_root_keywords.values())

    # 按优先级和上次扫描时间排序
    def sort_key(kw):
        last_checked = kw.get("lastChecked")
        if not last_checked:
            return 0  # 从未扫描的优先
        return -datetime.fromisoformat(last_checked).timestamp()

    all_keywords.sort(key=sort_key)

    # 取前 N 个
    to_scan = all_keywords[:limit]

    if not to_scan:
        return {"scanned": 0, "results": []}

    results = []
    for kw in to_scan:
        try:
            # 使用现有的 interest_over_time 端点获取趋势数据
            keyword = kw["keyword"]
            cache_key = f"roots:interest:{keyword}"

            # 检查缓存
            cached = _get_cached(cache_key)
            if cached:
                trend_value = cached.get("points", [{}])[-1].get("value", 0) if cached.get("points") else 0
                related = cached.get("related", [])
            else:
                # 获取新数据
                _rate_limit_pytrends()
                pytrends = TrendReq(hl="en-US", tz=360, timeout=(10, 25))
                pytrends.build_payload([keyword], cat=0, timeframe="now 7-d", geo="", gprop="")
                df = pytrends.interest_over_time()

                if df is not None and not df.empty and keyword in df.columns:
                    points = []
                    for ts, row in df.iterrows():
                        points.append({"timestamp": ts.isoformat(), "value": int(row[keyword])})
                    trend_value = points[-1]["value"] if points else 0
                else:
                    trend_value = 0
                    points = []

                # 获取相关词
                related_queries = pytrends.related_queries()
                related = []
                if keyword in related_queries and related_queries[keyword]:
                    rq = related_queries[keyword]
                    if rq.get('top') is not None:
                        for _, row in rq['top'].head(10).iterrows():
                            related.append(row['query'])

                # 保存缓存
                _set_cache(cache_key, {"points": points, "related": related})

            # 计算变化百分比
            change_percent = None
            if kw.get("latestData", {}).get("trendValue") is not None:
                old_value = kw["latestData"]["trendValue"]
                if old_value > 0:
                    change_percent = ((trend_value - old_value) / old_value) * 100

            # 确定状态
            if change_percent is not None:
                if change_percent > 50:
                    status = "surging"
                elif change_percent > 10:
                    status = "rising"
                elif change_percent < -10:
                    status = "declining"
                else:
                    status = "stable"
            else:
                status = "unknown"

            # 更新词根数据
            root_id = kw["id"]
            with _root_keywords_lock:
                if root_id in _root_keywords:
                    old_related = set(kw.get("latestData", {}).get("relatedKeywords", []))
                    new_related = set(related)
                    new_keywords = list(new_related - old_related)

                    _root_keywords[root_id]["lastChecked"] = datetime.now().isoformat()
                    _root_keywords[root_id]["latestData"] = {
                        "trendValue": trend_value,
                        "changePercent": round(change_percent, 2) if change_percent is not None else None,
                        "status": status,
                        "relatedKeywords": related[:20],  # 只保存前20个
                        "newKeywords": new_keywords[:5],    # 只保存前5个新词
                        "timestamp": datetime.now().isoformat()
                    }

                    # 保存历史快照
                    today = datetime.now().strftime("%Y-%m-%d")
                    _root_keywords[root_id]["history"].append({
                        "date": today,
                        "trendValue": trend_value,
                        "relatedKeywords": related[:20],
                        "topRising": new_keywords[:5],
                        "timestamp": datetime.now().isoformat()
                    })

            results.append({
                "keyword": keyword,
                "trendValue": trend_value,
                "changePercent": change_percent,
                "status": status
            })

        except Exception as e:
            print(f"[roots] Error scanning '{keyword}': {e}")
            results.append({
                "keyword": keyword,
                "error": str(e)
            })

    return {
        "scanned": len(results),
        "results": results
    }


@app.get("/health")
def health():
    cache_stats = {}
    now = time.time()
    for key, entry in _cache.items():
        age = round(now - entry["timestamp"])
        ttl = _ttl_for(key)
        cache_stats[key[:40]] = {"age_s": age, "ttl_s": ttl, "fresh": age < ttl}
    return {"status": "ok", "cache_entries": len(_cache), "cache": cache_stats}
