# PWA Push Notification Design

## Summary

Add PWA support and daily Web Push notifications to Trends Watcher Board. Users can subscribe to receive morning and evening trend summaries directly on their Android phones via Chrome, even when the site is not open.

## Motivation

The site currently has no PWA configuration. Adding push notifications lets users stay informed about trending topics without actively checking the dashboard.

## Architecture

```
[Browser] --subscribe--> [Vercel /api/push/subscribe] --> [Supabase twb_push_subscriptions]
[Browser] <--notification-- [Python Cron push_worker.py] --read--> [Supabase]
                                    |
                                    +--fetch--> [Python /api/trends, /api/trending, /api/hackernews]
```

## Part 1: PWA Foundation

### Serwist Integration

Add `@serwist/next` to handle service worker generation and registration automatically within the Next.js App Router build pipeline.

### manifest.json

- `name`: "Trends Watcher Board"
- `short_name`: "Trends Watcher"
- `start_url`: "/"
- `display`: "standalone"
- `theme_color`: "#1a1a2e" (match existing dark UI)
- `background_color`: "#0f0f1a"
- Icons: reuse existing `apple-icon.png` (180x180) and `icon.svg`

### layout.tsx Meta Tags

Add `theme-color`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, and manifest `<link>` tag.

## Part 2: Push Subscription Management

### VAPID Keys

Generate using `web-push` library. Public key embedded in frontend, private key stored as environment variable on the Python API server (`VAPID_PRIVATE_KEY`) and also on Vercel (`VAPID_PUBLIC_KEY`).

### Subscription Flow

1. Page loads → Service Worker checks existing subscription via `pushManager.getSubscription()`
2. User clicks "Enable Push" button (placed in top toolbar)
3. Frontend calls `pushManager.subscribe()` with VAPID public key
4. Subscription object sent to Python backend via `POST /api/push/subscribe`
5. Backend stores in Supabase `twb_push_subscriptions` table

### Supabase Table

```sql
CREATE TABLE twb_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL UNIQUE,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Backend API (Python)

- `POST /api/push/subscribe` — store subscription
- `DELETE /api/push/subscribe` — remove subscription (body contains endpoint)
- Proxied through Next.js `/api/push/subscribe` route to Python backend

## Part 3: Scheduled Push

### Push Worker Script

New file `api-server/push_worker.py`:

1. Fetches trend data from Python API endpoints:
   - `/api/trends` (Google Trends related queries)
   - `/api/trending` (Google Trends daily trending)
   - `/api/hackernews` (HN top posts)
2. Assembles summary message (top 5 items per section)
3. Reads all subscriptions from Supabase
4. Sends Web Push notification to each subscriber using `pywebpush` library
5. Removes failed/expired subscriptions (410 responses)

### Notification Payload

```json
{
  "title": "Trends Watcher Daily Brief",
  "body": "Top: AI video, LLM, maker | New: Anthropic (+320%)",
  "icon": "/icon.svg",
  "url": "https://trends-watcher-board.vercel.app/"
}
```

### Service Worker Notification Handler

Listen for `push` event in the service worker, display notification via `self.registration.showNotification()`. On click, open the site URL.

### Cron Schedule

System crontab on 43.165.126.121:

```
0 8 * * * cd /home/moses/claude_workspace/trends-watcher-board/api-server && /home/moses/claude_workspace/trends-watcher-board/api-server/venv/bin/python3 push_worker.py >> /tmp/push-morning.log 2>&1
0 20 * * * cd /home/moses/claude_workspace/trends-watcher-board/api-server && /home/moses/claude_workspace/trends-watcher-board/api-server/venv/bin/python3 push_worker.py >> /tmp/push-evening.log 2>&1
```

## Dependencies

### Frontend (package.json)

- `@serwist/next` — PWA service worker generation for Next.js

### Backend (requirements.txt)

- `pywebpush` — Python Web Push library

## Files Changed

| File | Change |
|------|--------|
| `next.config.ts` | Add Serwist plugin config |
| `app/layout.tsx` | Add PWA meta tags and manifest link |
| `app/sw.ts` | New — Serwist service worker entry |
| `public/manifest.json` | New — PWA manifest |
| `app/api/push/subscribe/route.ts` | New — proxy subscribe/unsubscribe to Python backend |
| `lib/usePushSubscription.ts` | New — React hook for push subscription management |
| `app/page.tsx` | Add "Enable Push" toggle button in toolbar |
| `api-server/server.py` | Add `/api/push/subscribe` and `/api/push/unsubscribe` endpoints |
| `api-server/push_worker.py` | New — cron job script for sending push notifications |
| `supabase/migrations/` | New migration for `twb_push_subscriptions` table |
| `.env.local` / Vercel env | Add `VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_VAPID_KEY` |
| Python server env | Add `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY` |

## Out of Scope

- iOS push (Safari has limited Web Push support, requires Apple developer account)
- User-customizable push schedule
- Keyword-specific alert push
- Push notification preferences dashboard
