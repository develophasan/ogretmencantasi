import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function ProtectedRoute({ children, requireSetup = true }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7]">
        <div className="h-10 w-10 rounded-full border-2 border-[#4B6858]/20 border-t-[#4B6858] animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (requireSetup && !user.setup_completed && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }
  return children;
}
