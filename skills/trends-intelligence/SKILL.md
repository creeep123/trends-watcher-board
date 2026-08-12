---
name: trends-intelligence
description: Query the Trends Watcher intelligence API for daily or weekly briefs, deduplicated selected records, or unfiltered source records. Use when users ask about 今日趋势情报、过去一周趋势、新词、新需求、新工具、待解决问题、趋势的精选原始数据、未经筛选的源数据, or request trend evidence in JSON.
---

# Trends Intelligence

Use `scripts/trends.py`; do not scrape the dashboard or re-run AI analysis.

## Setup

Require these environment variables:

```bash
export TRENDS_INTELLIGENCE_API_URL="https://your-api.example.com"
export TRENDS_INTELLIGENCE_API_KEY="twb_..."
```

## Map intent to data layer

- “趋势情报/简报” → `brief`
- “原始数据/整理后的数据/精选数据/证据” → `records` by default
- “完全原始/未经筛选/所有抓取数据” → `raw`
- “服务状态/有哪些数据” → `status`

Never treat `raw` as the default meaning of 原始数据. The user explicitly prefers deduplicated and selected records.

## Query

```bash
python3 scripts/trends.py brief --period today
python3 scripts/trends.py brief --period last_7_days
python3 scripts/trends.py records --period today --limit 100
python3 scripts/trends.py raw --from 2026-08-01 --to 2026-08-08 --limit 500
```

Supported periods: `today`, `last_7_days`, `previous_week`. Dates use `YYYY-MM-DD` and Asia/Shanghai boundaries.

Return a concise synthesis for `brief`. For `records` or `raw`, preserve source URLs and distinguish API evidence from your inference. If the user requests JSON, pass `--json` and return it without reinterpretation.

Read [references/api.md](references/api.md) only when endpoint fields or failure handling are needed.
