import { useContext } from "react";
import { SettingsContext } from "../components/SettingsProvider";

/**
 * The settings, anywhere.
 *
 * In its own file so SettingsProvider.tsx exports only components and stays eligible
 * for react-refresh fast refresh, the same reason navigation data lives outside
 * AppSidebar.
 */
export function useSettings() {
  return useContext(SettingsContext);
}
