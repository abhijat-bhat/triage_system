import { cn, priorityMeta } from "../lib/utils";
import type { TriagePriority } from "../types";

interface Props {
  priority: TriagePriority;
  size?: "sm" | "md" | "lg" | "xl";
  showLabel?: boolean;
}

const SIZES: Record<NonNullable<Props["size"]>, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
  lg: "px-3 py-1.5 text-base",
  xl: "px-4 py-2 text-lg",
};

export function PriorityBadge({ priority, size = "md", showLabel = true }: Props) {
  const meta = priorityMeta[priority];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full font-semibold ring-1 backdrop-blur-sm",
        meta.tone,
        meta.bg,
        meta.ring,
        SIZES[size],
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {priority}
      {showLabel && <span className="opacity-70">· {meta.label}</span>}
    </span>
  );
}
