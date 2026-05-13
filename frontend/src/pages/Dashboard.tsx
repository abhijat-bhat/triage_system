import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  GaugeCircle,
  HeartPulse,
  Loader2,
  PlayCircle,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Card } from "../components/Card";
import { PipelineDiagram } from "../components/PipelineDiagram";
import { PriorityBadge } from "../components/PriorityBadge";
import { StatCard } from "../components/StatCard";
import { api } from "../lib/api";
import {
  formatRelative,
  loadActivity,
  pushActivity,
  sampleCases,
} from "../lib/utils";
import type { PageKey } from "../components/Sidebar";
import type { ActivityEntry } from "../types";

interface SmokeStep {
  key: string;
  label: string;
  status: "idle" | "running" | "done" | "error";
  detail?: string;
}

interface Props {
  onNavigate: (page: PageKey) => void;
}

const INITIAL_STEPS: SmokeStep[] = [
  { key: "form", label: "Patient form intake", status: "idle" },
  { key: "ocr", label: "OCR queue submission", status: "idle" },
  { key: "sim_run", label: "Hospital simulation run", status: "idle" },
  { key: "sim_detail", label: "Simulation detail fetch", status: "idle" },
  { key: "sim_metrics", label: "Simulation metrics fetch", status: "idle" },
];

