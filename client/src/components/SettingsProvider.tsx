import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_SETTINGS, fetchSettings, patchSettings, readLegacyLocal, type ModuleKey, type Settings, type SettingsPatch } from "../lib/settings";

type SettingsContextValue = {
  settings: Settings;
  /** False until the server has answered once. The app renders on defaults meanwhile. */
  loaded: boolean;
  saving: boolean;
  update: (patch: SettingsPatch) => Promise<void>;
  enabled: (key: ModuleKey) => boolean;
};

// eslint-disable-next-line react-refresh/only-export-components
export const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  saving: false,
  update: async () => {},
  enabled: () => true,
});

/**
 * One read of the settings document, held for the whole app.
 *
 * Updates are optimistic: the switch you just flipped moves immediately and the
 * server's answer replaces it a moment later. A settings page where every toggle
 * pauses for a round trip feels broken even when it is working.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const migrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const server = await fetchSettings();
        if (cancelled) return;

        // First run on a browser that already had preferences: fold them in before
        // anyone sees a page rendered from defaults.
        if (!server.migratedLocal && !migrated.current) {
          migrated.current = true;
          const legacy = readLegacyLocal();
          const merged = await patchSettings({ ...(legacy ?? {}), migratedLocal: true });
          if (!cancelled) setSettings(merged);
        } else {
          setSettings(server);
        }
      } catch {
        // Defaults are a working app. A settings read that fails must not blank it.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(async (patch: SettingsPatch) => {
    setSaving(true);
    setSettings((current) => ({
      ...current,
      ...(patch.modules ? { modules: { ...current.modules, ...patch.modules } } : {}),
      ...(patch.navOrder ? { navOrder: patch.navOrder } : {}),
      ...(patch.appearance ? { appearance: { ...current.appearance, ...patch.appearance } } : {}),
      ...(patch.week ? { week: { ...current.week, ...patch.week } } : {}),
      ...(patch.dashboard ? { dashboard: { ...current.dashboard, ...patch.dashboard } } : {}),
      ...(patch.autoReminders ? { autoReminders: { ...current.autoReminders, ...patch.autoReminders } } : {}),
      ...(patch.quietHours ? { quietHours: { ...current.quietHours, ...patch.quietHours } } : {}),
      ...(patch.digestAuto !== undefined ? { digestAuto: patch.digestAuto } : {}),
      ...(patch.workout ? { workout: { ...current.workout, ...patch.workout } } : {}),
    }));
    try {
      setSettings(await patchSettings(patch));
    } catch {
      // Put back whatever the server actually holds rather than leaving the screen
      // showing a change that did not save.
      try {
        setSettings(await fetchSettings());
      } catch {
        /* offline: the optimistic value stands until the next load */
      }
    } finally {
      setSaving(false);
    }
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, loaded, saving, update, enabled: (key: ModuleKey) => settings.modules[key] !== false }),
    [settings, loaded, saving, update],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
