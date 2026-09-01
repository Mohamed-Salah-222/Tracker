import { useEffect, useState } from "react";

/**
 * Service worker registration and the two bits of state the UI needs from it.
 *
 * Registration is deliberately late: it waits for load so the first paint is not
 * competing with the precache of every chunk in the build.
 */
export function registerServiceWorker(onUpdate?: (waiting: ServiceWorker) => void): void {
  if (!("serviceWorker" in navigator)) return;
  // The dev server serves modules unbundled and has no built manifest, so a worker
  // there would cache half an app and confuse every reload.
  if (import.meta.env.DEV) return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        if (registration.waiting) onUpdate?.(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            // A worker that reaches "installed" while one is already controlling the
            // page is a new version waiting for the tab to let go.
            if (installing.state === "installed" && navigator.serviceWorker.controller) onUpdate?.(installing);
          });
        });
      })
      .catch(() => {
        /* An unregistered worker only costs offline support, so this stays quiet. */
      });
  });
}

/** True while the browser believes there is a network. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return online;
}

/**
 * Whether the app is running from the home screen rather than a browser tab.
 * Used to stop offering an install that has already happened.
 */
export function useInstalled(): boolean {
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(display-mode: standalone)");
    const check = () => setInstalled(query.matches || (window.navigator as { standalone?: boolean }).standalone === true);
    check();
    query.addEventListener("change", check);
    return () => query.removeEventListener("change", check);
  }, []);

  return installed;
}

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/**
 * Chrome fires beforeinstallprompt once and expects the page to hold onto it. iOS
 * fires nothing at all, which is why the install hint has a written fallback.
 */
export function useInstallPrompt(): { canPrompt: boolean; promptInstall: () => Promise<boolean> } {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return {
    canPrompt: deferred !== null,
    promptInstall: async () => {
      if (!deferred) return false;
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setDeferred(null);
      return choice.outcome === "accepted";
    },
  };
}
