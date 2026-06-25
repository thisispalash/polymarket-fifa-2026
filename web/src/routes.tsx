import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { AppShell, PageFallback } from "@/components/app-shell";

// Lazy routes so recharts (market detail) and per-page code split out of the
// initial bundle. Named exports are remapped to default for React.lazy.
const UnlockPage = lazy(() =>
  import("@/pages/unlock").then((m) => ({ default: m.UnlockPage })),
);
const HomePage = lazy(() =>
  import("@/pages/home").then((m) => ({ default: m.HomePage })),
);
const MarketsPage = lazy(() =>
  import("@/pages/markets").then((m) => ({ default: m.MarketsPage })),
);
const MarketDetailPage = lazy(() =>
  import("@/pages/market-detail").then((m) => ({ default: m.MarketDetailPage })),
);
const PortfolioPage = lazy(() =>
  import("@/pages/portfolio").then((m) => ({ default: m.PortfolioPage })),
);
const StrategiesPage = lazy(() =>
  import("@/pages/strategies").then((m) => ({ default: m.StrategiesPage })),
);
const ArbsPage = lazy(() =>
  import("@/pages/arbs").then((m) => ({ default: m.ArbsPage })),
);
const SettingsPage = lazy(() =>
  import("@/pages/settings").then((m) => ({ default: m.SettingsPage })),
);

export function AppRoutes() {
  return (
    <Routes>
      {/* Unlock sits outside the shell — no tab bar before authentication. */}
      <Route
        path="/unlock"
        element={
          <Suspense fallback={<PageFallback />}>
            <UnlockPage />
          </Suspense>
        }
      />
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
