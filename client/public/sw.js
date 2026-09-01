/* eslint-env serviceworker */

/**
 * LifeTracker's service worker.
 *
 * Written by hand rather than generated. The app has exactly three kinds of request
 * and each wants a different rule, which is a page of code, and a plugin that pulls
 * workbox in would be several hundred kilobytes to express the same thing.
 *
 * The reason this exists is the gym: the one place the app is used every day is the
 * one place with no signal. Sets already survive a dead zone through the retry queue
 * in the page, and this is the other half, so the app still opens and still shows the
 * last thing it knew.
 *
 * Bump SHELL_VERSION whenever this file changes. Old caches are dropped on activate.
 */
const SHELL_VERSION = "v1";
const SHELL_CACHE = `lifetracker-shell-${SHELL_VERSION}`;
const ASSET_CACHE = `lifetracker-assets-${SHELL_VERSION}`;
const API_CACHE = `lifetracker-api-${SHELL_VERSION}`;

/** How long an API answer is worth showing when the network is gone. */
const API_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Never worth a cache entry: liveness probes and anything that changes state. */
const NEVER_CACHE = ["/api/health"];

/**
 * Precache every built asset, read from Vite's own manifest.
 *
 * Caching only index.html would leave the app opening to a blank page offline until
 * each chunk had been visited once online. Reading the manifest means the whole app
 * is available after the first load, without this file listing hashed filenames it
 * cannot know.
 */
async function precache() {
  const cache = await caches.open(SHELL_CACHE);
  const urls = new Set(["/", "/index.html", "/manifest.webmanifest", "/app-icon.svg", "/icons/icon-192.png", "/icons/apple-touch-icon.png"]);

  try {
    const res = await fetch("/.vite/manifest.json", { cache: "no-cache" });
    if (res.ok) {
      const manifest = await res.json();
      for (const entry of Object.values(manifest)) {
        if (entry.file) urls.add("/" + entry.file);
        for (const css of entry.css ?? []) urls.add("/" + css);
      }
    }
  } catch {
    // No manifest in dev, and a failed fetch here must not block installation.
  }

  // One at a time rather than cache.addAll: a single 404 rejects the whole batch,
  // and an icon missing is not a reason to have no offline app at all.
  await Promise.all(
    [...urls].map(async (url) => {
      try {
        const res = await fetch(url, { cache: "no-cache" });
        if (res.ok) await cache.put(url, res);
      } catch {
        /* skipped */
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE, API_CACHE]);
      for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

/** The page asks for the new worker as soon as the user agrees to reload. */
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") void self.skipWaiting();
});

const isApi = (url) => url.pathname.startsWith("/api/") || url.pathname.includes("/api/");

/** Network first, falling back to whatever was last seen. Used for data. */
async function networkFirst(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) {
      // The timestamp rides along in a header so a stale answer can say how old it is.
      const copy = new Response(res.clone().body, res);
      copy.headers.set("x-cached-at", String(Date.now()));
      await cache.put(request, copy);
    }
    return res;
  } catch (err) {
    const hit = await cache.match(request);
    if (!hit) throw err;
    const cachedAt = Number(hit.headers.get("x-cached-at") ?? 0);
    if (cachedAt && Date.now() - cachedAt > API_MAX_AGE_MS) throw err;
    return hit;
  }
}

/**
 * Cache first for hashed build output, which never changes under its own name.
 *
 * The lookup is across every cache, not just this one. Install writes the whole build
 * into the shell cache, so checking only the runtime cache would miss all of it and
 * fall through to a network that is not there, which is exactly the case this exists
 * for: the app opened offline to a blank page while the chunks sat in the next cache.
 */
async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    const cache = await caches.open(ASSET_CACHE);
    await cache.put(request, res.clone());
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (NEVER_CACHE.some((path) => url.pathname.startsWith(path))) return;
  // A range request is a media seek. Serving it from a cache entry that holds the
  // whole file would answer with the wrong bytes.
  if (request.headers.has("range")) return;

  if (isApi(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // A navigation is the SPA shell whatever the path says, so an offline deep link to
  // /workout still opens the app rather than the browser's error page.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (await cache.match("/index.html")) ?? (await cache.match("/")) ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (/\.(js|css|woff2?|png|jpe?g|svg|webp|ico)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
