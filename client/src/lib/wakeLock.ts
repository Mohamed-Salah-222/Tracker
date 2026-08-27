// Keeps the phone screen on during a workout.
//
// Resting 90 seconds is long enough for the screen to lock. You then unlock, find
// your place, and on iOS the tab may have been evicted and reloads from scratch.
import { useEffect } from "react";

type WakeLockSentinel = { released: boolean; release: () => Promise<void> };
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> } };

/**
 * Holds a screen wake lock while `active`. The browser drops the lock whenever the
 * page is hidden, so it is taken again on the way back rather than assuming it held.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const wl = (navigator as WakeLockNavigator).wakeLock;
    if (!wl) return; // unsupported: nothing to fall back to, and nothing to warn about

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        sentinel = await wl.request("screen");
        if (cancelled) void sentinel.release();
      } catch {
        /* denied, low battery, or the tab lost focus mid-request */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && (sentinel === null || sentinel.released)) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (sentinel && !sentinel.released) void sentinel.release();
    };
  }, [active]);
}
