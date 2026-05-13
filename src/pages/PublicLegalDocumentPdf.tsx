import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { paginateLegalDocument } from "@/components/incidencias/legalDocumentPagination";
import { buildLegalPreviewSrcDoc } from "@/components/incidencias/legalDocumentPreview";
import { openLegalDocumentPrintPreviewFromSrcDoc } from "@/components/incidencias/legalDocumentPdf";

const SUPABASE_URL = "https://ipjffhwglbokzlunxgju.supabase.co";

/**
 * Direct-to-print landing page used by the email link
 * "descargar directamente en PDF". Renders an almost blank screen and
 * triggers the browser's native print/save dialog as soon as the document
 * is ready — without showing the full preview UI.
 *
 * Pipeline mirrors exactly the "Imprimir" flow used in the admin panel:
 *   1) Fetch raw HTML from public-actions (mode=raw).
 *   2) Run paginateLegalDocument + buildLegalPreviewSrcDoc.
 *   3) Call openLegalDocumentPrintPreviewFromSrcDoc → browser print dialog.
 */
export default function PublicLegalDocumentPdf() {
  const { token } = useParams<{ token: string }>();

  const [rawHtml, setRawHtml] = useState<string | null>(null);
  const [previewSrcDoc, setPreviewSrcDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "fired">("loading");
  const [fileName, setFileName] = useState<string>("documento");
  const printedRef = useRef(false);

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

  // 2 + 3) Build srcDoc
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
        if (!cancelled) setPreviewSrcDoc(src);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "No se pudo preparar el documento.");
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

  const triggerPrint = async () => {
    if (!previewSrcDoc) return;
    try {
      await openLegalDocumentPrintPreviewFromSrcDoc(previewSrcDoc, pdfFileName);
      setStatus("fired");
    } catch (e: any) {
      setError(e?.message || "No se pudo abrir el diálogo de impresión.");
    }
  };

  // Auto-fire the print dialog as soon as the doc is ready
  useEffect(() => {
    if (!previewSrcDoc || printedRef.current) return;
    printedRef.current = true;
    setStatus("ready");
    // Tiny delay so the loader is visible before the dialog grabs focus
    const t = window.setTimeout(() => {
      triggerPrint();
    }, 150);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewSrcDoc]);

  return (
    <div
      className="min-h-screen bg-white text-slate-800 flex items-center justify-center px-4"
      style={{ fontFamily: "Poppins, Inter, system-ui, -apple-system, sans-serif" }}
    >
      <div className="max-w-sm w-full text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center mb-4">
          <FileText className="h-5 w-5" />
        </div>

        {error ? (
          <>
            <h1 className="text-[15px] font-semibold text-slate-900 mb-2">
              No se pudo abrir el PDF
            </h1>
            <p className="text-[13px] text-rose-600 mb-5">{error}</p>
            {token ? (
              <Link
                to={`/doc/${token}`}
                className="text-[13px] text-amber-700 underline underline-offset-2"
              >
                Ver documento
              </Link>
            ) : null}
          </>
        ) : status === "fired" ? (
          <>
            <h1 className="text-[15px] font-semibold text-slate-900 mb-2">
              Documento listo
            </h1>
            <p className="text-[13px] text-slate-500 mb-5">
              Si el diálogo de guardado no se ha abierto, pulsa Reintentar.
            </p>
            <div className="flex flex-col gap-2 items-center">
              <Button
                onClick={triggerPrint}
                size="sm"
                className="rounded-full bg-amber-600 hover:bg-amber-700 text-white"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Reintentar
              </Button>
              {token ? (
                <Link
                  to={`/doc/${token}`}
                  className="text-[12px] text-slate-500 underline underline-offset-2"
                >
                  Ver documento
                </Link>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-amber-700 mx-auto mb-3" />
            <p className="text-[13px] text-slate-500">
              {status === "ready" ? "Abriendo diálogo de guardado…" : "Preparando PDF…"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
