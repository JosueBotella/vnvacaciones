/**
 * Global FIFO queue for legal-document generation/regeneration jobs.
 *
 * Why this exists:
 * The "Generar / Regenerar documento legal" pipeline is heavy (video frame
 * extraction, AI rendering, persistence) and the backend can struggle if
 * several runs are triggered in parallel — especially when the admin spams
 * the button or rapidly toggles tipo/gravedad on multiple proposals.
 *
 * This module exposes a single in-memory queue that serializes those jobs:
 * the next job only starts when the previous one resolves (or rejects).
 * Each job is identified by a key (typically the `propuestaId`) so we can:
 *   - report position / queue size to the UI
 *   - notify multiple subscribers when state changes
 *   - skip enqueueing a duplicate job for the same proposal
 *
 * The queue is purely client-side (per browser tab). Reloading the page
 * resets it — that's intentional: jobs are idempotent enough that the
 * worst case is "you'll have to press Regenerar again".
 */

export type LegalDocJobStatus = "pending" | "running" | "done" | "error";

export interface LegalDocJob {
  /** Stable key, usually the propuesta ID. Used to dedupe. */
  key: string;
  /** Optional human label for the UI ("Regenerar — Juan Pérez"). */
  label?: string;
  /** The async work to execute. Should resolve when the doc is fully ready. */
  run: () => Promise<void>;
  status: LegalDocJobStatus;
  enqueuedAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
}

type Listener = (snapshot: LegalDocQueueSnapshot) => void;

export interface LegalDocQueueSnapshot {
  /** All jobs currently tracked (pending + the one running). */
  jobs: LegalDocJob[];
  /** Convenience: current running job, if any. */
  running: LegalDocJob | null;
  /** Number of jobs waiting (excluding the running one). */
  pendingCount: number;
}

const queue: LegalDocJob[] = [];
const listeners = new Set<Listener>();
let processing = false;

const snapshot = (): LegalDocQueueSnapshot => {
  const running = queue.find((j) => j.status === "running") || null;
  const pendingCount = queue.filter((j) => j.status === "pending").length;
  return {
    jobs: [...queue],
    running,
    pendingCount,
  };
};

const emit = () => {
  const snap = snapshot();
  listeners.forEach((l) => {
    try { l(snap); } catch { /* listener errors must not break the queue */ }
  });
};

const processNext = async () => {
  if (processing) return;
  const next = queue.find((j) => j.status === "pending");
  if (!next) return;

  processing = true;
  next.status = "running";
  next.startedAt = Date.now();
  emit();

  try {
    await next.run();
    next.status = "done";
  } catch (err: any) {
    next.status = "error";
    next.error = err?.message || String(err);
  } finally {
    next.finishedAt = Date.now();
    processing = false;
    emit();

    // Cleanup finished jobs after a short delay so the UI can briefly show
    // "completed" before they disappear from the list.
    setTimeout(() => {
      const idx = queue.indexOf(next);
      if (idx >= 0 && (queue[idx].status === "done" || queue[idx].status === "error")) {
        queue.splice(idx, 1);
        emit();
      }
      // Try to drain the queue.
      processNext();
    }, 600);
  }
};

/**
 * Enqueue a legal-doc generation/regeneration job. If a job with the same
 * key is already pending or running, the new request is *coalesced*: we
 * keep the existing one and return it (so the UI doesn't pile up duplicate
 * regenerations of the same proposal).
 */
export const enqueueLegalDocJob = (job: Omit<LegalDocJob, "status" | "enqueuedAt">): LegalDocJob => {
  const existing = queue.find((j) => j.key === job.key && (j.status === "pending" || j.status === "running"));
  if (existing) {
    // Update label if the new one is more specific.
    if (job.label && !existing.label) existing.label = job.label;
    return existing;
  }

  const entry: LegalDocJob = {
    ...job,
    status: "pending",
    enqueuedAt: Date.now(),
  };
  queue.push(entry);
  emit();

  // Kick the loop. If something is already running, it will pick this up
  // when it finishes via processNext() in the cleanup timeout.
  processNext();

  return entry;
};

/** Subscribe to queue state changes. Returns an unsubscribe fn. */
export const subscribeLegalDocQueue = (listener: Listener): (() => void) => {
  listeners.add(listener);
  // Push current state immediately so consumers can render without waiting.
  try { listener(snapshot()); } catch { /* ignore */ }
  return () => { listeners.delete(listener); };
};

/** Read the current snapshot synchronously. */
export const getLegalDocQueueSnapshot = (): LegalDocQueueSnapshot => snapshot();

/**
 * Returns the queue position of a key (1-based). 0 means "running now",
 * -1 means "not in queue". Useful to render "En cola: posición 2".
 */
export const getQueuePosition = (key: string): number => {
  const idx = queue.findIndex((j) => j.key === key);
  if (idx < 0) return -1;
  if (queue[idx].status === "running") return 0;
  // Count how many pending entries come before this one.
  let position = 0;
  for (let i = 0; i <= idx; i++) {
    if (queue[i].status === "pending") position += 1;
    if (i === idx) break;
  }
  return position;
};
