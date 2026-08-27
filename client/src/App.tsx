import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Suspense, lazy, type CSSProperties } from "react";
import { SidebarProvider } from "./components/ui/sidebar";
import { useSidebar } from "./components/ui/sidebar-context";
import { Toaster } from "./components/ui/sonner";
import { AppSidebar } from "./components/AppSidebar";
import { currentPageTitle } from "./lib/navigation";
import { PrivateRoute } from "./components/PrivateRoute";
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
const Workout = lazy(() => import("./pages/Workout"));

function PageFallback() {
  return <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">Loading…</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
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
    </header>
  );
}

function AppContent() {
  const location = useLocation();
  const isDashboard = location.pathname === "/";

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
          <Suspense fallback={<PageFallback />}>
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
              <Route path="/today" element={<Today />} />
              <Route path="/calories" element={<Calories />} />
              <Route path="/kitchen" element={<Kitchen />} />
              {/* Old bookmarks keep working. */}
              <Route path="/fridge" element={<Navigate to="/kitchen" replace />} />
              <Route path="/foods" element={<Foods />} />
              <Route path="/workout" element={<Workout />} />
            </Routes>
          </Suspense>
        </div>
      </main>
      <Toaster position="top-right" />
    </SidebarProvider>
  );
}
