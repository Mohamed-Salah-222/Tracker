import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../components/ui/sidebar";
import { useSidebar } from "../components/ui/sidebar-context";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../components/ui/sheet";
import { Sprout } from "lucide-react";
import { isItemActive, visibleSections } from "../lib/navigation";
import { useSettings } from "../lib/useSettings";
import { StreakPill } from "./StreakPill";
import { OfflinePill } from "./ConnectionStatus";

/**
 * The nav card. Identical on desktop and inside the mobile drawer.
 *
 * A white card on the page's off-white ground, like every other surface in the app.
 * It used to be a black slab, which made the one permanent element on screen the one
 * element that did not belong to the design.
 *
 * The palette still has only two colours, so the current page is shown the way every
 * other selected thing here is shown: filled black, not tinted.
 */
function NavCard({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const { settings, enabled } = useSettings();
  const sections = visibleSections(enabled, settings.navOrder);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-[var(--shadow-card)]">
      <SidebarHeader className="px-3 pb-3 pt-4">
        <Link to="/" onClick={onNavigate} className="group flex items-center gap-3">
          <motion.div
            whileHover={{ rotate: -10, scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-foreground text-background"
          >
            <Sprout className="h-4.5 w-4.5" strokeWidth={2.35} />
          </motion.div>
          <div className="flex min-w-0 flex-col">
            <span className="text-base font-bold leading-none tracking-tight">LifeTracker</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="overflow-y-auto px-2 pb-3 pt-1">
        {sections.map((section) => (
          <SidebarGroup key={section.label} className="px-0 py-0">
            <SidebarGroupLabel className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              {section.items.length === 0 ? (
                <p className="px-3 py-1.5 text-[11px] text-muted-foreground">{section.placeholder}</p>
              ) : (
                <SidebarMenu className="gap-1">
                  {section.items.map((item) => {
                    const isActive = isItemActive(pathname, item.url);
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton isActive={isActive} className="h-auto rounded-md p-0 hover:bg-transparent data-active:bg-transparent">
                          <Link
                            to={item.url}
                            onClick={onNavigate}
                            className={`relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                              isActive ? "text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                          >
                            {isActive && (
                              <motion.span
                                layoutId="sidebarActivePill"
                                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                                className="absolute inset-0 rounded-lg bg-foreground"
                                style={{ zIndex: 0 }}
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

      <div className="mx-2 mb-2 hidden justify-center md:flex [&:has(span)]:flex">
        <OfflinePill />
      </div>
      <StreakPill onNavigate={onNavigate} />
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
