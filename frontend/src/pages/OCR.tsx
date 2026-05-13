import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FileText, Loader2, RefreshCw, ScanLine, Send, Sparkles } from "lucide-react";
import { Card } from "../components/Card";
import { api } from "../lib/api";
import { formatRelative, ocrMocks, pushActivity } from "../lib/utils";
import type { OCRQueueItem } from "../types";

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

  return (
    <div className="space-y-8">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full bg-priority-p4/10 px-3 py-1 text-xs font-semibold text-priority-p4 ring-1 ring-priority-p4/30">
          <ScanLine className="h-3.5 w-3.5" />
          scanned document intake
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink-50">OCR review queue</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-400">
          OCR ingestion runs as a placeholder endpoint — extracted payloads are
          queued here for a human reviewer before they reach the triage pipeline.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card
          title="Submit extraction payload"
          description="POST /api/v1/intake/ocr"
          action={
            <div className="flex flex-wrap gap-1.5">
              {ocrMocks.map((m, idx) => (
                <button
                  key={m.document_name}
                  className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent ring-1 ring-accent/30 transition hover:bg-accent/20"
                  onClick={() => {
                    setDocName(m.document_name);
                    setNote(m.note);
                    setPayload(JSON.stringify(m.payload, null, 2));
                  }}
                >
                  <Sparkles className="h-3 w-3" /> Mock {idx + 1}
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
                className="input min-h-[220px] font-mono text-xs leading-relaxed"
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
              />
            </label>
            <button className="btn-primary w-full" onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
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
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </button>
          }
        >
          {queue.length === 0 ? (
            <p className="rounded-lg border border-dashed border-ink-700/60 p-6 text-center text-sm text-ink-400">
              Queue is empty. Submit a document to test the flow.
            </p>
          ) : (
            <ul className="space-y-2.5">
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
