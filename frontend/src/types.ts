export type TriagePriority = "P1" | "P2" | "P3" | "P4" | "P5";
export type AgentName =
  | "nlp"
  | "vitals"
  | "drug_safety"
  | "guidelines"
  | "social_risk"
  | "vision";

export interface Medication {
  name: string;
  dose?: string | null;
  indication?: string | null;
}

export interface EHRData {
  allergies: string[];
  history: string[];
  medications: Medication[];
  labs: Record<string, number | string>;
  social_context: Record<string, string | boolean | number>;
  patient_name?: string | null;
  patient_id?: string | null;
  contact?: string | null;
}

export interface VitalSigns {
  hr: number;
  systolic_bp: number;
  diastolic_bp: number;
  spo2: number;
  temperature_c: number;
  rr: number;
}

export interface PatientInput {
  ehr_data: EHRData;
  vitals: VitalSigns;
  chief_complaint: string;
  image?: string | null;
}

export interface AgentOutput {
  triage_level: TriagePriority;
  confidence: number;
  reasoning: string;
  flags: string[];
}

export interface AggregationResult {
  final_priority: TriagePriority;
  final_score: number;
  normalized_score: number;
  confidence_score: number;
  weighted_components: Record<AgentName, number>;
}

export type CritiqueSeverity = "info" | "warn" | "critical";

export interface CritiqueSignal {
  code: string;
  severity: CritiqueSeverity;
  detail: string;
  evidence: Record<string, unknown>;
}

export interface CritiqueOutput {
  revised_triage: TriagePriority | null;
  flagged_for_review: boolean;
  critique_reason: string;
  signals: CritiqueSignal[];
  severity_distribution: Record<string, number>;
}

export interface AuditEntry {
  timestamp_utc: string;
  stage: string;
  payload: Record<string, unknown>;
}

export interface AuditLog {
  entries: AuditEntry[];
}

export interface TriageOutput {
  final_priority: TriagePriority;
  differential_diagnosis: string[];
  recommended_actions: string[];
  confidence_score: number;
  requires_human_review: boolean;
  audit_log: AuditLog;
}

export interface FormIntakeResponse {
  patient_record_id: number;
  triage_run_id: number;
  final_priority: TriagePriority;
  confidence_score: number;
  requires_human_review: boolean;
}

export interface TriageDetailResponse {
  triage_run_id: number;
  patient_record_id: number;
  triage_output: TriageOutput;
  patient_input: PatientInput | null;
  override_priority?: TriagePriority | null;
  override_reason?: string | null;
  overridden_at?: string | null;
}

export interface TriageOverrideRequest {
  override_priority: TriagePriority;
  override_reason: string;
}

export interface TriageOverrideResponse {
  triage_run_id: number;
  final_priority: TriagePriority;
  override_priority: TriagePriority;
  override_reason: string;
  overridden_at: string;
}

export interface OCRQueueItem {
  queue_id: number;
  document_name: string;
  status: string;
  created_at_utc: string;
}

export interface OCRParsedFields {
  patient_name: string | null;
  patient_id: string | null;
  age: number | null;
  sex: string | null;
  contact: string | null;
  chief_complaint: string | null;
  history: string[];
  allergies: string[];
  medications: { name: string; dose?: string | null; indication?: string | null }[];
  vitals: Record<string, number>;
  labs: Record<string, string | number>;
  social_context: Record<string, string | number | boolean>;
  raw_extracted: Record<string, string>;
}

export interface OCRTriageResult {
  patient_record_id: number;
  triage_run_id: number;
  final_priority: TriagePriority;
  confidence_score: number;
  requires_human_review: boolean;
}

export interface OCRUploadResult {
  document_name: string;
  method: "pdf_text" | "pdf_ocr" | "image_ocr" | "failed";
  page_count: number;
  raw_text: string;
  parsed_fields: OCRParsedFields;
  confidence: number;
  ocr_available: boolean;
  error: string | null;
  action: "triaged" | "queued" | "rejected";
  triage: OCRTriageResult | null;
  queue_id: number | null;
}

export interface OCRQueueList {
  items: OCRQueueItem[];
}

export interface OCRExtractResult {
  document_name: string;
  method: "pdf_text" | "pdf_ocr" | "image_ocr" | "failed";
  page_count: number;
  raw_text: string;
  parsed_fields: OCRParsedFields;
  confidence: number;
  ocr_available: boolean;
  error: string | null;
}

export interface SimulationMetrics {
  avg_wait_time_by_priority: Record<TriagePriority, number>;
  utilization_stats: Record<string, number>;
  bottlenecks: string[];
}

export interface SimulationRunResponse {
  simulation_id: number;
  total_patients: number;
  completed_patients: number;
  pending_patients: number;
  bottlenecks: string[];
}

export interface SimulationDetail {
  simulation_id: number;
  seed: number;
  scheduling_strategy: string;
  patient_count: number;
  status: string;
  metrics: SimulationMetrics | null;
  event_count: number;
  snapshot_count: number;
}

export interface HospitalStateSnapshot {
  available_doctors: Record<string, number>;
  available_nurses: number;
  icu_beds_total: number;
  icu_beds_occupied: number;
  general_beds_total: number;
  general_beds_occupied: number;
  machines_total: Record<string, number>;
  machines_available: Record<string, number>;
}

export interface SimulationEvent {
  timestamp: number;
  event_type: string;
  patient_id: string | null;
  resource_state: HospitalStateSnapshot | null;
  payload: Record<string, unknown>;
}

export interface TriageRunSummary {
  triage_run_id: number;
  patient_record_id: number;
  final_priority: TriagePriority;
  confidence_score: number;
  requires_human_review: boolean;
  created_at_utc: string;
  override_priority?: TriagePriority | null;
  override_reason?: string | null;
  overridden_at?: string | null;
}

export interface PagedList<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface SimulationSummary {
  simulation_id: number;
  seed: number;
  scheduling_strategy: string;
  patient_count: number;
  status: string;
  bottleneck_count: number;
  started_at_utc: string;
  completed_at_utc: string | null;
}

export interface ActivityEntry {
  id: string;
  kind: "triage" | "ocr" | "simulation" | "smoke";
  title: string;
  detail: string;
  priority?: TriagePriority;
  at: string;
}
