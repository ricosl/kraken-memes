import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { Home } from "./pages/Home";
import { Scanner } from "./pages/Scanner";
import { Alerts } from "./pages/Alerts";
import { CoinDetail } from "./pages/CoinDetail";
import { Paper } from "./pages/Paper";
import { Settings } from "./pages/Settings";
import { Onboarding } from "./pages/Onboarding";

const ONBOARDING_KEY = "kraken-intel:onboarded";

function App() {
  const [onboarded, setOnboarded] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDING_KEY) === "true";
    } catch {
      return false;
    }
  });

  if (!onboarded) {
    return (
      <Onboarding
        onComplete={() => {
          try {
            localStorage.setItem(ONBOARDING_KEY, "true");
          } catch {
            /* private browsing / storage blocked — proceed anyway */
          }
          setOnboarded(true);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-svh flex-col bg-bg text-text">
      <main className="mx-auto w-full max-w-lg flex-1 pb-24">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/scanner" element={<Scanner />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/alerts/:signalId" element={<Alerts />} />
          <Route path="/coin/:marketId" element={<CoinDetail />} />
          <Route path="/paper" element={<Paper />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}

export default App;
