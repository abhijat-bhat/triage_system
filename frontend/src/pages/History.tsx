import { useEffect, useMemo, useState } from "react";
import {
  Database,
  Eye,
  GaugeCircle,
  HeartPulse,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
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
  SimulationSummary,
  TriagePriority,
  TriageRunSummary,
} from "../types";

type Tab = "triage" | "simulation";

const PAGE_SIZE = 50;

export function History() {
  const [tab, setTab] = useState<Tab>("triage");
  const [triages, setTriages] = useState<TriageRunSummary[]>([]);
  const [triageTotal, setTriageTotal] = useState(0);
  const [sims, setSims] = useState<SimulationSummary[]>([]);
  const [simTotal, setSimTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerPatient, setDrawerPatient] = useState<PatientProfile | null>(null);
  const [drawerLoadingId, setDrawerLoadingId] = useState<number | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tr, sm] = await Promise.all([
        api.triageHistory({ limit: PAGE_SIZE, offset: 0 }),
        api.simulationHistory({ limit: PAGE_SIZE, offset: 0 }),
      ]);
      setTriages(tr.items);
      setTriageTotal(tr.total);
      setSims(sm.items);
      setSimTotal(sm.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    setLoadingMore(true);
    setError(null);
    try {
      if (tab === "triage") {
        const next = await api.triageHistory({
          limit: PAGE_SIZE,
          offset: triages.length,
        });
        setTriages((cur) => [...cur, ...next.items]);
        setTriageTotal(next.total);
      } else {
        const next = await api.simulationHistory({
          limit: PAGE_SIZE,
          offset: sims.length,
        });
        setSims((cur) => [...cur, ...next.items]);
        setSimTotal(next.total);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleClear = async () => {
    const totalRows = triageTotal + simTotal;
    const ok = window.confirm(
      totalRows === 0
        ? "There are no history records. Run the clear anyway?"
        : `This will permanently delete ${totalRows} record${
            totalRows === 1 ? "" : "s"
          } (triage runs, audit logs, simulations, OCR queue). This cannot be undone. Continue?`,
    );
    if (!ok) return;
    setClearing(true);
    setError(null);
    try {
      await api.clearHistory();
      setTriages([]);
      setTriageTotal(0);
      setSims([]);
      setSimTotal(0);
      setDrawerPatient(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const counts = useMemo(
    () => ({
      triage: triageTotal,
      simulation: simTotal,
    }),
    [triageTotal, simTotal],
  );

  const openTriage = async (run: TriageRunSummary) => {
    setDrawerLoadingId(run.triage_run_id);
    try {
      const detail = await api.triageDetail(run.triage_run_id);
      const agentPriority = detail.triage_output.final_priority;
      const effectivePriority = (detail.override_priority ?? agentPriority) as TriagePriority;
      setDrawerPatient({
        id:
          detail.patient_input?.ehr_data.patient_name ||
          detail.patient_input?.ehr_data.patient_id ||
          `Run #${detail.triage_run_id}`,
        arrivalTick: 0,
        priority: effectivePriority,
        confidence: detail.triage_output.confidence_score,
        requiresHumanReview: detail.triage_output.requires_human_review,
        patientInput: detail.patient_input,
        differentialDiagnosis: detail.triage_output.differential_diagnosis,
        recommendedActions: detail.triage_output.recommended_actions,
        triageRunId: detail.triage_run_id,
        agentPriority,
        overridePriority: detail.override_priority ?? null,
        overrideReason: detail.override_reason ?? null,
        overriddenAt: detail.overridden_at ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDrawerLoadingId(null);
    }
  };

  const handleOverrideApplied = ({
    triageRunId,
    overridePriority,
    overrideReason,
    overriddenAt,
  }: {
    triageRunId: number;
    overridePriority: TriagePriority;
    overrideReason: string;
    overriddenAt: string;
  }) => {
    setTriages((rows) =>
      rows.map((row) =>
        row.triage_run_id === triageRunId
          ? {
              ...row,
              override_priority: overridePriority,
              override_reason: overrideReason,
              overridden_at: overriddenAt,
            }
          : row,
      ),
    );
    setDrawerPatient((cur) =>
      cur && cur.triageRunId === triageRunId
        ? {
            ...cur,
            priority: overridePriority,
            overridePriority,
            overrideReason,
            overriddenAt,
          }
        : cur,
    );
  };

  const visibleCount = tab === "triage" ? triages.length : sims.length;
  const totalCount = tab === "triage" ? triageTotal : simTotal;
  const hasMore = visibleCount < totalCount;

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
          Every triage run and hospital simulation is stored in the backend
          database. Click any triage row to inspect the full patient input,
          agent outputs, audit log, and to apply a clinician override.
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
          active={tab === "simulation"}
          onClick={() => setTab("simulation")}
          icon={GaugeCircle}
          label="Simulations"
          count={counts.simulation}
        />
        <div className="ml-auto flex items-center gap-2">
          <button
            className="btn-ghost text-xs"
            onClick={refresh}
            disabled={loading || clearing}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </button>
          <button
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              "border-priority-p1/40 bg-priority-p1/10 text-priority-p1 hover:border-priority-p1/60 hover:bg-priority-p1/20",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
            onClick={handleClear}
            disabled={clearing || loading}
            title="Permanently delete all persisted triage, simulation, and OCR queue records."
          >
            {clearing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Clear history
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
          description="Full audit log + patient input is preserved for each run. Click any row to override."
        >
          {triages.length === 0 ? (
            <EmptyState
              icon={HeartPulse}
              title="No triage runs yet"
              hint="Submit a patient on the Triage page or via OCR upload — auto-triaged uploads also land here."
            />
          ) : (
            <>
              <ul className="divide-y divide-ink-700/60">
                {triages.map((row) => (
                  <TriageRow
                    key={row.triage_run_id}
                    row={row}
                    onOpen={openTriage}
                    loading={drawerLoadingId === row.triage_run_id}
                  />
                ))}
              </ul>
              <PaginationFooter
                shown={visibleCount}
                total={totalCount}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={loadMore}
              />
            </>
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
            <>
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
              <PaginationFooter
                shown={visibleCount}
                total={totalCount}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={loadMore}
              />
            </>
          )}
        </Card>
      )}

      <PatientDetailDrawer
        patient={drawerPatient}
        onClose={() => setDrawerPatient(null)}
        onOverrideApplied={handleOverrideApplied}
      />
    </div>
  );
}

function TriageRow({
  row,
  onOpen,
  loading,
}: {
  row: TriageRunSummary;
  onOpen: (row: TriageRunSummary) => void;
  loading: boolean;
}) {
  const overridden = row.overridden_at && row.override_priority;
  const effectivePriority = (row.override_priority ?? row.final_priority) as TriagePriority;

  return (
    <li className="group flex flex-wrap items-center justify-between gap-3 py-3">
      <button
        onClick={() => onOpen(row)}
        disabled={loading}
        className="flex flex-1 flex-wrap items-center gap-3 text-left transition group-hover:translate-x-0.5"
      >
        <PriorityBadge priority={effectivePriority} size="sm" />
        <div className="flex flex-col">
          <span className="font-mono text-sm text-ink-100">
            run #{row.triage_run_id}
            <span className="ml-1.5 text-ink-500">
              · pt #{row.patient_record_id}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-400">
            <span>confidence {(row.confidence_score * 100).toFixed(0)}%</span>
            {row.requires_human_review && (
              <span className="inline-flex items-center gap-1 rounded-full bg-priority-p1/15 px-1.5 py-0.5 text-[10px] font-semibold text-priority-p1">
                <Eye className="h-2.5 w-2.5" /> review
              </span>
            )}
            {overridden && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full bg-priority-p2/15 px-1.5 py-0.5 text-[10px] font-semibold text-priority-p2",
                )}
                title={row.override_reason ?? undefined}
              >
                <ShieldAlert className="h-2.5 w-2.5" />
                manually overridden from {row.final_priority} → {row.override_priority}
              </span>
            )}
          </span>
        </div>
      </button>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-ink-500">
          {formatRelative(row.created_at_utc)}
        </span>
        {loading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
        )}
      </div>
    </li>
  );
}

function PaginationFooter({
  shown,
  total,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  shown: number;
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-ink-700/60 pt-3 text-[11px] text-ink-400">
      <span>
        Showing <strong className="text-ink-200">{shown}</strong> of{" "}
        <strong className="text-ink-200">{total}</strong>
      </span>
      {hasMore && (
        <button
          className="btn-ghost text-xs"
          onClick={onLoadMore}
          disabled={loadingMore}
        >
          {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Load more
        </button>
      )}
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
