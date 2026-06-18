import { Routes, Route } from "react-router-dom";
import { UnlockPage } from "@/pages/unlock";
import { HomePage } from "@/pages/home";
import { MarketsPage } from "@/pages/markets";
import { MarketDetailPage } from "@/pages/market-detail";

function Portfolio() {
  return <div className="p-4">Portfolio</div>;
}

function Strategies() {
  return <div className="p-4">Strategies</div>;
}

function Arbs() {
  return <div className="p-4">Arbs</div>;
}

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
      <Route path="/portfolio" element={<Portfolio />} />
      <Route path="/strategies" element={<Strategies />} />
      <Route path="/arbs" element={<Arbs />} />
      <Route path="/settings" element={<Settings />} />
    </Routes>
  );
}
