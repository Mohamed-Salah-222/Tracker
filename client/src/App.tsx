import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect, type CSSProperties } from "react";
import { SidebarProvider } from "./components/ui/sidebar";
import { SettingsProvider } from "./components/SettingsProvider";
import { ThemeApplier } from "./components/ThemeApplier";
import { useSidebar } from "./components/ui/sidebar-context";
import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";
import { AppSidebar } from "./components/AppSidebar";
import { currentPageTitle } from "./lib/navigation";
import { PrivateRoute } from "./components/PrivateRoute";
import { InstallHint, OfflinePill } from "./components/ConnectionStatus";
import { moduleForRoute } from "./lib/modules";
import { useSettings } from "./lib/useSettings";
import { pingUsage, watchWrites } from "./lib/streak";
import { refreshSubscription } from "./lib/reminders";
import { installOfflineQueue } from "./lib/offlineQueue";
import { installUndo } from "./lib/undo";
import { Menu } from "lucide-react";

// Route-level code splitting: each page becomes its own chunk, so opening the app
// no longer downloads every screen's charts, dialogs and tables up front.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Income = lazy(() => import("./pages/Income"));
const Payments = lazy(() => import("./pages/Payments"));
const Foods = lazy(() => import("./pages/Foods"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Today = lazy(() => import("./pages/Today"));
const Calories = lazy(() => import("./pages/Calories"));
const Kitchen = lazy(() => import("./pages/Kitchen"));
const Habits = lazy(() => import("./pages/Habits"));
const HabitPage = lazy(() => import("./pages/HabitPage"));
const Goals = lazy(() => import("./pages/Goals"));
const Journal = lazy(() => import("./pages/Journal"));
const Badges = lazy(() => import("./pages/Badges"));
const Settings = lazy(() => import("./pages/Settings"));
const GoalPage = lazy(() => import("./pages/GoalPage"));
const Workout = lazy(() => import("./pages/Workout"));

function PageFallback() {
  return <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">Loading…</div>;
}

export default function App() {
  return (
    <SettingsProvider>
      <ThemeApplier />
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </SettingsProvider>
  );
}

/** Phone-only header. The nav is a drawer at this size, so it needs a way in. */
function MobileTopBar() {
  const location = useLocation();
  const { toggleSidebar } = useSidebar();

  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-border bg-background/95 px-2 py-2 backdrop-blur md:hidden">
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="Open navigation"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-foreground transition-colors hover:bg-muted active:bg-muted"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>
      <span className="truncate text-sm font-semibold tracking-tight">{currentPageTitle(location.pathname)}</span>
      <OfflinePill className="ml-auto shrink-0" />
    </header>
  );
}

/**
 * A page belonging to a module that is switched off is not reachable, even by typing
 * the address. Leaving it open would mean a "simple" setup could still be walked into
 * by an old bookmark, and the page would be there with its data and no way back to it
 * in the nav.
 *
 * Nothing is deleted, so this is a redirect and not an error.
 */
function ModuleRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { enabled, loaded } = useSettings();
  const owner = moduleForRoute(location.pathname);
  // Until the settings have loaded every module counts as on, or a slow answer would
  // bounce you off the page you asked for.
  if (loaded && owner && !enabled(owner.key)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppContent() {
  const location = useLocation();
  const isDashboard = location.pathname === "/";

  /**
   * Keeping the tracker is itself the habit, so opening it counts, and so does every
   * write from here on. Both funnel into one ping that the server only counts once a
   * day, and a failure here is swallowed: no streak is worth a broken page.
   */
  useEffect(() => {
    // Before anything else can fail: a write that leaves in a dead zone is kept and
    // replayed rather than lost.
    installOfflineQueue();
    // Every delete in the app now offers to be taken back, without any page knowing.
    installUndo();
    watchWrites();
    void pingUsage("open");
    // Push endpoints rotate. Re-reporting what the browser holds keeps the server
    // from quietly pushing into a dead one.
    void refreshSubscription();

    /**
     * Everything queued offline has landed.
     *
     * Rows created while offline are still on screen with placeholder ids, so the
     * refresh is offered rather than forced: nobody wants the page pulled out from
     * under them mid sentence.
     */
    const onSynced = (event: Event) => {
      const count = (event as CustomEvent<{ count: number }>).detail?.count ?? 0;
      if (count <= 0) return;
      toast.success(`Saved ${count} change${count === 1 ? "" : "s"}`, {
        description: "Made while you were offline.",
        action: { label: "Refresh", onClick: () => window.location.reload() },
      });
    };
    window.addEventListener("lifetracker:synced", onSynced);
    return () => window.removeEventListener("lifetracker:synced", onSynced);
  }, []);

  return (
    <SidebarProvider className="h-svh overflow-hidden" style={{ "--sidebar-width": "15rem" } as CSSProperties}>
      <AppSidebar />
      <main className="flex-1 h-svh w-full min-w-0 overflow-hidden flex flex-col">
        <MobileTopBar />
        {/* Page content. The bottom gutter matches the sidebar card's own inset so
            the last element on a page lines up with where the sidebar ends, and
            clears the iOS home indicator on phones.

            `items-start` is load-bearing: with the default `align-items: stretch`
            the centred page column is capped at the container's height and its
            taller content spills out as *visible overflow*, which padding-bottom
            does not extend past, so the last card ended up clipped flush against
            the viewport edge. Sizing the column to its content puts the padding
            back inside the scrollable area. */}
        <div
          className={`flex-1 overflow-y-auto overscroll-contain p-3 w-full min-w-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-[max(1.5rem,env(safe-area-inset-bottom))] ${isDashboard ? "md:py-6 md:pr-6 md:pl-0.5" : "md:p-6 flex justify-center items-start"}`}
        >
          <InstallHint />
          <Suspense fallback={<PageFallback />}>
            <ModuleRoute>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route
                path="/income"
                element={
                  <PrivateRoute>
                    <Income />
                  </PrivateRoute>
                }
              />
              <Route
                path="/payments"
                element={
                  <PrivateRoute>
                    <Payments />
                  </PrivateRoute>
                }
              />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/habits" element={<Habits />} />
              <Route path="/habits/:key" element={<HabitPage />} />
              <Route path="/goals" element={<Goals />} />
              <Route path="/goals/:id" element={<GoalPage />} />
              <Route path="/today" element={<Today />} />
              <Route path="/journal" element={<Journal />} />
              <Route path="/badges" element={<Badges />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/calories" element={<Calories />} />
              <Route path="/kitchen" element={<Kitchen />} />
              {/* Old bookmarks keep working. */}
              <Route path="/fridge" element={<Navigate to="/kitchen" replace />} />
              <Route path="/foods" element={<Foods />} />
              <Route path="/workout" element={<Workout />} />
            </Routes>
            </ModuleRoute>
          </Suspense>
        </div>
      </main>
      <Toaster position="top-right" />
    </SidebarProvider>
  );
}
