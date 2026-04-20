import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  House,
  Users,
  CalendarBlank,
  CalendarCheck,
  Gear,
  NotePencil,
  SignOut,
  Siren,
  List,
  X,
  ChartBar,
} from "@phosphor-icons/react";
import { useState, useEffect } from "react";
import BottomNav from "@/components/BottomNav";
import ChatWidget from "@/components/ChatWidget";

const NAV = [
  { to: "/dashboard", label: "Panel", icon: House },
  { to: "/students", label: "Öğrenciler", icon: Users },
  { to: "/students/new", label: "Yeni Kayıt", icon: NotePencil },
  { to: "/attendance", label: "Yoklama", icon: CalendarCheck },
  { to: "/daily-cases", label: "Vakalar", icon: Siren },
  { to: "/activity-notes", label: "Etkinlik", icon: NotePencil },
  { to: "/reports", label: "Raporlar", icon: CalendarBlank },
  { to: "/settings", label: "Ayarlar", icon: Gear },
];

const ADMIN_NAV = [
  { to: "/admin", label: "Admin Paneli", icon: ChartBar },
];

export default function Layout({ children }) {
  const { user } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();

  // Close menu when route changes
  useEffect(() => {
    setIsMenuOpen(false);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#28332D] pb-20 md:pb-0 relative overflow-x-hidden">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-[#FDFBF7]/90 backdrop-blur border-b border-[#E6E2D6]">
        {/* Mobile (centered title) */}
        <div className="md:hidden relative h-14 flex items-center justify-center px-4">
          <Link to="/dashboard" className="font-heading text-lg tracking-tight" data-testid="brand-link-mobile">
            Öğretmen Çantası
          </Link>
          <button
            onClick={() => setIsMenuOpen(true)}
            data-testid="mobile-menu-button"
            className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full hover:bg-[#F1EDE4] flex items-center justify-center text-[#28332D]"
            aria-label="Menü"
          >
            <List size={24} weight="duotone" />
          </button>
        </div>

        {/* Desktop */}
        <div className="hidden md:flex max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 items-center justify-between gap-4">
          <Link to="/dashboard" className="flex items-center gap-3 shrink-0" data-testid="brand-link">
            <div className="h-9 w-9 rounded-xl bg-[#4B6858] flex items-center justify-center">
              <span className="font-heading text-white text-sm">Öç</span>
            </div>
            <div>
              <p className="font-heading text-[15px] leading-tight">Öğretmen Çantası</p>
              <p className="text-xs text-[#6B7280] leading-tight">
                {user?.school_name || "Okul Öncesi Yönetim"}
              </p>
            </div>
          </Link>

          <nav className="flex items-center gap-0.5 flex-wrap justify-center">
            {(user?.role === "admin" ? [...NAV, ...ADMIN_NAV] : NAV).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                data-testid={`nav-${item.to.replace(/\//g, "")}`}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-full text-xs transition-all duration-200 flex items-center gap-1.5 ${
                    isActive
                      ? "bg-[#F1EDE4] text-[#28332D]"
                      : "text-[#6B7280] hover:text-[#28332D] hover:bg-[#F1EDE4]/60"
                  }`
                }
              >
                <item.icon size={16} weight="duotone" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <img
                src={user?.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || "Öğretmen")}&background=4B6858&color=fff`}
                alt="avatar"
                className="h-9 w-9 rounded-full border border-[#E6E2D6]"
              />
              <div className="leading-tight hidden lg:block">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-[#6B7280]">
                  {user?.education_model === "Maarif" ? "Maarif" : user?.education_model === "ECE" ? "EÇE" : "Kurulum bekliyor"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Sidebar Overlay */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 z-[60] bg-[#28332D]/40 backdrop-blur-sm md:hidden"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar (Right) */}
      <div className={`fixed inset-y-0 right-0 w-[280px] bg-[#FDFBF7] z-[70] shadow-2xl transform transition-transform duration-300 ease-in-out md:hidden ${isMenuOpen ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex flex-col h-full ring-1 ring-black/5">
          <div className="p-6 border-b border-[#E6E2D6] flex items-center justify-between bg-white/50 backdrop-blur-sm">
            <span className="font-heading text-lg">Menü</span>
            <button 
              onClick={() => setIsMenuOpen(false)}
              className="h-10 w-10 rounded-full bg-[#F1EDE4] flex items-center justify-center text-[#28332D] transition-colors hover:bg-[#E6E2D6]"
            >
              <X size={20} weight="bold" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <div className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-[#E6E2D6] shadow-sm">
              <img
                src={user?.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || "Öğretmen")}&background=4B6858&color=fff`}
                alt="avatar"
                className="h-10 w-10 rounded-full ring-2 ring-[#4B6858]/10"
              />
              <div className="leading-tight">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-[11px] text-[#6B7280] truncate max-w-[150px]">
                  {user?.school_name || "Öğretmen Hesabı"}
                </p>
              </div>
            </div>

            <nav className="space-y-1.5">
              {(user?.role === "admin" ? [...NAV, ...ADMIN_NAV] : NAV).map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 p-4 rounded-xl text-sm transition-all duration-200 ${
                      isActive
                        ? "bg-[#4B6858] text-white font-medium shadow-md -translate-x-1"
                        : "text-[#6B7280] hover:bg-[#F1EDE4] hover:text-[#28332D]"
                    }`
                  }
                >
                  <item.icon size={22} weight="duotone" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="p-8 border-t border-[#E6E2D6] text-center bg-white/30 backdrop-blur-sm">
            <p className="text-[11px] uppercase tracking-widest text-[#9CA3AF] font-medium">Öğretmen Çantası</p>
            <p className="text-[9px] text-[#9CA3AF] mt-1 opacity-60">Version 1.0.0</p>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-12">{children}</main>

      <BottomNav />
      <ChatWidget />
    </div>
  );
}
