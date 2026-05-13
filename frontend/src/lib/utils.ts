import clsx, { type ClassValue } from "clsx";
import type {
  ActivityEntry,
  PatientInput,
  TriagePriority,
} from "../types";

export const cn = (...inputs: ClassValue[]) => clsx(...inputs);

export const priorityMeta: Record<
  TriagePriority,
  { label: string; tone: string; bg: string; ring: string; dot: string }
> = {
  P1: {
    label: "Critical",
    tone: "text-priority-p1",
    bg: "bg-priority-p1/10",
    ring: "ring-priority-p1/40",
    dot: "bg-priority-p1",
  },
  P2: {
    label: "Urgent",
    tone: "text-priority-p2",
    bg: "bg-priority-p2/10",
    ring: "ring-priority-p2/40",
    dot: "bg-priority-p2",
  },
  P3: {
    label: "Moderate",
    tone: "text-priority-p3",
    bg: "bg-priority-p3/10",
    ring: "ring-priority-p3/40",
    dot: "bg-priority-p3",
  },
  P4: {
    label: "Low",
    tone: "text-priority-p4",
    bg: "bg-priority-p4/10",
    ring: "ring-priority-p4/40",
    dot: "bg-priority-p4",
  },
  P5: {
    label: "Routine",
    tone: "text-priority-p5",
    bg: "bg-priority-p5/10",
    ring: "ring-priority-p5/40",
    dot: "bg-priority-p5",
  },
};

export const agentMeta: Record<
  string,
  { label: string; description: string; emoji: string }
> = {
  nlp: {
    label: "NLP Agent",
    description: "Symptom keyword analysis + optional Mistral refinement.",
    emoji: "🗣️",
  },
  vitals: {
    label: "Vitals Agent",
    description: "NEWS-like score with hard overrides on lethal vitals.",
    emoji: "❤️",
  },
  drug_safety: {
    label: "Drug Safety",
    description: "Interaction & contraindication screen against med list.",
    emoji: "💊",
  },
  guidelines: {
    label: "Guidelines",
    description: "Pregnancy, diabetes, immunocompromised triggers.",
    emoji: "📘",
  },
  social_risk: {
    label: "Social Risk",
    description: "Housing, transport, adherence & support context.",
    emoji: "🏠",
  },
  vision: {
    label: "Vision Agent",
    description: "EfficientNetV2 dermatology classifier (2-stage).",
    emoji: "🔬",
  },
};

export const formatPct = (value: number) => `${value.toFixed(1)}%`;
export const formatScore = (value: number) => value.toFixed(3);

export const sampleCases: Record<"mild" | "moderate" | "critical", PatientInput> = {
  mild: {
    ehr_data: {
      allergies: [],
      history: ["seasonal allergies"],
      medications: [{ name: "cetirizine", dose: "10mg" }],
      labs: { wbc: 7.0 },
      social_context: { lives_alone: false },
      patient_name: "John Doe",
      patient_id: "DEMO-MILD-001",
      contact: "555-0101",
    },
    vitals: {
      hr: 78,
      systolic_bp: 122,
      diastolic_bp: 78,
      spo2: 98,
      temperature_c: 36.8,
      rr: 14,
    },
    chief_complaint: "Mild sore throat and cough for two days.",
    image: null,
  },
  moderate: {
    ehr_data: {
      allergies: [],
      history: ["diabetes"],
      medications: [{ name: "metformin", dose: "500mg" }],
      labs: { glucose: 220 },
      social_context: { lives_alone: true, no_transport: true },
      patient_name: "Jane Roe",
      patient_id: "DEMO-MOD-001",
      contact: "555-0102",
    },
    vitals: {
      hr: 102,
      systolic_bp: 104,
      diastolic_bp: 66,
      spo2: 94,
      temperature_c: 38.2,
      rr: 22,
    },
    chief_complaint: "Vomiting and dizziness since this morning.",
    image: "image-placeholder://abdomen",
  },
  critical: {
    ehr_data: {
      allergies: [],
      history: ["hypertension", "coronary artery disease"],
      medications: [
        { name: "warfarin", dose: "5mg" },
        { name: "aspirin", dose: "75mg" },
      ],
      labs: { troponin: "pending" },
      social_context: { lives_alone: true, medication_nonadherence: true },
      patient_name: "Sam Smith",
      patient_id: "DEMO-CRIT-001",
      contact: "555-0103",
    },
    vitals: {
      hr: 138,
      systolic_bp: 78,
      diastolic_bp: 50,
      spo2: 82,
      temperature_c: 39.2,
      rr: 36,
    },
    chief_complaint: "Severe chest pain with shortness of breath and confusion.",
    image: "image-placeholder://chest",
  },
};

