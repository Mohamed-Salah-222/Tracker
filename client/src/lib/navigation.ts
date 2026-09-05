import type { ModuleKey } from "./settings";
import { LayoutDashboard, Wallet, CreditCard, CheckSquare, Sun, Apple, ShoppingBasket, BookOpen, Dumbbell, Sparkles, Target, NotebookPen, Award, Settings } from "lucide-react";

// Nav data lives outside AppSidebar.tsx so that file exports only components and
// stays eligible for react-refresh fast refresh.

export type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  /** The module that owns it. Items with no module are always there. */
  module?: ModuleKey;
};

export type NavSection = {
  label: string;
  items: NavItem[];
  /** Shown in place of the list while a section has nothing in it yet. */
  placeholder?: string;
};

export const navSections: NavSection[] = [
  {
    label: "Daily",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      { title: "Today", url: "/today", icon: Sun },
      { title: "Tasks", url: "/tasks", icon: CheckSquare, module: "tasks" },
      { title: "Habits", url: "/habits", icon: Sparkles },
      { title: "Goals", url: "/goals", icon: Target, module: "goals" },
      { title: "Journal", url: "/journal", icon: NotebookPen, module: "journal" },
    ],
  },
  {
    label: "Health",
    items: [
      { title: "Calories", url: "/calories", icon: Apple, module: "calories" },
      { title: "Foods", url: "/foods", icon: BookOpen, module: "foods" },
      { title: "Kitchen", url: "/kitchen", icon: ShoppingBasket, module: "kitchen" },
      { title: "Workout", url: "/workout", icon: Dumbbell, module: "workout" },
    ],
  },
  {
    label: "Money",
    items: [
      { title: "Income", url: "/income", icon: Wallet, module: "income" },
      { title: "Payments", url: "/payments", icon: CreditCard, module: "payments" },
    ],
  },
  {
    label: "You",
    items: [
      { title: "Badges", url: "/badges", icon: Award, module: "badges" },
      { title: "Settings", url: "/settings", icon: Settings },
    ],
  },
];

export const navItems: NavItem[] = navSections.flatMap((section) => section.items);

/**
 * The nav as configured: modules that are off drop out, and anything named in
 * navOrder is pulled to the front in that order. A section left with nothing in it
 * disappears rather than showing an empty heading.
 */
export function visibleSections(enabled: (key: ModuleKey) => boolean, navOrder: string[] = []): NavSection[] {
  const rank = (item: NavItem) => {
    const at = navOrder.indexOf(item.url);
    return at === -1 ? navOrder.length : at;
  };
  return navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.module || enabled(item.module)).sort((a, b) => rank(a) - rank(b)),
    }))
    .filter((section) => section.items.length > 0);
}

export function isItemActive(pathname: string, url: string): boolean {
  return url === "/" ? pathname === "/" : pathname === url || pathname.startsWith(url + "/");
}

/** Title for the current route, used by the mobile top bar. */
export function currentPageTitle(pathname: string): string {
  // Longest match wins so a nested route resolves to its section, not "Tracker".
  const match = [...navItems].sort((a, b) => b.url.length - a.url.length).find((item) => isItemActive(pathname, item.url));
  return match?.title ?? "LifeTracker";
}
