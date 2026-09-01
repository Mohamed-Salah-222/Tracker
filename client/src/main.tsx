import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import App from "./App";
import { registerServiceWorker } from "./lib/pwa";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * A new build never takes over a tab mid-session. Reloading underneath someone who is
 * halfway through logging a set would lose what they typed, so the swap is offered
 * and waits to be accepted.
 */
registerServiceWorker((waiting) => {
  toast("A new version is ready", {
    duration: Infinity,
    action: {
      label: "Reload",
      onClick: () => {
        waiting.postMessage("skip-waiting");
        // The new worker takes control, then the page comes back on the new build.
        navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
      },
    },
  });
});
