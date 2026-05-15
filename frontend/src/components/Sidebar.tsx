import {
  Activity,
  ChevronRight,
  Database,
  GaugeCircle,
  HeartPulse,
  Info,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "../lib/utils";

export type PageKey =
  | "dashboard"
  | "triage"
  | "simulation"
  | "history"
  | "about";

const NAV: { key: PageKey; label: string; icon: typeof Activity; hint: string }[] =
  [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, hint: "Overview" },
    { key: "triage", label: "Triage", icon: HeartPulse, hint: "Patient intake · OCR" },
    { key: "simulation", label: "Simulation", icon: GaugeCircle, hint: "Hospital sim" },
    { key: "history", label: "History", icon: Database, hint: "Persisted records" },
    { key: "about", label: "Architecture", icon: Info, hint: "How it works" },
  ];

interface Props {
  active: PageKey;
  onChange: (page: PageKey) => void;
  healthy: boolean | null;
}

export function Sidebar({ active, onChange, healthy }: Props) {
  return (
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-ink-700/60 bg-ink-900/60 backdrop-blur-md md:flex md:flex-col">
      <div className="px-6 pb-6 pt-7">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-bold tracking-tight text-ink-50">Triagex</p>
            <p className="text-xs text-ink-400">Multi-agent clinical triage</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              className={cn(
                "group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition",
                isActive
                  ? "bg-accent/12 text-ink-50 ring-1 ring-accent/30"
                  : "text-ink-300 hover:bg-ink-800/60 hover:text-ink-50",
              )}
            >
              <span className="flex items-center gap-3">
                <Icon
                  className={cn(
                    "h-4.5 w-4.5 transition",
                    isActive ? "text-accent" : "text-ink-400 group-hover:text-accent-soft",
                  )}
                />
                <span className="flex flex-col">
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="text-[11px] text-ink-400">{item.hint}</span>
                </span>
              </span>
              <ChevronRight
                className={cn(
                  "h-4 w-4 transition",
                  isActive ? "translate-x-0 text-accent" : "-translate-x-1 text-transparent group-hover:translate-x-0 group-hover:text-ink-500",
                )}
              />
            </button>
          );
        })}
      </nav>

      <div className="border-t border-ink-700/60 px-5 py-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-ink-400">Backend status</p>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
              healthy === null && "bg-ink-700/40 text-ink-300",
              healthy === true && "bg-priority-p5/15 text-priority-p5",
              healthy === false && "bg-priority-p1/15 text-priority-p1",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                healthy === null && "bg-ink-300 animate-pulse-soft",
                healthy === true && "bg-priority-p5 animate-pulse-soft",
                healthy === false && "bg-priority-p1",
              )}
            />
            {healthy === null ? "checking" : healthy ? "online" : "offline"}
          </span>
        </div>
        <p className="mt-3 text-[11px] leading-snug text-ink-500">
          Connected via Vite proxy to FastAPI on
          <span className="ml-1 font-mono text-ink-400">127.0.0.1:8000</span>
        </p>
      </div>
    </aside>
  );
}
