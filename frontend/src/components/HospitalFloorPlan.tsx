import { AnimatePresence, motion } from "framer-motion";
import { Activity, Bed, CheckCircle2, Heart, Home, Stethoscope, Users } from "lucide-react";
import { cn, priorityMeta } from "../lib/utils";
import type { TriagePriority } from "../types";

export type ZoneKey = "waiting" | "critical_care" | "icu" | "general" | "self_care" | "discharged";
export interface PatientToken { id: string; priority: TriagePriority; zone: ZoneKey; }
export interface ResourceCounters { icu_occupied: number; icu_total: number; general_occupied: number; general_total: number; ventilator_busy: number; ventilator_total: number; monitor_busy: number; monitor_total: number; ecg_busy: number; ecg_total: number; }
interface Props { patients: Record<string, PatientToken>; counters: ResourceCounters; tick: number; }

const ZONE_META: Record<ZoneKey, { label: string; sublabel: string; icon: typeof Users; ring: string; bg: string; text: string }> = {
  waiting:       { label: "Waiting Room",  sublabel: "Triaged · awaiting bed",    icon: Users,        ring: "ring-priority-p3/50", bg: "bg-priority-p3/10", text: "text-priority-p3" },
  critical_care: { label: "Critical Care", sublabel: "ICU + ventilator · P1",     icon: Heart,        ring: "ring-priority-p1/50", bg: "bg-priority-p1/10", text: "text-priority-p1" },
  icu:           { label: "ICU",           sublabel: "Monitored bed · P2",         icon: Activity,     ring: "ring-priority-p2/50", bg: "bg-priority-p2/10", text: "text-priority-p2" },
  general:       { label: "General Ward",  sublabel: "General bed · P3",           icon: Bed,          ring: "ring-priority-p4/50", bg: "bg-priority-p4/10", text: "text-priority-p4" },
  self_care:     { label: "Self-care",     sublabel: "Outpatient · P4 / P5",       icon: Home,         ring: "ring-priority-p5/50", bg: "bg-priority-p5/10", text: "text-priority-p5" },
  discharged:    { label: "Discharged",    sublabel: "Treatment complete",              icon: CheckCircle2, ring: "ring-ink-600/50",    bg: "bg-ink-800/40",    text: "text-ink-300" },
};

function occupancyColor(pct: number): string {
  if (pct >= 0.85) return "bg-priority-p1";
  if (pct >= 0.60) return "bg-priority-p2";
  if (pct >= 0.30) return "bg-accent";
  return "bg-priority-p5";
}