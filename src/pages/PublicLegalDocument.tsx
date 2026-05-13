import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Loader2, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { paginateLegalDocument } from "@/components/incidencias/legalDocumentPagination";
import { buildLegalPreviewSrcDoc } from "@/components/incidencias/legalDocumentPreview";
import { openLegalDocumentPrintPreviewFromSrcDoc } from "@/components/incidencias/legalDocumentPdf";

const SUPABASE_URL = "https://ipjffhwglbokzlunxgju.supabase.co";

/**
 * Public viewer for a legal sanction/amonestación document linked from email.
 *
 * IMPORTANT: This page MUST mirror exactly the "Imprimir" flow used in
 * AdminTareasTab so the preview, the print dialog and the resulting PDF look
 * identical (A4 pagination, header/footer per page, margins, fonts).
 *
 * Steps:
 *   1) Fetch the raw HTML legal document via public-actions (mode=raw).
 *   2) Run it through `paginateLegalDocument` to get A4 pages.
 *   3) Render the result with `buildLegalPreviewSrcDoc` (same paginated
 *      preview component used inside the admin panel) inside an iframe.
 *   4) "Descargar PDF" calls `openLegalDocumentPrintPreviewFromSrcDoc`, the
 *      exact same helper the admin uses → identical print dialog & layout.
 */
export default function PublicLegalDocument() {
  const { token } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const autoPrint = params.get("print") === "1";

  const [rawHtml, setRawHtml] = useState<string | null>(null);
  const [previewSrcDoc, setPreviewSrcDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [fileName, setFileName] = useState<string>("documento");
  const autoPrintFiredRef = useRef(false);

  const meta = useMemo(() => {
    if (!rawHtml) return null;
    const get = (key: string) => {
      const m = new RegExp(`data-${key}="([^"]*)"`, "i").exec(rawHtml);
      return m ? m[1] : "";
    };
    return {
      documentCode: get("document-code"),
      tipoLabel: get("tipo"),
      workerName: get("worker-name"),
      workerNumber: get("worker-number"),
      fecha: get("fecha"),
    };
  }, [rawHtml]);

  // 1) Fetch raw HTML
  useEffect(() => {
    if (!token || token.length < 32) {
      setError("Enlace no válido.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const url = `${SUPABASE_URL}/functions/v1/public-actions?attachmentToken=${encodeURIComponent(token)}&mode=raw`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`No se pudo cargar el documento (${res.status}).`);
        const text = await res.text();
        const dispo = res.headers.get("content-disposition") || "";
        const match = dispo.match(/filename="?([^";]+)"?/i);
        if (match?.[1]) setFileName(match[1].replace(/\.html?$/i, ""));
        if (!cancelled) setRawHtml(text);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "No se pudo cargar el documento.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // 2 + 3) Paginate raw HTML and build the same srcDoc used in the admin panel
  useEffect(() => {
    if (!rawHtml || !meta) return;
    let cancelled = false;
    (async () => {
      try {
        const paginated = await paginateLegalDocument(rawHtml, {
          documentCode: meta.documentCode,
          tipoLabel: meta.tipoLabel,
          workerName: meta.workerName,
          workerNumber: meta.workerNumber,
          fecha: meta.fecha,
        });
        if (!paginated.pages.length) {
          throw new Error("Documento vacío.");
        }
        const src = buildLegalPreviewSrcDoc(paginated, fileName);
        if (!cancelled) {
          setPreviewSrcDoc(src);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "No se pudo preparar el documento.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rawHtml, meta, fileName]);

  const pdfFileName = useMemo(() => {
    const tipo = (meta?.tipoLabel || "").toLowerCase().includes("amonest")
      ? "Amonestación"
      : (meta?.tipoLabel || "").toLowerCase().includes("sanc")
        ? "Sanción"
        : "Documento";
    const name = (meta?.workerName || "Trabajador").trim();
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, "0");
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const yy = String(today.getFullYear()).slice(-2);
    return `${tipo} - ${name} (${dd}-${mm}-${yy}).pdf`;
  }, [meta]);

  const handleDownloadPdf = async () => {
    if (!previewSrcDoc) return;
    setPrinting(true);
    try {
      await openLegalDocumentPrintPreviewFromSrcDoc(previewSrcDoc, pdfFileName);
    } catch (e: any) {
      setError(e?.message || "No se pudo abrir el diálogo de impresión.");
    } finally {
      setPrinting(false);
    }
  };

  // Auto-print when ?print=1 is present (used by the email's "descargar
  // directamente en PDF" link).
  useEffect(() => {
    if (!autoPrint || !previewSrcDoc || autoPrintFiredRef.current) return;
    autoPrintFiredRef.current = true;
    const t = window.setTimeout(() => {
      handleDownloadPdf();
    }, 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrint, previewSrcDoc]);

  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-900"
      style={{ fontFamily: "Poppins, Inter, system-ui, -apple-system, sans-serif" }}
    >
      <div className="mx-auto max-w-[980px] px-4 pt-6 pb-10 md:px-6 md:pt-8">
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 md:px-6 md:py-5 flex items-center gap-3 border-b border-slate-100">
            <div className="h-9 w-9 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-[15px] font-semibold tracking-tight text-slate-900 truncate">
                Documento de la sanción
              </h1>
              <p className="text-[12px] text-slate-500 mt-0.5 truncate">
                Definitivo, pendiente de firma del trabajador
              </p>
            </div>
            <div className="hidden md:block">
              <Button
                onClick={handleDownloadPdf}
                disabled={!previewSrcDoc || printing}
                size="sm"
                className="rounded-full bg-amber-600 hover:bg-amber-700 text-white"
              >
                {printing ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                )}
                Descargar PDF
              </Button>
            </div>
          </div>

          <div className="md:hidden px-5 py-3 border-b border-slate-100 bg-slate-50/50">
            <Button
              onClick={handleDownloadPdf}
              disabled={!previewSrcDoc || printing}
              size="sm"
              className="rounded-full w-full bg-amber-600 hover:bg-amber-700 text-white"
            >
              {printing ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 mr-1.5" />
              )}
              Descargar PDF
            </Button>
          </div>

          <div className="bg-slate-100 p-3 md:p-4">
            {loading && !error && (
              <div className="flex items-center justify-center py-20 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Cargando documento…
              </div>
            )}
            {error && (
              <div className="rounded-xl bg-white border border-rose-200 p-6 text-center text-rose-700 text-sm">
                {error}
              </div>
            )}
            {previewSrcDoc && !error && (
              <iframe
                title={fileName}
                srcDoc={previewSrcDoc}
                className="w-full bg-slate-100 rounded-xl border border-slate-200 shadow-sm"
                style={{ height: "82vh" }}
              />
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-4">
          Pulsa <strong className="text-slate-500">Descargar PDF</strong> para guardarlo. Si el diálogo de
          impresión no se abre, usa Ctrl/Cmd + P.
        </p>
      </div>
    </div>
  );
}
