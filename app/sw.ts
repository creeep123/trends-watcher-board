import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry } from "serwist";
import { Serwist } from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: PrecacheEntry[];
};
export type {};

const precacheEntries: PrecacheEntry[] = self.__SW_MANIFEST;
const serwist = new Serwist({
  precacheEntries,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Trends Watcher", {
      body: data.body || "New trends update",
      icon: data.icon || "/icon.svg",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(self.clients.openWindow(url));
});

serwist.addEventListeners();
