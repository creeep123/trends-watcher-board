# PWA Push Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PWA support and daily Web Push notifications so users receive morning/evening trend summaries on Android.

**Architecture:** `@serwist/next` generates the service worker at build time. Frontend handles subscription via a React hook. Python backend stores subscriptions in Supabase and runs a cron-based push worker twice daily.

**Tech Stack:** `@serwist/next`, `pywebpush`, Supabase, system cron

---

### Task 1: Supabase Migration — push_subscriptions Table

**Files:**
- Create: `supabase/migrations/20260401000000_create_push_subscriptions.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Push notification subscriptions
CREATE TABLE IF NOT EXISTS twb_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL UNIQUE,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

```

> **Note:** No explicit index needed — the `UNIQUE` constraint on `endpoint` automatically creates a unique index. No RLS policy needed — the Python backend uses `SUPABASE_SERVICE_ROLE_KEY` which bypasses RLS.

- [ ] **Step 2: Apply migration via Supabase Dashboard or CLI**

Run in Supabase SQL Editor or: `supabase db push`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260401000000_create_push_subscriptions.sql
git commit -m "feat: add push subscriptions table migration"
```

---

### Task 2: Generate VAPID Keys

**Files:**
- Modify: `.env.example`
- Modify: `.env.local` (local dev)
- Modify: `api-server/.env` (Python server, create if missing)

- [ ] **Step 1: Install web-push CLI tool**

```bash
npx web-push generate-vapid-keys
```

Expected output: two keys (public and private).

- [ ] **Step 2: Save keys in `.env.local`**

```
NEXT_PUBLIC_VAPID_KEY=<public_key_from_step1>
VAPID_PRIVATE_KEY=<private_key_from_step1>
```

Also set these in Vercel dashboard environment variables.

- [ ] **Step 3: Save keys in `api-server/.env`**

```
VAPID_PUBLIC_KEY=<public_key_from_step1>
VAPID_PRIVATE_KEY=<private_key_from_step1>
VAPID_SUBJECT=mailto:your@email.com
```

- [ ] **Step 4: Update `.env.example`**

```
# Web Push (VAPID)
NEXT_PUBLIC_VAPID_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key

# Push Worker (Python API server)
VAPID_SUBJECT=mailto:your@email.com
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

- [ ] **Step 5: Verify `api-server/.env` is gitignored**

```bash
grep 'api-server/.env' .gitignore || echo 'api-server/.env' >> .gitignore
```

- [ ] **Step 6: Restart Python API to pick up env vars**

```bash
sudo systemctl restart pytrends-api
```

- [ ] **Step 6: Commit**

```bash
git add .env.example
git commit -m "feat: add VAPID key env vars to .env.example"
```

---

### Task 3: PWA Foundation — Serwist + Manifest + Meta Tags

**Files:**
- Modify: `package.json`
- Modify: `next.config.ts`
- Create: `public/manifest.json`
- Create: `app/sw.ts`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Install Serwist dependencies**

```bash
npm install @serwist/next@latest serwist@latest
```

- [ ] **Step 2: Create `public/manifest.json`**

```json
{
  "name": "Trends Watcher Board",
  "short_name": "Trends Watcher",
  "description": "AI trends monitoring dashboard",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f0f1a",
  "theme_color": "#1a1a2e",
  "icons": [
    {
      "src": "/apple-icon.png",
      "sizes": "180x180",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml"
    }
  ]
}
```

- [ ] **Step 3: Create `app/sw.ts` (Serwist service worker entry)**

```typescript
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry } from "serwist";
import { Serwist } from "serwist";

declare const self: ServiceWorkerGlobalScope;
export type {};

const precacheEntries: PrecacheEntry[] = self.__SW_MANIFEST;
const serwist = new Serwist({
  precacheEntries,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEvent("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Trends Watcher", {
      body: data.body || "New trends update",
      icon: data.icon || "/icon.svg",
      data: { url: data.url || "/" },
    })
  );
});

serwist.addEvent("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(self.clients.openWindow(url));
});

serwist.addEvent("install", (event) => {
  event.waitUntil(serwist.precacheAndRoute(precacheEntries));
});
```

- [ ] **Step 4: Update `next.config.ts` with Serwist plugin**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

// Wrapped in withSerwist for production PWA support
const withSerwist = (import("@serwist/next").then(({ withSerwist }) => withSerwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  gwSrc: "app/gw.ts",
})) as any) as (config: NextConfig) => NextConfig;

