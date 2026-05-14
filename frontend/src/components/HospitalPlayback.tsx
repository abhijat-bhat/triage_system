import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Bed,
  Building2,
  Cpu,
  Heart,
  Home,
  LayoutGrid,
  Map,
  Pause,
  Play,
  RotateCcw,
  Stethoscope,
  Users,
} from "lucide-react";
import { cn, priorityMeta } from "../lib/utils";
import {
  HospitalFloorPlan,
  type PatientToken as FloorPatientToken,
  type ZoneKey as FloorZoneKey,
} from "./HospitalFloorPlan";
import {
  PatientDetailDrawer,
  type PatientProfile,
} from "./PatientDetailDrawer";
import type {
  HospitalStateSnapshot,
  PatientInput,
  SimulationEvent,
  TriagePriority,
} from "../types";

type ZoneKey = FloorZoneKey;

interface PatientPos {
  id: string;
  priority: TriagePriority;
  zone: ZoneKey;
  arrivedAt: number;
  allocatedAt?: number;
  releasedAt?: number;
  resources?: Record<string, unknown>;
  patientInput?: PatientInput | null;
  confidence?: number;
  requiresHumanReview?: boolean;
  differentialDiagnosis?: string[];
  recommendedActions?: string[];
}

interface ResourceCounters {
  doctors_critical_care: number;
  doctors_general: number;
  nurses: number;
  icu_occupied: number;
  icu_total: number;
  general_occupied: number;
  general_total: number;
  ventilator_busy: number;
  ventilator_total: number;
  monitor_busy: number;
  monitor_total: number;
  ecg_busy: number;
  ecg_total: number;
}

const ZONES: { key: ZoneKey; label: string; icon: typeof Building2; tone: string; description: string }[] = [
  { key: "entry", label: "ER Entry", icon: Building2, tone: "from-accent/20 to-accent/0 border-accent/30 text-accent", description: "Just arrived — awaiting triage" },
  { key: "waiting", label: "Waiting room", icon: Users, tone: "from-priority-p3/20 to-priority-p3/0 border-priority-p3/30 text-priority-p3", description: "Triaged, awaiting allocation" },
  { key: "critical_care", label: "Critical Care", icon: Heart, tone: "from-priority-p1/20 to-priority-p1/0 border-priority-p1/30 text-priority-p1", description: "ICU + ventilator (P1)" },
  { key: "icu", label: "ICU", icon: Activity, tone: "from-priority-p2/20 to-priority-p2/0 border-priority-p2/30 text-priority-p2", description: "Monitored ICU bed (P2)" },
  { key: "general", label: "General Ward", icon: Bed, tone: "from-priority-p4/20 to-priority-p4/0 border-priority-p4/30 text-priority-p4", description: "General bed + nurse (P3)" },
  { key: "self_care", label: "Self-care", icon: Home, tone: "from-priority-p5/20 to-priority-p5/0 border-priority-p5/30 text-priority-p5", description: "No inpatient resources (P4/P5)" },
  { key: "discharged", label: "Discharged", icon: Stethoscope, tone: "from-ink-700/30 to-ink-700/0 border-ink-700/60 text-ink-300", description: "Treatment complete" },
];

interface Props {
  events: SimulationEvent[];
}

