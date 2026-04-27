import { useState, useCallback } from "react";

export type ItemType = "trending" | "queries" | "reddit" | "hn" | "technews" | "github" | "ph" | "hf" | "ih";

export function useReadItems() {
  const [readSet, setReadSet] = useState<Set<string>>(new Set());

  const fetchReadStatus = useCallback(async (items: { item_type: ItemType; item_key: string }[]) => {
    if (items.length === 0) return;
    try {
      const itemsParam = items
        .map(i => `${i.item_type}:${i.item_key}`)
        .join(",");
      const res = await fetch(`/api/read-items?items=${encodeURIComponent(itemsParam)}`);
      const { read } = await res.json();
      setReadSet(new Set(read as string[]));
    } catch (e) {
      console.error("Failed to fetch read status:", e);
    }
  }, []);

  const markAsRead = useCallback((item_type: ItemType, item_key: string) => {
    const key = `${item_type}:${item_key}`;
    setReadSet(prev => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    fetch("/api/read-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_type, item_key }),
    }).catch(console.error);
  }, []);

  const isRead = useCallback((item_type: ItemType, item_key: string): boolean => {
    return readSet.has(`${item_type}:${item_key}`);
  }, [readSet]);

  return { readSet, fetchReadStatus, markAsRead, isRead };
}