export interface OCRMock {
  document_name: string;
  note: string;
  payload: Record<string, unknown>;
}

export const ocrMocks: OCRMock[] = [
  {
    document_name: "ER-intake-2024-08-12.pdf",
    note: "scanned paper intake form",
    payload: {
      raw_text:
        "Patient: Robert Hayes, 64M. Chief complaint: chest pain radiating to left arm, sweating, nausea. Onset 45 min ago. PMH: HTN, T2DM.",
      confidence: 0.68,
      extracted_fields: {
        patient_name: "Robert Hayes",
        age: 64,
        sex: "M",
        chief_complaint: "Chest pain with left-arm radiation",
        hr: 118,
        spo2: 91,
      },
    },
  },
  {
    document_name: "discharge-summary-1207.pdf",
    note: "ambulance handoff record",
    payload: {
      raw_text:
        "EMS report — 28F, found unresponsive at home, GCS 9. Pinpoint pupils. Naloxone 0.4mg IM administered en route.",
      confidence: 0.74,
      extracted_fields: {
        age: 28,
        sex: "F",
        gcs: 9,
        suspected_overdose: true,
      },
    },
  },
  {
    document_name: "lab-fax-incoming.pdf",
    note: "external lab fax",
    payload: {
      raw_text:
        "Outpatient lab results — Anna Schmidt, F62. Troponin I 0.18 ng/mL (elevated). BNP 1,250. Cr 1.9.",
      confidence: 0.55,
      extracted_fields: {
        patient_name: "Anna Schmidt",
        troponin_i: 0.18,
        bnp: 1250,
        creatinine: 1.9,
      },
    },
  },
];

export interface SimulationMock {
  label: string;
  description: string;
  patient_count: number;
  pattern: "poisson" | "burst";
  scheduling_strategy: "strict_priority" | "weighted_fair";
  seed: number;
}

export const simulationMocks: SimulationMock[] = [
  {
    label: "Calm Tuesday",
    description: "30 patients, steady Poisson arrivals, strict priority.",
    patient_count: 30,
    pattern: "poisson",
    scheduling_strategy: "strict_priority",
    seed: 42,
  },
  {
    label: "Mass-casualty surge",
    description: "120 patients, burst arrivals — expect bottlenecks.",
    patient_count: 120,
    pattern: "burst",
    scheduling_strategy: "strict_priority",
    seed: 99,
  },
  {
    label: "Weighted fair Friday",
    description: "60 patients, Poisson, weighted-fair scheduling.",
    patient_count: 60,
    pattern: "poisson",
    scheduling_strategy: "weighted_fair",
    seed: 7,
  },
];

const ACTIVITY_KEY = "triagex.activity.v1";

export function loadActivity(): ActivityEntry[] {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ActivityEntry[];
  } catch {
    return [];
  }
}

export function pushActivity(entry: Omit<ActivityEntry, "id" | "at">) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const at = new Date().toISOString();
  const next = [{ ...entry, id, at }, ...loadActivity()].slice(0, 50);
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("triagex:activity"));
}

export function clearActivity() {
  localStorage.removeItem(ACTIVITY_KEY);
  window.dispatchEvent(new Event("triagex:activity"));
}

export function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 5_000) return "just now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}
