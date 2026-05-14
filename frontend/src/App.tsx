import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar, type PageKey } from "./components/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { Triage } from "./pages/Triage";
import { OCR } from "./pages/OCR";
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
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              {page === "dashboard" && <Dashboard onNavigate={setPage} />}
              {page === "triage" && <Triage />}
              {page === "ocr" && <OCR />}
              {page === "simulation" && <Simulation />}
              {page === "history" && <History />}
              {page === "about" && <About />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
