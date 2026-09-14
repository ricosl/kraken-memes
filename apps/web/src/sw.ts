/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";

declare let self: ServiceWorkerGlobalScope;

// Precache the app shell (spec section 36: offline shell must work; cached
// data is never presented as live).
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// API calls: try the network first (fresh data matters most for a live
// market screener); fall back to the last successful response when offline
// so navigation doesn't hard-fail, but the UI is responsible for labeling
// that data as stale (it carries no live-timestamp guarantee once served
// from this cache).
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/"),
  new NetworkFirst({ cacheName: "api-cache", networkTimeoutSeconds: 4 }),
);

registerRoute(
  ({ request }) => request.destination === "image",
  new StaleWhileRevalidate({ cacheName: "image-cache" }),
);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// --- Web Push (spec sections 19-20) ---

interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  data?: Record<string, unknown>;
}

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    payload = { title: "Kraken Intel", body: event.data.text(), url: "/", tag: "generic" };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      data: { url: payload.url, ...payload.data },
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    }),
  );
});

// Tapping a notification opens (or focuses) the relevant alert page (spec section 19/20).
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const targetUrl = (event.notification.data as { url?: string } | undefined)?.url ?? "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = allClients.find((client) => "focus" in client);
      if (existing) {
        await (existing as WindowClient).focus();
        (existing as WindowClient).navigate(targetUrl);
        return;
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