export default withSerwist(nextConfig);
```

> **Note:** If the dynamic import pattern causes issues, use the wrapper approach from `@serwist/next` docs for Next.js 15:
> ```typescript
> import withSerwistInit from "@serwist/next";
> const withSerwist = withSerwistInit({
>   swSrc: "app/sw.ts",
>   swDest: "public/sw.js",
>   gwSrc: "app/gw.ts",
> });
> export default withSerwist(nextConfig);
> ```

- [ ] **Step 5: Create `app/gw.ts` (Serwist gateway, required by @serwist/next)**

```typescript
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry } from "serwist";
import { Serwist } from "serwist";

declare const self: ServiceWorkerGlobalScope;
export type {};

const precacheEntries: PrecacheEntry[] = self.__SW_MANIFEST;
const serwist = new Serwist({
  precacheEntries,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEvent("install", () => serwist.precacheAndRoute(precacheEntries));
```

> **Note:** `gw.ts` and `sw.ts` can share the same content. The gateway file is for development mode (dev server), while `sw.ts` is for production builds. Both must exist.

- [ ] **Step 6: Update `app/layout.tsx` with PWA meta tags**

Add to the existing `metadata` export:

```typescript
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#1a1a2e",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Trends Watcher Board",
  description: "AI trends monitoring dashboard - Google Trends & GitHub Trending",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Trends Watcher",
  },
};
```

- [ ] **Step 7: Verify PWA works locally**

```bash
npm run build && npm start
# Open http://localhost:3000 in Chrome DevTools > Application > Manifest
# Verify manifest loads and service worker registers
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json next.config.ts public/manifest.json app/sw.ts app/gw.ts app/layout.tsx
git commit -m "feat: add PWA foundation with Serwist, manifest, and meta tags"
```

---

### Task 4: Push Subscription React Hook

**Files:**
- Create: `lib/usePushSubscription.ts`

- [ ] **Step 1: Create the hook**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_KEY!;

interface PushState {
  supported: boolean;
  subscribed: boolean;
  loading: boolean;
  error: string | null;
}

export function usePushSubscription() {
  const [state, setState] = useState<PushState>({
    supported: false,
    subscribed: false,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window;
    setState((s) => ({ ...s, supported, loading: false }));

    if (!supported) return;

    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setState((s) => ({ ...s, subscribed: !!sub, loading: false }));
    });
  }, []);

  const subscribe = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: sub.toJSON().keys,
          userAgent: navigator.userAgent,
        }),
      });

      if (!res.ok) throw new Error("Failed to register subscription");

      setState({ supported: true, subscribed: true, loading: false, error: null });
    } catch (err: any) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      }
      setState({ supported: true, subscribed: false, loading: false, error: null });
    } catch (err: any) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, []);

  return { ...state, subscribe, unsubscribe };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/usePushSubscription.ts
git commit -m "feat: add usePushSubscription hook"
```

---

### Task 5: Frontend Push API Route (Proxy to Python)

