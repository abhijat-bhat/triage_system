import { motion } from "framer-motion";
import { agentMeta, cn } from "../lib/utils";

const STAGES: { key: string; label: string; sublabel: string }[] = [
  { key: "input", label: "Patient Input", sublabel: "EHR + vitals + complaint" },
  { key: "deid", label: "De-identify", sublabel: "PHI redaction" },
  { key: "fhir", label: "FHIR Format", sublabel: "Bundle normalization" },
];

const AGGREGATION: { key: string; label: string; sublabel: string }[] = [
  { key: "aggregate", label: "Weighted Voting", sublabel: "Severity × confidence" },
  { key: "critique", label: "Self-Critique", sublabel: "Disagreement & contradictions" },
  { key: "output", label: "Final Triage", sublabel: "P1–P5 + audit log" },
];

const AGENTS = Object.keys(agentMeta);

export function PipelineDiagram() {
  return (
    <div className="space-y-6">
      <Lane stages={STAGES} accent />
      <FanOut />
      <Lane stages={AGGREGATION} />
    </div>
  );
}

function Lane({
  stages,
  accent,
}: {
  stages: { key: string; label: string; sublabel: string }[];
  accent?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {stages.map((s, idx) => (
        <motion.div
          key={s.key}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.08 }}
          className={cn(
            "rounded-xl border p-4 backdrop-blur",
            accent
              ? "border-accent/30 bg-accent/8"
              : "border-ink-700/70 bg-ink-800/40",
          )}
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">
            {s.label}
          </p>
          <p className="mt-1 text-sm text-ink-300">{s.sublabel}</p>
        </motion.div>
      ))}
    </div>
  );
}

function FanOut() {
  return (
    <div className="panel-tight p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-300">
          Parallel Worker Agents
        </p>
        <span className="chip text-[10px] text-accent">async fan-out</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        {AGENTS.map((name, idx) => {
          const meta = agentMeta[name];
          return (
            <motion.div
              key={name}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + idx * 0.04 }}
              className="rounded-lg border border-ink-700/60 bg-ink-900/60 p-3 transition hover:border-accent/40 hover:shadow-glow"
            >
              <div className="text-lg">{meta.emoji}</div>
              <p className="mt-1 text-xs font-semibold text-ink-100">{meta.label}</p>
              <p className="mt-0.5 text-[10px] leading-snug text-ink-400">
                {meta.description}
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
