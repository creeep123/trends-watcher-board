#!/usr/bin/env python3
"""Small dependency-free client for the Trends Intelligence API."""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def main() -> int:
    parser = argparse.ArgumentParser(description="Query Trends Intelligence")
    parser.add_argument("resource", choices=["brief", "records", "raw", "status"])
    parser.add_argument("--period", choices=["today", "last_7_days", "previous_week"], default="today")
    parser.add_argument("--from", dest="date_from")
    parser.add_argument("--to", dest="date_to")
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--json", action="store_true", help="Emit compact JSON")
    args = parser.parse_args()

    base = os.environ.get("TRENDS_INTELLIGENCE_API_URL", "").rstrip("/")
    key = os.environ.get("TRENDS_INTELLIGENCE_API_KEY", "")
    if not base or not key:
        parser.error("set TRENDS_INTELLIGENCE_API_URL and TRENDS_INTELLIGENCE_API_KEY")

    params = {"period": args.period}
    if args.date_from:
        params["from"] = args.date_from
    if args.date_to:
        params["to"] = args.date_to
    if args.resource in ("records", "raw"):
        params["limit"] = str(args.limit)
    suffix = "" if args.resource == "status" else "?" + urllib.parse.urlencode(params)
    url = f"{base}/api/v1/intelligence/{args.resource}{suffix}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        print(f"API error {exc.code}: {body}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"API unavailable: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(data, ensure_ascii=False, indent=None if args.json else 2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
