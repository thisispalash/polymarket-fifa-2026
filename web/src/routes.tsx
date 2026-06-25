import { Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/app-shell";
import { UnlockPage } from "@/pages/unlock";
import { HomePage } from "@/pages/home";
import { MarketsPage } from "@/pages/markets";
import { MarketDetailPage } from "@/pages/market-detail";
import { PortfolioPage } from "@/pages/portfolio";
import { StrategiesPage } from "@/pages/strategies";
import { ArbsPage } from "@/pages/arbs";
import { SettingsPage } from "@/pages/settings";

export function AppRoutes() {
  return (
    <Routes>
      {/* Unlock sits outside the shell — no tab bar before authentication. */}
      <Route path="/unlock" element={<UnlockPage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/markets" element={<MarketsPage />} />
        <Route path="/markets/:id" element={<MarketDetailPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/strategies" element={<StrategiesPage />} />
        <Route path="/arbs" element={<ArbsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
