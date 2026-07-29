import { BrowserRouter, Routes, Route } from "react-router-dom";
import type { CSSProperties } from "react";
import { SidebarProvider } from "./components/ui/sidebar";
import { Toaster } from "./components/ui/sonner";
import { AppSidebar } from "./components/AppSidebar";
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
import MedicalEnglish from "./pages/MedicalEnglish";
import Goals from "./pages/Goals";
import GoalDetail from "./pages/GoalDetail";

export default function App() {
  return (
    <BrowserRouter>
      <SidebarProvider style={{ "--sidebar-width": "13.5rem" } as CSSProperties}>
        <AppSidebar />
        <main className="flex-1 w-full min-w-0 flex flex-col">
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
              <Route path="/goals" element={<Goals />} />
              <Route path="/goals/:goalId" element={<GoalDetail />} />
              <Route path="/today" element={<Today />} />
              <Route path="/calories" element={<Calories />} />
              <Route path="/fridge" element={<Fridge />} />
              <Route path="/foods" element={<Foods />} />
              <Route path="/workout" element={<Workout />} />
              <Route path="/career" element={<Career />} />
              <Route path="/career/:topicId" element={<CareerTopic />} />
              <Route path="/medical-english" element={<MedicalEnglish />} />
            </Routes>
          </div>
        </main>
        <Toaster position="top-right" />
      </SidebarProvider>
    </BrowserRouter>
  );
}
