"""Trend intelligence persistence, deduplication, and brief generation."""

from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Callable
from urllib.parse import urlsplit, urlunsplit
from zoneinfo import ZoneInfo

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # Keep the legacy server bootable until dependency install.
    psycopg = None
    dict_row = None

SHANGHAI = ZoneInfo("Asia/Shanghai")
DATABASE_URL = os.environ.get("INTELLIGENCE_DATABASE_URL", "")


def enabled() -> bool:
    return bool(DATABASE_URL and psycopg)


def connect():
    if not enabled():
        raise RuntimeError("INTELLIGENCE_DATABASE_URL or psycopg is not configured")
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def latest_pipeline_at() -> datetime | None:
    """Return the last completed pipeline time, falling back to the latest brief."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT COALESCE(
                 (SELECT max(finished_at) FROM intelligence_runs WHERE status = 'success'),
                 (SELECT max(generated_at) FROM intelligence_briefs)
               ) AS latest"""
        )
        return cur.fetchone()["latest"]


def start_run() -> str:
    with connect() as conn, conn.cursor() as cur:
        cur.execute("INSERT INTO intelligence_runs DEFAULT VALUES RETURNING id")
        return str(cur.fetchone()["id"])


def finish_run(run_id: str, status: str, fetched: int = 0, new: int = 0,
               selected: int = 0, error: str | None = None) -> None:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            """UPDATE intelligence_runs SET finished_at=now(), status=%s,
                      fetched_count=%s, new_count=%s, selected_count=%s, error=%s
               WHERE id=%s""",
            (status, fetched, new, selected, error, run_id),
        )


def normalize_url(value: str) -> str:
    if not value:
        return ""
    try:
        p = urlsplit(value.strip())
        host = p.netloc.lower().removeprefix("www.")
        path = p.path.rstrip("/")
        return urlunsplit((p.scheme.lower() or "https", host, path, "", ""))
    except Exception:
        return value.strip()


def normalize_text(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"https?://\S+", "", value)
    value = re.sub(r"[^\w\u4e00-\u9fff]+", " ", value)
    return " ".join(value.split())


def fingerprint(title: str, url: str) -> str:
    basis = normalize_url(url) or normalize_text(title)
    return hashlib.sha256(basis.encode()).hexdigest()


def _external_id(source: str, item: dict[str, Any], title: str, url: str) -> str:
    explicit = item.get("id") or item.get("modelId") or item.get("name")
    return str(explicit or fingerprint(title, url))


def _published(item: dict[str, Any]) -> Any:
    value = item.get("published") or item.get("createdAt") or item.get("time") or None
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, timezone.utc)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return value if isinstance(value, datetime) else None


def _score(item: dict[str, Any]) -> float:
    for key in ("score", "points", "votesCount", "downloads", "stars", "ups", "traffic"):
        val = item.get(key)
        if isinstance(val, (int, float)):
            return float(val)
        if isinstance(val, str):
            digits = re.sub(r"[^0-9.]", "", val)
            if digits:
                try:
                    return float(digits)
                except ValueError:
                    pass
    return 0


