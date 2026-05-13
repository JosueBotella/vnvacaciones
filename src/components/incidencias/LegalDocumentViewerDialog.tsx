import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { paginateLegalDocument, type PaginatedLegalDocumentResult } from "./legalDocumentPagination";
import { buildLegalPreviewSrcDoc } from "./legalDocumentPreview";
import { downloadLegalPdfFromSrcDoc } from "./legalDocumentPdf";
import { toast } from "sonner";

interface LegalDocLite {
  id?: string;
  pdf_url?: string | null;
  draft_pdf_url?: string | null;
  scanned_signed_pdf_url?: string | null;
  html_content?: string | null;
  firmado?: boolean;
  tipo?: string | null;
  gravedad_final?: string | null;
  dias_suspension?: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  legalDocument: LegalDocLite | null;
  workerName?: string;
}

const tipoLabel = (tipo?: string | null, grav?: string | null) => {
  if (!tipo) return "Documento";
  if (tipo === "amonestacion") return "Amonestación";
  if (tipo === "sancion") {
    const g = grav === "muy_grave" ? "muy grave" : grav || "";
    return `Sanción${g ? ` ${g}` : ""}`;
  }
  if (tipo === "nspp") return "NSPP";
  return tipo;
};

export function LegalDocumentViewerDialog({ open, onOpenChange, legalDocument, workerName }: Props) {
  const firmado = !!legalDocument?.firmado;
  // If signed, prefer the scanned signed PDF (post-split). Otherwise render HTML.
  const url = firmado
    ? legalDocument?.scanned_signed_pdf_url || legalDocument?.pdf_url || legalDocument?.draft_pdf_url || null
    : legalDocument?.draft_pdf_url || legalDocument?.pdf_url || null;
  const html = legalDocument?.html_content || null;


  const [paginated, setPaginated] = useState<PaginatedLegalDocumentResult | null>(null);
  const [downloading, setDownloading] = useState(false);

  const safeName = (workerName || "documento").replace(/[^a-z0-9_-]+/gi, "_");
  const downloadName = `Doc_${legalDocument?.tipo || "legal"}_${safeName}_${firmado ? "firmado" : "sin_firmar"}.pdf`;

  useEffect(() => {
    let cancelled = false;
    if (!open || url || !html) {
      setPaginated(null);
      return;
    }
    paginateLegalDocument(html, { workerName })
      .then((res) => { if (!cancelled) setPaginated(res); })
      .catch(() => { if (!cancelled) setPaginated(null); });
    return () => { cancelled = true; };
  }, [open, url, html, workerName]);

  const srcDoc = useMemo(() => {
    if (!paginated?.pages.length) return "";
    return buildLegalPreviewSrcDoc(paginated, downloadName, {});
  }, [paginated, downloadName]);

  const handleDownloadFromHtml = async () => {
    if (!srcDoc) return;
    setDownloading(true);
    try {
      await downloadLegalPdfFromSrcDoc(srcDoc, downloadName);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo descargar el PDF");
    } finally {
      setDownloading(false);
    }
  };

  const hasContent = !!(url || srcDoc);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] p-0 overflow-hidden rounded-2xl flex flex-col">
        <DialogHeader className="px-5 pt-4 pb-3 border-b">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <DialogTitle className="text-sm font-semibold truncate">
                {workerName || "Documento legal"}
              </DialogTitle>
              <Badge variant="outline" className="text-[10px] px-2 py-0 shrink-0">
                {tipoLabel(legalDocument?.tipo, legalDocument?.gravedad_final)}
                {legalDocument?.dias_suspension ? ` · ${legalDocument.dias_suspension}d` : ""}
              </Badge>
              <Badge
                className={cn(
                  "text-[10px] px-2 py-0 gap-1 shrink-0 border",
                  firmado
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
                )}
              >
                {firmado ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                {firmado ? "Firmado" : "Sin firmar"}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 mr-6">
              {url ? (
                <>
                  <Button asChild size="sm" variant="outline" className="h-8 rounded-lg gap-1.5 text-xs">
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" /> Abrir
                    </a>
                  </Button>
                  <Button asChild size="sm" className="h-8 rounded-lg gap-1.5 text-xs">
                    <a href={url} download={downloadName} target="_blank" rel="noopener noreferrer">
                      <Download className="h-3.5 w-3.5" /> Descargar
                    </a>
                  </Button>
                </>
              ) : srcDoc ? (
                <Button
                  size="sm"
                  className="h-8 rounded-lg gap-1.5 text-xs"
                  onClick={handleDownloadFromHtml}
                  disabled={downloading}
                >
                  {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Descargar
                </Button>
              ) : null}
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 bg-muted/30 overflow-hidden">
          {url ? (
            <iframe src={url} title="Documento legal" className="w-full h-full border-0 bg-white" />
          ) : srcDoc ? (
            <iframe srcDoc={srcDoc} title="Documento legal" className="w-full h-full border-0 bg-white" />
          ) : html ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <FileText className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                No hay documento legal generado todavía para esta incidencia.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