export function HospitalPlayback({ events }: Props) {
  const maxTick = events.length > 0 ? events[events.length - 1].timestamp : 0;
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4); // ticks per second
  const [view, setView] = useState<"floor" | "zones">("floor");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const playRef = useRef<number | null>(null);

  // Auto-play when events arrive for the first time
  useEffect(() => {
    if (events.length > 0) {
      setTick(0);
      setPlaying(true);
    }
  }, [events]);

  useEffect(() => {
    if (!playing) {
      if (playRef.current) {
        clearInterval(playRef.current);
        playRef.current = null;
      }
      return;
    }
    playRef.current = window.setInterval(() => {
      setTick((t) => {
        if (t >= maxTick) {
          setPlaying(false);
          return t;
        }
        return t + 1;
      });
    }, 1000 / speed);
    return () => {
      if (playRef.current) {
        clearInterval(playRef.current);
        playRef.current = null;
      }
    };
  }, [playing, speed, maxTick]);

  const { patients, counters } = useMemo(
    () => deriveStateAtTick(events, tick),
    [events, tick],
  );

  const grouped = useMemo(() => groupByZone(patients), [patients]);
  const progress = maxTick > 0 ? Math.min(1, tick / maxTick) : 0;

  const selectedPatient: PatientProfile | null = useMemo(() => {
    if (!selectedId) return null;
    // Prefer the live position (latest tick); fall back to the earliest event so
    // a patient that has already been discharged off the floor is still inspectable.
    const live = patients[selectedId];
    if (live) {
      return {
        id: live.id,
        arrivalTick: live.arrivedAt,
        priority: live.priority,
        confidence: live.confidence,
        requiresHumanReview: live.requiresHumanReview,
        patientInput: live.patientInput,
        differentialDiagnosis: live.differentialDiagnosis,
        recommendedActions: live.recommendedActions,
        allocatedTick: live.allocatedAt,
        releasedTick: live.releasedAt,
        resources: live.resources,
      };
    }
    return buildProfileFromEvents(events, selectedId);
  }, [selectedId, patients, events]);

  return (
    <div className="space-y-5">
      <div className="panel-tight flex flex-wrap items-center gap-4 px-4 py-3">
        <button
          onClick={() => setPlaying((p) => !p)}
          className="btn-primary px-3 py-1.5 text-xs"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {playing ? "Pause" : tick >= maxTick ? "Replay" : "Play"}
        </button>
        <button
          onClick={() => {
            setTick(0);
            setPlaying(false);
          }}
          className="btn-ghost px-2.5 py-1.5 text-xs"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
        <div className="flex items-center gap-1.5">
          {[1, 2, 4, 8].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] font-mono",
                speed === s
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-ink-700/60 text-ink-300 hover:border-accent/30",
              )}
            >
              {s}x
            </button>
          ))}
        </div>
        <div className="flex flex-1 items-center gap-3 min-w-[200px]">
          <span className="font-mono text-[11px] text-ink-400">t = {tick}</span>
          <input
            type="range"
            min={0}
            max={maxTick}
            value={tick}
            onChange={(e) => {
              setTick(parseInt(e.target.value, 10));
              setPlaying(false);
            }}
            className="w-full accent-accent"
          />
          <span className="font-mono text-[11px] text-ink-400">/ {maxTick}</span>
        </div>
        <span className="font-mono text-[11px] text-ink-400">
          {(progress * 100).toFixed(0)}%
        </span>
        <div className="flex items-center gap-1 rounded-md border border-ink-700/60 bg-ink-900/40 p-0.5">
          <button
            onClick={() => setView("floor")}
            className={cn(
              "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition",
              view === "floor"
                ? "bg-accent/20 text-accent"
                : "text-ink-300 hover:text-ink-100",
            )}
            title="Floor-plan view"
          >
            <Map className="h-3 w-3" /> Floor
          </button>
          <button
            onClick={() => setView("zones")}
            className={cn(
              "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition",
              view === "zones"
                ? "bg-accent/20 text-accent"
                : "text-ink-300 hover:text-ink-100",
            )}
            title="Zone-grid view"
          >
            <LayoutGrid className="h-3 w-3" /> Zones
          </button>
        </div>
      </div>

      {view === "floor" && (
        <HospitalFloorPlan
          patients={toFloorPatients(patients)}
          counters={counters}
          tick={tick}
          maxTick={maxTick}
          onPatientClick={(id) => setSelectedId(id)}
        />
      )}

      {view === "zones" && (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {ZONES.map((zone) => {
          const Icon = zone.icon;
          const occupants = grouped[zone.key] ?? [];
          return (
            <motion.div
              key={zone.key}
              layout
              className={cn(
                "relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4",
                zone.tone,
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink-50">
                    <Icon className="h-4 w-4" /> {zone.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-300/80">{zone.description}</p>
                </div>
                <span className="font-mono text-[11px] text-ink-200">
                  {occupants.length}
                </span>
              </div>

              <div className="mt-3 flex min-h-[68px] flex-wrap gap-1.5">
                <AnimatePresence initial={false}>
                  {occupants.map((p) => (
                    <PatientDot
                      key={p.id}
                      patient={p}
                      onClick={() => setSelectedId(p.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </div>
      )}

      {view === "zones" && <ResourceBars counters={counters} />}

      <PatientDetailDrawer
        patient={selectedPatient}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

function toFloorPatients(
  patients: Record<string, PatientPos>,
): Record<string, FloorPatientToken> {
  const out: Record<string, FloorPatientToken> = {};
  for (const [id, p] of Object.entries(patients)) {
    out[id] = {
      id: p.id,
      priority: p.priority,
      zone: p.zone,
      arrivedAt: p.arrivedAt,
    };
  }
  return out;
}

function PatientDot({
  patient,
  onClick,
}: {
  patient: PatientPos;
  onClick?: () => void;
}) {
  const tone = priorityMeta[patient.priority];
  return (
    <motion.button
      layoutId={patient.id}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      whileHover={{ scale: 1.15 }}
      whileTap={{ scale: 0.92 }}
      title={`${patient.id} · ${patient.priority} — click to inspect`}
      onClick={onClick}
      className={cn(
        "grid h-7 w-7 place-items-center rounded-full text-[9px] font-mono font-bold ring-2 ring-ink-900/50 transition hover:ring-accent/60",
        tone.bg,
        tone.tone,
      )}
    >
      {patient.priority}
    </motion.button>
  );
}

function buildProfileFromEvents(
  events: SimulationEvent[],
  patientId: string,
): PatientProfile | null {
  let profile: PatientProfile | null = null;
  for (const ev of events) {
    if (ev.patient_id !== patientId) continue;
    if (ev.event_type === "PATIENT_ARRIVED") {
      const p = ev.payload as {
        priority: TriagePriority;
        confidence_score?: number;
        requires_human_review?: boolean;
        patient_input?: PatientInput | null;
        differential_diagnosis?: string[];
        recommended_actions?: string[];
      };
      profile = {
        id: patientId,
        arrivalTick: ev.timestamp,
        priority: p.priority,
        confidence: p.confidence_score,
        requiresHumanReview: p.requires_human_review,
        patientInput: p.patient_input ?? null,
        differentialDiagnosis: p.differential_diagnosis,
        recommendedActions: p.recommended_actions,
      };
    } else if (ev.event_type === "RESOURCE_ALLOCATED" && profile) {
      const p = ev.payload as { assigned_resources?: Record<string, unknown> };
      profile.allocatedTick = ev.timestamp;
      profile.resources = p.assigned_resources;
    } else if (ev.event_type === "RESOURCE_RELEASED" && profile) {
      profile.releasedTick = ev.timestamp;
    }
  }
  return profile;
}

function ResourceBars({ counters }: { counters: ResourceCounters }) {
  const items: {
    label: string;
    busy: number;
    total: number;
    icon: typeof Activity;
  }[] = [
    {
      label: "ICU beds",
      busy: counters.icu_occupied,
      total: counters.icu_total,
      icon: Bed,
    },
    {
      label: "General beds",
      busy: counters.general_occupied,
      total: counters.general_total,
      icon: Building2,
    },
    {
      label: "Ventilators",
      busy: counters.ventilator_busy,
      total: counters.ventilator_total,
      icon: Activity,
    },
    {
      label: "Monitors",
      busy: counters.monitor_busy,
      total: counters.monitor_total,
      icon: Cpu,
    },
    {
      label: "ECG",
      busy: counters.ecg_busy,
      total: counters.ecg_total,
      icon: Heart,
    },
  ];

  return (
    <div className="panel-tight p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-300">
        Resource state · live
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((item) => {
          const pct = item.total > 0 ? (item.busy / item.total) * 100 : 0;
          const Icon = item.icon;
          const tone =
            pct >= 85
              ? "bg-priority-p1"
              : pct >= 60
                ? "bg-priority-p2"
                : "bg-accent";
          return (
            <div key={item.label}>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-ink-200">
                  <Icon className="h-3.5 w-3.5 text-ink-400" />
                  {item.label}
                </span>
                <span className="font-mono text-ink-300">
                  {item.busy}/{item.total}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ink-700/40">
                <motion.div
                  className={cn("h-full rounded-full", tone)}
                  initial={false}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function priorityToZone(
  priority: TriagePriority,
  assigned: Record<string, unknown> | undefined,
): ZoneKey {
  // P1 = ICU + ventilator → Critical Care
  // P2 = ICU bed (no vent) → ICU
  // P3 = general bed → General Ward
  // P4/P5 = no resources → Self-care
  if (assigned && (assigned as { ventilator?: number }).ventilator) {
    return "critical_care";
  }
  if (assigned && (assigned as { icu_bed?: number }).icu_bed) {
    return priority === "P1" ? "critical_care" : "icu";
  }
  if (assigned && (assigned as { general_bed?: number }).general_bed) {
    return "general";
  }
  if (priority === "P1") return "critical_care";
  if (priority === "P2") return "icu";
  if (priority === "P3") return "general";
  return "self_care";
}

function groupByZone(patients: Record<string, PatientPos>): Record<ZoneKey, PatientPos[]> {
  const out: Record<ZoneKey, PatientPos[]> = {
    entry: [],
    waiting: [],
    critical_care: [],
    icu: [],
    general: [],
    self_care: [],
    discharged: [],
  };
  for (const p of Object.values(patients)) out[p.zone].push(p);
  return out;
}

function deriveStateAtTick(events: SimulationEvent[], tick: number): {
  patients: Record<string, PatientPos>;
  counters: ResourceCounters;
} {
  const patients: Record<string, PatientPos> = {};
  let lastResourceState: HospitalStateSnapshot | null = null;

  for (const event of events) {
    if (event.timestamp > tick) break;
    if (event.resource_state) {
      lastResourceState = event.resource_state as HospitalStateSnapshot;
    }

    if (event.event_type === "PATIENT_ARRIVED" && event.patient_id) {
      const payload = event.payload as {
        priority: TriagePriority;
        confidence_score?: number;
        requires_human_review?: boolean;
        patient_input?: PatientInput | null;
        differential_diagnosis?: string[];
        recommended_actions?: string[];
      };
      patients[event.patient_id] = {
        id: event.patient_id,
        priority: payload.priority,
        zone: "entry",
        arrivedAt: event.timestamp,
        patientInput: payload.patient_input ?? null,
        confidence: payload.confidence_score,
        requiresHumanReview: payload.requires_human_review,
        differentialDiagnosis: payload.differential_diagnosis,
        recommendedActions: payload.recommended_actions,
      };
    } else if (event.event_type === "PATIENT_TRIAGED" && event.patient_id) {
      const existing = patients[event.patient_id];
      const priority =
        (event.payload as { priority?: TriagePriority }).priority ?? existing?.priority ?? "P3";
      patients[event.patient_id] = {
        ...(existing ?? { id: event.patient_id, priority, arrivedAt: event.timestamp }),
        priority,
        zone: "waiting",
      };
    } else if (event.event_type === "RESOURCE_ALLOCATED" && event.patient_id) {
      const existing = patients[event.patient_id];
      const priority = (event.payload as { priority?: TriagePriority }).priority ?? existing?.priority ?? "P3";
      const assigned = (event.payload as { assigned_resources?: Record<string, unknown> }).assigned_resources;
      const zone = priorityToZone(priority, assigned);
      patients[event.patient_id] = {
        ...(existing ?? { id: event.patient_id, priority, arrivedAt: event.timestamp }),
        zone,
        allocatedAt: event.timestamp,
        resources: assigned,
      };
    } else if (event.event_type === "RESOURCE_RELEASED" && event.patient_id) {
      const existing = patients[event.patient_id];
      if (existing) {
        patients[event.patient_id] = {
          ...existing,
          zone: "discharged",
          releasedAt: event.timestamp,
        };
      }
    }
  }

  return {
    patients,
    counters: snapshotToCounters(lastResourceState),
  };
}

function snapshotToCounters(snap: HospitalStateSnapshot | null): ResourceCounters {
  if (!snap) {
    return {
      doctors_critical_care: 0,
      doctors_general: 0,
      nurses: 0,
      icu_occupied: 0,
      icu_total: 0,
      general_occupied: 0,
      general_total: 0,
      ventilator_busy: 0,
      ventilator_total: 0,
      monitor_busy: 0,
      monitor_total: 0,
      ecg_busy: 0,
      ecg_total: 0,
    };
  }
  return {
    doctors_critical_care: snap.available_doctors?.critical_care ?? 0,
    doctors_general: snap.available_doctors?.general ?? 0,
    nurses: snap.available_nurses ?? 0,
    icu_occupied: snap.icu_beds_occupied ?? 0,
    icu_total: snap.icu_beds_total ?? 0,
    general_occupied: snap.general_beds_occupied ?? 0,
    general_total: snap.general_beds_total ?? 0,
    ventilator_busy:
      (snap.machines_total?.ventilator ?? 0) - (snap.machines_available?.ventilator ?? 0),
    ventilator_total: snap.machines_total?.ventilator ?? 0,
    monitor_busy:
      (snap.machines_total?.monitor ?? 0) - (snap.machines_available?.monitor ?? 0),
    monitor_total: snap.machines_total?.monitor ?? 0,
    ecg_busy: (snap.machines_total?.ecg ?? 0) - (snap.machines_available?.ecg ?? 0),
    ecg_total: snap.machines_total?.ecg ?? 0,
  };
}

