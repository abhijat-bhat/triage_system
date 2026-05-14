import { useEffect, useMemo, useState } from "react";
import {
  Database,
  Eye,
  FileText,
  GaugeCircle,
  HeartPulse,
  Loader2,
  RefreshCw,
  ScanLine,
} from "lucide-react";
import { Card } from "../components/Card";
import { PriorityBadge } from "../components/PriorityBadge";
import {
  PatientDetailDrawer,
  type PatientProfile,
} from "../components/PatientDetailDrawer";
import { api } from "../lib/api";
import { cn, formatRelative } from "../lib/utils";
import type {
  OCRQueueItem,
  SimulationSummary,
  TriageRunSummary,
} from "../types";

type Tab = "triage" | "ocr" | "simulation";

export function History() {
  const [tab, setTab] = useState<Tab>("triage");
  const [triages, setTriages] = useState<TriageRunSummary[]>([]);
  const [sims, setSims] = useState<SimulationSummary[]>([]);
  const [ocrQueue, setOcrQueue] = useState<OCRQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerPatient, setDrawerPatient] = useState<PatientProfile | null>(null);
  const [drawerLoadingId, setDrawerLoadingId] = useState<number | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tr, sm, oc] = await Promise.all([
        api.triageHistory(),
        api.simulationHistory(),
        api.ocrQueue(),
      ]);
      setTriages(tr.items);
      setSims(sm.items);
      setOcrQueue(oc.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const counts = useMemo(
    () => ({
      triage: triages.length,
      ocr: ocrQueue.length,
      simulation: sims.length,
    }),
    [triages.length, ocrQueue.length, sims.length],
  );

  const openTriage = async (run: TriageRunSummary) => {
    setDrawerLoadingId(run.triage_run_id);
    try {
      const detail = await api.triageDetail(run.triage_run_id);
      setDrawerPatient({
        id:
          detail.patient_input?.ehr_data.patient_name ||
          detail.patient_input?.ehr_data.patient_id ||
          `Run #${detail.triage_run_id}`,
        arrivalTick: 0,
        priority: detail.triage_output.final_priority,
        confidence: detail.triage_output.confidence_score,
        requiresHumanReview: detail.triage_output.requires_human_review,
        patientInput: detail.patient_input,
        differentialDiagnosis: detail.triage_output.differential_diagnosis,
        recommendedActions: detail.triage_output.recommended_actions,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDrawerLoadingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent ring-1 ring-accent/30">
          <Database className="h-3.5 w-3.5" />
          persisted records · SQLite
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink-50">
          History
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-400">
          Every triage run, queued OCR document, and hospital simulation is
          stored in the backend database. Click any triage row to inspect the
          full patient input, agent outputs and audit log.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <TabButton
          active={tab === "triage"}
          onClick={() => setTab("triage")}
          icon={HeartPulse}
          label="Triage runs"
          count={counts.triage}
        />
        <TabButton
          active={tab === "ocr"}
          onClick={() => setTab("ocr")}
          icon={ScanLine}
          label="OCR queue"
          count={counts.ocr}
        />
        <TabButton
          active={tab === "simulation"}
          onClick={() => setTab("simulation")}
          icon={GaugeCircle}
          label="Simulations"
          count={counts.simulation}
        />
        <div className="ml-auto">
          <button
            className="btn-ghost text-xs"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-priority-p1/40 bg-priority-p1/10 px-3 py-2 text-xs text-priority-p1">
          {error}
        </p>
      )}

      {tab === "triage" && (
        <Card
          title="Triage runs"
          description="Full audit log + patient input is preserved for each run."
        >
          {triages.length === 0 ? (
            <EmptyState
              icon={HeartPulse}
              title="No triage runs yet"
              hint="Submit a patient on the Triage page or via OCR upload — auto-triaged uploads also land here."
            />
          ) : (
            <ul className="divide-y divide-ink-700/60">
              {triages.map((row) => (
                <li
                  key={row.triage_run_id}
                  className="group flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <button
                    onClick={() => openTriage(row)}
                    disabled={drawerLoadingId === row.triage_run_id}
                    className="flex flex-1 flex-wrap items-center gap-3 text-left transition group-hover:translate-x-0.5"
                  >
                    <PriorityBadge priority={row.final_priority} size="sm" />
                    <div className="flex flex-col">
                      <span className="font-mono text-sm text-ink-100">
                        run #{row.triage_run_id}
                        <span className="ml-1.5 text-ink-500">
                          · pt #{row.patient_record_id}
                        </span>
                      </span>
                      <span className="text-[11px] text-ink-400">
                        confidence {(row.confidence_score * 100).toFixed(0)}%
                        {row.requires_human_review && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-priority-p1/15 px-1.5 py-0.5 text-[10px] font-semibold text-priority-p1">
                            <Eye className="h-2.5 w-2.5" /> review
                          </span>
                        )}
                      </span>
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-ink-500">
                      {formatRelative(row.created_at_utc)}
                    </span>
                    {drawerLoadingId === row.triage_run_id && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "ocr" && (
        <Card
          title="OCR review queue"
          description="Scanned uploads that fell below the auto-triage confidence threshold."
        >
          {ocrQueue.length === 0 ? (
            <EmptyState
              icon={ScanLine}
              title="No OCR documents queued"
              hint="Upload a PDF/image on the OCR page — low-confidence extractions are routed here for human review."
            />
          ) : (
            <ul className="divide-y divide-ink-700/60">
              {ocrQueue.map((row) => (
                <li
                  key={row.queue_id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-ink-800/60 text-ink-300 ring-1 ring-ink-700/60">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink-100">
                        {row.document_name}
                      </p>
                      <p className="text-[11px] text-ink-400">
                        queue #{row.queue_id}
                        <span className="ml-1.5">· {row.status}</span>
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-ink-500">
                    {formatRelative(row.created_at_utc)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "simulation" && (
        <Card
          title="Simulation runs"
          description="Each run persists every event, resource snapshot, and metric."
        >
          {sims.length === 0 ? (
            <EmptyState
              icon={GaugeCircle}
              title="No simulations yet"
              hint="Run a hospital simulation from the Simulation page to populate this list."
            />
          ) : (
            <ul className="divide-y divide-ink-700/60">
              {sims.map((row) => (
                <li
                  key={row.simulation_id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-priority-p4/10 text-priority-p4 ring-1 ring-priority-p4/30">
                      <GaugeCircle className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink-100">
                        sim #{row.simulation_id}
                        <span className="ml-1.5 text-ink-500">
                          · {row.patient_count} patients
                        </span>
                      </p>
                      <p className="text-[11px] text-ink-400">
                        seed {row.seed} · {row.scheduling_strategy} · {row.status}
                        {row.bottleneck_count > 0 && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-priority-p1/15 px-1.5 py-0.5 text-[10px] font-semibold text-priority-p1">
                            {row.bottleneck_count} bottleneck
                            {row.bottleneck_count !== 1 ? "s" : ""}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-ink-500">
                    {formatRelative(row.started_at_utc)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <PatientDetailDrawer
        patient={drawerPatient}
        onClose={() => setDrawerPatient(null)}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof HeartPulse;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
        active
          ? "border-accent/40 bg-accent/15 text-accent"
          : "border-ink-700/60 bg-ink-900/40 text-ink-300 hover:border-accent/30 hover:text-ink-100",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-[10px] font-mono",
          active ? "bg-accent/25 text-accent" : "bg-ink-700/40 text-ink-400",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof HeartPulse;
  title: string;
  hint: string;
}) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-ink-700/60 p-10 text-center">
      <Icon className="h-9 w-9 text-ink-500" />
      <p className="mt-3 text-sm text-ink-200">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-ink-500">{hint}</p>
    </div>
  );
}
