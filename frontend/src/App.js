import "@/App.css";
import "@/index.css";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "sonner";

import Login from "@/pages/Login";
import Setup from "@/pages/Setup";
import Dashboard from "@/pages/Dashboard";
import Students from "@/pages/Students";
import StudentNew from "@/pages/StudentNew";
import StudentDetail from "@/pages/StudentDetail";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import Attendance from "@/pages/Attendance";
import DailyCases from "@/pages/DailyCases";
import ActivityNotes from "@/pages/ActivityNotes";
import AuthCallback from "@/pages/AuthCallback";
import ProtectedRoute from "@/components/ProtectedRoute";

function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/setup" element={<ProtectedRoute requireSetup={false}><Setup /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/students" element={<ProtectedRoute><Students /></ProtectedRoute>} />
      <Route path="/students/new" element={<ProtectedRoute><StudentNew /></ProtectedRoute>} />
      <Route path="/students/:id" element={<ProtectedRoute><StudentDetail /></ProtectedRoute>} />
      <Route path="/attendance" element={<ProtectedRoute><Attendance /></ProtectedRoute>} />
      <Route path="/daily-cases" element={<ProtectedRoute><DailyCases /></ProtectedRoute>} />
      <Route path="/activity-notes" element={<ProtectedRoute><ActivityNotes /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
        <Toaster position="top-center" richColors closeButton />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
