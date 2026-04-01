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
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY) as BufferSource,
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
