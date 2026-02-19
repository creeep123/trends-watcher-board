"""
pytrends API Server
Provides Google Trends related queries via FastAPI.
Board (Vercel) proxies requests here.
"""

import time
import hashlib
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote_plus

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pytrends.request import TrendReq

app = FastAPI(title="Trends Watcher API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# In-memory cache: key -> {data, timestamp}
_cache: dict[str, dict] = {}
CACHE_TTL = 1800  # 30 minutes


def _cache_key(keywords: list[str], timeframe: str, geo: str) -> str:
    raw = f"{','.join(sorted(keywords))}|{timeframe}|{geo}"
    return hashlib.md5(raw.encode()).hexdigest()


def _get_cached(key: str) -> Optional[dict]:
    entry = _cache.get(key)
    if not entry:
        return None
    if time.time() - entry["timestamp"] > CACHE_TTL:
        del _cache[key]
        return None
    return entry["data"]


def _set_cache(key: str, data: dict) -> None:
    _cache[key] = {"data": data, "timestamp": time.time()}


def fetch_related_queries(keyword: str, timeframe: str, geo: str) -> list[dict]:
    """Fetch rising + top related queries for a single keyword."""
    items = []

    try:
        pytrends = TrendReq(hl="en-US", tz=360, timeout=(10, 25))
        pytrends.build_payload([keyword], cat=0, timeframe=timeframe, geo=geo, gprop="")
        related = pytrends.related_queries()

        if keyword not in related or related[keyword] is None:
            return items

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

    except Exception as e:
        print(f"[pytrends] Error for '{keyword}': {e}")

    return items


@app.get("/api/trends")
def get_trends(
    keywords: str = Query(default="AI,ai video,ai tool,LLM", description="Comma-separated keyword roots"),
    timeframe: str = Query(default="now 1-d", description="pytrends timeframe"),
    geo: str = Query(default="", description="Country code, empty = global"),
):
    keyword_list = [k.strip() for k in keywords.split(",") if k.strip()]
    if not keyword_list:
        keyword_list = ["AI"]

    # Check cache
    key = _cache_key(keyword_list, timeframe, geo)
    cached = _get_cached(key)
    if cached:
        return cached

    # Fetch for each keyword (sequential, 1s delay between)
    all_items: list[dict] = []
    seen_names: set[str] = set()

    for kw in keyword_list:
        results = fetch_related_queries(kw, timeframe, geo)
        for item in results:
            if item["name"].lower() not in seen_names:
                seen_names.add(item["name"].lower())
                all_items.append(item)
        # Rate limit between keywords
        if kw != keyword_list[-1]:
            time.sleep(1)

    response = {
        "google": all_items,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "params": {
            "keywords": keyword_list,
            "timeframe": timeframe,
            "geo": geo,
        },
    }

    _set_cache(key, response)
    return response


@app.get("/health")
def health():
    return {"status": "ok"}
