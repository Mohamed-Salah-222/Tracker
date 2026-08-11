import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Suspense, lazy, type CSSProperties } from "react";
import { SidebarProvider } from "./components/ui/sidebar";
import { Toaster } from "./components/ui/sonner";
import { AppSidebar } from "./components/AppSidebar";
import { PrivateRoute } from "./components/PrivateRoute";

// Route-level code splitting: each page becomes its own chunk, so opening the app
// no longer downloads every screen's charts, dialogs and tables up front.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Income = lazy(() => import("./pages/Income"));
const Payments = lazy(() => import("./pages/Payments"));
const Foods = lazy(() => import("./pages/Foods"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Today = lazy(() => import("./pages/Today"));
const Calories = lazy(() => import("./pages/Calories"));
const Fridge = lazy(() => import("./pages/Fridge"));
const Workout = lazy(() => import("./pages/Workout"));
const Goals = lazy(() => import("./pages/Goals"));
const GoalDetail = lazy(() => import("./pages/GoalDetail"));
const Projects = lazy(() => import("./pages/Projects"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const Timeline = lazy(() => import("./pages/Timeline"));

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

function AppContent() {
  const location = useLocation();
  const isDashboard = location.pathname === "/";

  return (
    <SidebarProvider className="h-svh overflow-hidden" style={{ "--sidebar-width": "15rem" } as CSSProperties}>
      <AppSidebar />
      <main className="flex-1 h-svh w-full min-w-0 overflow-hidden flex flex-col">
        {/* Page content */}
        <div className={`flex-1 overflow-y-auto overscroll-contain p-3 w-full min-w-0 ${isDashboard ? "md:py-6 md:pr-6 md:pl-0.5" : "md:p-6 flex justify-center"}`}>
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
              <Route path="/goals" element={<Goals />} />
              <Route path="/goals/:goalId" element={<GoalDetail />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:projectId" element={<ProjectDetail />} />
              <Route path="/timeline" element={<Timeline />} />
              <Route path="/today" element={<Today />} />
              <Route path="/calories" element={<Calories />} />
              <Route path="/fridge" element={<Fridge />} />
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
