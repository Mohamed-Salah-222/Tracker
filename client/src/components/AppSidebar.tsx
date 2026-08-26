import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../components/ui/sidebar";
import { useSidebar } from "../components/ui/sidebar-context";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../components/ui/sheet";
import { Sprout } from "lucide-react";
import { isItemActive, navSections } from "../lib/navigation";

/** The dark nav card. Identical on desktop and inside the mobile drawer. */
function NavCard({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-900 text-white shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
      <SidebarHeader className="px-3 pb-3 pt-4">
        <Link to="/" onClick={onNavigate} className="group flex items-center gap-3">
          <motion.div
            whileHover={{ rotate: -10, scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/25 bg-white/10 text-white shadow-inner"
          >
            <Sprout className="h-4.5 w-4.5" strokeWidth={2.35} />
          </motion.div>
          <div className="flex min-w-0 flex-col">
            <span className="text-base font-bold leading-none tracking-tight text-white">LifeTracker</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="overflow-y-auto px-2 pb-3 pt-1">
        {navSections.map((section) => (
          <SidebarGroup key={section.label} className="px-0 py-0">
            <SidebarGroupLabel className="px-3 text-[10px] font-semibold uppercase tracking-wider text-white/40">{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              {section.items.length === 0 ? (
                <p className="px-3 py-1.5 text-[11px] text-white/30">{section.placeholder}</p>
              ) : (
                <SidebarMenu className="gap-1">
                  {section.items.map((item) => {
                    const isActive = isItemActive(pathname, item.url);
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton isActive={isActive} className="h-auto rounded-md p-0 hover:bg-transparent data-active:bg-transparent data-active:text-white">
                          <Link
                            to={item.url}
                            onClick={onNavigate}
                            className={`relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${isActive ? "font-semibold text-white" : "font-semibold text-white/60 hover:text-white"}`}
                            style={isActive ? { background: "rgba(255,255,255,0.15)", color: "#ffffff" } : undefined}
                          >
                            {isActive && (
                              <motion.span
                                layoutId="sidebarActivePill"
                                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                                className="absolute inset-0 rounded-xl"
                                style={{ background: "rgba(255,255,255,0.08)", zIndex: 0 }}
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
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </div>
  );
}

export function AppSidebar() {
  const location = useLocation();
  const { isMobile, openMobile, setOpenMobile } = useSidebar();

  // Close the drawer whenever navigation happens, including browser back.
  useEffect(() => {
    setOpenMobile(false);
  }, [location.pathname, setOpenMobile]);

  // On phones the nav is a drawer. Rendering it inline (the old behaviour) left a
  // 15rem column permanently eating most of the screen on every page but the
  // dashboard, which is what made the content unusable.
  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent side="left" className="w-[17rem] max-w-[85vw] border-0 bg-transparent p-2.5 shadow-none [&>button]:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>Links to every section of LifeTracker.</SheetDescription>
          </SheetHeader>
          <NavCard pathname={location.pathname} onNavigate={() => setOpenMobile(false)} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sidebar collapsible="none" className="hidden h-svh min-h-0 shrink-0 bg-transparent px-2.5 py-3 md:flex md:py-6">
      <NavCard pathname={location.pathname} />
    </Sidebar>
  );
}
