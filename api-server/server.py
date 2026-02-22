"""
pytrends API Server
Provides Google Trends related queries via FastAPI.
Board (Vercel) proxies requests here.
"""

import json
import os
import time
import hashlib
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote_plus

import requests as http_requests
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pytrends.request import TrendReq

OPENROUTER_API_KEY = os.environ.get(
    "OPENROUTER_API_KEY",
    "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",
)
LLM_MODEL = "z-ai/glm-4.5-air:free"

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

    for geo in geo_list:
        try:
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

    response = {
        "keyword": keyword,
        "found_in": found_in,
        "total_geos": len(geo_list),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
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


@app.get("/health")
def health():
    return {"status": "ok"}
