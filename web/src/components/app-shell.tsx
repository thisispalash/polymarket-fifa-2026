import { NavLink, Outlet } from "react-router-dom";
import {
  Home,
  LineChart,
  Wallet,
  ArrowLeftRight,
  SlidersHorizontal,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/markets", label: "Markets", icon: LineChart, end: false },
  { to: "/portfolio", label: "Portfolio", icon: Wallet, end: false },
  { to: "/arbs", label: "Arbs", icon: ArrowLeftRight, end: false },
  { to: "/strategies", label: "Strategies", icon: SlidersHorizontal, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
];

// Persistent app frame: a centered reading column for the active route plus a
// fixed bottom tab bar. Every primary destination is reachable from every
// screen, so Strategies/Settings are no longer URL-only orphans.
export function AppShell() {
  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto max-w-2xl pb-[calc(env(safe-area-inset-bottom)+4.5rem)]">
        <Outlet />
      </div>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/80 backdrop-blur-lg pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex max-w-2xl items-stretch">
          {TABS.map((tab) => (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn(
                    "flex h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium tracking-tight transition-colors",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <tab.icon
                      className="h-5 w-5"
                      strokeWidth={isActive ? 2.4 : 1.8}
                      aria-hidden
                    />
                    <span>{tab.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
