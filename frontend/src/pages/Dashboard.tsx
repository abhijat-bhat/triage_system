import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Database,
  GaugeCircle,
  HeartPulse,
  Loader2,
  PlayCircle,
  RadioTower,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Card } from "../components/Card";
import { PipelineDiagram } from "../components/PipelineDiagram";
import { PriorityBadge } from "../components/PriorityBadge";
import { StatCard } from "../components/StatCard";
import { api } from "../lib/api";
import {
  cn,
  formatRelative,
  loadActivity,
  pushActivity,
  sampleCases,
} from "../lib/utils";
import type { PageKey } from "../components/Sidebar";
import type {
  ActivityEntry,
  SimulationSummary,
  TriageRunSummary,
} from "../types";

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
  const [dbTriages, setDbTriages] = useState<TriageRunSummary[]>([]);
  const [dbSims, setDbSims] = useState<SimulationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const refreshHistory = async () => {
    setHistoryLoading(true);
    try {
      const [tr, sm] = await Promise.all([api.triageHistory(), api.simulationHistory()]);
      setDbTriages(tr.items);
      setDbSims(sm.items);
    } catch {
      // backend may be offline — keep prior values
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    const handler = () => setActivity(loadActivity());
    window.addEventListener("triagex:activity", handler);
    return () => window.removeEventListener("triagex:activity", handler);
  }, []);

  useEffect(() => {
    refreshHistory();
    const t = setInterval(refreshHistory, 15_000);
    return () => clearInterval(t);
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

  // Cumulative sparkline data — each entry adds 1 to the rolling history.
  const sparks = useMemo(() => {
    const ordered = [...activity].reverse();
    let t = 0,
      s = 0,
      o = 0,
      e = 0;
    const triageHist: number[] = [0];
    const simHist: number[] = [0];
    const ocrHist: number[] = [0];
    const escHist: number[] = [0];
    for (const a of ordered) {
      if (a.kind === "triage") {
        t++;
        if (a.priority === "P1" || a.priority === "P2") e++;
      }
      if (a.kind === "simulation") s++;
      if (a.kind === "ocr") o++;
      triageHist.push(t);
      simHist.push(s);
      ocrHist.push(o);
      escHist.push(e);
    }
    return {
      triages: triageHist.slice(-24),
      sims: simHist.slice(-24),
      ocrs: ocrHist.slice(-24),
      escalations: escHist.slice(-24),
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
      refreshHistory();
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

  const doneCount = steps.filter((s) => s.status === "done").length;
  const progressPct = (doneCount / steps.length) * 100;

  return (
    <div className="space-y-8">
      <HeroBanner onRunSmoke={runSmoke} running={running} progressPct={progressPct} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Triages this session"
          value={stats.triages}
          hint="Patient intakes processed"
          icon={HeartPulse}
          spark={sparks.triages}
        />
        <StatCard
          label="Simulations run"
          value={stats.sims}
          hint="Hospital resource scenarios"
          icon={GaugeCircle}
          spark={sparks.sims}
        />
        <StatCard
          label="OCR documents"
          value={stats.ocrs}
          hint="Queued for review"
          icon={Activity}
          accent="good"
          spark={sparks.ocrs}
        />
        <StatCard
          label="Critical escalations"
          value={stats.escalations}
          hint="P1 / P2 outcomes"
          icon={TriangleAlert}
          accent={stats.escalations > 0 ? "warning" : "default"}
          spark={sparks.escalations}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card
          title={
            <span className="flex items-center gap-2">
              Pipeline smoke test
              {running && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  running
                </span>
              )}
            </span>
          }
          description="Exercises every endpoint in sequence."
          className="lg:col-span-2"
        >
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-ink-700/40">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-accent-deep via-accent to-accent-soft"
              initial={false}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
          <ol className="space-y-2.5">
            {steps.map((step, idx) => (
              <motion.li
                key={step.key}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.04 }}
                className={cn(
                  "flex items-center justify-between rounded-lg border bg-ink-900/40 px-3 py-2.5 transition",
                  step.status === "done" && "border-priority-p5/30 bg-priority-p5/[0.04]",
                  step.status === "running" && "border-accent/40 bg-accent/[0.05]",
                  step.status === "error" && "border-priority-p1/40 bg-priority-p1/[0.06]",
                  step.status === "idle" && "border-ink-700/60",
                )}
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
              hint="Manual intake or OCR-fill from a scanned doc"
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
        title="Persisted records · SQLite"
        description="Pulled live from the backend database. Every triage and simulation is stored permanently."
        action={
          <button
            className="btn-ghost text-xs"
            onClick={refreshHistory}
            disabled={historyLoading}
          >
            {historyLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </button>
        }
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-300">
              <Database className="h-3.5 w-3.5" /> Triage runs ({dbTriages.length})
            </p>
            {dbTriages.length === 0 ? (
              <p className="rounded-lg border border-dashed border-ink-700/60 p-4 text-center text-xs text-ink-500">
                No triage runs persisted yet.
              </p>
            ) : (
              <ul className="max-h-60 space-y-1.5 overflow-y-auto pr-2 scrollbar-thin">
                {dbTriages.slice(0, 10).map((r) => (
                  <li
                    key={r.triage_run_id}
                    className="flex items-center justify-between rounded-lg border border-ink-700/60 bg-ink-900/40 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <PriorityBadge priority={r.final_priority} size="sm" />
                      <span className="font-mono text-ink-300">
                        run #{r.triage_run_id}
                      </span>
                      <span className="text-ink-500">
                        · pt #{r.patient_record_id}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-ink-500">
                      {formatRelative(r.created_at_utc)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-300">
              <Database className="h-3.5 w-3.5" /> Simulation runs ({dbSims.length})
            </p>
            {dbSims.length === 0 ? (
              <p className="rounded-lg border border-dashed border-ink-700/60 p-4 text-center text-xs text-ink-500">
                No simulations persisted yet.
              </p>
            ) : (
              <ul className="max-h-60 space-y-1.5 overflow-y-auto pr-2 scrollbar-thin">
                {dbSims.slice(0, 10).map((s) => (
                  <li
                    key={s.simulation_id}
                    className="flex items-center justify-between rounded-lg border border-ink-700/60 bg-ink-900/40 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-ink-200">
                        sim #{s.simulation_id}
                      </span>
                      <span className="text-ink-400">{s.patient_count} pts</span>
                      <span className="text-ink-500">· {s.scheduling_strategy}</span>
                      {s.bottleneck_count > 0 && (
                        <span className="rounded-full bg-priority-p1/15 px-1.5 py-0.5 text-[10px] font-semibold text-priority-p1 ring-1 ring-priority-p1/30">
                          {s.bottleneck_count} bn
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[10px] text-ink-500">
                      {formatRelative(s.started_at_utc)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>

      <Card
        title="Recent activity (session)"
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
            <AnimatePresence initial={false}>
              {activity.slice(0, 8).map((entry) => (
                <motion.li
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
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
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </Card>
    </div>
  );
}

function HeroBanner({
  onRunSmoke,
  running,
  progressPct,
}: {
  onRunSmoke: () => void;
  running: boolean;
  progressPct: number;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="relative overflow-hidden rounded-3xl border border-ink-700/60 bg-gradient-to-br from-ink-800/80 via-ink-900/80 to-ink-950 p-8 shadow-panel">
      {/* Animated background orbs */}
      <motion.div
        className="pointer-events-none absolute -top-32 -left-24 h-96 w-96 rounded-full bg-accent/20 blur-3xl"
        animate={{ x: [0, 60, -20, 0], y: [0, 40, 10, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-priority-p4/12 blur-3xl"
        animate={{ x: [0, -40, 30, 0], y: [0, -30, 20, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute top-1/3 right-1/3 h-72 w-72 rounded-full bg-priority-p5/10 blur-3xl"
        animate={{ scale: [1, 1.15, 0.95, 1] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Subtle dot grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(148,163,184,0.25) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
        }}
      />

      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/12 px-3 py-1 text-xs font-semibold text-accent ring-1 ring-accent/30">
              <Sparkles className="h-3.5 w-3.5" />
              multi-agent · async · deterministic safety net
            </span>
            <LivePulse />
          </div>
          <h1 className="mt-5 bg-gradient-to-r from-ink-50 via-ink-50 to-accent bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl">
            Triagex Command Center
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-300">
            Submit patient intakes, watch six worker agents collaborate in
            parallel, and stress-test the hospital with discrete-event
            simulation — all from one console.
          </p>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-widest text-ink-500">
            {now.toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
            <span className="mx-2 text-ink-700">·</span>
            {now.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <button
            onClick={onRunSmoke}
            disabled={running}
            className="btn-primary text-sm shadow-glow"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
            {running ? "Running smoke test…" : "Run full pipeline smoke test"}
          </button>
          {running && (
            <div className="w-56">
              <div className="h-1 overflow-hidden rounded-full bg-ink-700/60">
                <motion.div
                  className="h-full bg-gradient-to-r from-accent-deep to-accent-soft"
                  initial={false}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
              <p className="mt-1 text-right font-mono text-[10px] text-ink-400">
                {progressPct.toFixed(0)}% complete
              </p>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function LivePulse() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-priority-p5/12 px-2.5 py-1 text-[11px] font-semibold text-priority-p5 ring-1 ring-priority-p5/30">
      <span className="relative flex h-2 w-2">
        <span className="absolute inset-0 animate-ping rounded-full bg-priority-p5/70" />
        <span className="relative h-2 w-2 rounded-full bg-priority-p5" />
      </span>
      <RadioTower className="h-3 w-3" />
      live
    </span>
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
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className={cn("absolute inset-0 rounded-full opacity-40 animate-ping", tone)} />
      <span className={cn("relative h-2.5 w-2.5 rounded-full", tone)} />
    </span>
  );
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
      className="group flex w-full items-center justify-between rounded-lg border border-ink-700/60 bg-ink-900/40 px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:border-accent/40 hover:bg-ink-800/60 hover:shadow-glow"
    >
      <div>
        <p className="text-sm font-medium text-ink-100">{title}</p>
        <p className="text-xs text-ink-400">{hint}</p>
      </div>
      <ArrowRight className="h-4 w-4 -translate-x-1 text-ink-500 transition group-hover:translate-x-0 group-hover:text-accent" />
    </button>
  );
}
