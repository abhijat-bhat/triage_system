import { useEffect, useState } from "react";
import { Sidebar, type PageKey } from "./components/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { Triage } from "./pages/Triage";
import { Simulation } from "./pages/Simulation";
import { History } from "./pages/History";
import { About } from "./pages/About";
import { api } from "./lib/api";

export default function App() {
  const [page, setPage] = useState<PageKey>("dashboard");
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      try {
        const result = await api.health();
        if (!cancelled) setHealthy(result.status === "ok");
      } catch {
        if (!cancelled) setHealthy(false);
      }
    };
    ping();
    const interval = setInterval(ping, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar active={page} onChange={setPage} healthy={healthy} />
      <main className="relative flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-7xl px-8 py-10">
          <section className={page === "dashboard" ? "block" : "hidden"} aria-hidden={page !== "dashboard"}>
            <Dashboard onNavigate={setPage} />
          </section>
          <section className={page === "triage" ? "block" : "hidden"} aria-hidden={page !== "triage"}>
            <Triage />
          </section>
          <section className={page === "simulation" ? "block" : "hidden"} aria-hidden={page !== "simulation"}>
            <Simulation />
          </section>
          <section className={page === "history" ? "block" : "hidden"} aria-hidden={page !== "history"}>
            <History />
          </section>
          <section className={page === "about" ? "block" : "hidden"} aria-hidden={page !== "about"}>
            <About />
          </section>
        </div>
      </main>
    </div>
  );
}
