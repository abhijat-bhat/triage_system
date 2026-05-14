import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertOctagon,
  ClipboardList,
  Eye,
  Image as ImageIcon,
  Loader2,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { Card } from "../components/Card";
import { ConfidenceMeter } from "../components/ConfidenceMeter";
import { AuditTimeline } from "../components/AuditTimeline";
import { AgentOutputGrid } from "../components/AgentOutputGrid";
import { api } from "../lib/api";
import { cn, mockTriagePatient, priorityMeta, pushActivity, sampleCases } from "../lib/utils";
import type {
  AgentOutput,
  AggregationResult,
  CritiqueOutput,
  Medication,
  PatientInput,
  TriageDetailResponse,
} from "../types";

const BLANK: PatientInput = {
  ehr_data: {
    allergies: [],
    history: [],
    medications: [],
    labs: {},
    social_context: {},
    patient_name: "",
    patient_id: "",
    contact: "",
  },
  vitals: {
    hr: 80,
    systolic_bp: 120,
    diastolic_bp: 78,
    spo2: 98,
    temperature_c: 37.0,
    rr: 16,
  },
  chief_complaint: "",
  image: null,
};

export function Triage() {
  const [input, setInput] = useState<PatientInput>(BLANK);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<TriageDetailResponse | null>(null);

  const loadSample = (key: keyof typeof sampleCases) => {
    setInput(JSON.parse(JSON.stringify(sampleCases[key])));
    setDetail(null);
    setError(null);
  };

  const fillMockData = () => {
    setInput((prev) => ({
      ...JSON.parse(JSON.stringify(mockTriagePatient)),
      image: prev.image,
    }));
    setDetail(null);
    setError(null);
  };

  const reset = () => {
    setInput(JSON.parse(JSON.stringify(BLANK)));
    setDetail(null);
    setError(null);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setDetail(null);
    try {
      const response = await api.intakeForm(input);
      const full = await api.triageDetail(response.triage_run_id);
      setDetail(full);
      pushActivity({
        kind: "triage",
        title: `Triage ${response.final_priority}`,
        detail: `${full.patient_input?.chief_complaint ?? "patient"} · run #${response.triage_run_id}`,
        priority: response.final_priority,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full bg-priority-p2/10 px-3 py-1 text-xs font-semibold text-priority-p2 ring-1 ring-priority-p2/30">
          <UserRound className="h-3.5 w-3.5" />
          patient intake → multi-agent triage
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink-50">Triage workbench</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-400">
          Fill the form (or load a scenario), submit, and watch the orchestrator
          coordinate six specialist agents before producing a P1–P5 verdict.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.3fr]">
        <Card
          title="Patient input"
          description="Vitals are validated to clinical ranges. Image accepts a path or image-placeholder:// URI."
          action={
            <div className="flex gap-2">
              <button className="btn-ghost text-xs" onClick={reset}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            </div>
          }
        >
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <button
              onClick={fillMockData}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent ring-1 ring-accent/40 transition hover:bg-accent/25"
              title="Populate every field with mock data (leaves the image input untouched)"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Fill Mock Data
            </button>
            <span className="text-[11px] uppercase tracking-wider text-ink-500">
              or pick:
            </span>
            <SampleButton onClick={() => loadSample("mild")} tone="bg-priority-p5/10 text-priority-p5 ring-priority-p5/30">
              Mild scenario
            </SampleButton>
            <SampleButton onClick={() => loadSample("moderate")} tone="bg-priority-p3/10 text-priority-p3 ring-priority-p3/30">
              Moderate scenario
            </SampleButton>
            <SampleButton onClick={() => loadSample("critical")} tone="bg-priority-p1/10 text-priority-p1 ring-priority-p1/30">
              Critical scenario
            </SampleButton>
          </div>

          <div className="space-y-6">
            <Section title="Demographics">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Patient name">
                  <input
                    className="input"
                    value={input.ehr_data.patient_name ?? ""}
                    onChange={(e) =>
                      setInput({
                        ...input,
                        ehr_data: { ...input.ehr_data, patient_name: e.target.value },
                      })
                    }
                  />
                </Field>
                <Field label="Patient ID">
                  <input
                    className="input"
                    value={input.ehr_data.patient_id ?? ""}
                    onChange={(e) =>
                      setInput({
                        ...input,
                        ehr_data: { ...input.ehr_data, patient_id: e.target.value },
                      })
                    }
                  />
                </Field>
                <Field label="Contact">
                  <input
                    className="input"
                    value={input.ehr_data.contact ?? ""}
                    onChange={(e) =>
                      setInput({
                        ...input,
                        ehr_data: { ...input.ehr_data, contact: e.target.value },
                      })
                    }
                  />
                </Field>
              </div>
            </Section>

            <Section title="Chief complaint">
              <textarea
                className="input min-h-[80px] resize-y font-sans"
                placeholder="e.g. severe chest pain with shortness of breath"
                value={input.chief_complaint}
                onChange={(e) => setInput({ ...input, chief_complaint: e.target.value })}
              />
            </Section>

            <Section title="Vitals">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <NumberField
                  label="HR (bpm)"
                  value={input.vitals.hr}
                  onChange={(v) => setInput({ ...input, vitals: { ...input.vitals, hr: v } })}
                />
                <NumberField
                  label="SBP"
                  value={input.vitals.systolic_bp}
                  onChange={(v) =>
                    setInput({ ...input, vitals: { ...input.vitals, systolic_bp: v } })
                  }
                />
                <NumberField
                  label="DBP"
                  value={input.vitals.diastolic_bp}
                  onChange={(v) =>
                    setInput({ ...input, vitals: { ...input.vitals, diastolic_bp: v } })
                  }
                />
                <NumberField
                  label="SpO₂ (%)"
                  value={input.vitals.spo2}
                  onChange={(v) =>
                    setInput({ ...input, vitals: { ...input.vitals, spo2: v } })
                  }
                />
                <NumberField
                  label="Temp (°C)"
                  step={0.1}
                  value={input.vitals.temperature_c}
                  onChange={(v) =>
                    setInput({ ...input, vitals: { ...input.vitals, temperature_c: v } })
                  }
                />
                <NumberField
                  label="RR"
                  value={input.vitals.rr}
                  onChange={(v) => setInput({ ...input, vitals: { ...input.vitals, rr: v } })}
                />
              </div>
            </Section>

            <Section title="History">
              <TagInput
                values={input.ehr_data.history}
                onChange={(v) =>
                  setInput({ ...input, ehr_data: { ...input.ehr_data, history: v } })
                }
                placeholder="e.g. diabetes"
              />
            </Section>

            <Section title="Allergies">
              <TagInput
                values={input.ehr_data.allergies}
                onChange={(v) =>
                  setInput({ ...input, ehr_data: { ...input.ehr_data, allergies: v } })
                }
                placeholder="e.g. penicillin"
              />
            </Section>

            <Section title="Medications">
              <MedicationList
                meds={input.ehr_data.medications}
                onChange={(meds) =>
                  setInput({ ...input, ehr_data: { ...input.ehr_data, medications: meds } })
                }
              />
            </Section>

            <Section title="Labs">
              <KVList
                values={input.ehr_data.labs as Record<string, string | number>}
                onChange={(labs) =>
                  setInput({ ...input, ehr_data: { ...input.ehr_data, labs } })
                }
                placeholderKey="lab name (e.g. glucose)"
                placeholderValue="value"
              />
            </Section>

            <Section title="Social context">
              <KVList
                values={
                  input.ehr_data.social_context as Record<string, string | number | boolean>
                }
                onChange={(sc) =>
                  setInput({
                    ...input,
                    ehr_data: { ...input.ehr_data, social_context: sc },
                  })
                }
                placeholderKey="key (e.g. lives_alone)"
                placeholderValue="true | false | text"
                boolish
              />
            </Section>

            <Section title="Image">
              <ImageUpload
                image={input.image ?? null}
                onChange={(value) => setInput({ ...input, image: value })}
              />
            </Section>

            <button onClick={submit} disabled={submitting} className="btn-primary w-full">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? "Running triage pipeline…" : "Submit & triage"}
            </button>
            {error && (
              <p className="rounded-lg border border-priority-p1/40 bg-priority-p1/10 px-3 py-2 text-xs text-priority-p1">
                <AlertOctagon className="mr-1.5 inline h-3.5 w-3.5" />
                {error}
              </p>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          {detail ? (
            <Result detail={detail} />
          ) : (
            <Card title="Result panel" description="Submit a patient to see results.">
              <div className="grid place-items-center rounded-xl border border-dashed border-ink-700/60 p-10 text-center">
                <ClipboardList className="h-10 w-10 text-ink-500" />
                <p className="mt-3 text-sm text-ink-300">Awaiting submission…</p>
                <p className="mt-1 text-xs text-ink-500">
                  Load a sample on the left for a quick demo.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Result({ detail }: { detail: TriageDetailResponse }) {
  const output = detail.triage_output;
  const audit = output.audit_log.entries;

  const workerEntry = audit.find((e) => e.stage === "worker_outputs");
  const aggEntry = audit.find((e) => e.stage === "aggregation_complete");
  const critEntry = audit.find((e) => e.stage === "self_critique_complete");
  const routingEntry = audit.find((e) => e.stage === "routing_decision");

  const workerOutputs = useMemo(() => {
    if (!workerEntry) return {} as Record<string, AgentOutput>;
    return workerEntry.payload as unknown as Record<string, AgentOutput>;
  }, [workerEntry]);
  const aggregation = aggEntry?.payload as unknown as AggregationResult | undefined;
  const critique = critEntry?.payload as unknown as CritiqueOutput | undefined;
  const routedAgents =
    (routingEntry?.payload as { selected_agents?: string[] } | undefined)?.selected_agents ?? [];

  const tone = priorityMeta[output.final_priority];

  return (
    <>
      <Card>
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row sm:items-stretch">
          <div
            className={cn(
              "flex w-full flex-col justify-center rounded-2xl p-6 ring-1",
              tone.bg,
              tone.ring,
            )}
          >
            <p className="text-xs font-medium uppercase tracking-wider text-ink-300">
              Final priority
            </p>
            <p className={cn("mt-1 text-6xl font-bold tracking-tight", tone.tone)}>
              {output.final_priority}
            </p>
            <p className={cn("mt-1 text-sm font-semibold", tone.tone)}>{tone.label}</p>
            {output.requires_human_review && (
              <span className="mt-3 inline-flex items-center gap-1.5 self-start rounded-full bg-priority-p1/15 px-2.5 py-1 text-xs font-semibold text-priority-p1 ring-1 ring-priority-p1/40">
                <Eye className="h-3.5 w-3.5" />
                requires human review
              </span>
            )}
          </div>

          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-ink-700/60 p-6">
            <ConfidenceMeter value={output.confidence_score} label="confidence" />
            <p className="mt-3 text-xs text-ink-400">
              Run #{detail.triage_run_id} · Patient #{detail.patient_record_id}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Differential diagnosis">
          <ul className="space-y-2">
            {output.differential_diagnosis.map((dx) => (
              <li key={dx} className="flex items-center gap-2 text-sm text-ink-200">
                <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
                {dx}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Recommended actions">
          <ul className="space-y-2">
            {output.recommended_actions.map((action) => (
              <li key={action} className="flex items-start gap-2 text-sm text-ink-200">
                <span className={cn("mt-1.5 h-1.5 w-1.5 rounded-full", tone.dot)} />
                {action}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card
        title="Worker agents"
        description={
          routedAgents.length > 0
            ? `Routed: ${routedAgents.join(", ")}`
            : "Per-agent triage votes"
        }
      >
        <AgentOutputGrid outputs={workerOutputs} />
      </Card>

      {aggregation && (
        <Card
          title="Weighted aggregation"
          description={`Final score ${aggregation.final_score.toFixed(2)} · confidence ${(aggregation.confidence_score * 100).toFixed(0)}%`}
        >
          <div className="space-y-2">
            {Object.entries(aggregation.weighted_components).map(([name, value]) => {
              const max = Math.max(
                ...Object.values(aggregation.weighted_components).map((v) => Math.abs(v)),
                0.0001,
              );
              const pct = (Math.abs(value) / max) * 100;
              return (
                <div key={name}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-ink-200">{name}</span>
                    <span className="font-mono text-ink-400">{value.toFixed(3)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-ink-700/40">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6 }}
                      className="h-full rounded-full bg-gradient-to-r from-accent-deep to-accent"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {critique && (
        <Card title="Self-critique">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "grid h-10 w-10 place-items-center rounded-full ring-1",
                critique.flagged_for_review
                  ? "bg-priority-p1/10 text-priority-p1 ring-priority-p1/40"
                  : "bg-priority-p5/10 text-priority-p5 ring-priority-p5/40",
              )}
            >
              <AlertOctagon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink-100">
                {critique.flagged_for_review
                  ? "Flagged for human review"
                  : "No critique flags"}
              </p>
              <p className="mt-1 text-xs text-ink-400">{critique.critique_reason}</p>
              {critique.revised_triage && (
                <p className="mt-2 text-xs text-priority-p2">
                  Revised triage suggestion: <strong>{critique.revised_triage}</strong>
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card
        title="Full audit log"
        description={`${audit.length} stages recorded — click any row to inspect the payload.`}
      >
        <AuditTimeline entries={audit} />
      </Card>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        className="input font-mono"
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(step % 1 === 0 ? Number(e.target.value) : parseFloat(e.target.value))}
      />
    </label>
  );
}

function SampleButton({
  onClick,
  children,
  tone,
}: {
  onClick: () => void;
  children: React.ReactNode;
  tone: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-semibold ring-1 transition hover:opacity-90",
        tone,
      )}
    >
      {children}
    </button>
  );
}

function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    if (!draft.trim()) return;
    onChange([...values, draft.trim()]);
    setDraft("");
  };
  return (
    <div>
      <div className="mb-2 flex gap-2">
        <input
          className="input"
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button className="btn-ghost" onClick={add} type="button">
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((tag, idx) => (
            <span key={`${tag}-${idx}`} className="chip">
              {tag}
              <button
                className="ml-1 text-ink-400 hover:text-priority-p1"
                onClick={() => onChange(values.filter((_, i) => i !== idx))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MedicationList({
  meds,
  onChange,
}: {
  meds: Medication[];
  onChange: (meds: Medication[]) => void;
}) {
  const update = (idx: number, patch: Partial<Medication>) =>
    onChange(meds.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  return (
    <div className="space-y-2">
      {meds.map((med, idx) => (
        <div key={idx} className="grid grid-cols-1 gap-2 rounded-lg border border-ink-700/60 bg-ink-900/40 p-2 sm:grid-cols-[1.2fr_1fr_1.2fr_auto]">
          <input
            className="input"
            placeholder="name"
            value={med.name}
            onChange={(e) => update(idx, { name: e.target.value })}
          />
          <input
            className="input"
            placeholder="dose"
            value={med.dose ?? ""}
            onChange={(e) => update(idx, { dose: e.target.value || null })}
          />
          <input
            className="input"
            placeholder="indication"
            value={med.indication ?? ""}
            onChange={(e) => update(idx, { indication: e.target.value || null })}
          />
          <button
            className="btn-ghost"
            onClick={() => onChange(meds.filter((_, i) => i !== idx))}
            type="button"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn-ghost w-full"
        onClick={() => onChange([...meds, { name: "", dose: null, indication: null }])}
      >
        <Plus className="h-4 w-4" /> Add medication
      </button>
    </div>
  );
}

function KVList<V extends string | number | boolean>({
  values,
  onChange,
  placeholderKey,
  placeholderValue,
  boolish,
}: {
  values: Record<string, V>;
  onChange: (v: Record<string, V>) => void;
  placeholderKey: string;
  placeholderValue: string;
  boolish?: boolean;
}) {
  const [k, setK] = useState("");
  const [v, setV] = useState("");
  const add = () => {
    if (!k.trim()) return;
    let parsed: string | number | boolean = v;
    if (boolish) {
      if (v.toLowerCase() === "true") parsed = true;
      else if (v.toLowerCase() === "false") parsed = false;
      else if (!isNaN(Number(v)) && v !== "") parsed = Number(v);
    } else {
      if (!isNaN(Number(v)) && v !== "") parsed = Number(v);
    }
    onChange({ ...values, [k.trim()]: parsed as V });
    setK("");
    setV("");
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <input
          className="input"
          placeholder={placeholderKey}
          value={k}
          onChange={(e) => setK(e.target.value)}
        />
        <input
          className="input"
          placeholder={placeholderValue}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button className="btn-ghost" onClick={add} type="button">
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {Object.entries(values).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(values).map(([key, value]) => (
            <span key={key} className="chip">
              <span className="font-mono text-ink-400">{key}</span>
              <span className="text-ink-200">{String(value)}</span>
              <button
                className="ml-1 text-ink-400 hover:text-priority-p1"
                onClick={() => {
                  const next = { ...values };
                  delete next[key];
                  onChange(next);
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg"];

function ImageUpload({
  image,
  onChange,
}: {
  image: string | null;
  onChange: (value: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ name: string; size: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const isDataUri = image?.startsWith("data:image/");
  const isPlaceholder = image?.startsWith("image-placeholder://");

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError("Only PNG or JPEG files are accepted.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB) — max 5 MB.`);
      return;
    }
    setError(null);
    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        onChange(result);
        setMeta({ name: file.name, size: file.size });
      } else {
        setError("Failed to read file.");
      }
      setBusy(false);
    };
    reader.onerror = () => {
      setError("Failed to read file.");
      setBusy(false);
    };
    reader.readAsDataURL(file);
  };

  const clear = () => {
    onChange(null);
    setMeta(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {!image && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ink-700/60 bg-ink-900/40 px-4 py-6 text-sm text-ink-300 transition hover:border-accent/40 hover:bg-ink-800/60 hover:text-ink-100"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          <span>Upload a PNG or JPEG (max 5 MB)</span>
        </button>
      )}

      {isDataUri && (
        <div className="flex items-start gap-3 rounded-xl border border-ink-700/60 bg-ink-900/40 p-3">
          <img
            src={image!}
            alt="upload preview"
            className="h-20 w-20 shrink-0 rounded-lg object-cover ring-1 ring-ink-700/60"
          />
          <div className="flex-1 text-xs">
            <p className="font-medium text-ink-100">
              {meta?.name ?? "uploaded image"}
            </p>
            {meta && (
              <p className="mt-0.5 font-mono text-[11px] text-ink-400">
                {(meta.size / 1024).toFixed(0)} KB
              </p>
            )}
            <p className="mt-1 text-[11px] text-ink-500">
              encoded as data URI · sent to vision agent
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="btn-ghost text-[11px]"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={clear}
                className="btn-ghost text-[11px]"
              >
                <X className="h-3 w-3" /> Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {isPlaceholder && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-priority-p3/30 bg-priority-p3/5 px-3 py-2.5 text-xs">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-priority-p3" />
            <div>
              <p className="font-medium text-ink-100">Synthetic placeholder</p>
              <p className="font-mono text-[11px] text-ink-400">{image}</p>
              <p className="mt-0.5 text-[10px] text-ink-500">
                no real pixels — vision agent will return a P3 placeholder verdict
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={clear}
            className="btn-ghost text-[11px]"
          >
            <X className="h-3 w-3" /> Remove
          </button>
        </div>
      )}

      {error && (
        <p className="rounded-md border border-priority-p1/40 bg-priority-p1/10 px-2.5 py-1.5 text-[11px] text-priority-p1">
          {error}
        </p>
      )}
    </div>
  );
}
