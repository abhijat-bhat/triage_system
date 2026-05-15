import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertOctagon,
  Eye,
  HeartPulse,
  Image as ImageIcon,
  Loader2,
  Pill,
  ShieldAlert,
  Stethoscope,
  TriangleAlert,
  User,
  Wind,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { cn, formatRelative, priorityMeta } from "../lib/utils";
import { PriorityBadge } from "./PriorityBadge";
import type { PatientInput, TriagePriority } from "../types";

export interface PatientProfile {
  id: string;
  arrivalTick: number;
  priority: TriagePriority;
  confidence?: number;
  requiresHumanReview?: boolean;
  patientInput?: PatientInput | null;
  differentialDiagnosis?: string[];
  recommendedActions?: string[];
  allocatedTick?: number;
  releasedTick?: number;
  resources?: Record<string, unknown>;
  // When supplied, the drawer renders a clinician-override panel that PATCHes
  // /api/v1/triage/{triageRunId}/override and reports the new override via
  // onOverrideApplied so the caller can refresh its list/badge state.
  triageRunId?: number;
  agentPriority?: TriagePriority;
  overridePriority?: TriagePriority | null;
  overrideReason?: string | null;
  overriddenAt?: string | null;
}

interface Props {
  patient: PatientProfile | null;
  onClose: () => void;
  onOverrideApplied?: (update: {
    triageRunId: number;
    overridePriority: TriagePriority;
    overrideReason: string;
    overriddenAt: string;
  }) => void;
}

const PRIORITY_OPTIONS: TriagePriority[] = ["P1", "P2", "P3", "P4", "P5"];

// Reference ranges used to flag abnormal vitals visually.
const VITAL_RANGES: Record<
  string,
  { low: number; high: number; unit: string; label: string; icon: typeof Activity }
> = {
  hr: { low: 60, high: 100, unit: "bpm", label: "Heart Rate", icon: HeartPulse },
  systolic_bp: { low: 90, high: 140, unit: "mmHg", label: "Systolic BP", icon: Activity },
  diastolic_bp: { low: 60, high: 90, unit: "mmHg", label: "Diastolic BP", icon: Activity },
  spo2: { low: 95, high: 100, unit: "%", label: "SpO₂", icon: Wind },
  temperature_c: { low: 36.1, high: 37.6, unit: "°C", label: "Temp", icon: Activity },
  rr: { low: 12, high: 20, unit: "/min", label: "Resp. Rate", icon: Wind },
};

