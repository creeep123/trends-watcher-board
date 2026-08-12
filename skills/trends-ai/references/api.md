# API reference

All routes require `Authorization: Bearer <key>`.

| Route | Meaning |
|---|---|
| `GET /api/v1/intelligence/status` | Health, data range, latest brief |
| `GET /api/v1/intelligence/brief` | Saved AI brief; queries do not invoke AI |
| `GET /api/v1/intelligence/records` | Deduplicated selected topics with source evidence |
| `GET /api/v1/intelligence/raw` | Unfiltered normalized source items |

Query parameters:

- `period=today|last_7_days|previous_week`
- or `from=YYYY-MM-DD&to=YYYY-MM-DD` (maximum 90 days)
- `limit=1..500` for records; `1..2000` for raw

`brief.status=pending` means collection has not generated a saved brief for that range. Report that honestly and optionally query `records`; never fabricate a brief.

HTTP errors: `401` missing key, `403` invalid key, `503` server/database configuration missing.
