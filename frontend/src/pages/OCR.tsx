import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  FileText,
  Inbox,
  Loader2,
  RefreshCw,
  ScanLine,
  Send,
  Sparkles,
  TriangleAlert,
  Upload,
  XCircle,
} from "lucide-react";
import { Card } from "../components/Card";
import { PriorityBadge } from "../components/PriorityBadge";
import { api } from "../lib/api";
import {
  cn,
  formatRelative,
  ocrMocks,
  pushActivity,
} from "../lib/utils";
import type { OCRQueueItem, OCRUploadResult } from "../types";

const SAMPLE_PAYLOAD = JSON.stringify(
  {
    raw_text: "Triage note: patient reports chest discomfort and breathlessness.",
    confidence: 0.42,
    extracted_fields: {
      hr: 110,
      spo2: 92,
      complaint: "Chest pain, dyspnea",
    },
  },
  null,
  2,
);

export function OCR() {
  const [docName, setDocName] = useState("scan-demo.pdf");
  const [note, setNote] = useState("");
  const [payload, setPayload] = useState(SAMPLE_PAYLOAD);
  const [queue, setQueue] = useState<OCRQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload-pipeline state
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<OCRUploadResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.ocrQueue();
      setQueue(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const fillMockData = () => {
    const m = ocrMocks[Math.floor(Math.random() * ocrMocks.length)];
    setDocName(m.document_name);
    setNote(m.note);
    setPayload(JSON.stringify(m.payload, null, 2));
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(payload);
      } catch {
        throw new Error("Extraction payload must be valid JSON");
      }
      const item = await api.intakeOcr({
        document_name: docName,
        extraction_payload: parsed,
        note: note || null,
      });
      pushActivity({
        kind: "ocr",
        title: "OCR queued",
        detail: `${item.document_name} · #${item.queue_id}`,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const result = await api.intakeOcrUpload(file);
      setUploadResult(result);
      if (result.action === "triaged" && result.triage) {
        pushActivity({
          kind: "triage",
          title: `OCR → Triage ${result.triage.final_priority}`,
          detail: `${result.document_name} · run #${result.triage.triage_run_id} · conf ${(
            result.confidence * 100
          ).toFixed(0)}%`,
          priority: result.triage.final_priority,
        });
      } else if (result.action === "queued") {
        pushActivity({
          kind: "ocr",
          title: "OCR queued for review",
          detail: `${result.document_name} · #${result.queue_id} · conf ${(
            result.confidence * 100
          ).toFixed(0)}%`,
        });
      }
      await refresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const onFileChosen = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    handleUpload(files[0]);
  };

  return (
    <div className="space-y-8">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full bg-priority-p4/10 px-3 py-1 text-xs font-semibold text-priority-p4 ring-1 ring-priority-p4/30">
          <ScanLine className="h-3.5 w-3.5" />
          scanned document intake
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink-50">
          OCR ingestion pipeline
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-400">
          Upload a clinical PDF or scan: the pipeline extracts text via Mistral
          API, parses vitals + complaint, and either auto-triages
          high-confidence cases or queues them for a human reviewer.
        </p>
      </header>

      <Card
        title="Upload document"
        description="POST /api/v1/intake/ocr/upload · accepts PDF, PNG, JPG, TIFF"
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFileChosen(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          className={cn(
            "relative grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed p-10 text-center transition",
            dragging
              ? "border-accent/70 bg-accent/10"
              : "border-ink-700/60 bg-ink-900/30 hover:border-accent/40 hover:bg-ink-800/30",
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/png,image/jpeg,image/jpg,image/tiff,image/bmp,image/webp"
            className="hidden"
            onChange={(e) => onFileChosen(e.target.files)}
          />
          <Upload
            className={cn(
              "h-10 w-10 transition",
              dragging ? "text-accent" : "text-ink-400",
            )}
          />
          <p className="mt-3 text-sm font-medium text-ink-100">
            {uploading
              ? "Extracting & triaging…"
              : "Drop a PDF or image here, or click to browse"}
          </p>
          <p className="mt-1 text-xs text-ink-400">
            Pipeline: extract text → parse clinical fields → auto-triage if
            confidence ≥ 50%
          </p>
          {uploading && (
            <Loader2 className="absolute right-4 top-4 h-4 w-4 animate-spin text-accent" />
          )}
        </div>

        {uploadError && (
          <p className="mt-4 rounded-lg border border-priority-p1/40 bg-priority-p1/10 px-3 py-2 text-xs text-priority-p1">
            <XCircle className="mr-1.5 inline h-3.5 w-3.5" />
            {uploadError}
          </p>
        )}

        {uploadResult && <UploadResultPanel result={uploadResult} />}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card
          title="Manual extraction payload"
          description="POST /api/v1/intake/ocr · for pre-extracted JSON (skip the OCR step)"
          action={
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={fillMockData}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1.5 text-[11px] font-semibold text-accent ring-1 ring-accent/40 transition hover:bg-accent/25"
                title="Fill the form with a random scanned-document mock"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Fill Mock Data
              </button>
              {ocrMocks.map((m, idx) => (
                <button
                  key={m.document_name}
                  className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent ring-1 ring-accent/30 transition hover:bg-accent/20"
                  onClick={() => {
                    setDocName(m.document_name);
                    setNote(m.note);
                    setPayload(JSON.stringify(m.payload, null, 2));
                  }}
                  title={m.note}
                >
                  Mock {idx + 1}
                </button>
              ))}
            </div>
          }
        >
          <div className="space-y-4">
            <label className="block">
              <span className="label">Document name</span>
              <input
                className="input"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="label">Reviewer note</span>
              <input
                className="input"
                placeholder="optional"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="label">Extraction payload (JSON)</span>
              <textarea
                className="input min-h-[200px] font-mono text-xs leading-relaxed"
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
              />
            </label>
            <button className="btn-primary w-full" onClick={submit} disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Queue document
            </button>
            {error && (
              <p className="rounded-lg border border-priority-p1/40 bg-priority-p1/10 px-3 py-2 text-xs text-priority-p1">
                {error}
              </p>
            )}
          </div>
        </Card>

        <Card
          title="Review queue"
          description={`${queue.length} document${queue.length === 1 ? "" : "s"} pending`}
          action={
            <button className="btn-ghost text-xs" onClick={refresh} disabled={loading}>
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </button>
          }
        >
          {queue.length === 0 ? (
            <p className="rounded-lg border border-dashed border-ink-700/60 p-6 text-center text-sm text-ink-400">
              <Inbox className="mr-1.5 inline h-4 w-4" />
              Queue is empty. Upload a document or submit a JSON payload to test.
            </p>
          ) : (
            <ul className="max-h-[28rem] space-y-2.5 overflow-y-auto pr-1 scrollbar-thin">
              {queue.map((item, idx) => (
                <motion.li
                  key={item.queue_id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="flex items-center justify-between gap-3 rounded-lg border border-ink-700/60 bg-ink-900/40 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-priority-p4/10 text-priority-p4 ring-1 ring-priority-p4/30">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink-100">{item.document_name}</p>
                      <p className="text-xs text-ink-400">
                        queue #{item.queue_id} · {item.status}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-ink-500">
                    {formatRelative(item.created_at_utc)}
                  </span>
                </motion.li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function UploadResultPanel({ result }: { result: OCRUploadResult }) {
  const confPct = result.confidence * 100;
  const tone =
    result.action === "triaged"
      ? "border-priority-p5/40 bg-priority-p5/[0.05]"
      : "border-priority-p3/40 bg-priority-p3/[0.05]";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-5 space-y-4"
    >
      <div className={cn("rounded-2xl border p-4", tone)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {result.action === "triaged" ? (
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-priority-p5/15 text-priority-p5 ring-1 ring-priority-p5/40">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            ) : (
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-priority-p3/15 text-priority-p3 ring-1 ring-priority-p3/40">
                <TriangleAlert className="h-4 w-4" />
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-ink-50">
                {result.action === "triaged"
                  ? "Auto-triaged through full pipeline"
                  : "Queued for human review"}
              </p>
              <p className="text-xs text-ink-400">
                {result.document_name} ·{" "}
                <span className="font-mono">{result.method}</span>
                {result.page_count > 0 && ` · ${result.page_count} page${result.page_count === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-wider text-ink-400">
                extraction confidence
              </span>
              <span className="font-mono text-base font-semibold text-ink-100">
                {confPct.toFixed(0)}%
              </span>
            </div>
            {result.triage && <PriorityBadge priority={result.triage.final_priority} />}
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-700/40">
          <div
            className={cn(
              "h-full rounded-full",
              result.action === "triaged" ? "bg-priority-p5" : "bg-priority-p3",
            )}
            style={{ width: `${Math.min(100, confPct)}%` }}
          />
        </div>
        {result.error && (
          <p className="mt-2 text-[11px] text-priority-p2">
            note: {result.error}
          </p>
        )}
      </div>

      <ParsedFieldsView result={result} />

      <details className="rounded-xl border border-ink-700/60 bg-ink-900/40">
        <summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold text-ink-300">
          Raw extracted text ({result.raw_text.length} chars)
        </summary>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-b-xl border-t border-ink-700/60 bg-ink-950/50 p-3 font-mono text-[11px] leading-relaxed text-ink-200 scrollbar-thin">
          {result.raw_text || "(no text extracted)"}
        </pre>
      </details>
    </motion.div>
  );
}

function ParsedFieldsView({ result }: { result: OCRUploadResult }) {
  const f = result.parsed_fields;
  const vitalEntries = Object.entries(f.vitals);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-ink-700/60 bg-ink-900/40 p-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-ink-400">
          Demographics
        </p>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <FieldRow label="Name" value={f.patient_name} />
          <FieldRow label="MRN" value={f.patient_id} />
          <FieldRow label="Age" value={f.age?.toString()} />
          <FieldRow label="Sex" value={f.sex} />
          <FieldRow label="Contact" value={f.contact} />
        </dl>
      </div>

      <div className="rounded-xl border border-ink-700/60 bg-ink-900/40 p-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-ink-400">
          Vitals · {vitalEntries.length} captured
        </p>
        {vitalEntries.length === 0 ? (
          <p className="text-xs text-ink-500">No vitals extracted.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-1.5">
            {vitalEntries.map(([k, v]) => (
              <li
                key={k}
                className="flex items-center justify-between rounded-md bg-ink-800/50 px-2 py-1 text-xs"
              >
                <span className="font-mono text-ink-400">{k}</span>
                <span className="font-mono font-semibold text-ink-100">{v}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-ink-700/60 bg-ink-900/40 p-4 md:col-span-2">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-ink-400">
          Chief complaint
        </p>
        <p className="rounded-lg bg-ink-900/60 p-3 text-sm italic text-ink-100">
          {f.chief_complaint ? `"${f.chief_complaint}"` : "(not extracted)"}
        </p>
      </div>

      {(f.history.length > 0 || f.allergies.length > 0 || f.medications.length > 0) && (
        <div className="rounded-xl border border-ink-700/60 bg-ink-900/40 p-4 md:col-span-2">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {f.history.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-400">
                  History
                </p>
                <div className="flex flex-wrap gap-1">
                  {f.history.map((h, i) => (
                    <span key={`${h}-${i}`} className="chip">{h}</span>
                  ))}
                </div>
              </div>
            )}
            {f.allergies.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-400">
                  Allergies
                </p>
                <div className="flex flex-wrap gap-1">
                  {f.allergies.map((a, i) => (
                    <span
                      key={`${a}-${i}`}
                      className="inline-flex items-center gap-1 rounded-full border border-priority-p1/30 bg-priority-p1/10 px-2.5 py-1 text-xs font-medium text-priority-p1"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {f.medications.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-400">
                  Medications
                </p>
                <ul className="space-y-1">
                  {f.medications.map((m, i) => (
                    <li
                      key={`${m.name}-${i}`}
                      className="flex items-center justify-between rounded-md bg-ink-800/50 px-2 py-1 text-xs"
                    >
                      <span className="text-ink-100">{m.name}</span>
                      {m.dose && (
                        <span className="font-mono text-ink-400">{m.dose}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <dt className="text-ink-400">{label}</dt>
      <dd className={cn("font-medium", value ? "text-ink-100" : "text-ink-500")}>
        {value ?? "—"}
      </dd>
    </>
  );
}
