import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Ambulance,
  Bed,
  CheckCircle2,
  DoorOpen,
  Heart,
  Home,
  Stethoscope,
  Users,
} from "lucide-react";
import { cn, priorityMeta } from "../lib/utils";
import type { TriagePriority } from "../types";

export type ZoneKey =
  | "entry"
  | "waiting"
  | "critical_care"
  | "icu"
  | "general"
  | "self_care"
  | "discharged";

export interface PatientToken {
  id: string;
  priority: TriagePriority;
  zone: ZoneKey;
  arrivedAt: number;
}

export interface FloorResourceCounters {
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

interface Props {
  patients: Record<string, PatientToken>;
  counters: FloorResourceCounters;
  tick: number;
  maxTick: number;
  onPatientClick?: (id: string) => void;
}

interface ZoneLayout {
  key: ZoneKey;
  label: string;
  sublabel: string;
  icon: typeof Users;
  // percent-based rectangle within the 1000x600 viewBox
  x: number;
  y: number;
  w: number;
  h: number;
  accent: string;
  text: string;
  border: string;
}

const VW = 1000;
const VH = 600;

const ZONES: ZoneLayout[] = [
  {
    key: "entry",
    label: "ER Entry",
    sublabel: "Ambulance bay / walk-in",
    icon: Ambulance,
    x: 20,
    y: 250,
    w: 140,
    h: 100,
    accent: "fill-accent/10 stroke-accent/40",
    text: "text-accent",
    border: "ring-accent/40",
  },
  {
    key: "waiting",
    label: "Waiting Room",
    sublabel: "Triaged · awaiting bed",
    icon: Users,
    x: 200,
    y: 240,
    w: 180,
    h: 120,
    accent: "fill-priority-p3/10 stroke-priority-p3/40",
    text: "text-priority-p3",
    border: "ring-priority-p3/40",
  },
  {
    key: "critical_care",
    label: "Critical Care",
    sublabel: "ICU + ventilator · P1",
    icon: Heart,
    x: 430,
    y: 30,
    w: 240,
    h: 160,
    accent: "fill-priority-p1/10 stroke-priority-p1/40",
    text: "text-priority-p1",
    border: "ring-priority-p1/40",
  },
  {
    key: "icu",
    label: "ICU",
    sublabel: "Monitored bed · P2",
    icon: Activity,
    x: 720,
    y: 30,
    w: 240,
    h: 160,
    accent: "fill-priority-p2/10 stroke-priority-p2/40",
    text: "text-priority-p2",
    border: "ring-priority-p2/40",
  },
  {
    key: "general",
    label: "General Ward",
    sublabel: "General bed · P3",
    icon: Bed,
    x: 430,
    y: 230,
    w: 240,
    h: 160,
    accent: "fill-priority-p4/10 stroke-priority-p4/40",
    text: "text-priority-p4",
    border: "ring-priority-p4/40",
  },
  {
    key: "self_care",
    label: "Self-care",
    sublabel: "Outpatient · P4/P5",
    icon: Home,
    x: 430,
    y: 430,
    w: 240,
    h: 140,
    accent: "fill-priority-p5/10 stroke-priority-p5/40",
    text: "text-priority-p5",
    border: "ring-priority-p5/40",
  },
  {
    key: "discharged",
    label: "Discharge",
    sublabel: "Treatment complete",
    icon: CheckCircle2,
    x: 800,
    y: 430,
    w: 160,
    h: 140,
    accent: "fill-ink-700/10 stroke-ink-500/40",
    text: "text-ink-300",
    border: "ring-ink-600/40",
  },
];

const ZONE_INDEX: Record<ZoneKey, ZoneLayout> = Object.fromEntries(
  ZONES.map((z) => [z.key, z]),
) as Record<ZoneKey, ZoneLayout>;

// Soft connection paths between rooms, drawn in the SVG background.
const PATHS: { from: ZoneKey; to: ZoneKey }[] = [
  { from: "entry", to: "waiting" },
  { from: "waiting", to: "critical_care" },
  { from: "waiting", to: "icu" },
  { from: "waiting", to: "general" },
  { from: "waiting", to: "self_care" },
  { from: "critical_care", to: "discharged" },
  { from: "icu", to: "discharged" },
  { from: "general", to: "discharged" },
  { from: "self_care", to: "discharged" },
];

// Zone label takes the top 52px (title at y+24, sublabel at y+42 + small gap).
// Reserve that area so patient chips never collide with text.
const ZONE_LABEL_HEIGHT = 52;
const SLOT_SIZE = 26;
const SLOT_PADDING_X = 14;
const SLOT_PADDING_Y = 8;

function patientSlot(
  zone: ZoneLayout,
  index: number,
): { x: number; y: number } {
  // Pure row-major grid — deterministic, no collisions between patients.
  const usableW = Math.max(SLOT_SIZE, zone.w - SLOT_PADDING_X * 2);
  const cols = Math.max(1, Math.floor(usableW / SLOT_SIZE));
  const col = index % cols;
  const row = Math.floor(index / cols);
  const px = zone.x + SLOT_PADDING_X + col * SLOT_SIZE + SLOT_SIZE / 2;
  const py = zone.y + ZONE_LABEL_HEIGHT + SLOT_PADDING_Y + row * SLOT_SIZE + SLOT_SIZE / 2;
  return {
    x: Math.min(zone.x + zone.w - SLOT_SIZE / 2, px),
    y: Math.min(zone.y + zone.h - SLOT_SIZE / 2, py),
  };
}

function zoneCapacity(zone: ZoneLayout): number {
  const usableW = Math.max(SLOT_SIZE, zone.w - SLOT_PADDING_X * 2);
  const usableH = Math.max(SLOT_SIZE, zone.h - ZONE_LABEL_HEIGHT - SLOT_PADDING_Y * 2);
  const cols = Math.max(1, Math.floor(usableW / SLOT_SIZE));
  const rows = Math.max(1, Math.floor(usableH / SLOT_SIZE));
  return cols * rows;
}

export function HospitalFloorPlan({ patients, counters, tick, maxTick, onPatientClick }: Props) {
  const { placed, overflow } = useMemo(() => {
    const byZone: Record<ZoneKey, PatientToken[]> = {
      entry: [],
      waiting: [],
      critical_care: [],
      icu: [],
      general: [],
      self_care: [],
      discharged: [],
    };
    Object.values(patients).forEach((p) => byZone[p.zone].push(p));
    const placedTokens: { p: PatientToken; x: number; y: number }[] = [];
    const overflowMap: Partial<Record<ZoneKey, number>> = {};
    (Object.keys(byZone) as ZoneKey[]).forEach((k) => {
      const zone = ZONE_INDEX[k];
      const cap = zoneCapacity(zone);
      const sorted = byZone[k].sort((a, b) => a.arrivedAt - b.arrivedAt);
      const visible = sorted.slice(0, cap);
      const hidden = sorted.length - visible.length;
      if (hidden > 0) overflowMap[k] = hidden;
      visible.forEach((p, idx) => {
        const slot = patientSlot(zone, idx);
        placedTokens.push({ p, ...slot });
      });
    });
    return { placed: placedTokens, overflow: overflowMap };
  }, [patients]);

  const progress = maxTick > 0 ? Math.min(1, tick / maxTick) : 0;

  return (
    <div className="space-y-3">
      <div className="panel-tight relative overflow-hidden rounded-2xl border border-ink-700/60 bg-gradient-to-br from-ink-900/60 to-ink-950/60">
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          className="block w-full"
          style={{ aspectRatio: `${VW} / ${VH}` }}
        >
          {/* Floor grid for visual texture */}
          <defs>
            <pattern
              id="floor-grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="rgba(148,163,184,0.08)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width={VW} height={VH} fill="url(#floor-grid)" />

          {/* Corridors connecting rooms */}
          {PATHS.map(({ from, to }, idx) => {
            const a = ZONE_INDEX[from];
            const b = ZONE_INDEX[to];
            const ax = a.x + a.w / 2;
            const ay = a.y + a.h / 2;
            const bx = b.x + b.w / 2;
            const by = b.y + b.h / 2;
            return (
              <line
                key={`${from}-${to}-${idx}`}
                x1={ax}
                y1={ay}
                x2={bx}
                y2={by}
                stroke="rgba(148,163,184,0.18)"
                strokeWidth="3"
                strokeDasharray="6 8"
              />
            );
          })}

          {/* Rooms */}
          {ZONES.map((zone) => {
            const hidden = overflow[zone.key] ?? 0;
            return (
              <g key={zone.key}>
                <rect
                  x={zone.x}
                  y={zone.y}
                  width={zone.w}
                  height={zone.h}
                  rx={14}
                  className={zone.accent}
                  strokeWidth={2}
                />
                <text
                  x={zone.x + 14}
                  y={zone.y + 24}
                  className={cn("text-[14px] font-semibold", zone.text)}
                  fill="currentColor"
                >
                  {zone.label}
                </text>
                <text
                  x={zone.x + 14}
                  y={zone.y + 42}
                  className="text-[10px] fill-ink-400"
                >
                  {zone.sublabel}
                </text>
                {hidden > 0 && (
                  <>
                    <rect
                      x={zone.x + zone.w - 56}
                      y={zone.y + zone.h - 28}
                      width={44}
                      height={20}
                      rx={10}
                      className={cn("fill-ink-900/80", zone.text)}
                      stroke="currentColor"
                      strokeOpacity={0.6}
                    />
                    <text
                      x={zone.x + zone.w - 34}
                      y={zone.y + zone.h - 14}
                      textAnchor="middle"
                      className={cn("text-[11px] font-mono", zone.text)}
                      fill="currentColor"
                    >
                      +{hidden}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>

        {/* Patient tokens overlaid on top of the SVG, animated with framer-motion */}
        <div className="pointer-events-none absolute inset-0">
          {placed.map(({ p, x, y }) => (
            <PatientChip
              key={p.id}
              patient={p}
              left={`${(x / VW) * 100}%`}
              top={`${(y / VH) * 100}%`}
              onClick={onPatientClick ? () => onPatientClick(p.id) : undefined}
            />
          ))}
        </div>

        {/* Staff icons walking corridors — purely decorative life signal */}
        <StaffWalker delay={0} />
        <StaffWalker delay={2.5} />
        <StaffWalker delay={5} />

        <div className="absolute left-4 top-3 flex items-center gap-2 rounded-full bg-ink-900/70 px-3 py-1 text-[11px] font-mono text-ink-200 ring-1 ring-ink-700/60 backdrop-blur">
          <DoorOpen className="h-3 w-3 text-accent" />
          tick {tick} / {maxTick} · {(progress * 100).toFixed(0)}%
        </div>
        <div className="absolute right-4 top-3 flex items-center gap-2 rounded-full bg-ink-900/70 px-3 py-1 text-[11px] font-mono text-ink-200 ring-1 ring-ink-700/60 backdrop-blur">
          <Stethoscope className="h-3 w-3 text-priority-p2" />
          {Object.keys(patients).length} patients on floor
        </div>
      </div>

      <ResourceStrip counters={counters} />
    </div>
  );
}

function PatientChip({
  patient,
  left,
  top,
  onClick,
}: {
  patient: PatientToken;
  left: string;
  top: string;
  onClick?: () => void;
}) {
  const tone = priorityMeta[patient.priority];
  return (
    <motion.button
      type="button"
      layout
      layoutId={`patient-${patient.id}`}
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1, left, top }}
      exit={{ scale: 0.3, opacity: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 26 }}
      whileHover={{ scale: 1.25 }}
      whileTap={{ scale: 0.92 }}
      style={{ left, top, position: "absolute" }}
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "pointer-events-auto grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[9px] font-mono font-bold ring-2 ring-ink-900/60 shadow-lg transition",
        onClick && "cursor-pointer hover:ring-accent/70 hover:shadow-glow",
        tone.bg,
        tone.tone,
      )}
      title={
        onClick ? `${patient.id} · ${patient.priority} — click to inspect` : `${patient.id} · ${patient.priority}`
      }
    >
      {patient.priority}
    </motion.button>
  );
}

function StaffWalker({ delay }: { delay: number }) {
  // Loops the perimeter to make the floor plan feel alive
  return (
    <motion.div
      className="pointer-events-none absolute grid h-5 w-5 place-items-center rounded-full bg-priority-p2/20 text-priority-p2 ring-2 ring-priority-p2/40"
      initial={{ left: "12%", top: "82%" }}
      animate={{
        left: ["12%", "60%", "85%", "60%", "12%"],
        top: ["82%", "75%", "82%", "85%", "82%"],
      }}
      transition={{
        duration: 14,
        delay,
        repeat: Infinity,
        ease: "linear",
      }}
    >
      <Stethoscope className="h-3 w-3" />
    </motion.div>
  );
}

function ResourceStrip({ counters }: { counters: FloorResourceCounters }) {
  const items = [
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
      icon: Bed,
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
      icon: Activity,
    },
    {
      label: "ECG",
      busy: counters.ecg_busy,
      total: counters.ecg_total,
      icon: Heart,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => {
        const pct = item.total > 0 ? (item.busy / item.total) * 100 : 0;
        const tone =
          pct >= 85 ? "bg-priority-p1" : pct >= 60 ? "bg-priority-p2" : "bg-accent";
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="rounded-lg border border-ink-700/60 bg-ink-900/40 p-2"
          >
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-ink-200">
                <Icon className="h-3 w-3 text-ink-400" />
                {item.label}
              </span>
              <span className="font-mono text-ink-300">
                {item.busy}/{item.total}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-700/40">
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
  );
}
