import { motion } from "framer-motion";
import { agentMeta, cn, priorityMeta } from "../lib/utils";
import type { AgentOutput } from "../types";
import { PriorityBadge } from "./PriorityBadge";

interface Props {
  outputs: Record<string, AgentOutput>;
}

export function AgentOutputGrid({ outputs }: Props) {
  const entries = Object.entries(outputs);
  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-ink-700/60 p-4 text-sm text-ink-400">
        No agent outputs recorded in this audit log.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {entries.map(([name, output], idx) => {
        const meta = agentMeta[name] ?? {
          label: name,
          description: "Worker agent",
          emoji: "🤖",
        };
        const tone = priorityMeta[output.triage_level];
        return (
          <motion.div
            key={name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.06 }}
            className={cn(
              "rounded-xl border border-ink-700/70 bg-ink-800/40 p-4 backdrop-blur-md transition hover:border-accent/40",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-ink-50">
                  <span className="text-base">{meta.emoji}</span>
                  {meta.label}
                </p>
                <p className="text-[11px] text-ink-400">{meta.description}</p>
              </div>
              <PriorityBadge priority={output.triage_level} size="sm" showLabel={false} />
            </div>

            <div className="mt-3 flex items-center gap-3">
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-ink-700/40">
                <motion.span
                  className={cn("absolute left-0 top-0 h-full rounded-full", tone.dot)}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(output.confidence * 100)}%` }}
                  transition={{ duration: 0.7 }}
                />
              </div>
              <span className="font-mono text-xs text-ink-300">
                {(output.confidence * 100).toFixed(0)}%
              </span>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-ink-300">
              {output.reasoning}
            </p>

            {output.flags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {output.flags.map((flag) => (
                  <span
                    key={flag}
                    className="rounded-full bg-priority-p2/10 px-2 py-0.5 text-[10px] font-medium text-priority-p2 ring-1 ring-priority-p2/30"
                  >
                    {flag}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
