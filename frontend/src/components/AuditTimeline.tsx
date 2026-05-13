import { useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronDown,
  CircleCheck,
  CircleDot,
  Cpu,
  FileCheck,
  Flag,
  GitFork,
  Scale,
  Send,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";
import type { AuditEntry } from "../types";

const STAGE_META: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  input_received: { label: "Patient input received", icon: Send, tone: "text-ink-200" },
  deidentification_complete: {
    label: "De-identification complete",
    icon: ShieldCheck,
    tone: "text-accent",
  },
  fhir_normalization_complete: {
    label: "FHIR normalization",
    icon: FileCheck,
    tone: "text-accent",
  },
  routing_decision: { label: "Agent routing", icon: GitFork, tone: "text-priority-p4" },
  worker_outputs: { label: "Worker agent outputs", icon: Cpu, tone: "text-priority-p2" },
  aggregation_complete: {
    label: "Weighted aggregation",
    icon: Scale,
    tone: "text-priority-p3",
  },
  self_critique_complete: {
    label: "Self-critique pass",
    icon: Flag,
    tone: "text-priority-p1",
  },
  final_output_emitted: {
    label: "Final triage emitted",
    icon: CircleCheck,
    tone: "text-priority-p5",
  },
};

interface Props {
  entries: AuditEntry[];
}

export function AuditTimeline({ entries }: Props) {
  return (
    <ol className="relative space-y-3">
      <span className="pointer-events-none absolute left-[14px] top-2 bottom-2 w-px bg-gradient-to-b from-accent/40 via-ink-700/60 to-ink-700/0" />
      {entries.map((entry, idx) => (
        <Entry key={`${entry.stage}-${idx}`} entry={entry} index={idx} />
      ))}
    </ol>
  );
}

function Entry({ entry, index }: { entry: AuditEntry; index: number }) {
  const meta = STAGE_META[entry.stage] ?? {
    label: entry.stage,
    icon: CircleDot,
    tone: "text-ink-300",
  };
  const Icon = meta.icon;
  const [open, setOpen] = useState(false);

  return (
    <motion.li
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
      className="relative pl-10"
    >
      <span
        className={cn(
          "absolute left-0 top-1 grid h-7 w-7 place-items-center rounded-full border border-ink-700/70 bg-ink-800/80 shadow-panel",
          meta.tone,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <button
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition hover:bg-ink-800/40"
      >
        <div>
          <p className="text-sm font-medium text-ink-100">{meta.label}</p>
          <p className="font-mono text-[11px] text-ink-500">{entry.stage}</p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-ink-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <motion.pre
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="ml-3 mt-1 max-h-72 overflow-auto rounded-lg border border-ink-700/70 bg-ink-900/60 px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-300 scrollbar-thin"
        >
          {JSON.stringify(entry.payload, null, 2)}
        </motion.pre>
      )}
    </motion.li>
  );
}