**Files:**
- Create: `app/api/push/subscribe/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.PYTRENDS_API_URL || "http://43.165.126.121";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await fetch(`${API_BASE}/api/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await fetch(`${API_BASE}/api/push/subscribe`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Failed to unsubscribe" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/push/subscribe/route.ts
git commit -m "feat: add push subscribe API route proxy"
```

---

### Task 6: Push Toggle Button in Page Header

**Files:**
- Modify: `app/page.tsx` (imports + header area around line 900-935)

- [ ] **Step 1: Add import at top of `app/page.tsx`**

Add after the existing imports (around line 20):

```typescript
import { usePushSubscription } from "@/lib/usePushSubscription";
```

- [ ] **Step 2: Add hook call inside component function**

After existing `useState` declarations (around line 240):

```typescript
const push = usePushSubscription();
```

- [ ] **Step 3: Add push toggle button in header**

In the header `title row` div (around line 909-935), after the `批量 GT` link (`</a>` at line 922), add:

```tsx
{push.supported && (
  <button
    onClick={push.subscribed ? push.unsubscribe : push.subscribe}
    disabled={push.loading}
    className="rounded-md px-2 py-1 text-xs font-medium transition-colors hover:opacity-80"
    style={{
      background: push.subscribed ? "rgba(16, 185, 129, 0.15)" : "var(--bg-secondary)",
      color: push.subscribed ? "#34d399" : "var(--text-secondary)",
    }}
    title={push.subscribed ? "关闭推送" : "开启推送通知"}
  >
    {push.loading ? "..." : push.subscribed ? "🔔 已订阅" : "🔕 推送"}
  </button>
)}
```

- [ ] **Step 4: Verify button renders**

```bash
npm run dev
# Check header has push toggle button
```

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add push notification toggle button in header"
```

---

### Task 7: Python Backend — Subscribe + Unsubscribe Endpoints

**Files:**
- Modify: `api-server/server.py`
- Modify: `api-server/requirements.txt`

- [ ] **Step 1: Add `pywebpush` to requirements**

Append to `api-server/requirements.txt`:

```
pywebpush>=2.0.0
supabase>=2.0.0
```

- [ ] **Step 2: Install dependencies**

```bash
cd api-server && venv/bin/pip install -r requirements.txt
```

- [ ] **Step 3: Add environment variable loading and Supabase init to `server.py`**

Add near top of `server.py` (after existing imports), if not already present:

```python
from supabase import create_client, Client
import os

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:trends@example.com")

supabase_client: Client | None = None
if SUPABASE_URL and SUPABASE_KEY:
    supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
```

- [ ] **Step 4: Add subscribe/unsubscribe endpoints to `server.py`**

```python
@app.post("/api/push/subscribe")
async def push_subscribe(payload: dict):
    if not supabase_client:
        raise HTTPException(500, "Supabase not configured")
    endpoint = payload.get("endpoint")
    keys = payload.get("keys", {})
    if not endpoint or not keys.get("p256dh") or not keys.get("auth"):
        raise HTTPException(400, "Missing required fields")
    try:
        supabase_client.table("twb_push_subscriptions").upsert({
            "endpoint": endpoint,
            "keys_p256dh": keys["p256dh"],
            "keys_auth": keys["auth"],
            "user_agent": payload.get("user_agent", ""),
        }).execute()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.delete("/api/push/subscribe")
async def push_unsubscribe(payload: dict):
    if not supabase_client:
        raise HTTPException(500, "Supabase not configured")
    endpoint = payload.get("endpoint")
    if not endpoint:
        raise HTTPException(400, "Missing endpoint")
    try:
        supabase_client.table("twb_push_subscriptions").delete().eq("endpoint", endpoint).execute()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(500, str(e))
```

- [ ] **Step 5: Add Supabase env vars to `api-server/.env`**

```
SUPABASE_URL=https://roruthlntnpjtfardmte.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key_from_.env.local>
```

- [ ] **Step 6: Restart Python API and test**

```bash
sudo systemctl restart pytrends-api
# Test:
curl -X POST http://127.0.0.1:8765/api/push/subscribe \
  -H "Content-Type: application/json" \
  -d '{"endpoint":"https://test.example.com","keys":{"p256dh":"test","auth":"test"}}'
```

Expected: `{"status":"ok"}`

- [ ] **Step 7: Commit**

```bash
git add api-server/server.py api-server/requirements.txt
git commit -m "feat: add push subscribe/unsubscribe endpoints to Python API"
```

---

### Task 8: Push Worker Script (Cron Job)

**Files:**
- Create: `api-server/push_worker.py`

- [ ] **Step 1: Create `push_worker.py`**

```python
"""
Push notification worker.
Called by cron to send daily trend summaries to all subscribers.
Usage: python push_worker.py
"""
import json
import os
import sys
import logging
from datetime import datetime

import requests as http_requests
from pywebpush import webpush, WebPushException
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY")
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:trends@example.com")
API_BASE = "http://127.0.0.1:8765"
SITE_URL = "https://trends-watcher-board.vercel.app"

def fetch_trends():
    """Fetch Google Trends related queries."""
    try:
        resp = http_requests.get(f"{API_BASE}/api/trends", params={
            "keywords": "AI,LLM,ai video,ai tool,maker,generator,creator,Anthropic",
            "timeframe": "now 1-d",
        }, timeout=60)
        data = resp.json()
        return data.get("google", [])[:5]
    except Exception as e:
        log.warning(f"Failed to fetch trends: {e}")
        return []

def fetch_trending():
    """Fetch Google daily trending topics."""
    try:
        resp = http_requests.get(f"{API_BASE}/api/trending", params={"geo": "US"}, timeout=60)
        data = resp.json()
        return data.get("trending", [])[:5]
    except Exception as e:
        log.warning(f"Failed to fetch trending: {e}")
        return []

def fetch_hackernews():
    """Fetch HackerNews top posts."""
    try:
        resp = http_requests.get(f"{API_BASE}/api/hackernews", timeout=60)
        data = resp.json()
        return data.get("posts", [])[:5]
    except Exception as e:
        log.warning(f"Failed to fetch HN: {e}")
        return []

def build_summary():
    """Build push notification body from all sources."""
    parts = []

    trending = fetch_trending()
    if trending:
        names = [t["name"] for t in trending[:5]]
        parts.append(f"Trending: {', '.join(names)}")

    google = fetch_trends()
    if google:
        names = [g["name"] for g in google[:5]]
        parts.append(f"Related: {', '.join(names)}")

    hn = fetch_hackernews()
    if hn:
        titles = [h["title"] for h in hn[:3]]
        parts.append(f"HN: {titles[0]}" if len(titles) == 1 else f"HN: {', '.join(titles)}")

    return " | ".join(parts) if parts else "Check the latest trends"

def send_notifications():
    """Send push to all subscribers."""
    if not all([SUPABASE_URL, SUPABASE_KEY, VAPID_PRIVATE_KEY]):
        log.error("Missing environment variables")
        sys.exit(1)

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    result = supabase.table("twb_push_subscriptions").select("*").execute()
    subs = result.data
    if not subs:
        log.info("No subscribers found")
        return

    body = build_summary()
    now = datetime.now().strftime("%H:%M")
    title = f"Trends Watcher ({now})"

    log.info(f"Sending to {len(subs)} subscribers")

    failed_endpoints = []
    for sub in subs:
        subscription_info = {
            "endpoint": sub["endpoint"],
            "keys": {
                "p256dh": sub["keys_p256dh"],
                "auth": sub["keys_auth"],
            },
        }
        try:
            webpush(
                subscription_info=subscription_info,
                data=json.dumps({
                    "title": title,
                    "body": body,
                    "icon": "/icon.svg",
                    "url": SITE_URL,
                }),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_SUBJECT},
            )
            log.info(f"Sent to {sub['endpoint'][:60]}...")
        except WebPushException as e:
            log.warning(f"Failed: {sub['endpoint'][:60]}... ({e})")
            if e.response and e.response.status_code == 410:
                failed_endpoints.append(sub["endpoint"])
        except Exception as e:
            log.warning(f"Error: {sub['endpoint'][:60]}... ({e})")

    # Clean up expired subscriptions
    for endpoint in failed_endpoints:
        supabase.table("twb_push_subscriptions").delete().eq("endpoint", endpoint).execute()
        log.info(f"Removed expired: {endpoint[:60]}...")

if __name__ == "__main__":
    send_notifications()
```

- [ ] **Step 2: Test the worker manually**

```bash
cd api-server && venv/bin/python3 push_worker.py
```

Expected: "No subscribers found" (no one has subscribed yet) or sends to existing subscribers.

- [ ] **Step 3: Set up cron jobs**

```bash
(crontab -l 2>/dev/null; echo "0 8 * * * cd /home/moses/claude_workspace/trends-watcher-board/api-server && /home/moses/claude_workspace/trends-watcher-board/api-server/venv/bin/python3 push_worker.py >> /tmp/push-morning.log 2>&1") | crontab -
(crontab -l 2>/dev/null; echo "0 20 * * * cd /home/moses/claude_workspace/trends-watcher-board/api-server && /home/moses/claude_workspace/trends-watcher-board/api-server/venv/bin/python3 push_worker.py >> /tmp/push-evening.log 2>&1") | crontab -
```

Verify:
```bash
crontab -l
```

- [ ] **Step 4: Commit**

```bash
git add api-server/push_worker.py
git commit -m "feat: add push notification cron worker"
```

---

### Task 9: Deploy and Verify

- [ ] **Step 1: Push all changes to GitHub**

```bash
git push origin main
```

- [ ] **Step 2: Set Vercel environment variables**

In Vercel dashboard, add:
- `NEXT_PUBLIC_VAPID_KEY` = (your public key)
- `PYTRENDS_API_URL` = `http://43.165.126.121`

- [ ] **Step 3: Verify Vercel deploy succeeds**

Check: `https://trends-watcher-board.vercel.app/`

- [ ] **Step 4: Test full flow on Android Chrome**

1. Open site in Chrome on Android
2. Accept install prompt (or add to home screen)
3. Click "推送" button in header → should change to "🔔 已订阅"
4. Run push worker manually from server:
   ```bash
   cd api-server && venv/bin/python3 push_worker.py
   ```
5. Verify notification arrives on phone

- [ ] **Step 5: Final commit for any fixes**

```bash
git add -A && git commit -m "fix: address issues found during push notification testing"
git push origin main
```
