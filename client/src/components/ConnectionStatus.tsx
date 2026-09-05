import { useEffect, useRef, useState } from "react";
import { CloudOff, CloudUpload, Download } from "lucide-react";
import { toast } from "sonner";
import { useInstallPrompt, useInstalled, useOnline } from "../lib/pwa";
import { subscribeToQueue, type QueueSnapshot } from "../lib/offlineQueue";

/**
 * The offline pill.
 *
 * Small and permanent while there is no network, rather than a toast that appears
 * once and is gone by the time it matters. Half of this app is used in a basement gym
 * where the signal comes and goes, and the difference between "saving" and "saved"
 * needs to be visible at a glance.
 */
export function OfflinePill({ className = "" }: { className?: string }) {
  const online = useOnline();
  const wasOffline = useRef(false);
  const [queue, setQueue] = useState<QueueSnapshot>({ pending: 0, syncing: false, oldestAt: null, lastError: null });

  useEffect(() => subscribeToQueue(setQueue), []);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      toast.success("Back online");
    }
  }, [online]);

  // Anything still waiting is worth saying even once the network is back, because it
  // is the difference between "saved" and "about to be saved".
  if (online && queue.pending === 0) return null;

  if (online) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border border-border-strong px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${className}`}>
        <CloudUpload className="h-3 w-3" aria-hidden />
        {queue.syncing ? "Saving" : "Waiting"} {queue.pending}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-foreground px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${className}`}>
      <CloudOff className="h-3 w-3" aria-hidden />
      Offline{queue.pending > 0 ? ` · ${queue.pending}` : ""}
    </span>
  );
}

/**
 * The install hint.
 *
 * Shown once, dismissible for good. Chrome hands over a real prompt; iOS Safari never
 * does, so there it has to be a sentence telling you where the button is.
 */
const DISMISSED_KEY = "lifetracker.install.dismissed.v1";

export function InstallHint() {
  const installed = useInstalled();
  const { canPrompt, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      return true;
    }
  });

  const isIos = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (installed || dismissed || (!canPrompt && !isIos)) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* a private window just gets asked again */
    }
    setDismissed(true);
  };

  return (
    <div className="mx-auto mb-3 flex w-full max-w-[720px] items-center gap-3 rounded-xl border border-border-strong bg-card px-3 py-2.5">
      <Download className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="min-w-0 flex-1 text-[12px] leading-snug">
        {canPrompt ? "Install this on your phone and it opens like an app, offline included." : "Add this to your home screen from the share menu and it opens like an app, offline included."}
      </p>
      {canPrompt && (
        <button
          type="button"
          onClick={() => void promptInstall().then((ok) => ok && dismiss())}
          className="shrink-0 rounded-lg bg-foreground px-2.5 py-1.5 text-[11px] font-semibold text-background"
        >
          Install
        </button>
      )}
      <button type="button" onClick={dismiss} className="shrink-0 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted">
        Not now
      </button>
    </div>
  );
}
