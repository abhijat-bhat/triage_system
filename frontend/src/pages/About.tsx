import { motion } from "framer-motion";
import {
  Activity,
  Boxes,
  Cpu,
  Database,
  Eye,
  GitFork,
  Layers,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";
import { Card } from "../components/Card";
import { PipelineDiagram } from "../components/PipelineDiagram";

const TECH = [
  "Python 3.12",
  "FastAPI",
  "Pydantic v2",
  "PydanticAI",
  "Mistral API",
  "SQLAlchemy 2",
  "SQLite (WAL)",
  "PyTorch",
  "EfficientNetV2-S",
  "React 18",
  "TypeScript",
  "Tailwind CSS",
  "Recharts",
  "Framer Motion",
  "Vite",
];

const FEATURES = [
  {
    icon: Workflow,
    title: "Async multi-agent orchestrator",
    body:
      "Six specialist agents fan out in parallel from a deterministic router; the orchestrator collects, weights, and critiques their verdicts.",
  },
  {
    icon: ShieldCheck,
    title: "Built-in safety overrides",
    body:
      "Vitals agent hard-escalates lethal vitals to P1 regardless of LLM output. Drug agent flags high-risk interactions deterministically.",
  },
  {
    icon: GitFork,
    title: "Self-critique pass",
    body:
      "Detects high inter-agent disagreement, low global confidence, and vitals-vs-NLP contradictions; auto-escalates or flags for human review.",
  },
  {
    icon: Eye,
    title: "Vision pipeline",
    body:
      "Two-stage EfficientNetV2-S DermNet inference: first picks the severity tier (P1–P5), then the specific dermatological condition.",
  },
  {
    icon: Boxes,
    title: "Hospital discrete-event sim",
    body:
      "Heap-based event loop over resource pools (doctors, beds, machines) with strict-priority or weighted-fair scheduling.",
  },
  {
    icon: Database,
    title: "Full audit log persisted",
    body:
      "Every stage from input receipt to final emission is recorded with timestamps and payloads — accessible via REST.",
  },
];

export function About() {
  return (
    <div className="space-y-8">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent ring-1 ring-accent/30">
          <Sparkles className="h-3.5 w-3.5" />
          how the system thinks
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink-50">Architecture</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-400">
          A research-grade clinical triage pipeline built around strict Pydantic
          schemas, async parallel agents, and deterministic safety nets.
        </p>
      </header>

      <Card
        title="Pipeline overview"
        description="Patient input flows top-to-bottom through every stage; each row is auditable."
      >
        <PipelineDiagram />
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {FEATURES.map((f, idx) => {
          const Icon = f.icon;
          return (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.06 }}
              className="panel p-5"
            >
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/30">
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-semibold text-ink-50">{f.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-300">{f.body}</p>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="REST endpoints" description="What the frontend talks to.">
          <div className="space-y-2">
            <Endpoint method="POST" path="/api/v1/intake/form" desc="Submit patient input → run full pipeline" />
            <Endpoint method="GET" path="/api/v1/triage/{id}" desc="Fetch persisted triage output + audit log" />
            <Endpoint method="POST" path="/api/v1/intake/ocr" desc="Queue scanned document payload for review" />
            <Endpoint method="GET" path="/api/v1/intake/ocr/review-queue" desc="List queued OCR documents" />
            <Endpoint method="POST" path="/api/v1/simulation/run" desc="Run hospital discrete-event simulation" />
            <Endpoint method="GET" path="/api/v1/simulation/{id}" desc="Summary + metrics for one run" />
            <Endpoint method="GET" path="/api/v1/simulation/{id}/events" desc="Full event stream timeline" />
            <Endpoint method="GET" path="/api/v1/simulation/{id}/metrics" desc="Typed metrics payload" />
            <Endpoint method="GET" path="/health" desc="Health check" />
          </div>
        </Card>

        <Card title="Tech stack" description="Everything under the hood.">
          <div className="flex flex-wrap gap-1.5">
            {TECH.map((t) => (
              <span
                key={t}
                className="rounded-full border border-ink-700/60 bg-ink-900/60 px-2.5 py-1 text-xs font-medium text-ink-200"
              >
                {t}
              </span>
            ))}
          </div>
          <div className="mt-5 space-y-2 text-xs text-ink-300">
            <p className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-accent" />
              SQLite hardened with WAL + 30s busy timeout for concurrent writes.
            </p>
            <p className="flex items-center gap-2">
              <Cpu className="h-3.5 w-3.5 text-accent" />
              Mistral LLM enrichment is opt-in via env var; system always falls back to deterministic heuristics.
            </p>
            <p className="flex items-center gap-2">
              <Layers className="h-3.5 w-3.5 text-accent" />
              Strict Pydantic <code className="font-mono">extra="forbid"</code> on every schema for typed safety.
            </p>
            <p className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-accent" />
              All async — six agents run concurrently via <code className="font-mono">asyncio.gather</code>.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Endpoint({
  method,
  path,
  desc,
}: {
  method: "GET" | "POST";
  path: string;
  desc: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-ink-700/60 bg-ink-900/40 px-3 py-2">
      <span
        className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold ${
          method === "POST"
            ? "bg-priority-p2/15 text-priority-p2"
            : "bg-priority-p4/15 text-priority-p4"
        }`}
      >
        {method}
      </span>
      <code className="font-mono text-xs text-ink-100">{path}</code>
      <span className="ml-auto text-[11px] text-ink-400">{desc}</span>
    </div>
  );
}