def flatten_cache(cache: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """Normalize the current board cache into a stable source-item format."""
    specs = {
        "reddit|hot": ("reddit", "posts", "title", "url", "discussion"),
        "hackernews|top": ("hackernews", "posts", "title", "url", "discussion"),
        "technews|latest": ("technews", "articles", "title", "url", "news"),
        "ph|daily": ("producthunt", "products", "name", "url", "tool"),
        "huggingface": ("huggingface", "models", "modelId", "url", "tool"),
        "indiehackers": ("indiehackers", "posts", "title", "url", "discussion"),
    }
    rows: list[dict[str, Any]] = []
    for key, (source, list_key, title_key, url_key, item_type) in specs.items():
        data = cache.get(key) or {}
        for item in data.get(list_key, []):
            title = str(item.get(title_key) or "").strip()
            if not title:
                continue
            url = normalize_url(str(item.get(url_key) or ""))
            rows.append({
                "source": source,
                "external_id": _external_id(source, item, title, url),
                "title": title,
                "url": url,
                "published_at": _published(item),
                "score": _score(item),
                "item_type": item_type,
                "description": str(item.get("summary") or item.get("tagline") or "")[:1000],
                "metadata": item,
                "fingerprint": fingerprint(title, url),
            })

    # Trending cache keys vary by geo; retain each term and its geography.
    for key, data in cache.items():
        if not key.startswith("trending|"):
            continue
        geo = key.split("|", 1)[1]
        for item in data.get("trending", []):
            title = str(item.get("name") or "").strip()
            if not title:
                continue
            url = normalize_url(str(item.get("url") or ""))
            meta = {**item, "geo": geo}
            rows.append({
                "source": "google_trending",
                "external_id": f"{geo}:{normalize_text(title)}",
                "title": title,
                "url": url,
                "published_at": data.get("timestamp"),
                "score": _score(item),
                "item_type": "term",
                "description": "",
                "metadata": meta,
                "fingerprint": fingerprint(title, ""),
            })
    return rows


def ingest(rows: list[dict[str, Any]]) -> dict[str, int]:
    if not rows:
        return {"fetched": 0, "new": 0}
    inserted = 0
    with connect() as conn, conn.cursor() as cur:
        for row in rows:
            cur.execute(
                """
                INSERT INTO intelligence_source_items
                  (source, external_id, title, url, published_at, score, item_type,
                   description, metadata, fingerprint)
                VALUES (%(source)s, %(external_id)s, %(title)s, %(url)s, %(published_at)s,
                  %(score)s, %(item_type)s, %(description)s, %(metadata)s::jsonb, %(fingerprint)s)
                ON CONFLICT (source, external_id) DO UPDATE SET
                  last_seen_at = now(), seen_count = intelligence_source_items.seen_count + 1,
                  score = EXCLUDED.score, description = EXCLUDED.description,
                  metadata = EXCLUDED.metadata, url = EXCLUDED.url
                RETURNING (xmax = 0) AS was_inserted, id
                """,
                {**row, "metadata": json.dumps(row["metadata"], ensure_ascii=False, default=str)},
            )
            result = cur.fetchone()
            inserted += int(bool(result["was_inserted"]))
            item_id = result["id"]
            topic_key = normalize_text(row["title"])[:240]
            if not topic_key:
                continue
            cur.execute(
                """
                INSERT INTO intelligence_topics
                  (canonical_name, normalized_name, topic_type, heat, first_seen_at, last_seen_at)
                VALUES (%s, %s, %s, %s, now(), now())
                ON CONFLICT (normalized_name) DO UPDATE SET
                  last_seen_at = now(), heat = GREATEST(intelligence_topics.heat, EXCLUDED.heat)
                RETURNING id
                """,
                (row["title"][:300], topic_key, row["item_type"], row["score"]),
            )
            topic_id = cur.fetchone()["id"]
            cur.execute(
                """INSERT INTO intelligence_topic_items(topic_id, item_id)
                   VALUES (%s, %s) ON CONFLICT DO NOTHING""",
                (topic_id, item_id),
            )
        cur.execute(
            """
            UPDATE intelligence_topics t SET
              item_count = s.item_count, source_count = s.source_count,
              first_seen_at = s.first_seen_at, last_seen_at = s.last_seen_at
            FROM (
              SELECT ti.topic_id, count(*) item_count, count(DISTINCT i.source) source_count,
                     min(i.first_seen_at) first_seen_at, max(i.last_seen_at) last_seen_at
              FROM intelligence_topic_items ti JOIN intelligence_source_items i ON i.id=ti.item_id
              GROUP BY ti.topic_id
            ) s WHERE t.id=s.topic_id
            """
        )
    return {"fetched": len(rows), "new": inserted}


def today_range(now: datetime | None = None) -> tuple[datetime, datetime]:
    local = (now or datetime.now(timezone.utc)).astimezone(SHANGHAI)
    start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return start.astimezone(timezone.utc), (start + timedelta(days=1)).astimezone(timezone.utc)


def selected_records(start: datetime, end: datetime, limit: int = 500) -> list[dict[str, Any]]:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT t.id topic_id, t.canonical_name topic, t.topic_type, t.heat,
                   t.source_count, t.item_count, t.first_seen_at, t.last_seen_at,
                   COALESCE(jsonb_agg(jsonb_build_object(
                     'id', i.id, 'source', i.source, 'title', i.title, 'url', i.url,
                     'published_at', i.published_at, 'score', i.score,
                     'description', i.description
                   ) ORDER BY i.score DESC) FILTER (WHERE i.id IS NOT NULL), '[]') AS evidence
            FROM intelligence_topics t
            JOIN intelligence_topic_items ti ON ti.topic_id=t.id
            JOIN intelligence_source_items i ON i.id=ti.item_id
            WHERE i.included AND i.first_seen_at >= %s AND i.first_seen_at < %s
            GROUP BY t.id
            ORDER BY t.source_count DESC, t.heat DESC, t.last_seen_at DESC
            LIMIT %s
            """,
            (start, end, limit),
        )
        return cur.fetchall()


def raw_records(start: datetime, end: datetime, limit: int = 1000) -> list[dict[str, Any]]:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT id, source, external_id, title, url, published_at, first_seen_at,
                      last_seen_at, seen_count, score, item_type, description, metadata,
                      included, filter_reason
               FROM intelligence_source_items
               WHERE first_seen_at >= %s AND first_seen_at < %s
               ORDER BY first_seen_at DESC LIMIT %s""",
            (start, end, limit),
        )
        return cur.fetchall()


