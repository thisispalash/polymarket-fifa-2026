import { Routes, Route } from "react-router-dom";
import { Button } from "@/components/ui/button";

function Home() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">FIFA Trader</h1>
      <Button>Hello FIFA</Button>
    </div>
  );
}

function Unlock() {
  return <div className="p-4">Unlock</div>;
}

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
      <Route path="/unlock" element={<Unlock />} />
      <Route path="/" element={<Home />} />
      <Route path="/markets" element={<Markets />} />
      <Route path="/markets/:id" element={<MarketDetail />} />
      <Route path="/portfolio" element={<Portfolio />} />
      <Route path="/strategies" element={<Strategies />} />
      <Route path="/arbs" element={<Arbs />} />
      <Route path="/settings" element={<Settings />} />
    </Routes>
  );
}
