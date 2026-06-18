import { Routes, Route } from "react-router-dom";
import { UnlockPage } from "@/pages/unlock";
import { HomePage } from "@/pages/home";
import { MarketsPage } from "@/pages/markets";
import { MarketDetailPage } from "@/pages/market-detail";
import { PortfolioPage } from "@/pages/portfolio";
import { StrategiesPage } from "@/pages/strategies";
import { ArbsPage } from "@/pages/arbs";

function Settings() {
  return <div className="p-4">Settings</div>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/unlock" element={<UnlockPage />} />
      <Route path="/" element={<HomePage />} />
      <Route path="/markets" element={<MarketsPage />} />
      <Route path="/markets/:id" element={<MarketDetailPage />} />
      <Route path="/portfolio" element={<PortfolioPage />} />
      <Route path="/strategies" element={<StrategiesPage />} />
      <Route path="/arbs" element={<ArbsPage />} />
      <Route path="/settings" element={<Settings />} />
    </Routes>
  );
}