export function Dashboard({ onNavigate }: Props) {
  const [activity, setActivity] = useState<ActivityEntry[]>(() => loadActivity());
  const [steps, setSteps] = useState<SmokeStep[]>(INITIAL_STEPS);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const handler = () => setActivity(loadActivity());
    window.addEventListener("triagex:activity", handler);
    return () => window.removeEventListener("triagex:activity", handler);
  }, []);

  const stats = useMemo(() => {
    const triages = activity.filter((a) => a.kind === "triage");
    const sims = activity.filter((a) => a.kind === "simulation");
    const ocrs = activity.filter((a) => a.kind === "ocr");
    const p1count = triages.filter((a) => a.priority === "P1" || a.priority === "P2").length;
    return {
      triages: triages.length,
      sims: sims.length,
      ocrs: ocrs.length,
      escalations: p1count,
    };
  }, [activity]);

  const runSmoke = async () => {
    setRunning(true);
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: "idle" })));

    const update = (key: string, patch: Partial<SmokeStep>) =>
      setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));

    try {
      update("form", { status: "running" });
      const form = await api.intakeForm(sampleCases.critical);
      update("form", {
        status: "done",
        detail: `${form.final_priority} · conf ${(form.confidence_score * 100).toFixed(0)}%`,
      });
      pushActivity({
        kind: "triage",
        title: `Triage ${form.final_priority}`,
        detail: `Smoke test critical case · run #${form.triage_run_id}`,
        priority: form.final_priority,
      });

      update("ocr", { status: "running" });
      const ocr = await api.intakeOcr({
        document_name: "smoke-test.pdf",
        extraction_payload: {
          raw_text: "Patient reports chest discomfort and breathlessness.",
          confidence: 0.41,
          extracted_fields: { hr: 110, spo2: 92 },
        },
        note: "dashboard smoke test",
      });
      update("ocr", { status: "done", detail: `queued as #${ocr.queue_id}` });
      pushActivity({
        kind: "ocr",
        title: "OCR queued",
        detail: `Document #${ocr.queue_id} pending review`,
      });

      update("sim_run", { status: "running" });
      const sim = await api.simulationRun({
        patient_count: 12,
        pattern: "poisson",
        scheduling_strategy: "strict_priority",
        seed: Math.floor(Math.random() * 9999),
      });
      update("sim_run", {
        status: "done",
        detail: `sim #${sim.simulation_id} · ${sim.completed_patients}/${sim.total_patients}`,
      });

      update("sim_detail", { status: "running" });
      const detail = await api.simulationDetail(sim.simulation_id);
      update("sim_detail", {
        status: "done",
        detail: `${detail.event_count} events · ${detail.snapshot_count} snapshots`,
      });

      update("sim_metrics", { status: "running" });
      const metrics = await api.simulationMetrics(sim.simulation_id);
      update("sim_metrics", {
        status: "done",
        detail: `${metrics.metrics.bottlenecks.length} bottlenecks reported`,
      });
      pushActivity({
        kind: "simulation",
        title: `Simulation #${sim.simulation_id}`,
        detail: `${sim.completed_patients}/${sim.total_patients} treated, ${metrics.metrics.bottlenecks.length} bottlenecks`,
      });
      pushActivity({
        kind: "smoke",
        title: "Full pipeline smoke test passed",
        detail: "form → ocr → sim → detail → metrics",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSteps((prev) =>
        prev.map((s) =>
          s.status === "running" ? { ...s, status: "error", detail: message } : s,
        ),
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent ring-1 ring-accent/30">
            <Sparkles className="h-3.5 w-3.5" />
            multi-agent · async · deterministic safety net
          </div>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-ink-50">
            Triagex Command Center
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-400">
            Submit patient intakes, watch six worker agents collaborate in parallel,
            and stress-test the hospital with discrete-event simulation — all from
            one console.
          </p>
        </div>
        <button
          onClick={runSmoke}
          disabled={running}
          className="btn-primary text-sm"
        >
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PlayCircle className="h-4 w-4" />
          )}
          {running ? "Running smoke test…" : "Run full pipeline smoke test"}
        </button>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Triages this session"
          value={stats.triages}
          hint="Patient intakes processed"
          icon={HeartPulse}
        />
        <StatCard
          label="Simulations run"
          value={stats.sims}
          hint="Hospital resource scenarios"
          icon={GaugeCircle}
        />
        <StatCard
          label="OCR documents"
          value={stats.ocrs}
          hint="Queued for review"
          icon={Activity}
          accent="good"
        />
        <StatCard
          label="Critical escalations"
          value={stats.escalations}
          hint="P1 / P2 outcomes"
          icon={TriangleAlert}
          accent={stats.escalations > 0 ? "warning" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card
          title="Pipeline smoke test"
          description="Exercises every endpoint in sequence."
          className="lg:col-span-2"
        >
          <ol className="space-y-2.5">
            {steps.map((step, idx) => (
              <motion.li
                key={step.key}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.04 }}
                className="flex items-center justify-between rounded-lg border border-ink-700/60 bg-ink-900/40 px-3 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <StepIcon status={step.status} />
                  <span className="text-sm text-ink-100">{step.label}</span>
                </div>
                <span className="font-mono text-[11px] text-ink-400">
                  {step.detail ?? (step.status === "idle" ? "queued" : step.status)}
                </span>
              </motion.li>
            ))}
          </ol>
        </Card>

        <Card title="Quick links" description="Jump into a specific flow.">
          <div className="space-y-2.5">
            <QuickLink
              onClick={() => onNavigate("triage")}
              title="Triage a patient"
              hint="Submit vitals, EHR & chief complaint"
            />
            <QuickLink
              onClick={() => onNavigate("ocr")}
              title="OCR review queue"
              hint="Inspect scanned-document intake"
            />
            <QuickLink
              onClick={() => onNavigate("simulation")}
              title="Hospital simulation"
              hint="Stress-test resource allocation"
            />
            <QuickLink
              onClick={() => onNavigate("about")}
              title="How it works"
              hint="See the pipeline architecture"
            />
          </div>
        </Card>
      </div>

      <Card
        title="Architecture preview"
        description="Six worker agents fan out in parallel after de-identification + FHIR formatting; outputs are weighted-voted and critiqued before emission."
      >
        <PipelineDiagram />
      </Card>

      <Card
        title="Recent activity"
        description="Every action you take in this session is logged client-side."
        action={
          activity.length > 0 && (
            <button
              className="btn-ghost text-xs"
              onClick={() => {
                localStorage.removeItem("triagex.activity.v1");
                setActivity([]);
              }}
            >
              Clear
            </button>
          )
        }
      >
        {activity.length === 0 ? (
          <p className="rounded-lg border border-dashed border-ink-700/60 p-6 text-center text-sm text-ink-400">
            No activity yet. Run the smoke test or use one of the flows above.
          </p>
        ) : (
          <ul className="divide-y divide-ink-700/60">
            {activity.slice(0, 8).map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <ActivityDot kind={entry.kind} />
                  <div>
                    <p className="text-sm font-medium text-ink-100">{entry.title}</p>
                    <p className="text-xs text-ink-400">{entry.detail}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {entry.priority && <PriorityBadge priority={entry.priority} size="sm" />}
                  <span className="font-mono text-[11px] text-ink-500">
                    {formatRelative(entry.at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function StepIcon({ status }: { status: SmokeStep["status"] }) {
  if (status === "done")
    return <CheckCircle2 className="h-4 w-4 text-priority-p5" />;
  if (status === "running")
    return <Loader2 className="h-4 w-4 animate-spin text-accent" />;
  if (status === "error")
    return <TriangleAlert className="h-4 w-4 text-priority-p1" />;
  return <span className="h-2 w-2 rounded-full bg-ink-600" />;
}

function ActivityDot({ kind }: { kind: ActivityEntry["kind"] }) {
  const tone =
    kind === "triage"
      ? "bg-priority-p2"
      : kind === "simulation"
        ? "bg-priority-p4"
        : kind === "ocr"
          ? "bg-priority-p5"
          : "bg-accent";
  return <span className={`h-2 w-2 rounded-full ${tone}`} />;
}

function QuickLink({
  onClick,
  title,
  hint,
}: {
  onClick: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center justify-between rounded-lg border border-ink-700/60 bg-ink-900/40 px-3 py-2.5 text-left transition hover:border-accent/40 hover:bg-ink-800/50"
    >
      <div>
        <p className="text-sm font-medium text-ink-100">{title}</p>
        <p className="text-xs text-ink-400">{hint}</p>
      </div>
      <ArrowRight className="h-4 w-4 -translate-x-1 text-ink-500 transition group-hover:translate-x-0 group-hover:text-accent" />
    </button>
  );
}
