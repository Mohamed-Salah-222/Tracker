import { Link, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../components/ui/sidebar";
import { LayoutDashboard, Wallet, CreditCard, CheckSquare, Sun, Apple, Refrigerator, BookOpen, Sprout, Dumbbell, GraduationCap, Stethoscope, Target } from "lucide-react";

type Item = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
};

const sections: { label: string; items: Item[] }[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      { title: "Today", url: "/today", icon: Sun },
    ],
  },
  {
    label: "Money",
    items: [
      { title: "Income", url: "/income", icon: Wallet },
      { title: "Payments", url: "/payments", icon: CreditCard },
    ],
  },
  {
    label: "Health",
    items: [
      { title: "Foods", url: "/foods", icon: BookOpen },
      { title: "Calories", url: "/calories", icon: Apple },
      { title: "Fridge", url: "/fridge", icon: Refrigerator },
    ],
  },
  {
    label: "Planning",
    items: [
      { title: "Tasks", url: "/tasks", icon: CheckSquare },
      { title: "Goals", url: "/goals", icon: Target },
      { title: "Workout", url: "/workout", icon: Dumbbell },
    ],
  },
  {
    label: "Career",
    items: [
      { title: "AI Engineering", url: "/career", icon: GraduationCap },
      { title: "Medical English", url: "/medical-english", icon: Stethoscope },
    ],
  },
];

const navItems = sections.flatMap((section) => section.items);

export function AppSidebar() {
  const location = useLocation();
  const isDashboard = location.pathname === "/";

  return (
    <>
      <Sidebar collapsible="none" className={`h-svh min-h-0 shrink-0 bg-transparent px-2.5 py-3 md:py-6 ${isDashboard ? "hidden md:flex" : ""}`}>
        <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-900 text-white shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
          <SidebarHeader className="px-3 pb-3 pt-4">
            <Link to="/" className="flex items-center gap-3 group">
              <motion.div
                whileHover={{ rotate: -10, scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className="w-8 h-8 rounded-lg border border-white/25 bg-white/10 flex items-center justify-center flex-shrink-0 text-white shadow-inner"
              >
                <Sprout className="h-4.5 w-4.5" strokeWidth={2.35} />
              </motion.div>
              <div className="flex flex-col min-w-0">
                <span className="text-base font-bold tracking-tight leading-none text-white">LifeTracker</span>
              </div>
            </Link>
          </SidebarHeader>

          <SidebarContent className="px-2 pb-3 pt-1">
            <SidebarGroup className="px-0 py-0">
              <SidebarGroupContent>
                <SidebarMenu className="gap-1.5">
                  {navItems.map((item) => {
                    const isActive = item.url === "/" ? location.pathname === "/" : location.pathname === item.url || location.pathname.startsWith(item.url + "/");
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton isActive={isActive} className="h-auto rounded-md p-0 data-active:bg-transparent data-active:text-white hover:bg-transparent">
                          <Link
                            to={item.url}
                            className={`relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${isActive ? "font-semibold text-white" : "font-semibold text-white/60 hover:text-white"}`}
                            style={
                              isActive
                                ? {
                                    background: "rgba(255,255,255,0.15)",
                                    color: "#ffffff",
                                  }
                                : undefined
                            }
                          >
                            {isActive && (
                              <motion.span
                                layoutId="sidebarActivePill"
                                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                                className="absolute inset-0 rounded-xl"
                                style={{
                                  background: "rgba(255,255,255,0.08)",
                                  zIndex: 0,
                                }}
                              />
                            )}
                            <item.icon className="relative z-10 h-4.5 w-4.5 flex-shrink-0" strokeWidth={2.1} />
                            <span className="relative z-10 truncate">{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </div>
      </Sidebar>
      {isDashboard && (
        <nav className="fixed inset-x-2 bottom-2 z-40 rounded-2xl border border-white/10 bg-neutral-900/95 p-1.5 text-white shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur md:hidden">
          <div className="flex gap-1 overflow-x-auto">
            {navItems.map((item) => {
              const isActive = item.url === "/" ? location.pathname === "/" : location.pathname === item.url || location.pathname.startsWith(item.url + "/");
              return (
                <Link
                  key={item.title}
                  to={item.url}
                  className={`flex min-w-[68px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-semibold transition-colors ${isActive ? "bg-white/15 text-white" : "text-white/60"}`}
                >
                  <item.icon className="h-4 w-4" strokeWidth={2.1} />
                  <span className="max-w-16 truncate">{item.title}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
