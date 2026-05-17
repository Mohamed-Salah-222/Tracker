import { Link, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../components/ui/sidebar";
import { LayoutDashboard, Wallet, CreditCard, CheckSquare, Sun, Apple, Refrigerator, BookOpen, Activity, Dumbbell } from "lucide-react";

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
      { title: "Workout", url: "/workout", icon: Dumbbell },
    ],
  },
];

export function AppSidebar() {
  const location = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="px-3 py-4 border-b border-sidebar-border">
        <Link to="/" className="flex items-center gap-2 group">
          <motion.div
            whileHover={{ rotate: -10, scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
            style={{
              background: "var(--color-foreground)",
              color: "var(--color-background)",
            }}
          >
            <Activity className="h-3.5 w-3.5" strokeWidth={2.5} />
          </motion.div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold tracking-tight leading-none">Life Tracker</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mt-0.5 leading-none">Personal</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-1 py-2">
        {sections.map((section) => (
          <SidebarGroup key={section.label} className="px-1 py-1">
            <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-2">{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const isActive = location.pathname === item.url;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link to={item.url} className="relative flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors group">
                          {isActive && <motion.span layoutId="sidebarActiveIndicator" transition={{ type: "spring", stiffness: 380, damping: 30 }} className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full" style={{ background: "var(--color-foreground)" }} />}
                          <item.icon className={`h-4 w-4 flex-shrink-0 transition-colors ${isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`} />
                          <span className={`text-sm transition-colors ${isActive ? "text-foreground font-medium" : "text-muted-foreground group-hover:text-foreground"}`}>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
