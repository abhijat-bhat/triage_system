import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Eye, Filter, Search, Users } from "lucide-react";
import { cn, priorityMeta } from "../lib/utils";
import { PriorityBadge } from "./PriorityBadge";
import { PatientDetailDrawer, type PatientProfile } from "./PatientDetailDrawer";
import type { PatientInput, SimulationEvent, TriagePriority } from "../types";

interface Props {
  events: SimulationEvent[];
}

interface Row {
  id: string;
  arrivalTick: number;
  priority: TriagePriority;
  confidence?: number;
  requiresHumanReview?: boolean;
  chiefComplaint?: string;
  vitals?: {
    hr: number;
    spo2: number;
    systolic_bp: number;
    rr: number;
    temperature_c: number;
  };
  patientInput?: PatientInput | null;
  allocatedTick?: number;
  releasedTick?: number;
  resources?: Record<string, unknown>;
  differentialDiagnosis?: string[];
  recommendedActions?: string[];
}

type SortKey = "arrivalTick" | "priority" | "confidence" | "wait";

const PRIORITY_ORDER: Record<TriagePriority, number> = {
  P1: 0,
  P2: 1,
  P3: 2,
  P4: 3,
  P5: 4,
};

export function SyntheticPatientsTable({ events }: Props) {
  const rows = useMemo<Row[]>(() => buildRows(events), [events]);
  const [filter, setFilter] = useState<"all" | TriagePriority>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("priority");
  const [asc, setAsc] = useState(true);
  const [selected, setSelected] = useState<Row | null>(null);

  const filtered = useMemo(() => {
    let out = rows;
    if (filter !== "all") out = out.filter((r) => r.priority === filter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          (r.chiefComplaint ?? "").toLowerCase().includes(q),
      );
    }
    return [...out].sort((a, b) => {
      const dir = asc ? 1 : -1;
      switch (sort) {
        case "arrivalTick":
          return (a.arrivalTick - b.arrivalTick) * dir;
        case "priority":
          return (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]) * dir;
        case "confidence":
          return ((a.confidence ?? 0) - (b.confidence ?? 0)) * dir;
        case "wait": {
          const aw = (a.allocatedTick ?? Number.MAX_SAFE_INTEGER) - a.arrivalTick;
          const bw = (b.allocatedTick ?? Number.MAX_SAFE_INTEGER) - b.arrivalTick;
          return (aw - bw) * dir;
        }
      }
    });
  }, [rows, filter, query, sort, asc]);

  const buckets = useMemo(() => {
    const out: Record<TriagePriority, number> = { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 };
    rows.forEach((r) => (out[r.priority] += 1));
    return out;
  }, [rows]);

  if (rows.length === 0) return null;

  const profile: PatientProfile | null = selected
    ? {
        id: selected.id,
        arrivalTick: selected.arrivalTick,
        priority: selected.priority,
        confidence: selected.confidence,
        requiresHumanReview: selected.requiresHumanReview,
        patientInput: selected.patientInput,
        allocatedTick: selected.allocatedTick,
        releasedTick: selected.releasedTick,
        resources: selected.resources,
        differentialDiagnosis: selected.differentialDiagnosis,
        recommendedActions: selected.recommendedActions,
      }
    : null;

  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent ring-1 ring-accent/30">
            <Users className="h-3 w-3" />
            {rows.length} synthetic patients
          </span>
          <FilterChip
            label="All"
            active={filter === "all"}
            onClick={() => setFilter("all")}
            count={rows.length}
          />
          {(Object.keys(PRIORITY_ORDER) as TriagePriority[]).map((p) => (
            <FilterChip
              key={p}
              label={p}
              active={filter === p}
              onClick={() => setFilter(p)}
              count={buckets[p]}
              tone={priorityMeta[p].tone}
            />
          ))}
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-400" />
              <input
                className="input pl-7 py-1.5 text-xs"
                placeholder="search id / complaint"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-ink-700/60">
          <div className="max-h-[28rem] overflow-y-auto scrollbar-thin">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-ink-900/80 backdrop-blur">
                <tr className="border-b border-ink-700/60 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                  <SortHeader
                    label="Patient"
                    active={false}
                    onClick={() => {}}
                  />
                  <SortHeader
                    label="Priority"
                    active={sort === "priority"}
                    asc={asc}
                    onClick={() => toggle(sort, asc, setSort, setAsc, "priority")}
                  />
                  <SortHeader
                    label="Arrival"
                    active={sort === "arrivalTick"}
                    asc={asc}
                    onClick={() => toggle(sort, asc, setSort, setAsc, "arrivalTick")}
                  />
                  <SortHeader
                    label="Wait"
                    active={sort === "wait"}
                    asc={asc}
                    onClick={() => toggle(sort, asc, setSort, setAsc, "wait")}
                  />
                  <SortHeader
                    label="Confidence"
                    active={sort === "confidence"}
                    asc={asc}
                    onClick={() => toggle(sort, asc, setSort, setAsc, "confidence")}
                  />
                  <th className="px-3 py-2">Chief complaint</th>
                  <th className="px-3 py-2">Vitals</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, idx) => (
                  <motion.tr
                    key={row.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(idx * 0.01, 0.3) }}
                    className="cursor-pointer border-b border-ink-700/40 text-xs text-ink-200 transition hover:bg-ink-800/40"
                    onClick={() => setSelected(row)}
                  >
                    <td className="px-3 py-2 font-mono text-ink-300">{row.id}</td>
                    <td className="px-3 py-2">
                      <PriorityBadge priority={row.priority} size="sm" />
                    </td>
                    <td className="px-3 py-2 font-mono text-ink-400">
                      t={row.arrivalTick}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {row.allocatedTick !== undefined ? (
                        <span
                          className={cn(
                            row.allocatedTick - row.arrivalTick > 20
                              ? "text-priority-p1"
                              : row.allocatedTick - row.arrivalTick > 10
                                ? "text-priority-p2"
                                : "text-ink-300",
                          )}
                        >
                          {row.allocatedTick - row.arrivalTick}
                        </span>
                      ) : (
                        <span className="text-ink-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-ink-300">
                      {row.confidence !== undefined
                        ? `${(row.confidence * 100).toFixed(0)}%`
                        : "—"}
                    </td>
                    <td className="max-w-[18rem] truncate px-3 py-2 text-ink-300">
                      {row.chiefComplaint ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-ink-400">
                      {row.vitals ? (
                        <span className="inline-flex flex-wrap gap-2">
                          <VitalPill
                            label="HR"
                            value={row.vitals.hr}
                            abnormal={row.vitals.hr < 60 || row.vitals.hr > 100}
                          />
                          <VitalPill
                            label="SpO₂"
                            value={row.vitals.spo2}
                            abnormal={row.vitals.spo2 < 95}
                          />
                          <VitalPill
                            label="RR"
                            value={row.vitals.rr}
                            abnormal={row.vitals.rr < 12 || row.vitals.rr > 20}
                          />
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="inline-flex items-center gap-1 rounded-md border border-ink-700/60 bg-ink-900/40 px-2 py-1 text-[10px] font-medium text-ink-300 group-hover:border-accent/40">
                        <Eye className="h-3 w-3" />
                        view
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <p className="border-t border-ink-700/60 p-6 text-center text-xs text-ink-400">
              <Filter className="mr-1 inline h-3 w-3" /> No patients match this filter.
            </p>
          )}
        </div>
      </div>

      <PatientDetailDrawer
        patient={profile}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

function buildRows(events: SimulationEvent[]): Row[] {
  const map = new Map<string, Row>();
  for (const ev of events) {
    if (!ev.patient_id) continue;
    if (ev.event_type === "PATIENT_ARRIVED") {
      const p = ev.payload as {
        priority: TriagePriority;
        confidence_score?: number;
        requires_human_review?: boolean;
        patient_input?: PatientInput | null;
        differential_diagnosis?: string[];
        recommended_actions?: string[];
      };
      const v = p.patient_input?.vitals;
      map.set(ev.patient_id, {
        id: ev.patient_id,
        arrivalTick: ev.timestamp,
        priority: p.priority,
        confidence: p.confidence_score,
        requiresHumanReview: p.requires_human_review,
        chiefComplaint: p.patient_input?.chief_complaint,
        vitals: v
          ? {
              hr: v.hr,
              spo2: v.spo2,
              systolic_bp: v.systolic_bp,
              rr: v.rr,
              temperature_c: v.temperature_c,
            }
          : undefined,
        patientInput: p.patient_input ?? null,
        differentialDiagnosis: p.differential_diagnosis,
        recommendedActions: p.recommended_actions,
      });
    } else if (ev.event_type === "RESOURCE_ALLOCATED") {
      const existing = map.get(ev.patient_id);
      const p = ev.payload as { assigned_resources?: Record<string, unknown> };
      if (existing) {
        existing.allocatedTick = ev.timestamp;
        existing.resources = p.assigned_resources;
      }
    } else if (ev.event_type === "RESOURCE_RELEASED") {
      const existing = map.get(ev.patient_id);
      if (existing) existing.releasedTick = ev.timestamp;
    }
  }
  return Array.from(map.values());
}

function FilterChip({
  label,
  count,
  active,
  onClick,
  tone,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
        active
          ? "border-accent/40 bg-accent/15 text-accent"
          : "border-ink-700/60 bg-ink-900/40 text-ink-300 hover:border-accent/30",
      )}
    >
      <span className={tone}>{label}</span>
      <span className="rounded-full bg-ink-900/60 px-1.5 font-mono text-[10px] text-ink-300">
        {count}
      </span>
    </button>
  );
}

function SortHeader({
  label,
  active,
  asc,
  onClick,
}: {
  label: string;
  active: boolean;
  asc?: boolean;
  onClick: () => void;
}) {
  return (
    <th className="px-3 py-2">
      <button
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 transition hover:text-ink-100",
          active && "text-accent",
        )}
      >
        {label}
        {active &&
          (asc ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          ))}
      </button>
    </th>
  );
}

function VitalPill({
  label,
  value,
  abnormal,
}: {
  label: string;
  value: number;
  abnormal: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5",
        abnormal
          ? "bg-priority-p1/10 text-priority-p1 ring-1 ring-priority-p1/30"
          : "bg-ink-800/60 text-ink-300",
      )}
    >
      <span className="opacity-70">{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}

function toggle(
  cur: SortKey,
  curAsc: boolean,
  setKey: (k: SortKey) => void,
  setAsc: (b: boolean) => void,
  next: SortKey,
) {
  if (cur === next) {
    setAsc(!curAsc);
  } else {
    setKey(next);
    setAsc(true);
  }
}
