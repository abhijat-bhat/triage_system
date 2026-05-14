import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  accent?: "default" | "warning" | "danger" | "good";
  /** Optional spark history; renders a tiny sparkline at the bottom. */
  spark?: number[];
  /** Render value as money / decimal etc. Defaults to integer for numeric values. */
  format?: (n: number) => string;
}

const ACCENTS: Record<NonNullable<Props["accent"]>, string> = {
  default: "from-accent/15 to-accent/0 text-accent ring-accent/25",
  warning: "from-priority-p2/15 to-transparent text-priority-p2 ring-priority-p2/25",
  danger: "from-priority-p1/15 to-transparent text-priority-p1 ring-priority-p1/25",
  good: "from-priority-p5/15 to-transparent text-priority-p5 ring-priority-p5/25",
};

const STROKE: Record<NonNullable<Props["accent"]>, string> = {
  default: "stroke-accent",
  warning: "stroke-priority-p2",
  danger: "stroke-priority-p1",
  good: "stroke-priority-p5",
};

const GLOW: Record<NonNullable<Props["accent"]>, string> = {
  default: "shadow-[0_0_60px_-30px_rgba(6,182,212,0.6)]",
  warning: "shadow-[0_0_60px_-30px_rgba(249,115,22,0.6)]",
  danger: "shadow-[0_0_60px_-30px_rgba(239,68,68,0.7)]",
  good: "shadow-[0_0_60px_-30px_rgba(16,185,129,0.6)]",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "default",
  spark,
  format,
}: Props) {
  const numeric = typeof value === "number" ? value : null;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className={cn(
        "panel relative overflow-hidden p-5 transition-shadow hover:shadow-glow",
        GLOW[accent],
      )}
    >
      {/* Diagonal sheen */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent" />
      <div
        className={cn(
          "pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full blur-2xl",
          accent === "default" && "bg-accent/20",
          accent === "warning" && "bg-priority-p2/20",
          accent === "danger" && "bg-priority-p1/25",
          accent === "good" && "bg-priority-p5/20",
        )}
      />

      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-ink-50">
            {numeric !== null ? (
              <CountUp value={numeric} format={format} />
            ) : (
              value
            )}
          </p>
          {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
        </div>
        {Icon && (
          <motion.div
            initial={{ rotate: -8, scale: 0.9 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.05 }}
            className={cn(
              "grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ring-1",
              ACCENTS[accent],
            )}
          >
            <Icon className="h-5 w-5" />
          </motion.div>
        )}
      </div>

      {spark && spark.length > 1 && (
        <div className="relative mt-3 h-8">
          <Sparkline points={spark} strokeClass={STROKE[accent]} />
        </div>
      )}
    </motion.div>
  );
}

function CountUp({
  value,
  format,
}: {
  value: number;
  format?: (n: number) => string;
}) {
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { stiffness: 120, damping: 22 });
  const rounded = useTransform(spring, (v) =>
    format ? format(v) : Math.round(v).toString(),
  );
  const [display, setDisplay] = useState(format ? format(0) : "0");

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  useEffect(() => {
    return rounded.on("change", (v) => setDisplay(v));
  }, [rounded]);

  return <span className="tabular-nums">{display}</span>;
}

function Sparkline({
  points,
  strokeClass,
}: {
  points: number[];
  strokeClass: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const w = 100;
  const h = 32;
  if (points.length === 0) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = Math.max(1, max - min);
  const step = points.length > 1 ? w / (points.length - 1) : 0;
  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = h - ((p - min) / span) * h;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  const fillPath = `${path} L ${w} ${h} L 0 ${h} Z`;

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${w} ${h}`}
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
    >
      <path d={fillPath} className={cn("fill-current opacity-10", strokeClass)} />
      <motion.path
        d={path}
        fill="none"
        strokeWidth={1.5}
        className={strokeClass}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
    </svg>
  );
}
