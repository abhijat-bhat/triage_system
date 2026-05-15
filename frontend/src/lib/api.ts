import type {
  FormIntakeResponse,
  OCRQueueItem,
  OCRQueueList,
  PagedList,
  PatientInput,
  SimulationDetail,
  SimulationEvent,
  SimulationMetrics,
  SimulationRunResponse,
  SimulationSummary,
  TriageDetailResponse,
  TriageOverrideRequest,
  TriageOverrideResponse,
  TriageRunSummary,
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

  intakeOcrUpload: async (file: File) => {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/v1/intake/ocr/upload", {
      method: "POST",
      body,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`${response.status} ${response.statusText}: ${text}`);
    }
    return (await response.json()) as import("../types").OCRUploadResult;
  },

  intakeOcrExtract: async (file: File) => {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/v1/intake/ocr/extract", {
      method: "POST",
      body,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`${response.status} ${response.statusText}: ${text}`);
    }
    return (await response.json()) as import("../types").OCRExtractResult;
  },

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

  triageHistory: (opts?: { limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
    if (opts?.offset !== undefined) params.set("offset", String(opts.offset));
    const qs = params.toString();
    return request<PagedList<TriageRunSummary>>(
      qs ? `/api/v1/triage?${qs}` : "/api/v1/triage",
    );
  },

  simulationHistory: (opts?: { limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
    if (opts?.offset !== undefined) params.set("offset", String(opts.offset));
    const qs = params.toString();
    return request<PagedList<SimulationSummary>>(
      qs ? `/api/v1/simulation?${qs}` : "/api/v1/simulation",
    );
  },

  triageOverride: (triageRunId: number, body: TriageOverrideRequest) =>
    request<TriageOverrideResponse>(
      `/api/v1/triage/${triageRunId}/override`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    ),

  clearHistory: () =>
    request<{ deleted: Record<string, number>; total_deleted: number }>(
      "/api/v1/history",
      { method: "DELETE" },
    ),
};
