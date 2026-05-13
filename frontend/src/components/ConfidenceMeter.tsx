import { motion } from "framer-motion";
import { cn } from "../lib/utils";

interface Props {
  value: number;
  size?: number;
  label?: string;
}

export function ConfidenceMeter({ value, size = 132, label }: Props) {
  const clamped = Math.max(0, Math.min(1, value));
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);

  const tone =
    clamped >= 0.75
      ? "stroke-priority-p5"
      : clamped >= 0.5
        ? "stroke-accent"
        : clamped >= 0.3
          ? "stroke-priority-p3"
          : "stroke-priority-p1";

  return (
    <div className="relative inline-flex flex-col items-center">
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgb(30 41 59 / 0.6)"
          strokeWidth={stroke}
          fill="none"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          className={cn(tone, "drop-shadow-[0_0_8px_rgba(6,182,212,0.45)]")}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-2xl font-bold text-ink-50">
          {(clamped * 100).toFixed(0)}
          <span className="ml-0.5 text-base text-ink-400">%</span>
        </p>
        {label && <p className="text-[11px] uppercase tracking-wider text-ink-400">{label}</p>}
      </div>
    </div>
  );
}
