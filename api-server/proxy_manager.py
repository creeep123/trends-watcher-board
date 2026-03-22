"""
Proxy Manager - Free proxy rotation for Google Trends
Fetches free proxies from GitHub and manages lazy verification.
"""

import time
import threading
from typing import Optional
from datetime import datetime, timezone


class ProxyInfo:
    """Information about a proxy in the pool."""

    def __init__(self):
        self.verified: bool = False
        self.last_check: float = 0.0
        self.fail_count: int = 0
        self.last_success: float = 0.0

    def to_dict(self) -> dict:
        return {
            "verified": self.verified,
            "last_check": self.last_check,
            "fail_count": self.fail_count,
            "last_success": self.last_success,
        }


class ProxyManager:
    """Manages a pool of free proxies with lazy verification."""

    # GitHub sources for free proxy lists
    PROXY_SOURCES = [
        "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
        "https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt",
    ]

    # Configuration
    VERIFY_TIMEOUT = 5.0  # seconds
    MAX_FAIL_COUNT = 3
    VERIFY_URL = "https://www.google.com"

    def __init__(self):
        # Proxy pool: {proxy_url: ProxyInfo}
        self._proxy_pool: dict[str, ProxyInfo] = {}
        self._lock = threading.Lock()
        self._last_refresh = 0.0
        self._refresh_interval = 3600.0  # 1 hour

    def get_proxies(self, count: int = 3) -> list[str]:
        """Get N available proxies, prioritizing verified ones."""
        with self._lock:
            # Get verified proxies first
            verified = [
                p for p, info in self._proxy_pool.items()
                if info.verified and info.fail_count < self.MAX_FAIL_COUNT
            ]

            # Get unverified proxies to fill the count
            unverified = [
                p for p, info in self._proxy_pool.items()
                if not info.verified and info.fail_count < self.MAX_FAIL_COUNT
            ]

            # Combine: verified first, then unverified
            selected = verified[:count]
            if len(selected) < count:
                selected.extend(unverified[:count - len(selected)])

            return selected

    def mark_failed(self, proxy: str) -> None:
        """Mark a proxy as failed."""
        with self._lock:
            if proxy in self._proxy_pool:
                info = self._proxy_pool[proxy]
                info.fail_count += 1
                info.last_check = time.time()

                # Remove if too many failures
                if info.fail_count >= self.MAX_FAIL_COUNT:
                    del self._proxy_pool[proxy]
                    print(f"[proxy] Removed {proxy} after {info.fail_count} failures")

    def mark_success(self, proxy: str) -> None:
        """Mark a proxy as successful."""
        with self._lock:
            if proxy not in self._proxy_pool:
                self._proxy_pool[proxy] = ProxyInfo()

            info = self._proxy_pool[proxy]
            info.verified = True
            info.fail_count = 0
            info.last_success = time.time()
            info.last_check = time.time()

    def refresh_list(self) -> int:
        """Fetch proxy list from GitHub and add to pool."""
        now = time.time()
        if now - self._last_refresh < self._refresh_interval:
            # Refreshed recently, skip
            return 0

        added_count = 0
        for source_url in self.PROXY_SOURCES:
            try:
                proxies = self._fetch_from_github(source_url)
                with self._lock:
                    for proxy in proxies:
                        if proxy not in self._proxy_pool:
                            self._proxy_pool[proxy] = ProxyInfo()
                            added_count += 1
                print(f"[proxy] Added {len(proxies)} proxies from {source_url}")
            except Exception as e:
                print(f"[proxy] Failed to fetch from {source_url}: {e}")

        self._last_refresh = now
        self._clean_expired()

        return added_count

    def _fetch_from_github(self, url: str) -> list[str]:
        """Fetch and parse proxy list from GitHub."""
        proxies = []

        try:
            import requests
            response = requests.get(url, timeout=10)
            response.raise_for_status()

            for line in response.text.strip().split('\n'):
                line = line.strip()
                if not line or line.startswith('#'):
                    continue

                # Parse IP:PORT format
                if ':' in line:
                    ip_port = line.split(':')[0:2]  # Take only IP and PORT
                    proxy = f"http://{':'.join(ip_port)}"
                    proxies.append(proxy)

        except Exception as e:
            print(f"[proxy] Error parsing {url}: {e}")

        return proxies

    def _clean_expired(self) -> None:
        """Remove old unverified proxies (lazy cleanup)."""
        now = time.time()
        to_remove = []

        with self._lock:
            for proxy, info in self._proxy_pool.items():
                # Remove unverified proxies older than 1 hour
                # Skip proxies that were just added (last_check = 0 means newly created)
                if not info.verified and info.last_check > 0 and (now - info.last_check) > 3600:
                    to_remove.append(proxy)

            for proxy in to_remove:
                del self._proxy_pool[proxy]

            if to_remove:
                print(f"[proxy] Cleaned {len(to_remove)} expired unverified proxies")

    def get_status(self) -> dict:
        """Get proxy pool status."""
        with self._lock:
            verified = sum(1 for info in self._proxy_pool.values() if info.verified)
            unverified = len(self._proxy_pool) - verified

            return {
                "total": len(self._proxy_pool),
                "verified": verified,
                "unverified": unverified,
                "failed": 0,  # Already removed from pool
                "last_refresh": datetime.fromtimestamp(self._last_refresh, tz=timezone.utc).isoformat() if self._last_refresh else None,
            }

    def verify_proxy_sync(self, proxy: str) -> bool:
        """Synchronous proxy verification (fallback)."""
        try:
            import requests
            response = requests.head(
                self.VERIFY_URL,
                proxies={"https": proxy, "http": proxy},
                timeout=self.VERIFY_TIMEOUT
            )
            return response.status_code in (200, 301, 302, 304)
        except Exception as e:
            print(f"[proxy] Verification failed for {proxy}: {e}")
            return False


# Global singleton instance
_proxy_manager: Optional[ProxyManager] = None


def get_proxy_manager() -> ProxyManager:
    """Get the global ProxyManager instance."""
    global _proxy_manager
    if _proxy_manager is None:
        _proxy_manager = ProxyManager()
        # Initial refresh on first use
        _proxy_manager.refresh_list()
    return _proxy_manager
