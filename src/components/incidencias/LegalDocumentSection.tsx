import { useState, useEffect, useRef } from "react";
import { FileText, Sparkles, Loader2, Eye, Download, PenTool, Send, Ban, ChevronUp, ChevronDown } from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitize";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SignaturePad } from "@/components/SignaturePad";
import { SignDialog } from "@/components/incidencias/SignDialog";

interface Props {
  propuestaId: string;
  propuestaEstado: string;
}

export function LegalDocumentSection({ propuestaId, propuestaEstado }: Props) {
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [viewDoc, setViewDoc] = useState<any>(null);
  const [signDoc, setSignDoc] = useState<any>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [emailDialog, setEmailDialog] = useState<any>(null);
  const [emailAddress, setEmailAddress] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [annulDialog, setAnnulDialog] = useState<any>(null);
  const [annulMotivo, setAnnulMotivo] = useState("");
  const [annulling, setAnnulling] = useState(false);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "getLegalDocuments", sessionToken, propuestaId },
      });
      setDocuments(data?.documents || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { loadDocuments(); }, [propuestaId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "generateLegalDocument", sessionToken, propuestaId },
      });
      if (data?.success) {
        toast.success(`${data.documents?.length || 0} documento(s) generado(s)`);
        loadDocuments();
      } else {
        toast.error(data?.error || "Error al generar");
      }
    } catch { toast.error("Error al generar documento"); }
    finally { setGenerating(false); }
  };

  const handleViewDocument = (doc: any) => {
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(doc.html_content);
      w.document.close();
    } else {
      setViewDoc(doc);
    }
  };

  const handleDownload = (doc: any) => {
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(doc.html_content);
      w.document.close();
      setTimeout(() => w.print(), 500);
    }
  };

  const handleSign = async () => {
    if (!signDoc || !signatureData) return;
    setSigning(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "signLegalDocument", sessionToken, documentId: signDoc.id, signatureBase64: signatureData },
      });
      if (data?.success) {
        toast.success("Documento firmado correctamente");
        setSignDoc(null);
        setSignatureData(null);
        // Reload documents in background
        loadDocuments();
      } else {
        toast.error(data?.error || "Error al firmar");
      }
    } catch { toast.error("Error al firmar"); }
    finally { setSigning(false); }
  };

  const handleRejectSignature = async () => {
    if (!signDoc) return;
    setSigning(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "rejectSignature", sessionToken, documentId: signDoc.id },
      });
      if (data?.success) {
        toast.success("Firma rechazada");
        setSignDoc(null);
        loadDocuments();
      } else {
        toast.error(data?.error || "Error");
      }
    } catch { toast.error("Error"); }
    finally { setSigning(false); }
  };

  const handleSendEmail = async () => {
    if (!emailDialog || !emailAddress.trim()) return;
    setSendingEmail(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "sendLegalDocumentCopy", sessionToken, documentId: emailDialog.id, email: emailAddress.trim() },
      });
      if (data?.success) {
        toast.success("Copia enviada por email");
        setEmailDialog(null);
        setEmailAddress("");
        loadDocuments();
      } else {
        toast.error(data?.error || "Error al enviar");
      }
    } catch { toast.error("Error al enviar email"); }
    finally { setSendingEmail(false); }
  };

  const handleAnnul = async () => {
    if (!annulDialog || !annulMotivo.trim()) return;
    setAnnulling(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "annulLegalDocument", sessionToken, documentId: annulDialog.id, motivo: annulMotivo.trim() },
      });
      if (data?.success) {
        toast.success("Documento anulado");
        setAnnulDialog(null);
        setAnnulMotivo("");
        loadDocuments();
      } else {
        toast.error(data?.error || "Error");
      }
    } catch { toast.error("Error al anular"); }
    finally { setAnnulling(false); }
  };

  const canGenerate = ['pendiente', 'aprobada', 'enviada'].includes(propuestaEstado);

  if (loading) return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Documento Legal</p>

      {documents.length === 0 && canGenerate && (
        <Button size="sm" variant="outline" className="h-7 rounded-xl gap-1 text-xs" onClick={handleGenerate} disabled={generating}>
          {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <><FileText className="h-3 w-3" /><Sparkles className="h-3 w-3" /></>}
          Generar Documento Legal
        </Button>
      )}

      {documents.map((doc: any) => {
        const statusColor = doc.anulado ? '#9ca3af' : doc.firmado ? '#22c55e' : '#f59e0b';
        const statusLabel = doc.anulado ? 'Anulado' : doc.firmado ? 'Firmado' : 'Pendiente firma';

        return (
          <div key={doc.id} className="border border-border/50 rounded-xl p-3 space-y-2 bg-muted/20">
            <div className="flex items-center gap-2 flex-wrap">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium truncate">{doc.worker_name}</span>
              <Badge className="text-[10px] px-2 py-0" style={{ backgroundColor: statusColor + '20', color: statusColor }}>{statusLabel}</Badge>
              {doc.email_enviado && <Badge variant="secondary" className="text-[10px] px-2 py-0">📧 Enviado</Badge>}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <Button size="sm" variant="ghost" className="h-6 rounded-lg text-[10px] px-2 gap-1" onClick={() => handleViewDocument(doc)}>
                <Eye className="h-3 w-3" /> Ver
              </Button>
              <Button size="sm" variant="ghost" className="h-6 rounded-lg text-[10px] px-2 gap-1" onClick={() => handleDownload(doc)}>
                <Download className="h-3 w-3" /> PDF
              </Button>
              {!doc.firmado && !doc.anulado && (
                <Button size="sm" variant="ghost" className="h-6 rounded-lg text-[10px] px-2 gap-1 text-primary" onClick={() => { setSignDoc(doc); setSignatureData(null); }}>
                  <PenTool className="h-3 w-3" /> Firmar
                </Button>
              )}
              {doc.firmado && !doc.email_enviado && (
                <Button size="sm" variant="ghost" className="h-6 rounded-lg text-[10px] px-2 gap-1" onClick={() => { setEmailDialog(doc); setEmailAddress(""); }}>
                  <Send className="h-3 w-3" /> Enviar copia
                </Button>
              )}
              {!doc.anulado && (
                <Button size="sm" variant="ghost" className="h-6 rounded-lg text-[10px] px-2 gap-1 text-destructive" onClick={() => { setAnnulDialog(doc); setAnnulMotivo(""); }}>
                  <Ban className="h-3 w-3" /> Anular
                </Button>
              )}
            </div>
          </div>
        );
      })}

      {/* Sign Dialog */}
      <SignDialog
        signDoc={signDoc}
        onClose={() => setSignDoc(null)}
        signatureData={signatureData}
        setSignatureData={setSignatureData}
        signing={signing}
        onSign={handleSign}
        onReject={handleRejectSignature}
      />

      {/* View Dialog (fallback) */}
      <Dialog open={!!viewDoc} onOpenChange={open => !open && setViewDoc(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(viewDoc?.html_content || '') }} />
        </DialogContent>
      </Dialog>

      {/* Email Dialog */}
      <Dialog open={!!emailDialog} onOpenChange={open => !open && setEmailDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar copia — {emailDialog?.worker_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Email del trabajador" value={emailAddress} onChange={e => setEmailAddress(e.target.value)} className="rounded-xl" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialog(null)}>Cancelar</Button>
            <Button onClick={handleSendEmail} disabled={sendingEmail || !emailAddress.trim()}>
              {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Annul Dialog */}
      <Dialog open={!!annulDialog} onOpenChange={open => !open && setAnnulDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular documento — {annulDialog?.worker_name}</DialogTitle>
          </DialogHeader>
          <Textarea placeholder="Motivo de anulación (obligatorio)..." value={annulMotivo} onChange={e => setAnnulMotivo(e.target.value)} className="rounded-xl" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnnulDialog(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleAnnul} disabled={annulling || !annulMotivo.trim()}>
              {annulling ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Anular'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
