import { Routes, Route } from "react-router-dom";
import { UnlockPage } from "@/pages/unlock";
import { HomePage } from "@/pages/home";

function Markets() {
  return <div className="p-4">Markets</div>;
}

function MarketDetail() {
  return <div className="p-4">Market Detail</div>;
}

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
      <Route path="/markets" element={<Markets />} />
      <Route path="/markets/:id" element={<MarketDetail />} />
      <Route path="/portfolio" element={<Portfolio />} />
      <Route path="/strategies" element={<Strategies />} />
      <Route path="/arbs" element={<Arbs />} />
      <Route path="/settings" element={<Settings />} />
    </Routes>
  );
}
