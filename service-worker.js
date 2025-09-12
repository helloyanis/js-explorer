const cacheName = "offline-cache-v2";
const cacheUrls = [
  "index.html",
  "script.js",
  "web-worker.js",
  "styles/mdui.css",
  "styles/style.css",
  "favicon.svg",
  "manifest.json"
];

// Install event
self.addEventListener("install", async (event) => {
  const cache = await caches.open(cacheName);
  await cache.addAll(cacheUrls);
});

// Fetch event
self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async () => {
      const cache = await caches.open(cacheName);
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }
      const fetchResponse = await fetch(event.request);
      cache.put(event.request, fetchResponse.clone());
      return fetchResponse;
    })()
  );
});
