import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const run = async () => {
      const hash = window.location.hash || "";
      const match = hash.match(/session_id=([^&]+)/);
      if (!match) {
        navigate("/login", { replace: true });
        return;
      }
      const sessionId = decodeURIComponent(match[1]);
      try {
        const { data } = await api.post("/auth/session", { session_id: sessionId });
        setUser(data.user);
        // Clear hash
        window.history.replaceState(null, "", "/");
        if (data.user?.setup_completed) {
          navigate("/dashboard", { replace: true, state: { user: data.user } });
        } else {
          navigate("/setup", { replace: true, state: { user: data.user } });
        }
      } catch (_e) {
        navigate("/login", { replace: true });
      }
    };
    run();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7]">
      <div data-testid="auth-callback-loader" className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 rounded-full border-2 border-[#4B6858]/20 border-t-[#4B6858] animate-spin" />
        <p className="text-[#6B7280] font-heading">Giriş yapılıyor…</p>
      </div>
    </div>
  );
}
