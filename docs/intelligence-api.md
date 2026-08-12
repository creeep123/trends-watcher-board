# Trends Intelligence API

The service exposes three data layers over authenticated HTTP:

1. `raw`: normalized but unfiltered source items.
2. `records`: selected and deduplicated topics with source evidence.
3. `brief`: saved cross-source AI intelligence. Reading it never triggers an AI call.

## Server configuration

```bash
INTELLIGENCE_DATABASE_URL=postgresql://...
INTELLIGENCE_API_KEYS=twb_key_one,twb_key_two
```

Install `api-server/requirements.txt`, apply `intelligence/migrations/0001_init.sql`, then restart the FastAPI service. One unified pipeline runs every 12 hours, writes incrementally to the intelligence database, refreshes the persistent dashboard cache, and makes one reusable cross-source brief.

The old hourly warmup has been removed. Service restarts read the last successful run from Neon in a background bootstrap thread and preserve the remaining schedule instead of blocking startup or immediately repeating a costly refresh. Scheduled source requests skip per-source LLM extraction while retaining the previous keyword chips; individual post summaries remain on demand. A process lock prevents scheduled and manual refreshes from overlapping, and `/health` exposes the current/next run state.

## Authentication and examples

```bash
curl -H "Authorization: Bearer $TRENDS_INTELLIGENCE_API_KEY" \
  "$TRENDS_INTELLIGENCE_API_URL/api/v1/intelligence/brief?period=today"

curl -H "Authorization: Bearer $TRENDS_INTELLIGENCE_API_KEY" \
  "$TRENDS_INTELLIGENCE_API_URL/api/v1/intelligence/records?period=last_7_days&limit=100"

curl -H "Authorization: Bearer $TRENDS_INTELLIGENCE_API_KEY" \
  "$TRENDS_INTELLIGENCE_API_URL/api/v1/intelligence/raw?from=2026-08-01&to=2026-08-08"
```

Date boundaries use `Asia/Shanghai`. `previous_week` means the previous Monday through Sunday; `last_7_days` includes today.

## Skill

Copy `skills/trends-intelligence` into the agent's skill directory, set `TRENDS_INTELLIGENCE_API_URL` and `TRENDS_INTELLIGENCE_API_KEY`, then ask “看一下今日趋势情报” or “给我前一周去重后的原始数据”.
