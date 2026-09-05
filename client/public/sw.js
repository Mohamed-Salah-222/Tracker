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
const SHELL_VERSION = "v2";
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

/* =====================================================================
   Reminders
   =====================================================================
   A push arrives whether or not the app is open, which is the entire point: a
   habit tracker that can only nudge you while you are already looking at it is
   not a reminder, it is a label.
   ===================================================================== */
self.addEventListener("push", (event) => {
  let payload = { title: "LifeTracker", body: "", url: "/" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // A push with no readable body still deserves to appear.
    payload.body = event.data ? event.data.text() : "";
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body || undefined,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      // Same tag replaces an older copy rather than stacking three of them.
      tag: payload.tag || "lifetracker",
      renotify: Boolean(payload.tag),
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Reuse a tab that is already open rather than piling up windows.
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin)) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

/**
 * Where the API lives.
 *
 * The worker is a static file, so it cannot be built with the API base in it, and the
 * API is on another origin. The page tells it once and it is kept in the cache, which
 * is the only storage here that survives the worker being stopped and restarted.
 */
const API_KEY_URL = "/__lifetracker_api__";

async function rememberApiBase(base) {
  const cache = await caches.open(SHELL_CACHE);
  await cache.put(API_KEY_URL, new Response(base));
}

async function apiBase() {
  const hit = await caches.match(API_KEY_URL);
  return hit ? hit.text() : "";
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "api-base" && typeof event.data.base === "string") {
    event.waitUntil(rememberApiBase(event.data.base));
  }
});

/**
 * The browser can retire a subscription on its own, usually after an update. It says
 * so once, and this is the only chance to hand the server the replacement before the
 * old endpoint starts bouncing.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const base = await apiBase();
      if (!base) return; // The page will re-report on its next load.
      const options = event.oldSubscription?.options ?? { userVisibleOnly: true };
      const fresh = await self.registration.pushManager.subscribe(options);
      await fetch(base + "/reminders/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...fresh.toJSON(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
    })(),
  );
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
