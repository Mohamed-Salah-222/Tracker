import { useEffect } from "react";
import { useSettings } from "../lib/useSettings";

/**
 * Puts the chosen appearance on the root element, where the CSS is waiting for it.
 *
 * Renders nothing. Theme, font, density and accent are all one attribute each, so
 * everything downstream is plain CSS that works without React having to know about
 * any of it.
 *
 * "system" deliberately stamps no data-theme at all rather than resolving the media
 * query here: letting CSS answer means the app follows the device the moment it
 * changes, with no listener to keep in step.
 */
export function ThemeApplier() {
  const { settings } = useSettings();
  const { theme, font, density, accent } = settings.appearance;

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);

    root.setAttribute("data-font", font);
    root.setAttribute("data-density", density);
    root.setAttribute("data-accent", accent);
  }, [theme, font, density, accent]);

  // The browser chrome around the page follows too, or a dark app sits inside a
  // white address bar on a phone.
  useEffect(() => {
    const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#09090b" : "#ffffff");
  }, [theme]);

  return null;
}
