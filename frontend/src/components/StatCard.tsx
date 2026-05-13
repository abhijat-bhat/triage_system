import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  accent?: "default" | "warning" | "danger" | "good";
}

const ACCENTS: Record<NonNullable<Props["accent"]>, string> = {
  default: "from-accent/15 to-accent/0 text-accent ring-accent/25",
  warning: "from-priority-p2/15 to-transparent text-priority-p2 ring-priority-p2/25",
  danger: "from-priority-p1/15 to-transparent text-priority-p1 ring-priority-p1/25",
  good: "from-priority-p5/15 to-transparent text-priority-p5 ring-priority-p5/25",
};

export function StatCard({ label, value, hint, icon: Icon, accent = "default" }: Props) {
  return (
    <div className="panel relative overflow-hidden p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-400">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-ink-50">{value}</p>
          {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
        </div>
        {Icon && (
          <div
            className={cn(
              "grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ring-1",
              ACCENTS[accent],
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}