def _fallback_brief(records: list[dict[str, Any]]) -> dict[str, Any]:
    def take(kind: str, count: int = 8):
        return [
            {"title": r["topic"], "type": r["topic_type"], "heat": r["heat"],
             "sources": sorted({e["source"] for e in r["evidence"]}),
             "evidence": r["evidence"][:3]}
            for r in records if kind == "all" or r["topic_type"] == kind
        ][:count]
    return {
        "summary": "今日精选趋势已更新；AI 归纳不可用，以下为按来源数与热度排序的结果。",
        "new_terms": take("term"), "new_tools": take("tool"),
        "new_needs": [], "problems": [], "opportunities": [],
        "highlights": take("all", 10),
    }


def generate_today_brief(call_llm: Callable[..., str | None] | None = None) -> dict[str, Any]:
    start, end = today_range()
    records = selected_records(start, end)
    content = _fallback_brief(records)
    if call_llm and records:
        compact = [{"id": f"T{i + 1:03d}", "topic": r["topic"], "type": r["topic_type"], "heat": r["heat"],
                    "sources": list({e["source"] for e in r["evidence"]}),
                    "titles": [e["title"] for e in r["evidence"][:4]]} for i, r in enumerate(records[:80])]
        prompt = (
            "你是科技趋势情报分析员。分析下面已经去重的跨来源数据，只输出合法 JSON。"
            "根对象必须包含中文 summary，以及 new_terms、new_needs、new_tools、problems、opportunities、highlights 六个数组。"
            "每个数组项目只能包含 title、insight（均为简洁中文）和 evidence_ids。"
            "evidence_ids 必须且只能引用输入中的 T 编号；没有证据就不要输出。每类最多 8 条。"
            "不要把普通体育娱乐热搜当科技新词，不要臆测，不要复述本指令。输入：\n" +
            json.dumps(compact, ensure_ascii=False)
        )
        result = call_llm(prompt, max_tokens=3500, timeout=90)
        if result:
            try:
                candidate = json.loads(result[result.find("{"):result.rfind("}") + 1])
                record_by_id = {row["id"]: records[i] for i, row in enumerate(compact)}
                categories = ("new_terms", "new_needs", "new_tools", "problems", "opportunities", "highlights")
                cleaned: dict[str, Any] = {"summary": str(candidate.get("summary") or "").strip()[:500]}
                for category in categories:
                    cleaned[category] = []
                    for item in candidate.get(category, [])[:8]:
                        ids = [x for x in item.get("evidence_ids", []) if x in record_by_id][:5]
                        if not ids or not item.get("title") or not item.get("insight"):
                            continue
                        evidence_topics = [record_by_id[x]["topic"] for x in ids]
                        evidence = []
                        for x in ids:
                            evidence.extend(record_by_id[x]["evidence"][:2])
                        cleaned[category].append({
                            "title": str(item["title"])[:200], "insight": str(item["insight"])[:500],
                            "evidence_topics": evidence_topics, "evidence": evidence[:6],
                        })
                # Reject malformed/degenerate model output instead of persisting AI noise.
                if len(cleaned["summary"]) >= 20 and sum(len(cleaned[c]) for c in categories) >= 3:
                    content = cleaned
            except Exception:
                pass
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO intelligence_briefs
              (period_start, period_end, content, source_item_count, topic_count)
            VALUES (%s, %s, %s::jsonb, %s, %s)
            ON CONFLICT (period_start, period_end) DO UPDATE SET
              content=EXCLUDED.content, source_item_count=EXCLUDED.source_item_count,
              topic_count=EXCLUDED.topic_count, version=intelligence_briefs.version+1,
              generated_at=now()
            """,
            (start, end, json.dumps(content, ensure_ascii=False, default=str),
             sum(r["item_count"] for r in records), len(records)),
        )
    return {"period": {"from": start, "to": end, "timezone": "Asia/Shanghai"},
            "content": content, "topic_count": len(records)}
