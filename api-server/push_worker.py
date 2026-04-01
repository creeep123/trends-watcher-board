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
