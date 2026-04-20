import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  House,
  Users,
  CalendarBlank,
  Gear,
  NotePencil,
  SignOut,
  List as ListIcon,
  X,
} from "@phosphor-icons/react";
import { useState } from "react";

const NAV = [
  { to: "/dashboard", label: "Panel", icon: House },
  { to: "/students", label: "Öğrenciler", icon: Users },
  { to: "/students/new", label: "Yeni Kayıt", icon: NotePencil },
  { to: "/reports", label: "Raporlar", icon: CalendarBlank },
  { to: "/settings", label: "Sınıf Ayarları", icon: Gear },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#28332D]">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-[#FDFBF7]/85 backdrop-blur border-b border-[#E6E2D6]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-3" data-testid="brand-link">
            <div className="h-9 w-9 rounded-xl bg-[#4B6858] flex items-center justify-center">
              <span className="font-heading text-white text-sm">Öç</span>
            </div>
            <div className="hidden sm:block">
              <p className="font-heading text-[15px] leading-tight">Öğretmen Çantası</p>
              <p className="text-xs text-[#6B7280] leading-tight">
                {user?.school_name || "Okul Öncesi Yönetim"}
              </p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                data-testid={`nav-${item.to.replace(/\//g, "")}`}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-full text-sm transition-all duration-200 flex items-center gap-2 ${
                    isActive
                      ? "bg-[#F1EDE4] text-[#28332D]"
                      : "text-[#6B7280] hover:text-[#28332D] hover:bg-[#F1EDE4]/60"
                  }`
                }
              >
                <item.icon size={18} weight="duotone" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-3">
              <img
                src={user?.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || "Öğretmen")}&background=4B6858&color=fff`}
                alt="avatar"
                className="h-9 w-9 rounded-full border border-[#E6E2D6]"
              />
              <div className="leading-tight">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-[#6B7280]">
                  {user?.education_model === "Maarif" ? "Maarif Modeli" : user?.education_model === "ECE" ? "EÇE Modeli" : "Kurulum bekliyor"}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              data-testid="logout-button"
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm text-[#6B7280] hover:text-[#C86B5E] hover:bg-[#F1EDE4] transition-all"
            >
              <SignOut size={18} weight="duotone" />
              Çıkış
            </button>
            <button
              className="md:hidden h-10 w-10 rounded-full flex items-center justify-center hover:bg-[#F1EDE4]"
              onClick={() => setOpen((v) => !v)}
              aria-label="menu"
              data-testid="mobile-menu-toggle"
            >
              {open ? <X size={22} weight="duotone" /> : <ListIcon size={22} weight="duotone" />}
            </button>
          </div>
        </div>
        {open && (
          <div className="md:hidden border-t border-[#E6E2D6] bg-[#FDFBF7]">
            <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-1">
              {NAV.map((item) => (
                <button
                  key={item.to}
                  onClick={() => {
                    setOpen(false);
                    navigate(item.to);
                  }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F1EDE4] text-left"
                  data-testid={`mobile-nav-${item.to.replace(/\//g, "")}`}
                >
                  <item.icon size={20} weight="duotone" className="text-[#4B6858]" />
                  <span className="text-sm">{item.label}</span>
                </button>
              ))}
              <button
                onClick={logout}
                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F1EDE4] text-left text-[#C86B5E]"
                data-testid="mobile-logout-button"
              >
                <SignOut size={20} weight="duotone" />
                <span className="text-sm">Çıkış</span>
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">{children}</main>
    </div>
  );
}
