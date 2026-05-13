import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Gavel, Loader2, Eye, Sparkles, Download, RefreshCw, MessageSquarePlus, Clock, Pencil, Save, XCircle, ImageIcon, Type, Move, Blocks, Undo2, Redo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LegalDocumentEditChat } from "./LegalDocumentEditChat";
import { LegalDocumentVersionHistory } from "./LegalDocumentVersionHistory";
import { LegalDocumentInDocBlockControls } from "./LegalDocumentInDocBlockControls";
import { LegalSelectionPopover } from "./LegalSelectionPopover";
import {
  parseLegalDocument,
  reorderBlocks,
  setBlockInlineStyle,
  resetBlock,
  removeBlock,
  removeFigure,
  serializeDocument,
  getBlockMeta,
  moveBlockBy,
  getBlockMovability,
  type BlockMeta,
  type BlockInlineStylePatch,
} from "@/lib/legalDocumentBlocks";
import { useLegalDocumentAIEdit } from "@/hooks/useLegalDocumentAIEdit";
import { filterVideoPaths, preprocessProposalVideos } from "@/lib/videoFrameExtractor";
import { LegalDocumentProgressOverlay, type LegalDocProgressState } from "./LegalDocumentProgressOverlay";
import { VideoEvidenceAuditPanel } from "./VideoEvidenceAuditPanel";
import { getManagerSessionToken } from "@/lib/sessionHelpers";
import {
  LEGAL_A4_HEIGHT,
  paginateLegalDocument,
  type PaginatedLegalDocumentResult,
  waitForLegalDocumentAssets,
} from "./legalDocumentPagination";
import { buildLegalPreviewSrcDoc } from "./legalDocumentPreview";
import { LegalDocumentImageEditorDialog, type ImageEditorTarget, type ImageEditorResult } from "./LegalDocumentImageEditorDialog";
import { enqueueLegalDocJob } from "@/lib/legalDocumentQueue";
import { useLegalDocQueueStatus } from "@/hooks/useLegalDocQueueStatus";

interface Props {
  propuestaId: string;
  propuestaEstado: string;
  isNspp?: boolean;
  workerName?: string;
  autoRefresh?: boolean;
  hasAiAnalysis?: boolean;
}

const getLegalPdfFileName = (doc: any, paginated: PaginatedLegalDocumentResult) => {
  const tipoDoc = doc.tipo === "amonestacion" ? "Amonestación" : "Sanción";
  const nombre = (paginated.meta.workerName || "Trabajador").trim();
  const numero = (paginated.meta.workerNumber || "").trim();
  const d = new Date(doc.created_at);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  const nombreConNumero = numero ? `${nombre} (${numero})` : nombre;
  return `${tipoDoc} - ${nombreConNumero} | ${dd}-${mm}-${yyyy}.pdf`;
};

