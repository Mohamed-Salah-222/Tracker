import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "./components/ui/sidebar";
import { Toaster } from "./components/ui/sonner";
import { AppSidebar } from "./components/AppSidebar";
import { ThemeToggle } from "./components/ThemeToggle";
import Dashboard from "./pages/Dashboard";
import Income from "./pages/Income";
import Payments from "./pages/Payments";
import Foods from "./pages/Foods";
import Tasks from "./pages/Tasks";
import Today from "./pages/Today";
import Calories from "./pages/Calories";
import Fridge from "./pages/Fridge";
import { PrivateRoute } from "./components/PrivateRoute";
import Workout from "./pages/Workout";
import Career from "./pages/Career";
import CareerTopic from "./pages/CareerTopic";

export default function App() {
  return (
    <BrowserRouter>
      <SidebarProvider>
        <AppSidebar />
        <main className="flex-1 w-full min-w-0 flex flex-col">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex items-center justify-between px-3 md:px-6 py-2.5 bg-background/80 backdrop-blur-md border-b border-border">
            <SidebarTrigger />
            <ThemeToggle />
          </header>

          {/* Page content */}
          <div className="flex-1 p-3 md:p-6 w-full min-w-0">
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
              <Route path="/today" element={<Today />} />
              <Route path="/calories" element={<Calories />} />
              <Route path="/fridge" element={<Fridge />} />
              <Route path="/foods" element={<Foods />} />
              <Route path="/workout" element={<Workout />} />
              <Route path="/career" element={<Career />} />
              <Route path="/career/:topicId" element={<CareerTopic />} />
            </Routes>
          </div>
        </main>
        <Toaster position="top-right" />
      </SidebarProvider>
    </BrowserRouter>
  );
}
