import { NavLink } from "react-router-dom";
import { House, Users, CalendarCheck, NotePencil, Siren } from "@phosphor-icons/react";

const BOTTOM_NAV = [
  { to: "/dashboard", label: "Panel", icon: House },
  { to: "/students", label: "Öğrenci", icon: Users },
  { to: "/attendance", label: "Yoklama", icon: CalendarCheck },
  { to: "/daily-cases", label: "Vakalar", icon: Siren },
  { to: "/activity-notes", label: "Etkinlik", icon: NotePencil },
];

export default function BottomNav() {
  return (
    <nav
      data-testid="bottom-nav"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-[#E6E2D6] pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-5">
        {BOTTOM_NAV.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              data-testid={`bnav-${item.to.replace(/\//g, "")}`}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2 text-[10px] tracking-wide transition-all ${
                  isActive ? "text-[#4B6858]" : "text-[#6B7280]"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={22} weight={isActive ? "fill" : "duotone"} />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