export function PatientDetailDrawer({ patient, onClose, onOverrideApplied }: Props) {
  return (
    <AnimatePresence>
      {patient && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-ink-900/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col border-l border-ink-700/60 bg-ink-900/95 shadow-panel backdrop-blur-xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
          >
            <DrawerBody
              patient={patient}
              onClose={onClose}
              onOverrideApplied={onOverrideApplied}
            />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function DrawerBody({
  patient,
  onClose,
  onOverrideApplied,
}: {
  patient: PatientProfile;
  onClose: () => void;
  onOverrideApplied?: Props["onOverrideApplied"];
}) {
  const tone = priorityMeta[patient.priority];
  const input = patient.patientInput ?? null;
  const waitTicks =
    patient.allocatedTick !== undefined
      ? patient.allocatedTick - patient.arrivalTick
      : null;

  return (
    <>
      <header
        className={cn(
          "relative flex items-start justify-between gap-3 border-b border-ink-700/60 px-5 py-4",
          tone.bg,
        )}
      >
        <div className="flex items-center gap-3">
          <div className={cn("grid h-11 w-11 place-items-center rounded-xl ring-2", tone.tone, tone.ring)}>
            <User className="h-5 w-5" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-ink-400">
              patient
            </p>
            <p className="font-mono text-sm font-semibold text-ink-50">{patient.id}</p>
            <p className="mt-0.5 text-[11px] text-ink-300">
              arrived at tick {patient.arrivalTick}
              {waitTicks !== null && (
                <span className="ml-1.5 text-ink-400">
                  · waited {waitTicks} ticks
                </span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close patient detail"
          className="grid h-8 w-8 place-items-center rounded-lg border border-ink-700/60 bg-ink-900/50 text-ink-300 transition hover:border-accent/40 hover:text-ink-50"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="space-y-5 px-5 py-5">
          <section className="rounded-xl border border-ink-700/60 bg-ink-900/40 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-400">
              Triage verdict
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <PriorityBadge priority={patient.priority} />
              {patient.confidence !== undefined && (
                <div className="flex flex-col items-end">
                  <span className="text-[10px] uppercase tracking-wider text-ink-400">
                    confidence
                  </span>
                  <span className="font-mono text-sm font-semibold text-ink-100">
                    {(patient.confidence * 100).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
            {patient.confidence !== undefined && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-700/40">
                <div
                  className={cn("h-full rounded-full", tone.dot)}
                  style={{ width: `${Math.min(100, patient.confidence * 100)}%` }}
                />
              </div>
            )}
            {patient.overriddenAt && patient.overridePriority && patient.agentPriority && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-priority-p2/10 px-2.5 py-1.5 text-xs text-priority-p2 ring-1 ring-priority-p2/30">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Manually overridden from{" "}
                  <strong className="font-mono">{patient.agentPriority}</strong> to{" "}
                  <strong className="font-mono">{patient.overridePriority}</strong>{" "}
                  <span className="text-ink-400">
                    · {formatRelative(patient.overriddenAt)}
                  </span>
                </span>
              </div>
            )}
            {patient.requiresHumanReview && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-priority-p1/10 px-2.5 py-1.5 text-xs text-priority-p1 ring-1 ring-priority-p1/30">
                <Eye className="h-3.5 w-3.5" />
                Flagged for human review
              </div>
            )}
          </section>

          {patient.triageRunId !== undefined && (
            <OverridePanel
              triageRunId={patient.triageRunId}
              agentPriority={patient.agentPriority ?? patient.priority}
              currentOverridePriority={patient.overridePriority ?? null}
              currentOverrideReason={patient.overrideReason ?? null}
              currentOverriddenAt={patient.overriddenAt ?? null}
              onOverrideApplied={onOverrideApplied}
            />
          )}

          {input?.chief_complaint && (
            <Section title="Chief complaint" icon={Stethoscope}>
              <p className="rounded-lg border border-ink-700/60 bg-ink-900/50 p-3 text-sm italic text-ink-100">
                “{input.chief_complaint}”
              </p>
            </Section>
          )}

          {input?.vitals && (
            <Section title="Vital signs" icon={HeartPulse}>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(input.vitals).map(([key, value]) => (
                  <VitalCell
                    key={key}
                    name={key}
                    value={value as number}
                  />
                ))}
              </div>
            </Section>
          )}

          {input?.ehr_data?.history && input.ehr_data.history.length > 0 && (
            <Section title="History" icon={Activity}>
              <div className="flex flex-wrap gap-1.5">
                {input.ehr_data.history.map((h, i) => (
                  <span key={`${h}-${i}`} className="chip">{h}</span>
                ))}
              </div>
            </Section>
          )}

          {input?.ehr_data?.allergies && input.ehr_data.allergies.length > 0 && (
            <Section title="Allergies" icon={TriangleAlert}>
              <div className="flex flex-wrap gap-1.5">
                {input.ehr_data.allergies.map((a, i) => (
                  <span
                    key={`${a}-${i}`}
                    className="inline-flex items-center gap-1 rounded-full border border-priority-p1/30 bg-priority-p1/10 px-2.5 py-1 text-xs font-medium text-priority-p1"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {input?.ehr_data?.medications && input.ehr_data.medications.length > 0 && (
            <Section title="Medications" icon={Pill}>
              <ul className="space-y-1.5">
                {input.ehr_data.medications.map((m, i) => (
                  <li
                    key={`${m.name}-${i}`}
                    className="flex items-center justify-between rounded-lg border border-ink-700/60 bg-ink-900/40 px-3 py-1.5 text-xs"
                  >
                    <span className="font-medium text-ink-100">{m.name}</span>
                    {m.dose && (
                      <span className="font-mono text-ink-400">{m.dose}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {input?.ehr_data?.labs && Object.keys(input.ehr_data.labs).length > 0 && (
            <Section title="Labs" icon={Activity}>
              <ul className="grid grid-cols-2 gap-1.5">
                {Object.entries(input.ehr_data.labs).map(([key, value]) => (
                  <li
                    key={key}
                    className="flex items-center justify-between rounded-lg border border-ink-700/60 bg-ink-900/40 px-2.5 py-1.5 text-xs"
                  >
                    <span className="font-mono text-ink-400">{key}</span>
                    <span className="font-mono text-ink-100">{String(value)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {input?.ehr_data?.social_context &&
            Object.keys(input.ehr_data.social_context).length > 0 && (
              <Section title="Social context" icon={User}>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(input.ehr_data.social_context).map(([k, v]) => (
                    <span key={k} className="chip">
                      <span className="font-mono text-ink-400">{k}</span>
                      <span className="text-ink-200">{String(v)}</span>
                    </span>
                  ))}
                </div>
              </Section>
            )}

          {input?.image && (
            <Section title="Image input" icon={ImageIcon}>
              <p className="rounded-lg border border-ink-700/60 bg-ink-900/40 p-2.5 font-mono text-[11px] text-ink-300">
                {input.image}
              </p>
            </Section>
          )}

          {patient.differentialDiagnosis &&
            patient.differentialDiagnosis.length > 0 && (
              <Section title="Differential diagnosis" icon={Stethoscope}>
                <ul className="space-y-1">
                  {patient.differentialDiagnosis.map((d, i) => (
                    <li
                      key={`${d}-${i}`}
                      className="flex items-start gap-2 text-sm text-ink-200"
                    >
                      <span className={cn("mt-1.5 h-1.5 w-1.5 rounded-full", tone.dot)} />
                      {d}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

          {patient.recommendedActions &&
            patient.recommendedActions.length > 0 && (
              <Section title="Recommended actions" icon={AlertOctagon}>
                <ul className="space-y-1">
                  {patient.recommendedActions.map((d, i) => (
                    <li
                      key={`${d}-${i}`}
                      className="flex items-start gap-2 text-sm text-ink-200"
                    >
                      <span className={cn("mt-1.5 h-1.5 w-1.5 rounded-full", tone.dot)} />
                      {d}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

          {patient.resources && Object.keys(patient.resources).length > 0 && (
            <Section title="Assigned resources" icon={Activity}>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(patient.resources).map(([k, v]) => (
                  <span key={k} className="chip">
                    <span className="font-mono text-ink-400">{k}</span>
                    <span className="text-ink-200">{String(v)}</span>
                  </span>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Activity;
  children: React.ReactNode;
}) {
  return (
    <section>
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-400">
        <Icon className="h-3 w-3" />
        {title}
      </p>
      {children}
    </section>
  );
}

function VitalCell({ name, value }: { name: string; value: number }) {
  const meta = VITAL_RANGES[name];
  if (!meta) return null;
  const Icon = meta.icon;
  const abnormal = value < meta.low || value > meta.high;
  const lowSide = value < meta.low;
  return (
    <div
      className={cn(
        "rounded-lg border p-2.5",
        abnormal
          ? "border-priority-p1/40 bg-priority-p1/10"
          : "border-ink-700/60 bg-ink-900/40",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider",
            abnormal ? "text-priority-p1" : "text-ink-400",
          )}
        >
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
        {abnormal && (
          <span className="rounded-full bg-priority-p1/20 px-1.5 py-0.5 text-[9px] font-semibold text-priority-p1">
            {lowSide ? "LOW" : "HIGH"}
          </span>
        )}
      </div>
      <p
        className={cn(
          "mt-1 font-mono text-base font-semibold tabular-nums",
          abnormal ? "text-priority-p1" : "text-ink-100",
        )}
      >
        {value}
        <span className="ml-1 text-[10px] font-normal text-ink-400">
          {meta.unit}
        </span>
      </p>
      <p className="mt-0.5 text-[10px] text-ink-500">
        ref {meta.low}–{meta.high}
      </p>
    </div>
  );
}

function OverridePanel({
  triageRunId,
  agentPriority,
  currentOverridePriority,
  currentOverrideReason,
  currentOverriddenAt,
  onOverrideApplied,
}: {
  triageRunId: number;
  agentPriority: TriagePriority;
  currentOverridePriority: TriagePriority | null;
  currentOverrideReason: string | null;
  currentOverriddenAt: string | null;
  onOverrideApplied?: Props["onOverrideApplied"];
}) {
  const initialPriority = currentOverridePriority ?? agentPriority;
  const [selected, setSelected] = useState<TriagePriority>(initialPriority);
  const [reason, setReason] = useState(currentOverrideReason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(currentOverriddenAt);

  // When the drawer is reused for a different patient, reset local state.
  useEffect(() => {
    setSelected(currentOverridePriority ?? agentPriority);
    setReason(currentOverrideReason ?? "");
    setSavedAt(currentOverriddenAt);
    setError(null);
  }, [triageRunId, agentPriority, currentOverridePriority, currentOverrideReason, currentOverriddenAt]);

  const trimmedReason = reason.trim();
  const isSameAsCurrent =
    selected === (currentOverridePriority ?? agentPriority) &&
    trimmedReason === (currentOverrideReason ?? "");
  const canSubmit = !busy && trimmedReason.length > 0 && !isSameAsCurrent;

  const handleSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.triageOverride(triageRunId, {
        override_priority: selected,
        override_reason: trimmedReason,
      });
      setSavedAt(result.overridden_at);
      onOverrideApplied?.({
        triageRunId: result.triage_run_id,
        overridePriority: result.override_priority,
        overrideReason: result.override_reason,
        overriddenAt: result.overridden_at,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-priority-p2/30 bg-priority-p2/5 p-4">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-priority-p2">
        <ShieldAlert className="h-3 w-3" />
        Clinician override
      </p>
      <p className="mt-1 text-xs text-ink-400">
        Override the agent-computed priority. The original verdict
        (<span className="font-mono">{agentPriority}</span>) is preserved on
        the audit trail.
      </p>

      <div className="mt-3 space-y-3">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
            New priority
          </label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {PRIORITY_OPTIONS.map((p) => {
              const meta = priorityMeta[p];
              const active = selected === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSelected(p)}
                  disabled={busy}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-xs font-mono font-semibold transition disabled:opacity-50",
                    active
                      ? cn(meta.bg, meta.ring, meta.tone, "ring-1")
                      : "border-ink-700/60 bg-ink-900/40 text-ink-300 hover:border-accent/30 hover:text-ink-100",
                  )}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label
            htmlFor={`override-reason-${triageRunId}`}
            className="text-[10px] font-semibold uppercase tracking-wider text-ink-400"
          >
            Reason <span className="text-priority-p1">*</span>
          </label>
          <textarea
            id={`override-reason-${triageRunId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
            rows={3}
            placeholder="Explain why the agent verdict is being overridden (clinical rationale, missing context, etc.)"
            className="mt-1 w-full rounded-lg border border-ink-700/60 bg-ink-900/60 px-3 py-2 text-xs text-ink-100 placeholder-ink-500 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30 disabled:opacity-50"
          />
        </div>

        {error && (
          <p className="rounded-lg border border-priority-p1/40 bg-priority-p1/10 px-2.5 py-1.5 text-[11px] text-priority-p1">
            {error}
          </p>
        )}

        {savedAt && !error && (
          <p className="text-[11px] text-ink-400">
            Override saved {formatRelative(savedAt)}.
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
            canSubmit
              ? "bg-priority-p2 text-ink-900 hover:brightness-110"
              : "cursor-not-allowed bg-ink-700/40 text-ink-500",
          )}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ShieldAlert className="h-3.5 w-3.5" />
          )}
          {currentOverridePriority ? "Update override" : "Apply override"}
        </button>
      </div>
    </section>
  );
}
