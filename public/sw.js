// Layisha driver app service worker.
// Keeps a copy of the driver app on the phone so it opens with no signal.
// Data (stops, deliveries) is handled by the app itself in IndexedDB, not here.

const CACHE = "layisha-driver-v1";
const APP_SHELL = ["/d", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API calls or the driver sign-in link.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/driver/")) return;

  // Built JS/CSS files never change once published: cache first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // The driver app page: try the network, fall back to the saved copy.
  if (req.mode === "navigate" && url.pathname === "/d") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("/d", copy));
          }
          return res;
        })
        .catch(() => caches.match("/d").then((hit) => hit || Response.error())),
    );
  }
});