export function LegalDocumentInlineButton({ propuestaId, propuestaEstado, isNspp, workerName, autoRefresh, hasAiAnalysis }: Props) {
  const sessionToken = getManagerSessionToken() || "";
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDoc, setViewDoc] = useState<any>(null);
  const [paginatedViewDoc, setPaginatedViewDoc] = useState<PaginatedLegalDocumentResult | null>(null);
  const [paginatingViewDoc, setPaginatingViewDoc] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [previewFrameReady, setPreviewFrameReady] = useState(false);
  const [sidePanel, setSidePanel] = useState<"chat" | "history" | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editDirty, setEditDirty] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [imageRepositionMode, setImageRepositionMode] = useState(false);
  const [imageRepositionDirty, setImageRepositionDirty] = useState(false);
  const [editorTarget, setEditorTarget] = useState<ImageEditorTarget | null>(null);
  const [selection, setSelection] = useState<{ text: string; top: number; left: number } | null>(null);
  // ── In-document block editor (drag/reorder, margins, delete inside the doc)
  const [blockEditMode, setBlockEditMode] = useState(false);
  const [blockEditDirty, setBlockEditDirty] = useState(false);
  const blockWorkingDocRef = useRef<Document | null>(null);
  const blockFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockHistoryRef = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] });
  const [blockHistoryTick, setBlockHistoryTick] = useState(0);
  const [selectedBlock, setSelectedBlock] = useState<BlockMeta | null>(null);
  const [selectedBlockAnchor, setSelectedBlockAnchor] = useState<{ top: number; left: number; right: number; bottom: number; width: number } | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const triggerAttemptedRef = useRef(false);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [autoGenFailed, setAutoGenFailed] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [fontDelta, setFontDelta] = useState(0); // live preview font-size offset (px)
  const FONT_DELTA_STEP = 0.5;
  const FONT_DELTA_MIN = -3;
  const FONT_DELTA_MAX = 4;
  // Track which document the current fontDelta belongs to, so we don't
  // accidentally persist a value loaded from a different document.
  const fontDeltaDocRef = useRef<string | null>(null);
  const fontDeltaSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fontDeltaLatestRef = useRef(0);
  const fontDeltaPersistedRef = useRef<{ docId: string | null; value: number }>({
    docId: null,
    value: 0,
  });
  const [progressState, setProgressState] = useState<LegalDocProgressState>({
    open: false,
    phase: "preparing",
    percent: 0,
    title: "",
    hint: "",
  });
  const closeProgress = () => setProgressState((s) => ({ ...s, open: false }));

  // Reactive view of this proposal's position in the global generation queue.
  // When position > 0, the job is waiting for previous ones to finish.
  const queueStatus = useLegalDocQueueStatus(propuestaId);

  // While this proposal is waiting in the queue, keep the progress hint in
  // sync with its position so the admin can see "En cola: posición 2" live.
  useEffect(() => {
    if (!progressState.open) return;
    if (queueStatus.position > 0) {
      setProgressState((s) => ({
        ...s,
        phase: "preparing",
        percent: 1,
        hint: `En cola — posición ${queueStatus.position} de ${queueStatus.pendingCount + (queueStatus.runningKey ? 1 : 0)}`,
      }));
    }
  }, [queueStatus.position, queueStatus.pendingCount, queueStatus.runningKey, progressState.open]);

  const { runAIEdit, running: aiSelectionRunning } = useLegalDocumentAIEdit({
    documentId: viewDoc?.id || "",
    htmlContent: viewDoc?.html_content || "",
    onDocumentUpdated: (newHtml) => {
      if (viewDoc) setViewDoc({ ...viewDoc, html_content: newHtml });
      loadDocuments();
    },
  });

  const sortDocumentsByNewest = (docs: any[]) => {
    return [...docs].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
  };

  const clampFontDelta = useCallback((value: number) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(FONT_DELTA_MIN, Math.min(FONT_DELTA_MAX, Math.round(numeric * 2) / 2));
  }, []);

  const syncLocalFontDelta = useCallback((documentId: string, nextDelta: number) => {
    setViewDoc((prev: any) => (prev?.id === documentId ? { ...prev, font_delta: nextDelta } : prev));
    setDocuments((prev) => prev.map((doc: any) => (doc.id === documentId ? { ...doc, font_delta: nextDelta } : doc)));
  }, []);

  const persistFontDelta = useCallback(async (documentId: string, nextDelta: number, force = false) => {
    const clamped = clampFontDelta(nextDelta);
    const alreadyPersisted =
      fontDeltaPersistedRef.current.docId === documentId &&
      fontDeltaPersistedRef.current.value === clamped;

    if (!force && alreadyPersisted) return;

    try {
      const { data, error } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "updateLegalDocumentFontDelta",
          sessionToken,
          documentId,
          font_delta: clamped,
          set_as_default: true,
        },
      });

      if (error || data?.success === false) {
        throw error || new Error(data?.error || "No se pudo guardar el tamaño del texto");
      }

      const persisted = clampFontDelta(Number(data?.font_delta ?? clamped));
      fontDeltaPersistedRef.current = { docId: documentId, value: persisted };
      syncLocalFontDelta(documentId, persisted);
    } catch (error) {
      console.warn("[LegalDocumentInlineButton] Could not persist font_delta", error);
    }
  }, [clampFontDelta, sessionToken, syncLocalFontDelta]);

  const loadDocuments = async () => {
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "getLegalDocuments", sessionToken, propuestaId },
      });
      const docs = sortDocumentsByNewest(data?.documents || []);
      setDocuments(docs);
      if (viewDoc) {
        const replacementDoc = docs.find((d: any) => !d.anulado && d.id === viewDoc.id) || docs.find((d: any) => !d.anulado) || null;
        setViewDoc(replacementDoc);
      }
      if (docs.filter((d: any) => !d.anulado).length > 0) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        // Close the unified progress overlay once a document is available.
        setProgressState((s) => (s.open ? { ...s, open: false, percent: 100 } : s));
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { loadDocuments(); }, [propuestaId]);

  // Listen for explicit "regenerated" broadcasts (e.g. after admin saves
  // new suspension days). Force a hard reload of the documents so the
  // open viewer shows the updated HTML immediately.
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail || {};
      if (!detail.propuestaId || detail.propuestaId === propuestaId) {
        loadDocuments();
      }
    };
    window.addEventListener('legal-document-regenerated', handler as EventListener);
    return () => window.removeEventListener('legal-document-regenerated', handler as EventListener);
  }, [propuestaId]);

  // Auto-refresh polling
  useEffect(() => {
    if (!autoRefresh) return;
    const activeDocs = documents.filter(d => !d.anulado);
    if (activeDocs.length > 0) { setAutoGenFailed(false); return; }

    pollingRef.current = setInterval(() => { loadDocuments(); }, 3000);
    const timeout = setTimeout(() => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      // If still no document after timeout, mark as failed
      setAutoGenFailed(true);
    }, 30000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      clearTimeout(timeout);
    };
  }, [autoRefresh, documents.length, propuestaId]);

  // Auto-trigger generation
  useEffect(() => {
    if (!autoRefresh || !hasAiAnalysis || loading || triggerAttemptedRef.current) return;
    const activeDocs = documents.filter(d => !d.anulado);
    if (activeDocs.length > 0) return;

    triggerAttemptedRef.current = true;
    setAutoGenFailed(false);
    setProgressState({
      open: true,
      phase: "preparing",
      percent: 1,
      title: "Generando documento legal",
      hint: "En cola, esperando turno…",
    });
    enqueueLegalDocJob({
      key: propuestaId,
      label: workerName ? `Generar — ${workerName}` : "Generar documento",
      run: async () => {
        setProgressState((s) => ({
          ...s,
          phase: "preparing",
          percent: 2,
          hint: "Preparando datos de la propuesta…",
        }));
        const autoPreResult = await preprocessVideosIfAny();
        if (autoPreResult && autoPreResult.totalVideos > 0 && autoPreResult.totalFrames === 0) {
          const details = autoPreResult.skippedReasons.length ? ` ${autoPreResult.skippedReasons.join(" · ")}` : "";
          throw new Error(`No se pudieron extraer fotogramas reales del vídeo.${details}`);
        }
        setProgressState((s) => ({
          ...s,
          phase: "generating-document",
          percent: Math.max(s.percent, 65),
          hint: "Redactando con la IA según el convenio…",
        }));
        try {
          await supabase.functions.invoke("incidencias-operations", {
            body: { action: "generateLegalDocument", sessionToken, propuestaId },
          });
          setProgressState((s) => ({ ...s, phase: "finalizing", percent: 95, hint: "Esperando documento generado…" }));
          await waitForDocumentToAppear();
        } catch (err) {
          setAutoGenFailed(true);
          closeProgress();
          throw err;
        }
      },
    });
  }, [autoRefresh, hasAiAnalysis, loading, documents, propuestaId, sessionToken]);

  // Reset trigger when hasAiAnalysis changes to true (analysis completed after mount)
  useEffect(() => {
    if (hasAiAnalysis) {
      const activeDocs = documents.filter(d => !d.anulado);
      if (activeDocs.length === 0) {
        triggerAttemptedRef.current = false;
      }
    }
  }, [hasAiAnalysis]);

  // Fetch all evidence paths attached to the proposal (record + admin extras)
  // and process the videos client-side BEFORE asking the backend to generate
  // the legal document. This guarantees frames in `incidencias_video_frames`
  // are REAL captures of the original video (decoded by the browser) and not
  // AI reconstructions, so they have full probatory value.
  // Reports detailed progress through the unified overlay.
  const preprocessVideosIfAny = async (
    descriptionHint = "",
  ): Promise<{ totalFrames: number; totalVideos: number; skippedReasons: string[] } | null> => {
    try {
      const { data, error } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "getProposalEvidencePaths", sessionToken, propuestaId },
      });
      if (error || data?.success === false) {
        console.warn("[preprocessVideosIfAny] Could not load evidence paths:", error || data?.error);
        return null;
      }

      const videoPaths = filterVideoPaths(Array.isArray(data?.videoPaths) ? data.videoPaths : []);
      if (videoPaths.length === 0) return { totalFrames: 0, totalVideos: 0, skippedReasons: [] };
      const contextHint = descriptionHint || String(data?.descripcion || "");

      // Mark phase as extraction; allocate the 0-60% range to extraction work,
      // 60-95% for the document generation, last 5% for finalize.
      setProgressState({
        open: true,
        phase: "extracting-frames",
        percent: 5,
        title: videoPaths.length === 1 ? "Procesando vídeo de prueba" : `Procesando ${Math.min(videoPaths.length, 3)} vídeos`,
        hint: "Comprobando caché de evidencias…",
      });

      const result = await preprocessProposalVideos(propuestaId, videoPaths, contextHint, (p) => {
        // Map video index + step into a single 5-60% progress window.
        const perVideo = 55 / Math.max(p.totalVideos, 1);
        const stepWeight: Record<string, number> = {
          "cache-check": 0.05,
          analyze: 0.15,
          download: 0.35,
          decode: 0.45,
          seek: 0.65,
          upload: 0.85,
          save: 0.95,
          done: 1,
        };
        const within = stepWeight[p.step.step] ?? 0;
        const itemFraction = p.step.total
          ? Math.min(1, (p.step.current || 0) / Math.max(p.step.total, 1))
          : 0;
        const localPct = within + (itemFraction * 0.05);
        const pct = 5 + (p.videoIndex * perVideo) + (Math.min(localPct, 1) * perVideo);

        const itemLabel = p.step.total ? ` (${p.step.current}/${p.step.total})` : "";
        const videoTag = p.totalVideos > 1 ? `Vídeo ${p.videoIndex + 1}/${p.totalVideos} — ` : "";
        setProgressState({
          open: true,
          phase: "extracting-frames",
          percent: Math.min(60, Math.max(5, Math.round(pct))),
          title: videoPaths.length === 1 ? "Procesando vídeo de prueba" : `Procesando ${Math.min(videoPaths.length, 3)} vídeos`,
          hint: `${videoTag}${p.step.label}${itemLabel}`,
        });
      });

      const skippedReasons = result.outcomes
        .filter((o) => o.skipped)
        .map((o) => `${o.videoName}: ${o.reason || "sin frames reales"}`);
      return {
        totalFrames: result.totalFrames,
        totalVideos: videoPaths.length,
        skippedReasons,
      };
    } catch (e) {
      console.warn("[preprocessVideosIfAny] Failed:", e);
      return null;
    }
  };

  const handleManualGenerate = async () => {
    setRegenerating(true);
    triggerAttemptedRef.current = true;
    setAutoGenFailed(false);
    // Show "queued" state immediately. The actual work runs through the
    // global FIFO queue so concurrent generation requests don't pile up.
    setProgressState({
      open: true,
      phase: "preparing",
      percent: 1,
      title: "Generando documento legal",
      hint: "En cola, esperando turno…",
    });

    enqueueLegalDocJob({
      key: propuestaId,
      label: workerName ? `Generar — ${workerName}` : "Generar documento",
      run: async () => {
        setProgressState({
          open: true,
          phase: "preparing",
          percent: 2,
          title: "Generando documento legal",
          hint: "Preparando datos de la propuesta…",
        });
        try {
          // Extract REAL frames from any attached video before asking the backend.
          const preResult = await preprocessVideosIfAny();

          if (preResult && preResult.totalVideos > 0) {
            if (preResult.totalFrames === 0) {
              const details = preResult.skippedReasons.length ? ` ${preResult.skippedReasons.join(" · ")}` : "";
              toast.error(`No se pudieron extraer fotogramas reales del vídeo.${details}`, { duration: 9000 });
              closeProgress();
              return;
            } else if (preResult.skippedReasons.length > 0) {
              toast.info(
                `Se incluyen ${preResult.totalFrames} fotogramas reales. ${preResult.skippedReasons.length} vídeo(s) sin evidencias.`,
                { duration: 6000 },
              );
            }
          }

          setProgressState((s) => ({
            ...s,
            phase: "generating-document",
            percent: Math.max(s.percent, 65),
            title: "Generando documento legal",
            hint: "Redactando con la IA según el convenio…",
          }));

          const { data, error } = await supabase.functions.invoke("incidencias-operations", {
            body: { action: "generateLegalDocument", sessionToken, propuestaId },
          });

          if (error) throw error;
          if (data?.success === false) {
            toast.error(data?.error || "No se pudo generar el documento legal");
            setAutoGenFailed(true);
            closeProgress();
            return;
          }

          setProgressState((s) => ({ ...s, phase: "finalizing", percent: 95, hint: "Esperando documento generado…" }));

          // Block the queue until the doc shows up so the next job doesn't
          // start hammering the backend in parallel.
          await waitForDocumentToAppear();
        } catch (err: any) {
          toast.error(err?.message || "No se pudo generar el documento legal");
          setAutoGenFailed(true);
          closeProgress();
          throw err;
        } finally {
          setRegenerating(false);
        }
      },
    });
  };

  /**
   * Returns once the proposal has at least one active legal document, or
   * after a 30s timeout. Used to keep the queue blocked until the doc
   * actually exists, so subsequent jobs can run sequentially.
   */
  const waitForDocumentToAppear = (timeoutMs = 30000): Promise<void> => {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = async () => {
        try {
          const { data } = await supabase.functions.invoke("incidencias-operations", {
            body: { action: "getLegalDocuments", sessionToken, propuestaId },
          });
          const docs = sortDocumentsByNewest(data?.documents || []);
          const active = docs.filter((d: any) => !d.anulado);
          if (active.length > 0) {
            setDocuments(docs);
            setProgressState((s) => (s.open ? { ...s, percent: 100, hint: "Documento listo" } : s));
            setTimeout(closeProgress, 350);
            resolve();
            return;
          }
        } catch { /* ignore and retry */ }
        if (Date.now() - start > timeoutMs) {
          setAutoGenFailed(true);
          closeProgress();
          resolve();
          return;
        }
        setTimeout(check, 2000);
      };
      check();
    });
  };

  const getPaginationFallbackMeta = (doc: any) => ({
    documentCode: doc?.document_code || "",
    tipoLabel: doc?.tipo === "amonestacion" ? "AMONESTACIÓN" : doc?.tipo === "sancion" ? "SANCIÓN" : "",
    workerName: workerName || doc?.worker_name || "",
    workerNumber: doc?.worker_number || "",
    fecha: doc?.created_at
      ? new Date(doc.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })
      : "",
  });

  useEffect(() => {
    let cancelled = false;

    if (!viewDoc?.html_content) {
      setPaginatedViewDoc(null);
      setPaginatingViewDoc(false);
      return;
    }

    setPaginatedViewDoc(null);
    setPaginatingViewDoc(true);

    paginateLegalDocument(viewDoc.html_content, getPaginationFallbackMeta(viewDoc))
      .then((result) => {
        if (!cancelled) setPaginatedViewDoc(result);
      })
      .catch(() => {
        if (!cancelled) setPaginatedViewDoc(null);
      })
      .finally(() => {
        if (!cancelled) setPaginatingViewDoc(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewDoc?.id, viewDoc?.html_content, workerName]);

  // Load the persisted font_delta whenever a new document is opened
  useEffect(() => {
    if (!viewDoc?.id) {
      fontDeltaDocRef.current = null;
      fontDeltaPersistedRef.current = { docId: null, value: 0 };
      return;
    }
    fontDeltaDocRef.current = viewDoc.id;
    const persisted = clampFontDelta(Number(viewDoc.font_delta || 0) || 0);
    fontDeltaLatestRef.current = persisted;
    fontDeltaPersistedRef.current = { docId: viewDoc.id, value: persisted };
    setFontDelta(persisted);
  }, [viewDoc?.id, viewDoc?.font_delta, clampFontDelta]);

  // Persist font_delta with debounce (also pushes it as the global default
  // so newly generated documents inherit the same size).
  useEffect(() => {
    if (!viewDoc?.id) return;
    const clamped = clampFontDelta(fontDelta);
    const currentDocId = viewDoc.id;
    fontDeltaLatestRef.current = clamped;
    if (fontDeltaDocRef.current !== currentDocId) return;
    if (
      fontDeltaPersistedRef.current.docId === currentDocId &&
      fontDeltaPersistedRef.current.value === clamped
    ) {
      return;
    }
    if (fontDeltaSaveTimerRef.current) clearTimeout(fontDeltaSaveTimerRef.current);
    fontDeltaSaveTimerRef.current = setTimeout(async () => {
      await persistFontDelta(currentDocId, fontDeltaLatestRef.current);
    }, 600);
    return () => {
      if (fontDeltaSaveTimerRef.current) clearTimeout(fontDeltaSaveTimerRef.current);
      const wasPersisted =
        fontDeltaPersistedRef.current.docId === currentDocId &&
        fontDeltaPersistedRef.current.value === clamped;
      if (!wasPersisted) {
        void persistFontDelta(currentDocId, clamped, true);
      }
    };
  }, [fontDelta, viewDoc?.id, clampFontDelta, persistFontDelta]);

  useEffect(() => {
    return () => {
      if (fontDeltaSaveTimerRef.current) clearTimeout(fontDeltaSaveTimerRef.current);
      const docId = fontDeltaDocRef.current;
      if (!docId) return;
      const latest = fontDeltaLatestRef.current;
      const wasPersisted =
        fontDeltaPersistedRef.current.docId === docId &&
        fontDeltaPersistedRef.current.value === latest;
      if (!wasPersisted) {
        void persistFontDelta(docId, latest, true);
      }
    };
  }, [persistFontDelta]);

  const isSigned = !!(viewDoc?.firmado_at || viewDoc?.signed_photo_urls || viewDoc?.negado_firmar);

  // Effective fontDelta: prefer the live state when it belongs to the current
  // document; otherwise fall back to the doc's persisted value so the very first
  // render (before the sync effect runs) already shows the correct size.
  const effectiveFontDelta = useMemo(() => {
    if (viewDoc?.id && fontDeltaDocRef.current === viewDoc.id) {
      return clampFontDelta(fontDelta);
    }
    return clampFontDelta(Number(viewDoc?.font_delta || 0) || 0);
  }, [viewDoc?.id, viewDoc?.font_delta, fontDelta, clampFontDelta]);

  const previewSrcDoc = useMemo(() => {
    if (!viewDoc || !paginatedViewDoc?.pages.length) return "";
    return buildLegalPreviewSrcDoc(paginatedViewDoc, getLegalPdfFileName(viewDoc, paginatedViewDoc), {
      enableSelection: !editMode && !imageRepositionMode && !blockEditMode && !isSigned,
      editable: editMode && !isSigned,
      imageReposition: imageRepositionMode && !isSigned,
      blockEditing: blockEditMode && !isSigned,
      fontDelta: effectiveFontDelta,
    });
  }, [paginatedViewDoc, viewDoc, editMode, imageRepositionMode, blockEditMode, isSigned, effectiveFontDelta]);

  const previewFrameHeight = useMemo(() => {
    const totalPages = paginatedViewDoc?.pages.length || 0;
    if (!totalPages) return 0;
    return totalPages * LEGAL_A4_HEIGHT + Math.max(totalPages - 1, 0) * 24 + 56;
  }, [paginatedViewDoc?.pages.length]);

  const ensurePreviewImageId = useCallback((img: HTMLImageElement, fallbackIndex = 0) => {
    let id = img.getAttribute("data-legal-image-id");
    if (id) return id;
    id = `legal-img-${fallbackIndex}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    img.setAttribute("data-legal-image-id", id);
    return id;
  }, []);

  const findPreviewImageFrame = useCallback((img: HTMLImageElement) => {
    let node: HTMLElement | null = img.parentElement;
    for (let i = 0; i < 8 && node; i += 1) {
      const styles = window.getComputedStyle(node);
      if (
        styles.overflow === "hidden" ||
        styles.overflow === "clip" ||
        styles.overflowX === "hidden" ||
        styles.overflowY === "hidden"
      ) {
        return node;
      }
      node = node.parentElement;
    }
    return img.parentElement || img;
  }, []);

  const openImageEditorFromFrameNode = useCallback((img: HTMLImageElement, fallbackIndex = 0) => {
    const id = ensurePreviewImageId(img, fallbackIndex);
    const frame = findPreviewImageFrame(img);
    const rect = frame.getBoundingClientRect();
    const computed = window.getComputedStyle(img);

    setEditorTarget({
      id,
      src: img.currentSrc || img.src || "",
      naturalWidth: img.naturalWidth || 0,
      naturalHeight: img.naturalHeight || 0,
      frameWidth: Math.max(1, Math.round(rect.width || img.clientWidth || 0)),
      frameHeight: Math.max(1, Math.round(rect.height || img.clientHeight || 0)),
      currentObjectPosition: img.style.objectPosition || computed.objectPosition || "50% 50%",
      currentTransform: img.style.transform || "",
    });
  }, [ensurePreviewImageId, findPreviewImageFrame]);

  useEffect(() => {
    if (!imageRepositionMode || !previewFrameReady) return;
    const frameDocument = previewFrameRef.current?.contentDocument;
    if (!frameDocument) return;

    const imageSelector = "img.evidence-image, .evidence-aside-frame img, figure img[alt='Evidencia']";

    const getEditableImages = () => Array.from(frameDocument.querySelectorAll<HTMLImageElement>(imageSelector));

    const primeImages = () => {
      getEditableImages().forEach((img, index) => {
        ensurePreviewImageId(img, index);
        img.setAttribute("draggable", "false");
        img.style.cursor = "pointer";
      });
    };

    const handleFrameClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const clickedImage = target.closest("img");
      if (!(clickedImage instanceof HTMLImageElement)) return;

      const editableImages = getEditableImages();
      const imageIndex = editableImages.indexOf(clickedImage);
      if (imageIndex === -1) return;

      event.preventDefault();
      event.stopPropagation();
      openImageEditorFromFrameNode(clickedImage, imageIndex);
    };

    primeImages();
    frameDocument.addEventListener("click", handleFrameClick, true);

    return () => {
      frameDocument.removeEventListener("click", handleFrameClick, true);
    };
  }, [imageRepositionMode, previewFrameReady, previewSrcDoc, ensurePreviewImageId, openImageEditorFromFrameNode]);

  useEffect(() => {
    setPreviewFrameReady(false);
    setSelection(null);
    setEditDirty(false);
    setImageRepositionDirty(false);
  }, [previewSrcDoc]);

  // Flush the working DOM serialization to the iframe (debounced).
  // Only used when we need to fully re-render the iframe (undo/redo).
  const flushBlockDoc = useCallback(() => {
    const d = blockWorkingDocRef.current;
    if (!d) return;
    const newHtml = serializeDocument(d);
    setViewDoc((prev: any) => prev ? { ...prev, html_content: newHtml } : prev);
  }, []);

  const scheduleFlushBlockDoc = useCallback((delay = 60) => {
    if (blockFlushTimerRef.current) clearTimeout(blockFlushTimerRef.current);
    blockFlushTimerRef.current = setTimeout(() => {
      blockFlushTimerRef.current = null;
      flushBlockDoc();
    }, delay);
  }, [flushBlockDoc]);

  // Snapshot current working doc to the undo stack (call BEFORE mutating).
  const pushBlockHistory = useCallback(() => {
    const d = blockWorkingDocRef.current;
    if (!d) return;
    const snap = serializeDocument(d);
    const hist = blockHistoryRef.current;
    if (hist.past[hist.past.length - 1] !== snap) {
      hist.past.push(snap);
      if (hist.past.length > 50) hist.past.shift();
    }
    hist.future = [];
    setBlockHistoryTick((t) => t + 1);
  }, []);

  // Apply a mutation. By default `silent: true` — the working doc is mutated
  // for save/undo, but the iframe is NOT re-rendered (the caller is expected
  // to apply the visual change via postMessage for live preview).
  // Pass `silent: false` (or `reload: true`) when the mutation can't be
  // mirrored via postMessage and the iframe must be regenerated.
  const applyBlockDocChange = useCallback((
    mutate: (d: Document) => void,
    opts?: { reload?: boolean; immediate?: boolean },
  ) => {
    const d = blockWorkingDocRef.current;
    if (!d) return;
    pushBlockHistory();
    mutate(d);
    setBlockEditDirty(true);
    if (opts?.reload) {
      if (opts.immediate) {
        if (blockFlushTimerRef.current) { clearTimeout(blockFlushTimerRef.current); blockFlushTimerRef.current = null; }
        flushBlockDoc();
      } else {
        scheduleFlushBlockDoc();
      }
    }
  }, [pushBlockHistory, flushBlockDoc, scheduleFlushBlockDoc]);

  // Restore a serialized HTML snapshot into the working doc and refresh iframe.
  const restoreBlockSnapshot = useCallback((html: string) => {
    const { doc: parsedDoc } = parseLegalDocument(html);
    blockWorkingDocRef.current = parsedDoc;
    setViewDoc((prev: any) => prev ? { ...prev, html_content: serializeDocument(parsedDoc) } : prev);
    // Refresh selection meta if a block was selected
    setSelectedBlock((prev) => {
      if (!prev) return prev;
      const meta = getBlockMeta(parsedDoc, prev.id);
      return meta || null;
    });
    setBlockEditDirty(true);
  }, []);

  const handleBlockUndo = useCallback(() => {
    const d = blockWorkingDocRef.current;
    if (!d) return;
    const hist = blockHistoryRef.current;
    if (!hist.past.length) return;
    const current = serializeDocument(d);
    const prev = hist.past.pop()!;
    hist.future.push(current);
    if (hist.future.length > 50) hist.future.shift();
    restoreBlockSnapshot(prev);
    setBlockHistoryTick((t) => t + 1);
  }, [restoreBlockSnapshot]);

  const handleBlockRedo = useCallback(() => {
    const d = blockWorkingDocRef.current;
    if (!d) return;
    const hist = blockHistoryRef.current;
    if (!hist.future.length) return;
    const current = serializeDocument(d);
    const next = hist.future.pop()!;
    hist.past.push(current);
    if (hist.past.length > 50) hist.past.shift();
    restoreBlockSnapshot(next);
    setBlockHistoryTick((t) => t + 1);
  }, [restoreBlockSnapshot]);

  const canUndoBlock = blockHistoryRef.current.past.length > 0;
  const canRedoBlock = blockHistoryRef.current.future.length > 0;
  void blockHistoryTick; // ensure re-render when history changes


  // Listen for messages from the preview iframe (selection / editable changes / requested HTML / image clicked / block events)
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const data = e.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "legal-doc-selection" && !editMode && !imageRepositionMode && !blockEditMode) {
        const frameRect = previewFrameRef.current?.getBoundingClientRect();
        if (!frameRect) return;
        const top = frameRect.top + (data.rect?.bottom || 0) + 8;
        const left = frameRect.left + (data.rect?.left || 0);
        setSelection({ text: String(data.text || ""), top, left });
      } else if (data.type === "legal-doc-selection-cleared") {
        setSelection(null);
      } else if (data.type === "legal-doc-editable-changed") {
        setEditDirty(true);
      } else if (data.type === "legal-doc-image-clicked" && imageRepositionMode) {
        setEditorTarget({
          id: String(data.id || ""),
          src: String(data.src || ""),
          naturalWidth: Number(data.naturalWidth) || 0,
          naturalHeight: Number(data.naturalHeight) || 0,
          frameWidth: Number(data.frameWidth) || 0,
          frameHeight: Number(data.frameHeight) || 0,
          currentObjectPosition: String(data.currentObjectPosition || ""),
          currentTransform: String(data.currentTransform || ""),
        });
      } else if (blockEditMode && data.type === "legal-doc-block-selected") {
        const frameRect = previewFrameRef.current?.getBoundingClientRect();
        const d = blockWorkingDocRef.current;
        if (!frameRect || !d) return;
        const meta = getBlockMeta(d, String(data.id || ""));
        if (!meta) return;
        setSelectedBlock(meta);
        const r = data.rect || {};
        setSelectedBlockAnchor({
          top: frameRect.top + (r.top || 0),
          left: frameRect.left + (r.left || 0),
          right: frameRect.left + (r.right || 0),
          bottom: frameRect.top + (r.bottom || 0),
          width: r.width || 0,
        });
      } else if (blockEditMode && data.type === "legal-doc-block-deselected") {
        setSelectedBlock(null);
        setSelectedBlockAnchor(null);
      } else if (blockEditMode && data.type === "legal-doc-block-reorder" && Array.isArray(data.orderedIds)) {
        applyBlockDocChange((d) => reorderBlocks(d, data.orderedIds.map((x: any) => String(x))), { reload: true });
      } else if (blockEditMode && data.type === "legal-doc-figure-remove") {
        applyBlockDocChange((d) => removeFigure(d, String(data.blockId || ""), String(data.figureId || "")), { reload: true });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [editMode, imageRepositionMode, blockEditMode, applyBlockDocChange]);

  // Reset edit mode when closing dialog or switching docs
  useEffect(() => {
    if (!viewDoc) {
      setEditMode(false);
      setEditDirty(false);
      setImageRepositionMode(false);
      setImageRepositionDirty(false);
      setEditorTarget(null);
      setSelection(null);
      setBlockEditMode(false);
      setBlockEditDirty(false);
      setSelectedBlock(null);
      setSelectedBlockAnchor(null);
      blockWorkingDocRef.current = null;
    }
  }, [viewDoc?.id]);

  // ── In-document block editor: enter/exit/save/discard ──
  const handleToggleBlockEditMode = useCallback(() => {
    if (isSigned) {
      toast.error("Documento firmado: no se puede editar");
      return;
    }
    if (blockEditMode && blockEditDirty) {
      const ok = window.confirm("Tienes cambios sin guardar en los bloques. ¿Descartarlos?");
      if (!ok) return;
    }
    if (!blockEditMode) {
      // Entering: parse a fresh working doc from current html_content
      const { doc: parsedDoc } = parseLegalDocument(viewDoc?.html_content || "");
      blockWorkingDocRef.current = parsedDoc;
      blockHistoryRef.current = { past: [], future: [] };
      setBlockHistoryTick((t) => t + 1);
      // Push the (now tagged with data-block-id/data-figure-id) HTML to the iframe
      setViewDoc((prev: any) => prev ? { ...prev, html_content: serializeDocument(parsedDoc) } : prev);
      setBlockEditMode(true);
      setSidePanel(null);
      setSelection(null);
      setSelectedBlock(null);
      setSelectedBlockAnchor(null);
      setBlockEditDirty(false);
    } else {
      if (blockFlushTimerRef.current) { clearTimeout(blockFlushTimerRef.current); blockFlushTimerRef.current = null; }
      setBlockEditMode(false);
      setSelectedBlock(null);
      setSelectedBlockAnchor(null);
      blockWorkingDocRef.current = null;
      blockHistoryRef.current = { past: [], future: [] };
      setBlockEditDirty(false);
    }
  }, [blockEditMode, blockEditDirty, isSigned, viewDoc?.html_content]);

  const handleDiscardBlockEdit = useCallback(() => {
    if (blockEditDirty) {
      const ok = window.confirm("¿Descartar los cambios de bloques?");
      if (!ok) return;
    }
    if (blockFlushTimerRef.current) { clearTimeout(blockFlushTimerRef.current); blockFlushTimerRef.current = null; }
    setBlockEditMode(false);
    setBlockEditDirty(false);
    setSelectedBlock(null);
    setSelectedBlockAnchor(null);
    blockWorkingDocRef.current = null;
    blockHistoryRef.current = { past: [], future: [] };
    // Force iframe to revert to last persisted html
    loadDocuments();
  }, [blockEditDirty]);

  const handleSaveBlockEdit = useCallback(async () => {
    const d = blockWorkingDocRef.current;
    if (!viewDoc || !d) return;
    if (blockFlushTimerRef.current) { clearTimeout(blockFlushTimerRef.current); blockFlushTimerRef.current = null; }
    setSavingEdit(true);
    try {
      const finalHtml = serializeDocument(d);
      const { data, error } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "updateLegalDocument",
          sessionToken,
          documentId: viewDoc.id,
          html_content: finalHtml,
          change_description: "Edición visual de bloques",
        },
      });
      if (error || !data?.success) {
        toast.error(data?.error || error?.message || "Error al guardar");
        return;
      }
      toast.success("Bloques guardados");
      setBlockEditDirty(false);
      setBlockEditMode(false);
      setSelectedBlock(null);
      setSelectedBlockAnchor(null);
      blockWorkingDocRef.current = null;
      blockHistoryRef.current = { past: [], future: [] };
      setViewDoc({ ...viewDoc, html_content: finalHtml });
      loadDocuments();
    } finally {
      setSavingEdit(false);
    }
  }, [viewDoc, sessionToken]);

  // Live style change: mutate working doc + postMessage iframe (no reload).
  const handleBlockChangeStyle = useCallback((patch: BlockInlineStylePatch) => {
    if (!selectedBlock) return;
    const blockId = selectedBlock.id;
    // Mutate working doc silently (for save) — no iframe reload.
    applyBlockDocChange((d) => { setBlockInlineStyle(d, blockId, patch); });
    // Update popover meta from the freshly-mutated working doc.
    const d = blockWorkingDocRef.current;
    if (d) {
      const meta = getBlockMeta(d, blockId);
      if (meta) setSelectedBlock(meta);
    }
    // Apply visually live in the iframe.
    previewFrameRef.current?.contentWindow?.postMessage(
      { type: "legal-doc-block-apply-style", id: blockId, patch },
      "*",
    );
  }, [selectedBlock, applyBlockDocChange]);

  const handleBlockReset = useCallback(() => {
    if (!selectedBlock) return;
    const blockId = selectedBlock.id;
    applyBlockDocChange((d) => resetBlock(d, blockId));
    const d = blockWorkingDocRef.current;
    if (d) {
      const meta = getBlockMeta(d, blockId);
      if (meta) setSelectedBlock(meta);
    }
    previewFrameRef.current?.contentWindow?.postMessage(
      { type: "legal-doc-block-clear-styles", id: blockId },
      "*",
    );
  }, [selectedBlock, applyBlockDocChange]);

  const handleBlockRemove = useCallback(() => {
    if (!selectedBlock) return;
    const blockId = selectedBlock.id;
    applyBlockDocChange((d) => removeBlock(d, blockId), { reload: true });
    setSelectedBlock(null);
    setSelectedBlockAnchor(null);
    previewFrameRef.current?.contentWindow?.postMessage({ type: "legal-doc-clear-selection" }, "*");
  }, [selectedBlock, applyBlockDocChange]);

  const handleBlockMove = useCallback((delta: -1 | 1) => {
    if (!selectedBlock) return;
    const blockId = selectedBlock.id;
    applyBlockDocChange((d) => { moveBlockBy(d, blockId, delta); }, { reload: true, immediate: true });
  }, [selectedBlock, applyBlockDocChange]);

  const blockMovability = useMemo(() => {
    const d = blockWorkingDocRef.current;
    if (!d || !selectedBlock) return { canUp: false, canDown: false };
    return getBlockMovability(d, selectedBlock.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBlock, blockHistoryTick]);

  const handleBlockClosePopover = useCallback(() => {
    setSelectedBlock(null);
    setSelectedBlockAnchor(null);
    previewFrameRef.current?.contentWindow?.postMessage({ type: "legal-doc-clear-selection" }, "*");
  }, []);

  // Keyboard shortcuts: undo/redo while in block edit mode
  useEffect(() => {
    if (!blockEditMode) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) { e.preventDefault(); handleBlockUndo(); }
      else if ((key === "z" && e.shiftKey) || key === "y") { e.preventDefault(); handleBlockRedo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [blockEditMode, handleBlockUndo, handleBlockRedo]);

  const handleDocumentUpdated = (newHtml: string) => {
    if (viewDoc) setViewDoc({ ...viewDoc, html_content: newHtml });
    loadDocuments();
  };

  const handleApplySelection = async (instruction: string) => {
    if (!selection) return;
    const result = await runAIEdit({ instruccion: instruction, selected_text: selection.text });
    if (result.ok) {
      setSelection(null);
    } else {
      toast.error(result.error || "No se pudo aplicar el cambio");
    }
  };

  const handleToggleEditMode = () => {
    if (isSigned) {
      toast.error("Documento firmado: no se puede editar");
      return;
    }
    if (editMode && editDirty) {
      const ok = window.confirm("Tienes cambios sin guardar. ¿Descartarlos?");
      if (!ok) return;
    }
    setEditMode((v) => !v);
    setSidePanel(null);
    setSelection(null);
    setEditDirty(false);
  };

  const handleSaveManualEdit = async () => {
    if (!viewDoc || !previewFrameRef.current) return;
    setSavingEdit(true);
    try {
      const html: string = await new Promise((resolve) => {
        const onMsg = (e: MessageEvent) => {
          if (e.data?.type === "legal-doc-edited-html") {
            window.removeEventListener("message", onMsg);
            resolve(String(e.data.html || ""));
          }
        };
        window.addEventListener("message", onMsg);
        previewFrameRef.current?.contentWindow?.postMessage({ type: "legal-doc-request-html" }, "*");
        setTimeout(() => {
          window.removeEventListener("message", onMsg);
          resolve("");
        }, 3000);
      });

      if (!html) {
        toast.error("No se pudo extraer el contenido editado");
        return;
      }

      // Wrap edited fragments back into the original HTML shell so structure is preserved.
      // Strategy: replace the body of the original html_content with the new combined fragments.
      const original = viewDoc.html_content || "";
      const merged = original.replace(/(<body[^>]*>)([\s\S]*?)(<\/body>)/i, (_m, openTag, _inner, closeTag) => {
        return `${openTag}${html}${closeTag}`;
      });
      const finalHtml = merged !== original ? merged : html;

      const { data, error } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "updateLegalDocument",
          sessionToken,
          documentId: viewDoc.id,
          html_content: finalHtml,
          change_description: "Edición manual",
        },
      });
      if (error || !data?.success) {
        toast.error(data?.error || error?.message || "Error al guardar");
        return;
      }
      toast.success("Cambios guardados");
      setEditDirty(false);
      setEditMode(false);
      setViewDoc({ ...viewDoc, html_content: finalHtml });
      loadDocuments();
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDiscardManualEdit = () => {
    if (editDirty) {
      const ok = window.confirm("¿Descartar los cambios manuales?");
      if (!ok) return;
    }
    setEditMode(false);
    setEditDirty(false);
    // Force iframe reload by updating viewDoc reference (no-op change)
    if (viewDoc) setViewDoc({ ...viewDoc });
  };

  const handleToggleImageReposition = () => {
    if (isSigned) {
      toast.error("Documento firmado: no se puede editar");
      return;
    }
    if (imageRepositionMode && imageRepositionDirty) {
      const ok = window.confirm("Tienes cambios sin guardar en la posición de las imágenes. ¿Descartarlos?");
      if (!ok) return;
    }
    setImageRepositionMode((v) => !v);
    setSidePanel(null);
    setSelection(null);
    setImageRepositionDirty(false);
    setEditorTarget(null);
  };

  const sendImageApplyToFrame = useCallback((result: ImageEditorResult) => {
    const frameDocument = previewFrameRef.current?.contentDocument;
    const frameImage = frameDocument
      ? Array.from(frameDocument.querySelectorAll<HTMLImageElement>("img[data-legal-image-id]"))
          .find((img) => img.getAttribute("data-legal-image-id") === result.id) || null
      : null;

    if (frameImage) {
      frameImage.style.objectPosition = result.objectPosition;
      frameImage.style.transform = result.transform;
      frameImage.style.transformOrigin = "center center";
    }

    previewFrameRef.current?.contentWindow?.postMessage({
      type: "legal-doc-image-apply",
      id: result.id,
      objectPosition: result.objectPosition,
      transform: result.transform,
    }, "*");
  }, []);

  const handleEditorPreview = useCallback((result: ImageEditorResult) => {
    sendImageApplyToFrame(result);
  }, [sendImageApplyToFrame]);

  const handleEditorConfirm = useCallback((result: ImageEditorResult) => {
    sendImageApplyToFrame(result);
    setImageRepositionDirty(true);
    setEditorTarget(null);
  }, [sendImageApplyToFrame]);

  const handleEditorCancel = useCallback(() => {
    // Revert preview by re-applying the original style values from the target
    if (editorTarget) {
      previewFrameRef.current?.contentWindow?.postMessage({
        type: "legal-doc-image-apply",
        id: editorTarget.id,
        objectPosition: editorTarget.currentObjectPosition || "",
        transform: editorTarget.currentTransform || "",
      }, "*");
    }
    setEditorTarget(null);
  }, [editorTarget]);

  const handleSaveImageReposition = async () => {
    if (!viewDoc || !previewFrameRef.current) return;
    setSavingEdit(true);
    try {
      const html: string = await new Promise((resolve) => {
        const onMsg = (e: MessageEvent) => {
          if (e.data?.type === "legal-doc-edited-html") {
            window.removeEventListener("message", onMsg);
            resolve(String(e.data.html || ""));
          }
        };
        window.addEventListener("message", onMsg);
        previewFrameRef.current?.contentWindow?.postMessage({ type: "legal-doc-request-html" }, "*");
        setTimeout(() => {
          window.removeEventListener("message", onMsg);
          resolve("");
        }, 3000);
      });

      if (!html) {
        toast.error("No se pudo extraer el contenido editado");
        return;
      }

      const original = viewDoc.html_content || "";
      const merged = original.replace(/(<body[^>]*>)([\s\S]*?)(<\/body>)/i, (_m, openTag, _inner, closeTag) => {
        return `${openTag}${html}${closeTag}`;
      });
      const finalHtml = merged !== original ? merged : html;

      const { data, error } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "updateLegalDocument",
          sessionToken,
          documentId: viewDoc.id,
          html_content: finalHtml,
          change_description: "Reposición de imagen",
        },
      });
      if (error || !data?.success) {
        toast.error(data?.error || error?.message || "Error al guardar");
        return;
      }
      toast.success("Posición de imagen guardada");
      setImageRepositionDirty(false);
      setImageRepositionMode(false);
      setViewDoc({ ...viewDoc, html_content: finalHtml });
      loadDocuments();
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDiscardImageReposition = () => {
    if (imageRepositionDirty) {
      const ok = window.confirm("¿Descartar los cambios de posición de las imágenes?");
      if (!ok) return;
    }
    setImageRepositionMode(false);
    setImageRepositionDirty(false);
    if (viewDoc) setViewDoc({ ...viewDoc });
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setProgressState({
      open: true,
      phase: "preparing",
      percent: 1,
      title: "Regenerando documento legal",
      hint: "En cola, esperando turno…",
    });

    enqueueLegalDocJob({
      key: propuestaId,
      label: workerName ? `Regenerar — ${workerName}` : "Regenerar documento",
      run: async () => {
        setProgressState({
          open: true,
          phase: "preparing",
          percent: 2,
          title: "Regenerando documento legal",
          hint: "Preparando datos de la propuesta…",
        });
        try {
          // Extract REAL frames from any attached video before regenerating.
          const preResult = await preprocessVideosIfAny();
          if (preResult && preResult.totalVideos > 0) {
            if (preResult.totalFrames === 0) {
              const details = preResult.skippedReasons.length ? ` ${preResult.skippedReasons.join(" · ")}` : "";
              toast.error(`No se pudo extraer ningún fotograma real.${details}`, { duration: 9000 });
              closeProgress();
              return;
            } else {
              toast.success(`${preResult.totalFrames} fotograma(s) real(es) preparados para el documento`);
            }
          }

          setProgressState((s) => ({
            ...s,
            phase: "generating-document",
            percent: Math.max(s.percent, 65),
            title: "Regenerando documento legal",
            hint: "Redactando con la IA según el convenio…",
          }));

          const { data } = await supabase.functions.invoke("incidencias-operations", {
            body: { action: "generateLegalDocument", sessionToken, propuestaId, force_regenerate: true },
          });
          if (data?.success) {
            setProgressState((s) => ({ ...s, phase: "finalizing", percent: 95, hint: "Aplicando nuevas evidencias…" }));
            const regeneratedDocs = sortDocumentsByNewest(data?.documents || []);
            if (regeneratedDocs.length > 0) {
              setDocuments(regeneratedDocs);
              // Swap viewDoc to the freshly regenerated equivalent so the
              // preview reflects the new html_content AND the new font_delta
              // (which inherits the global default — usually +1.5).
              if (viewDoc) {
                const replacement =
                  regeneratedDocs.find((d: any) => !d.anulado && d.worker_id === viewDoc.worker_id) ||
                  regeneratedDocs.find((d: any) => !d.anulado) ||
                  null;
                if (replacement) setViewDoc(replacement);
              } else {
                const firstActive = regeneratedDocs.find((d: any) => !d.anulado) || null;
                if (firstActive) setViewDoc(firstActive);
              }
            } else {
              await loadDocuments();
            }
            setProgressState((s) => ({ ...s, percent: 100, hint: "Documento listo" }));
            setTimeout(closeProgress, 350);
            toast.success("Documento regenerado correctamente");
          } else {
            toast.error(data?.error || "Error al regenerar");
            closeProgress();
            throw new Error(data?.error || "regen_failed");
          }
        } catch (err) {
          toast.error("Error al regenerar documento");
          closeProgress();
          throw err;
        } finally {
          setRegenerating(false);
        }
      },
    });
  };

  const buildMiniPreviewSrcDoc = (raw: string) => {
    const baseHref = typeof window !== "undefined" ? `${window.location.origin}/` : "/";

    if (/<base\b/i.test(raw)) return raw;

    if (/<head[^>]*>/i.test(raw)) {
      return raw.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}">`);
    }

    return `<!DOCTYPE html><html><head><base href="${baseHref}"></head><body>${raw}</body></html>`;
  };

  const handlePreviewFrameLoad = async () => {
    const frameDocument = previewFrameRef.current?.contentDocument;
    if (!frameDocument) return;

    setPreviewFrameReady(false);

    try {
      await waitForLegalDocumentAssets(frameDocument);
    } finally {
      setPreviewFrameReady(true);
    }
  };

  // ── PDF Export: print the exact same iframe shown in preview ───────────
  const handleDownloadPdf = async () => {
    const previewWindow = previewFrameRef.current?.contentWindow;
    const previewDocument = previewFrameRef.current?.contentDocument;

    if (!viewDoc || !paginatedViewDoc?.pages.length || !previewWindow || !previewDocument || !previewFrameReady) {
      toast.error("La vista previa aún se está preparando");
      return;
    }

    setDownloadingPdf(true);

    try {
      await waitForLegalDocumentAssets(previewDocument);
      const pdfFileName = getLegalPdfFileName(viewDoc, paginatedViewDoc);
      previewDocument.title = pdfFileName.replace(/\.pdf$/i, "");

      await new Promise<void>((resolve) => {
        let finished = false;

        const finish = () => {
          if (finished) return;
          finished = true;
          previewWindow.removeEventListener("afterprint", finish);
          window.clearTimeout(fallbackTimeoutId);
          resolve();
        };

        const fallbackTimeoutId = window.setTimeout(finish, 1500);

        previewWindow.addEventListener("afterprint", finish, { once: true });
        previewWindow.focus();
        previewWindow.print();
      });
    } catch (err) {
      console.error(err);
      toast.error("Error al abrir la impresión del PDF");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const activeDocuments = sortDocumentsByNewest(documents.filter(d => !d.anulado));
  const hasDocument = activeDocuments.length > 0;

  if (loading) return null;
  const isAutoGenerating = autoRefresh && !hasDocument && !autoGenFailed && hasAiAnalysis;

  const renderPaginatedPreview = (srcDoc: string, height: number) => (
    <iframe
      ref={previewFrameRef}
      srcDoc={srcDoc}
      onLoad={handlePreviewFrameLoad}
      className="w-full border-0 bg-transparent"
      style={{ height, minHeight: Math.min(height || 0, LEGAL_A4_HEIGHT + 56) }}
      sandbox="allow-scripts allow-modals allow-same-origin"
      title="Vista previa del documento legal"
    />
  );

  // ── Miniature preview ──
  const renderMiniPreview = (raw: string) => {
    return (
      <div
        className="cursor-pointer group relative rounded-lg border border-border/60 overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow flex-shrink-0"
        style={{ width: 160, height: 210 }}
        onClick={() => { setViewDoc(activeDocuments[0]); setSidePanel(null); }}
      >
        <iframe
          srcDoc={buildMiniPreviewSrcDoc(raw)}
          style={{ width: 793, height: 1122, transform: 'scale(0.201)', transformOrigin: 'top left', pointerEvents: 'none', border: 'none', position: 'absolute', top: 0, left: 0 }}
          sandbox=""
          tabIndex={-1}
          title="Preview"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-2">
          <span className="text-white text-[9px] font-medium flex items-center gap-1"><Eye className="h-2.5 w-2.5" /> Abrir</span>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-3">
          {isAutoGenerating ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-1">
              <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
              <span>Generando documento legal automáticamente...</span>
            </div>
          ) : !hasDocument ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{hasAiAnalysis ? "Documento no generado" : "El documento legal se generará tras el análisis IA"}</span>
              <Button size="sm" variant="outline" className="h-6 rounded-lg text-[10px] gap-1" onClick={handleManualGenerate} disabled={regenerating || progressState.open}>
                <Sparkles className="h-3 w-3" /> {progressState.open ? "Generando..." : "Generar ahora"}
              </Button>
            </div>
          ) : (
            <>
              {renderMiniPreview(activeDocuments[0].html_content || '')}
              <div className="flex flex-col gap-1 pt-1 flex-1 min-w-0">
                <Button
                  size="sm" variant="ghost"
                  className="h-7 rounded-xl gap-1.5 text-xs text-muted-foreground hover:text-foreground justify-start"
                  onClick={() => { setViewDoc(activeDocuments[0]); setSidePanel(null); }}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Ver documento
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-1">Generado</Badge>
                </Button>
                <Button
                  size="sm" variant="ghost"
                  className="h-7 rounded-xl gap-1 text-[10px] text-muted-foreground hover:text-foreground justify-start"
                  onClick={handleRegenerate} disabled={regenerating || progressState.open}
                >
                  <RefreshCw className="h-3 w-3" />
                  Regenerar
                </Button>
                <Button
                  size="sm" variant="ghost"
                  className="h-7 rounded-xl gap-1 text-[10px] text-muted-foreground hover:text-foreground justify-start"
                  onClick={() => setAuditOpen((v) => !v)}
                >
                  <ImageIcon className="h-3 w-3" />
                  {auditOpen ? "Ocultar evidencias" : "Auditar evidencias del vídeo"}
                </Button>

                {/* Inline progress bar — sits in the dead space under the action buttons */}
                {progressState.open && (
                  <div className="pt-1.5">
                    <LegalDocumentProgressOverlay state={progressState} />
                  </div>
                )}

                {auditOpen && (
                  <div className="pt-2">
                    <VideoEvidenceAuditPanel propuestaId={propuestaId} compact />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* When there's no document yet, the progress bar lives under the row */}
        {!hasDocument && progressState.open && (
          <LegalDocumentProgressOverlay state={progressState} />
        )}
      </div>

      <Dialog open={!!viewDoc} onOpenChange={() => { setViewDoc(null); setSidePanel(null); setEditMode(false); setImageRepositionMode(false); setBlockEditMode(false); }}>
        <DialogContent hideCloseButton className="max-w-[95vw] max-h-[95vh] flex flex-col p-0 gap-0 overflow-hidden bg-neutral-200 dark:bg-neutral-800 border-none">
          <DialogHeader className="px-5 pt-4 pb-3 shrink-0 bg-neutral-100 dark:bg-neutral-900 border-b border-neutral-300 dark:border-neutral-700">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Gavel className="h-4 w-4" />
              Documento Legal
              {editMode && (
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-1 bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20">
                  Modo edición manual
                </Badge>
              )}
              {imageRepositionMode && (
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-1 bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20">
                  Reposicionar imagen — haz clic sobre una imagen
                </Badge>
              )}
              {blockEditMode && (
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-1 bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20">
                  Editar bloques — clic en un bloque o arrastra para mover
                </Badge>
              )}
              {isSigned && (
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-1">Firmado</Badge>
              )}
              <div className="ml-auto flex items-center gap-1">
                {editMode ? (
                  <>
                    <Button
                      size="sm" className="h-7 text-[11px] gap-1"
                      onClick={handleSaveManualEdit}
                      disabled={savingEdit || !editDirty}
                    >
                      {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      {savingEdit ? "Guardando…" : "Guardar"}
                    </Button>
                    <Button
                      variant="outline" size="sm" className="h-7 text-[11px] gap-1"
                      onClick={handleDiscardManualEdit}
                      disabled={savingEdit}
                    >
                      <XCircle className="h-3 w-3" />
                      Descartar
                    </Button>
                  </>
                ) : imageRepositionMode ? (
                  <>
                    <Button
                      size="sm" className="h-7 text-[11px] gap-1"
                      onClick={handleSaveImageReposition}
                      disabled={savingEdit || !imageRepositionDirty}
                    >
                      {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      {savingEdit ? "Guardando…" : "Guardar"}
                    </Button>
                    <Button
                      variant="outline" size="sm" className="h-7 text-[11px] gap-1"
                      onClick={handleDiscardImageReposition}
                      disabled={savingEdit}
                    >
                      <XCircle className="h-3 w-3" />
                      Descartar
                    </Button>
                  </>
                ) : blockEditMode ? (
                  <>
                    <Button
                      variant="outline" size="sm" className="h-7 w-7 p-0"
                      onClick={handleBlockUndo}
                      disabled={savingEdit || !canUndoBlock}
                      title="Deshacer (Ctrl/⌘+Z)"
                      aria-label="Deshacer"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline" size="sm" className="h-7 w-7 p-0"
                      onClick={handleBlockRedo}
                      disabled={savingEdit || !canRedoBlock}
                      title="Rehacer (Ctrl/⌘+Shift+Z)"
                      aria-label="Rehacer"
                    >
                      <Redo2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm" className="h-7 text-[11px] gap-1"
                      onClick={handleSaveBlockEdit}
                      disabled={savingEdit || !blockEditDirty}
                    >
                      {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      {savingEdit ? "Guardando…" : "Guardar"}
                    </Button>
                    <Button
                      variant="outline" size="sm" className="h-7 text-[11px] gap-1"
                      onClick={handleDiscardBlockEdit}
                      disabled={savingEdit}
                    >
                      <XCircle className="h-3 w-3" />
                      Descartar
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant={sidePanel === "chat" ? "default" : "outline"}
                      size="sm" className="h-7 text-[11px] gap-1"
                      onClick={() => setSidePanel(sidePanel === "chat" ? null : "chat")}
                    >
                      <MessageSquarePlus className="h-3 w-3" />
                      Editar con IA
                    </Button>
                    <Button
                      variant="outline" size="sm" className="h-7 text-[11px] gap-1"
                      onClick={handleToggleEditMode}
                      disabled={isSigned}
                      title={isSigned ? "Documento firmado, no editable" : "Editar texto manualmente"}
                    >
                      <Pencil className="h-3 w-3" />
                      Editar texto
                    </Button>
                    <Button
                      variant="outline" size="sm" className="h-7 text-[11px] gap-1"
                      onClick={handleToggleImageReposition}
                      disabled={isSigned}
                      title={isSigned ? "Documento firmado, no editable" : "Arrastra las imágenes para ajustar qué parte se ve"}
                    >
                      <Move className="h-3 w-3" />
                      Reposicionar imagen
                    </Button>
                    {propuestaEstado === 'pendiente' && (
                      <Button
                        variant="outline"
                        size="sm" className="h-7 text-[11px] gap-1"
                        onClick={handleToggleBlockEditMode}
                        disabled={isSigned}
                        title={isSigned ? "Documento firmado, no editable" : "Reordenar bloques, ajustar márgenes y eliminar elementos directamente sobre el documento"}
                      >
                        <Blocks className="h-3 w-3" />
                        Editar bloques
                      </Button>
                    )}
                    <Button
                      variant={sidePanel === "history" ? "default" : "outline"}
                      size="sm" className="h-7 text-[11px] gap-1"
                      onClick={() => setSidePanel(sidePanel === "history" ? null : "history")}
                    >
                      <Clock className="h-3 w-3" />
                      Historial
                    </Button>

                    {/* Live font-size tweak — preview only, doesn't change saved HTML */}
                    <div
                      className="flex items-center gap-0.5 rounded-md border border-input bg-background h-7 px-1"
                      title="Ajustar tamaño de letra (solo vista previa, no modifica el documento)"
                    >
                      <Type className="h-3 w-3 text-muted-foreground mx-0.5" />
                      <Button
                        variant="ghost" size="sm"
                        className="h-5 w-5 p-0 text-[12px] leading-none"
                        onClick={() => setFontDelta(Math.max(FONT_DELTA_MIN, +(effectiveFontDelta - FONT_DELTA_STEP).toFixed(1)))}
                        disabled={effectiveFontDelta <= FONT_DELTA_MIN}
                        title="Reducir 0.5 px"
                      >
                        −
                      </Button>
                      <button
                        type="button"
                        onClick={() => setFontDelta(0)}
                        className="text-[10px] tabular-nums w-9 text-center text-muted-foreground hover:text-foreground transition-colors"
                        title="Restablecer tamaño original"
                      >
                        {effectiveFontDelta === 0 ? "0" : (effectiveFontDelta > 0 ? `+${effectiveFontDelta}` : effectiveFontDelta)}
                      </button>
                      <Button
                        variant="ghost" size="sm"
                        className="h-5 w-5 p-0 text-[12px] leading-none"
                        onClick={() => setFontDelta(Math.min(FONT_DELTA_MAX, +(effectiveFontDelta + FONT_DELTA_STEP).toFixed(1)))}
                        disabled={effectiveFontDelta >= FONT_DELTA_MAX}
                        title="Aumentar 0.5 px"
                      >
                        +
                      </Button>
                    </div>

                    <Button
                      variant="outline" size="sm" className="h-7 text-[11px] gap-1"
                      onClick={handleDownloadPdf}
                      disabled={downloadingPdf || paginatingViewDoc || !previewSrcDoc || !previewFrameReady}
                    >
                      {downloadingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                      {downloadingPdf ? "Abriendo..." : "PDF"}
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => { setViewDoc(null); setSidePanel(null); setEditMode(false); setImageRepositionMode(false); setBlockEditMode(false); }}>
                  Cerrar
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 flex overflow-hidden">
            <div className="flex-1 min-w-0 overflow-auto py-6 px-4">
              {paginatingViewDoc ? (
                <div className="flex items-center justify-center py-16 text-sm text-muted-foreground gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Paginando vista previa…
                </div>
              ) : previewSrcDoc ? (
                renderPaginatedPreview(previewSrcDoc, previewFrameHeight)
              ) : (
                <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                  No se pudo renderizar la vista previa.
                </div>
              )}
            </div>

            {sidePanel && viewDoc && !editMode && !imageRepositionMode && !blockEditMode && (
              <div className="shrink-0 border-l border-neutral-300 dark:border-neutral-700 bg-background overflow-hidden flex flex-col min-h-0 w-[340px]">
                {sidePanel === "chat" ? (
                  <LegalDocumentEditChat
                    documentId={viewDoc.id}
                    htmlContent={viewDoc.html_content || ''}
                    onDocumentUpdated={handleDocumentUpdated}
                    onRegenerateWithEvidence={handleRegenerate}
                    regeneratingEvidence={regenerating || progressState.open}
                  />
                ) : (
                  <LegalDocumentVersionHistory
                    documentId={viewDoc.id}
                    onPreviewVersion={(html) => setViewDoc({ ...viewDoc, html_content: html })}
                    onRestored={() => { loadDocuments(); setSidePanel(null); }}
                  />
                )}
              </div>
            )}
          </div>

          {selection && viewDoc && !editMode && !imageRepositionMode && !blockEditMode && (
            <LegalSelectionPopover
              selectedText={selection.text}
              position={{ top: selection.top, left: selection.left }}
              running={aiSelectionRunning}
              onApply={handleApplySelection}
              onClose={() => setSelection(null)}
            />
          )}

          {blockEditMode && selectedBlock && selectedBlockAnchor && (
            <LegalDocumentInDocBlockControls
              block={selectedBlock}
              anchor={selectedBlockAnchor}
              onChangeStyle={handleBlockChangeStyle}
              onResetBlock={handleBlockReset}
              onRemoveBlock={handleBlockRemove}
              onMoveUp={() => handleBlockMove(-1)}
              onMoveDown={() => handleBlockMove(1)}
              canMoveUp={blockMovability.canUp}
              canMoveDown={blockMovability.canDown}
              onClose={handleBlockClosePopover}
            />
          )}
        </DialogContent>
      </Dialog>

      <LegalDocumentImageEditorDialog
        open={!!editorTarget}
        target={editorTarget}
        onCancel={handleEditorCancel}
        onConfirm={handleEditorConfirm}
        onPreview={handleEditorPreview}
      />

    </>
  );
}
