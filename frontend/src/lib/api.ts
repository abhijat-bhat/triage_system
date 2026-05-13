import type {
  FormIntakeResponse,
  OCRQueueItem,
  OCRQueueList,
  PatientInput,
  SimulationDetail,
  SimulationEvent,
  SimulationMetrics,
  SimulationRunResponse,
  TriageDetailResponse,
} from "../types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText}: ${text || path}`);
  }
  return (await response.json()) as T;
}

export const api = {
  health: () => request<{ status: string }>("/health"),

  intakeForm: (patient_input: PatientInput) =>
    request<FormIntakeResponse>("/api/v1/intake/form", {
      method: "POST",
      body: JSON.stringify({ patient_input }),
    }),

  triageDetail: (triageRunId: number) =>
    request<TriageDetailResponse>(`/api/v1/triage/${triageRunId}`),

  intakeOcr: (payload: {
    document_name: string;
    extraction_payload: Record<string, unknown>;
    note?: string | null;
  }) =>
    request<OCRQueueItem>("/api/v1/intake/ocr", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  ocrQueue: () => request<OCRQueueList>("/api/v1/intake/ocr/review-queue"),

  simulationRun: (payload: {
    patient_count: number;
    pattern: "poisson" | "burst";
    scheduling_strategy: "strict_priority" | "weighted_fair";
    seed: number;
  }) =>
    request<SimulationRunResponse>("/api/v1/simulation/run", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  simulationDetail: (id: number) =>
    request<SimulationDetail>(`/api/v1/simulation/${id}`),

  simulationMetrics: (id: number) =>
    request<{ simulation_id: number; metrics: SimulationMetrics }>(
      `/api/v1/simulation/${id}/metrics`,
    ),

  simulationEvents: (id: number) =>
    request<{ simulation_id: number; events: SimulationEvent[] }>(
      `/api/v1/simulation/${id}/events`,
    ),

  triageHistory: () =>
    request<{ items: import("../types").TriageRunSummary[] }>("/api/v1/triage"),

  simulationHistory: () =>
    request<{ items: import("../types").SimulationSummary[] }>("/api/v1/simulation"),
};
