import { useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Cpu,
  GaugeCircle,
  Loader2,
  Play,
  Sparkles,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "../components/Card";
import { StatCard } from "../components/StatCard";
import { PriorityBadge } from "../components/PriorityBadge";
import { HospitalPlayback } from "../components/HospitalPlayback";
import { SyntheticPatientsTable } from "../components/SyntheticPatientsTable";
import { api } from "../lib/api";
import { cn, formatPct, pushActivity, simulationMocks } from "../lib/utils";
import type {
  SimulationDetail,
  SimulationEvent,
  SimulationMetrics,
  TriagePriority,
} from "../types";

const PATTERNS = [
  { value: "poisson", label: "Poisson arrivals", hint: "exponentially-distributed inter-arrival" },
  { value: "burst", label: "Burst arrivals", hint: "sudden surge in middle of timeline" },
] as const;

const STRATEGIES = [
  { value: "strict_priority", label: "Strict priority", hint: "P1 always first" },
  { value: "weighted_fair", label: "Weighted fair", hint: "deficit round-robin" },
] as const;

export function Simulation() {
  const [patientCount, setPatientCount] = useState(30);
  const [pattern, setPattern] = useState<(typeof PATTERNS)[number]["value"]>("poisson");
  const [strategy, setStrategy] = useState<(typeof STRATEGIES)[number]["value"]>("strict_priority");
  const [seed, setSeed] = useState(42);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SimulationDetail | null>(null);
  const [events, setEvents] = useState<SimulationEvent[]>([]);

  const fillMockData = () => {
    const m = simulationMocks[Math.floor(Math.random() * simulationMocks.length)];
    setPatientCount(m.patient_count);
    setPattern(m.pattern);
    setStrategy(m.scheduling_strategy);
    setSeed(m.seed);
  };

  const run = async () => {
    setRunning(true);
    setError(null);
    setDetail(null);
    setEvents([]);
    try {
      const summary = await api.simulationRun({
        patient_count: patientCount,
        pattern,
        scheduling_strategy: strategy,
        seed,
      });
      const fullDetail = await api.simulationDetail(summary.simulation_id);
      const evStream = await api.simulationEvents(summary.simulation_id);
      setDetail(fullDetail);
      setEvents(evStream.events);
      pushActivity({
        kind: "simulation",
        title: `Simulation #${summary.simulation_id}`,
        detail: `${summary.completed_patients}/${summary.total_patients} treated · ${fullDetail.metrics?.bottlenecks.length ?? 0} bottlenecks`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full bg-priority-p4/10 px-3 py-1 text-xs font-semibold text-priority-p4 ring-1 ring-priority-p4/30">
          <GaugeCircle className="h-3.5 w-3.5" />
          discrete-event hospital simulation
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink-50">
          Hospital simulation
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-400">
          Generates synthetic arrivals, triages each through the full pipeline,
          then runs a heap-based event loop with finite doctors, beds, and
          machines to surface bottlenecks.
        </p>
      </header>

      <Card
        title="Run configuration"
        description="POST /api/v1/simulation/run"
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={fillMockData}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1.5 text-[11px] font-semibold text-accent ring-1 ring-accent/40 transition hover:bg-accent/25"
              title="Fill simulation config with a random demo scenario"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Fill Mock Data
            </button>
            {simulationMocks.map((m) => (
              <button
                key={m.label}
                title={m.description}
                className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent ring-1 ring-accent/30 transition hover:bg-accent/20"
                onClick={() => {
                  setPatientCount(m.patient_count);
                  setPattern(m.pattern);
                  setStrategy(m.scheduling_strategy);
                  setSeed(m.seed);
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <span className="label mb-0">Patient count</span>
                <span className="font-mono text-xs text-ink-300">{patientCount}</span>
              </div>
              <input
                type="range"
                min={5}
                max={200}
                step={5}
                value={patientCount}
                onChange={(e) => setPatientCount(parseInt(e.target.value, 10))}
                className="mt-2 w-full accent-accent"
              />
              <div className="mt-1 flex justify-between text-[10px] text-ink-500">
                <span>5</span>
                <span>200</span>
              </div>
            </div>

            <div>
              <span className="label">Random seed</span>
              <input
                type="number"
                className="input font-mono"
                value={seed}
                onChange={(e) => setSeed(parseInt(e.target.value || "0", 10))}
              />
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <span className="label">Arrival pattern</span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PATTERNS.map((opt) => (
                  <RadioCard
                    key={opt.value}
                    label={opt.label}
                    hint={opt.hint}
                    active={pattern === opt.value}
                    onClick={() => setPattern(opt.value)}
                  />
                ))}
              </div>
            </div>
            <div>
              <span className="label">Scheduling strategy</span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {STRATEGIES.map((opt) => (
                  <RadioCard
                    key={opt.value}
                    label={opt.label}
                    hint={opt.hint}
                    active={strategy === opt.value}
                    onClick={() => setStrategy(opt.value)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button className="btn-primary" onClick={run} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? `Triaging ${patientCount} patients…` : "Run simulation"}
          </button>
          {running && (
            <span className="text-xs text-ink-400">
              Larger runs can take a moment — each patient goes through the full
              orchestrator.
            </span>
          )}
        </div>
        {error && (
          <p className="mt-4 rounded-lg border border-priority-p1/40 bg-priority-p1/10 px-3 py-2 text-xs text-priority-p1">
            {error}
          </p>
        )}
      </Card>

      {detail && <Results detail={detail} events={events} />}
    </div>
  );
}

function RadioCard({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={cn(
        "rounded-lg border px-3 py-2 text-left transition",
        active
          ? "border-accent/50 bg-accent/10 ring-1 ring-accent/30"
          : "border-ink-700/60 bg-ink-900/40 hover:border-accent/30",
      )}
    >
      <p className="text-sm font-medium text-ink-100">{label}</p>
      <p className="text-[11px] text-ink-400">{hint}</p>
    </button>
  );
}

function Results({
  detail,
  events,
}: {
  detail: SimulationDetail;
  events: SimulationEvent[];
}) {
  const metrics = detail.metrics;
  if (!metrics) return null;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Simulation ID"
          value={`#${detail.simulation_id}`}
          hint={`${detail.scheduling_strategy} · seed ${detail.seed}`}
          icon={GaugeCircle}
        />
        <StatCard
          label="Patients"
          value={detail.patient_count}
          hint={`${detail.event_count} events logged`}
          icon={Users}
        />
        <StatCard
          label="Snapshots"
          value={detail.snapshot_count}
          hint="hospital state captures"
          icon={Activity}
          accent="good"
        />
        <StatCard
          label="Bottlenecks"
          value={metrics.bottlenecks.length}
          hint="alerts fired"
          icon={AlertTriangle}
          accent={metrics.bottlenecks.length > 0 ? "danger" : "good"}
        />
      </div>

      {metrics.bottlenecks.length > 0 && (
        <Card title="Bottlenecks detected">
          <ul className="space-y-2">
            {metrics.bottlenecks.map((b) => (
              <li
                key={b}
                className="flex items-start gap-2 rounded-lg border border-priority-p1/30 bg-priority-p1/8 p-2.5 text-sm text-priority-p1"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {b}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title="Hospital floor — live playback"
        description="Watch patients flow between departments as the simulation advances. Click any patient chip to inspect their synthetic data. Use the controls to scrub through time, change speed, or replay."
      >
        <HospitalPlayback events={events} />
      </Card>

      <Card
        title="Synthetic patients"
        description="Every generated patient with the vitals, complaint, and triage verdict the simulator produced. Click a row to inspect."
      >
        <SyntheticPatientsTable events={events} />
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Avg wait time by priority" description="ticks waited before allocation">
          <WaitChart metrics={metrics} />
        </Card>
        <Card title="Resource utilization" description="time-weighted occupancy">
          <UtilizationChart metrics={metrics} />
        </Card>
      </div>

      <Card
        title="Queue metrics"
        description="Pressure and overflow over the simulation timeline."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <QueueStat
            icon={Users}
            label="Peak queue length"
            value={metrics.utilization_stats["queue_peak"]?.toFixed(0) ?? "—"}
          />
          <QueueStat
            icon={Cpu}
            label="Avg queue length"
            value={metrics.utilization_stats["avg_queue_length"]?.toFixed(2) ?? "—"}
          />
          <QueueStat
            icon={AlertTriangle}
            label="Overflow time"
            value={formatPct(metrics.utilization_stats["queue_overflow_pct"] ?? 0)}
          />
        </div>
      </Card>

      <Card
        title="Event timeline"
        description={`${events.length} events recorded · scroll to inspect`}
      >
        <div className="max-h-96 overflow-auto rounded-xl border border-ink-700/60 bg-ink-900/40 p-2 scrollbar-thin">
          <ol className="space-y-1.5">
            {events.slice(0, 200).map((event, idx) => (
              <motion.li
                key={`${event.timestamp}-${event.event_type}-${idx}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(idx * 0.005, 0.5) }}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-xs hover:bg-ink-800/40"
              >
                <span className="font-mono text-ink-500 w-10 text-right">
                  t={event.timestamp}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 font-semibold ring-1 text-[10px]",
                    eventTone(event.event_type),
                  )}
                >
                  {event.event_type}
                </span>
                {event.patient_id && (
                  <span className="font-mono text-ink-300">{event.patient_id}</span>
                )}
                {(event.payload as { priority?: TriagePriority }).priority && (
                  <PriorityBadge
                    priority={
                      (event.payload as { priority: TriagePriority }).priority
                    }
                    size="sm"
                    showLabel={false}
                  />
                )}
                {(event.payload as { wait_ticks?: number }).wait_ticks !==
                  undefined && (
                  <span className="text-ink-400">
                    waited {(event.payload as { wait_ticks: number }).wait_ticks} ticks
                  </span>
                )}
              </motion.li>
            ))}
          </ol>
          {events.length > 200 && (
            <p className="px-2 py-2 text-center text-[11px] text-ink-500">
              showing first 200 of {events.length} events
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

function QueueStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-ink-700/60 bg-ink-900/40 p-4">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/10 text-accent ring-1 ring-accent/25">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-ink-400">
            {label}
          </p>
          <p className="font-mono text-lg text-ink-50">{value}</p>
        </div>
      </div>
    </div>
  );
}

function WaitChart({ metrics }: { metrics: SimulationMetrics }) {
  const data = (Object.keys(metrics.avg_wait_time_by_priority) as TriagePriority[])
    .map((p) => ({ priority: p, wait: metrics.avg_wait_time_by_priority[p] }))
    .sort((a, b) => a.priority.localeCompare(b.priority));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
        <CartesianGrid stroke="rgba(148,163,184,0.08)" />
        <XAxis dataKey="priority" stroke="#64748b" tick={{ fontSize: 12 }} />
        <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
        <Tooltip
          cursor={{ fill: "rgba(6,182,212,0.06)" }}
          contentStyle={{
            background: "#0f172a",
            border: "1px solid #1e293b",
            borderRadius: 8,
            color: "#e2e8f0",
            fontSize: 12,
          }}
          formatter={(v: number) => [`${v.toFixed(2)} ticks`, "avg wait"]}
        />
        <Bar dataKey="wait" radius={[6, 6, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.priority} fill={priorityHex(d.priority)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function UtilizationChart({ metrics }: { metrics: SimulationMetrics }) {
  const data = [
    { name: "ICU", pct: metrics.utilization_stats["icu_occupancy_pct"] ?? 0 },
    { name: "General", pct: metrics.utilization_stats["general_bed_occupancy_pct"] ?? 0 },
    { name: "Ventilator", pct: metrics.utilization_stats["ventilator_usage_pct"] ?? 0 },
    { name: "Monitor", pct: metrics.utilization_stats["monitor_usage_pct"] ?? 0 },
    { name: "ECG", pct: metrics.utilization_stats["ecg_usage_pct"] ?? 0 },
  ];
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
        <CartesianGrid stroke="rgba(148,163,184,0.08)" />
        <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 12 }} />
        <YAxis stroke="#64748b" tick={{ fontSize: 12 }} domain={[0, 100]} />
        <Tooltip
          cursor={{ fill: "rgba(6,182,212,0.06)" }}
          contentStyle={{
            background: "#0f172a",
            border: "1px solid #1e293b",
            borderRadius: 8,
            color: "#e2e8f0",
            fontSize: 12,
          }}
          formatter={(v: number) => [formatPct(v), "occupancy"]}
        />
        <Bar dataKey="pct" radius={[6, 6, 0, 0]} fill="#06b6d4" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function priorityHex(priority: TriagePriority): string {
  return {
    P1: "#ef4444",
    P2: "#f97316",
    P3: "#eab308",
    P4: "#3b82f6",
    P5: "#10b981",
  }[priority];
}

function eventTone(eventType: string): string {
  switch (eventType) {
    case "PATIENT_ARRIVED":
      return "bg-priority-p4/10 text-priority-p4 ring-priority-p4/30";
    case "PATIENT_TRIAGED":
      return "bg-priority-p3/10 text-priority-p3 ring-priority-p3/30";
    case "RESOURCE_ALLOCATED":
      return "bg-priority-p5/10 text-priority-p5 ring-priority-p5/30";
    case "RESOURCE_RELEASED":
      return "bg-accent/10 text-accent ring-accent/30";
    case "PATIENT_WAITING":
      return "bg-priority-p2/10 text-priority-p2 ring-priority-p2/30";
    default:
      return "bg-ink-700/40 text-ink-200 ring-ink-700/60";
  }
}
