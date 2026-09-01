import { LayoutDashboard, Wallet, CreditCard, CheckSquare, Sun, Apple, ShoppingBasket, BookOpen, Dumbbell, Sparkles, Target, NotebookPen } from "lucide-react";

// Nav data lives outside AppSidebar.tsx so that file exports only components and
// stays eligible for react-refresh fast refresh.

export type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
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
      { title: "Tasks", url: "/tasks", icon: CheckSquare },
      { title: "Habits", url: "/habits", icon: Sparkles },
      { title: "Goals", url: "/goals", icon: Target },
      { title: "Journal", url: "/journal", icon: NotebookPen },
    ],
  },
  {
    label: "Health",
    items: [
      { title: "Calories", url: "/calories", icon: Apple },
      { title: "Foods", url: "/foods", icon: BookOpen },
      { title: "Kitchen", url: "/kitchen", icon: ShoppingBasket },
      { title: "Workout", url: "/workout", icon: Dumbbell },
    ],
  },
  {
    label: "Money",
    items: [
      { title: "Income", url: "/income", icon: Wallet },
      { title: "Payments", url: "/payments", icon: CreditCard },
    ],
  },
];

export const navItems: NavItem[] = navSections.flatMap((section) => section.items);

export function isItemActive(pathname: string, url: string): boolean {
  return url === "/" ? pathname === "/" : pathname === url || pathname.startsWith(url + "/");
}

/** Title for the current route, used by the mobile top bar. */
export function currentPageTitle(pathname: string): string {
  // Longest match wins so a nested route resolves to its section, not "Tracker".
  const match = [...navItems].sort((a, b) => b.url.length - a.url.length).find((item) => isItemActive(pathname, item.url));
  return match?.title ?? "LifeTracker";
}
