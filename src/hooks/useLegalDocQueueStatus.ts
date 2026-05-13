import { useEffect, useState } from "react";
import {
  getLegalDocQueueSnapshot,
  subscribeLegalDocQueue,
  type LegalDocQueueSnapshot,
} from "@/lib/legalDocumentQueue";

/**
 * React hook that exposes the legal-doc queue state and the position of a
 * specific proposal inside it.
 *
 * Returns:
 *   - `position`: 0 means "running now", N≥1 means "Nth in line", -1 means
 *     not in the queue (idle).
 *   - `pendingCount`: total jobs waiting (excluding the running one).
 *   - `runningKey`: key of the job currently being processed, if any.
 *   - `isQueued`: convenience boolean for "this proposal is in the queue".
 */
export function useLegalDocQueueStatus(key: string) {
  const [snap, setSnap] = useState<LegalDocQueueSnapshot>(() => getLegalDocQueueSnapshot());

  useEffect(() => {
    return subscribeLegalDocQueue(setSnap);
  }, []);

  const idx = snap.jobs.findIndex((j) => j.key === key);
  let position = -1;
  if (idx >= 0) {
    if (snap.jobs[idx].status === "running") position = 0;
    else if (snap.jobs[idx].status === "pending") {
      let p = 0;
      for (let i = 0; i <= idx; i++) {
        if (snap.jobs[i].status === "pending") p += 1;
        if (i === idx) break;
      }
      position = p;
    }
  }

  return {
    position,
    isQueued: position >= 0,
    isRunning: position === 0,
    pendingCount: snap.pendingCount,
    runningKey: snap.running?.key || null,
    snapshot: snap,
  };
}
