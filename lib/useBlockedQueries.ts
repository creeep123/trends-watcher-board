import { useState, useCallback } from "react";

const BLOCKED_TYPE = "blocked_queries";

export function useBlockedQueries() {
  const [blockedSet, setBlockedSet] = useState<Set<string>>(new Set());

  const fetchBlocked = useCallback(async () => {
    try {
      const res = await fetch("/api/blocked-queries");
      const { blocked } = await res.json();
      setBlockedSet(new Set(blocked as string[]));
    } catch (e) {
      console.error("Failed to fetch blocked queries:", e);
    }
  }, []);

  const block = useCallback((keyword: string) => {
    setBlockedSet(prev => new Set(prev).add(keyword));
    fetch("/api/blocked-queries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword }),
    }).catch(console.error);
  }, []);

  const unblock = useCallback((keyword: string) => {
    setBlockedSet(prev => {
      const next = new Set(prev);
      next.delete(keyword);
      return next;
    });
    fetch("/api/blocked-queries", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword }),
    }).catch(console.error);
  }, []);

  const isBlocked = useCallback((keyword: string): boolean => {
    return blockedSet.has(keyword);
  }, [blockedSet]);

  return { blockedSet, fetchBlocked, block, unblock, isBlocked };
}
