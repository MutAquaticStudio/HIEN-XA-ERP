const CACHE_VERSION = "vlxd-erp-v5";
const APP_SHELL_URLS = ["/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(async () => {
        await self.clients.claim();
        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        windows.forEach((client) => client.postMessage({ type: "hx-app-version-changed" }));
      })
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Financial and operational mutations must never be queued or replayed offline.
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    // Personalized ERP HTML must never be served from another user's cache.
    event.respondWith(fetch(request));
    return;
  }

  if (APP_SHELL_URLS.includes(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cachedResponse = await cache.match(request);
  const networkResponsePromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  return cachedResponse ?? (await networkResponsePromise) ?? Response.error();
}

self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  const title = payload.title || "VLXD Hien Xa";
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || "Có cập nhật mới từ cửa hàng.",
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: payload.tag || "vlxd-update",
    data: { url: payload.url || "/" },
    renotify: true
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clients.find((client) => client.url === targetUrl);
    if (existing) return existing.focus();
    return self.clients.openWindow(targetUrl);
  })());
});
