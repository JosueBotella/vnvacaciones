import { useState, useEffect, useCallback, useRef } from "react";
import { ListTodo, Clock, AlertTriangle, Scale, Mail, Check, X, Loader2, CheckCircle, Zap, PenTool, LayoutList, Columns3, ExternalLink, Send, Eraser, Users, Download, CheckSquare, Printer, Camera, Image, Bot, Eye, Plus, Trash2, Star, FileCheck, ScanLine, FileText } from "lucide-react";
import { LegalDocumentEditChat } from "./LegalDocumentEditChat";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow, isToday, isThisWeek, isThisMonth, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { sanitizeHtml } from "@/lib/sanitize";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { paginateLegalDocument } from "./legalDocumentPagination";
import { buildLegalPreviewSrcDoc } from "./legalDocumentPreview";
import { openLegalDocumentPrintPreviewFromSrcDoc } from "./legalDocumentPdf";
import { PDFDocument } from "pdf-lib";

interface Task {
  id: string;
  department_id: string;
  department_name: string;
  type: string;
  ref_id: string | null;
  title: string;
  description: string | null;
  status: string;
  completed_by: string | null;
  completed_at: string | null;
  due_at: string | null;
  created_at: string;
  worker_name?: string;
  worker_number?: string;
  html_content?: string;
  email_destinatario?: string;
  firmado?: boolean;
  legal_document_id?: string;
  pdf_url?: string | null;
  printed_at?: string | null;
  signed_photo_url?: string | null;
  signed_photo_urls?: string[];
  scanned_signed_pdf_url?: string | null;
  gravedad_final?: string | null;
  document_created_at?: string | null;
  incident_date?: string | null;
  documento_tipo?: 'amonestacion' | 'sancion' | null;
  font_delta?: number;
  suspension_dias?: number | null;
  suspension_fecha_inicio?: string | null;
}

// Calcula el día máximo en que el trabajador puede firmar una sanción con
// suspensión de empleo y sueldo: el día laborable anterior al inicio de la suspensión.
function getSignatureDeadline(task: Task): { deadlineDate: Date; label: string; suspStartLabel: string; isToday: boolean; isOverdue: boolean; daysLeft: number } | null {
  if (task.documento_tipo !== 'sancion') return null;
  if (!task.suspension_dias || task.suspension_dias <= 0) return null;
  if (!task.suspension_fecha_inicio) return null;

  // Parse YYYY-MM-DD as local date (no UTC shift)
  const parts = task.suspension_fecha_inicio.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const suspStart = new Date(parts[0], parts[1] - 1, parts[2]);

  // Retroceder 1 día y saltar fines de semana hacia atrás
  const deadline = new Date(suspStart);
  deadline.setDate(deadline.getDate() - 1);
  while (deadline.getDay() === 0 || deadline.getDay() === 6) {
    deadline.setDate(deadline.getDate() - 1);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadlineMidnight = new Date(deadline);
  deadlineMidnight.setHours(0, 0, 0, 0);
  const msDay = 24 * 60 * 60 * 1000;
  const daysLeft = Math.round((deadlineMidnight.getTime() - today.getTime()) / msDay);
  const isToday = daysLeft === 0;
  const isOverdue = daysLeft < 0;

  const fmt = (d: Date) => {
    const s = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  return {
    deadlineDate: deadline,
    label: fmt(deadline),
    suspStartLabel: fmt(suspStart),
    isToday,
    isOverdue,
    daysLeft,
  };
}

function canResendSuspensionAviso(task: Task): boolean {
  const tipo = String(task.documento_tipo || '').trim().toLowerCase();
  const dias = Number(task.suspension_dias || 0);
  return task.type === 'firma_documento'
    && !!task.ref_id
    && tipo === 'sancion'
    && dias > 0
    && task.status !== 'completed'
    && task.status !== 'delivered_rrhh';
}

// Prescription days by severity (ET Art. 60.2 + Convenio)
const PRESCRIPTION_DAYS: Record<string, number> = {
  leve: 10,
  moderada: 10,
  grave: 20,
  muy_grave: 60,
};

function getPrescriptionInfo(task: Task): { daysLeft: number; totalDays: number; percent: number; label: string; color: string; blink: boolean } | null {
  if (task.type !== 'firma_documento' || task.status === 'completed' || task.status === 'delivered_rrhh') return null;
  const normalizedTipo = String(task.documento_tipo || '').trim().toLowerCase();
  const normalizedGravedad = String(task.gravedad_final || '').trim().toLowerCase();
  // Prescription countdown starts from the INCIDENT date (fecha del hecho), NOT the document/task creation date.
  // ET Art. 60.2 + Convenio: el plazo corre desde que la empresa tiene conocimiento del hecho (fecha de la incidencia).
  const incidentDate = task.incident_date || task.document_created_at;
  if (!incidentDate) return null;
  // Amonestaciones: siempre plazo de 10 días para que se firmen/impongan como tarde.
  // No deben heredar 20/60 días aunque la gravedad interna llegue marcada como grave/muy grave.
  const totalDays = normalizedTipo === 'amonestacion'
    ? 10
    : PRESCRIPTION_DAYS[normalizedGravedad] || 10;
  const created = new Date(incidentDate);
  const deadline = new Date(created.getTime() + totalDays * 24 * 60 * 60 * 1000);
  const now = new Date();
  const msLeft = deadline.getTime() - now.getTime();
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  const percent = daysLeft / totalDays;

  if (daysLeft <= 0) return { daysLeft: 0, totalDays, percent: 0, label: 'PRESCRITA', color: 'text-destructive', blink: true };
  if (percent <= 0.25) return { daysLeft, totalDays, percent, label: `${daysLeft}d`, color: 'text-destructive', blink: false };
  if (percent <= 0.5) return { daysLeft, totalDays, percent, label: `${daysLeft}d`, color: 'text-amber-500 dark:text-amber-400', blink: false };
  if (percent <= 0.75) return { daysLeft, totalDays, percent, label: `${daysLeft}d`, color: 'text-yellow-500 dark:text-yellow-400', blink: false };
  return { daysLeft, totalDays, percent, label: `${daysLeft}d`, color: 'text-[#93d600]', blink: false };
}

// ── Signature Canvas (rendered OUTSIDE the document, only for interaction) ──
function SignatureCanvas({ onSignatureChange, height = 120 }: { onSignatureChange: (sig: string | null) => void; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Transparent background for clean embedding
    ctx.clearRect(0, 0, rect.width, rect.height);
  }, []);

  const getCoords = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    if (isConfirmed) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasSignature(true);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing || isConfirmed) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasSignature(false);
    setIsConfirmed(false);
    onSignatureChange(null);
  };

  const confirm = () => {
    if (!canvasRef.current || !hasSignature) return;
    // Export as PNG with transparent background
    onSignatureChange(canvasRef.current.toDataURL("image/png"));
    setIsConfirmed(true);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Firma del trabajador</p>
      <div
        className={cn(
          "relative rounded-xl overflow-hidden bg-white border-2",
          isConfirmed ? "border-primary/50" : "border-muted-foreground/30",
          !isConfirmed && "cursor-crosshair"
        )}
      >
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: `${height}px`, touchAction: 'none', display: 'block' }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {!hasSignature && !isConfirmed && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-muted-foreground/40 text-sm">Firme aquí</span>
          </div>
        )}
        {isConfirmed && (
          <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-0.5">
            <Check className="h-3 w-3" />
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={clear} className="text-xs gap-1">
          <Eraser className="h-3 w-3" /> Borrar
        </Button>
        {hasSignature && !isConfirmed && (
          <Button type="button" size="sm" onClick={confirm} className="text-xs gap-1">
            <Check className="h-3 w-3" /> Confirmar firma
          </Button>
        )}
        {isConfirmed && (
          <span className="text-xs text-primary font-medium flex items-center gap-1 ml-1">
            <Check className="h-3 w-3" /> Firma confirmada
          </span>
        )}
      </div>
    </div>
  );
}

const typeConfig: Record<string, { icon: typeof AlertTriangle; label: string }> = {
  evaluar_reincidencia: { icon: AlertTriangle, label: 'Reincidencia' },
  revisar_propuesta: { icon: Scale, label: 'Propuesta' },
  prescripcion: { icon: Clock, label: 'Prescripción' },
  recordatorio_rrhh: { icon: Mail, label: 'Recordatorio' },
  firma_documento: { icon: PenTool, label: 'Firma documento' },
};

type FilterType = 'all' | 'evaluar_reincidencia' | 'revisar_propuesta' | 'prescripcion' | 'recordatorio_rrhh' | 'firma_documento';
type FilterStatus = 'all' | 'pending' | 'completed' | 'dismissed';
type PeriodFilter = 'all' | 'today' | 'week' | 'month';
type ViewMode = 'list' | 'kanban';
type SignStep = 'sign' | 'email';

// CSS styles for A4-paginated document rendering
const A4_DOC_STYLES = `
  .a4-doc * { box-sizing: border-box; }
  .a4-doc { 
    color: #1a1a1a; 
    font-family: 'Poppins', 'Helvetica Neue', Arial, sans-serif;
    font-size: 12.5px; 
    line-height: 1.65; 
    font-weight: 300;
  }
  .a4-doc h1 { font-size: 15px; font-weight: 600; margin: 0; }
  .a4-doc h2 { font-size: 13px; font-weight: 600; margin: 20px 0 8px; color: #333; }
  .a4-doc .header { 
    display: flex; justify-content: space-between; align-items: center; 
    margin-bottom: 20px; padding-bottom: 14px; border-bottom: 1px solid #e5e5e5; 
    page-break-inside: avoid;
  }
  .a4-doc .header-left { display: flex; align-items: center; gap: 12px; }
  .a4-doc .header-left img { height: 38px; width: auto; }
  .a4-doc .header-left-text h1 { font-size: 15px; font-weight: 600; }
  .a4-doc .company-info { text-align: right; font-size: 9.5px; color: #888; }
  .a4-doc .badge { 
    display: inline-block; padding: 3px 12px; border-radius: 999px; 
    font-size: 10.5px; font-weight: 600; color: white; 
    page-break-inside: avoid;
  }
  .a4-doc .worker-info { margin: 10px 0; page-break-inside: avoid; }
  .a4-doc .worker-info table { border-collapse: collapse; width: 100%; }
  .a4-doc .worker-info td { padding: 3px 0; vertical-align: top; font-size: 12px; }
  .a4-doc .worker-info td:first-child { font-weight: 400; color: #888; width: 130px; }
  .a4-doc .section { margin: 16px 0; font-size: 12.5px; page-break-inside: avoid; }
  .a4-doc .section p { margin-bottom: 6px; }
  .a4-doc .articulos { 
    background: #f0f9e8; border-left: 3px solid #93d600; 
    border-radius: 0 8px 8px 0; padding: 12px 16px; margin: 10px 0; 
    font-size: 11.5px; page-break-inside: avoid; 
  }
  .a4-doc .advertencias { 
    background: #fef3cd; border-left: 3px solid #f59e0b; 
    border-radius: 0 8px 8px 0; padding: 12px 16px; margin: 10px 0; 
    font-size: 11.5px; page-break-inside: avoid; 
  }
  .a4-doc .firma-section { 
    display: flex; gap: 40px; margin-top: 32px; 
    page-break-inside: avoid; 
  }
  .a4-doc .firma-box { 
    flex: 1; text-align: center; padding-top: 14px; 
    border-top: 1px solid #ccc; 
  }
  .a4-doc .firma-box p { font-size: 10.5px; color: #888; margin-top: 4px; }
  .a4-doc .footer { 
    margin-top: 32px; padding-top: 10px; border-top: 1px solid #e5e5e5; 
    font-size: 9.5px; color: #aaa; display: flex; justify-content: space-between; 
    page-break-inside: avoid; 
  }
  .a4-doc .firma-trabajador .signature-embed {
    display: block; max-width: 220px; height: auto; margin: 8px auto 0;
  }
  .a4-doc .no-conforme-label {
    text-align: center; color: #dc2626; font-weight: 700; 
    font-size: 12px; margin-top: 4px;
  }
  .a4-doc .testigos-section {
    margin-top: 16px; padding: 14px 18px; border: 1px solid #e5e5e5; 
    border-radius: 8px; background: #fafafa; page-break-inside: avoid;
  }
  .a4-doc .testigos-section .testigo-header { 
    font-size: 11.5px; font-weight: 600; color: #333; margin-bottom: 12px; 
  }
  .a4-doc .testigos-grid { display: flex; gap: 30px; }
  .a4-doc .testigo-col { flex: 1; text-align: center; }
  .a4-doc .testigo-col .testigo-label { font-size: 10px; font-weight: 600; color: #555; margin-bottom: 4px; }
  .a4-doc .testigo-col .testigo-name { font-size: 11px; color: #333; }
  .a4-doc .testigo-col .testigo-dni { font-size: 10px; color: #888; }
  .a4-doc .testigo-col .testigo-firma-img { max-width: 180px; height: auto; margin: 6px auto 0; display: block; }
`;

export function AdminTareasTab() {
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState({ pending: 0, completed: 0, dismissed: 0 });
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('pending');
  const [actioning, setActioning] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  // Preview dialog state
  const [previewTask, setPreviewTask] = useState<Task | null>(null);
  const [showEditChat, setShowEditChat] = useState(false);
  const [liveHtmlContent, setLiveHtmlContent] = useState<string>("");

  // Signature flow state
  const [signTask, setSignTask] = useState<Task | null>(null);
  const [signStep, setSignStep] = useState<SignStep>('sign');
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [firmaPopupOpen, setFirmaPopupOpen] = useState(false);
  const [signing, setSigning] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const documentRef = useRef<HTMLDivElement>(null);

  // No conforme & witnesses
  const [noConforme, setNoConforme] = useState(false);
  const [negadoFirmar, setNegadoFirmar] = useState(false);
  const [testigo1Nombre, setTestigo1Nombre] = useState("");
  const [testigo1Dni, setTestigo1Dni] = useState("");
  const [testigo1Firma, setTestigo1Firma] = useState<string | null>(null);
  const [testigo2Nombre, setTestigo2Nombre] = useState("");
  const [testigo2Dni, setTestigo2Dni] = useState("");
  const [testigo2Firma, setTestigo2Firma] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!sessionToken) return;
    const body: Record<string, unknown> = { action: "listTasks", sessionToken };
    if (viewMode === 'list' && filterStatus !== 'all') body.status = filterStatus;
    if (filterType !== 'all') body.type = filterType;

    const { data } = await supabase.functions.invoke("incidencias-operations", { body });
    if (data?.success) {
      setTasks(data.tasks || []);
      setStats(data.stats || { pending: 0, completed: 0, dismissed: 0 });
    }
    setLoading(false);
  }, [sessionToken, filterType, filterStatus, viewMode]);

  useEffect(() => { fetchTasks(); setSelectedIds(new Set()); }, [fetchTasks]);

  useEffect(() => {
    const channel = supabase
      .channel('incidencias-tasks-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidencias_tasks' }, () => fetchTasks())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidencias_firma_tasks' }, () => fetchTasks())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchTasks]);

  const handleAction = async (taskId: string, action: 'complete' | 'dismiss') => {
    setActioning(taskId);
    const { data } = await supabase.functions.invoke("incidencias-operations", {
      body: { action: "completeTask", sessionToken, taskId, taskAction: action },
    });
    if (data?.success) {
      toast.success(action === 'complete' ? 'Tarea completada' : 'Tarea descartada');
      fetchTasks();
    } else {
      toast.error(data?.error || 'Error');
    }
    setActioning(null);
  };

  const openSignFlow = (task: Task) => {
    setSignTask(task);
    setSignStep('sign');
    setSignatureData(null);
    setEmailAddress(task.email_destinatario || "");
    setNoConforme(false);
    setNegadoFirmar(false);
    setTestigo1Nombre("");
    setTestigo1Dni("");
    setTestigo1Firma(null);
    setTestigo2Nombre("");
    setTestigo2Dni("");
    setTestigo2Firma(null);
  };

  // Generate high-quality PDF from the rendered A4 document
  const generatePdfBase64 = async (): Promise<string | null> => {
    const el = documentRef.current;
    if (!el) return null;

    try {
      // Use scale 4 for ultra-high quality + PNG for crisp text/signatures
      const canvas = await html2canvas(el, {
        scale: 4,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const scaleFactor = 4;
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = pdfWidth / (imgWidth / scaleFactor);
      const totalPdfHeight = (imgHeight / scaleFactor) * ratio;

      let position = 0;
      let page = 0;

      while (position < totalPdfHeight) {
        if (page > 0) pdf.addPage();

        const srcY = (position / ratio) * scaleFactor;
        const srcH = Math.min((pdfHeight / ratio) * scaleFactor, imgHeight - srcY);
        const destH = srcH * ratio / scaleFactor;

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = imgWidth;
        pageCanvas.height = Math.ceil(srcH);
        const ctx = pageCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          ctx.drawImage(canvas, 0, srcY, imgWidth, srcH, 0, 0, imgWidth, srcH);
          const pageImg = pageCanvas.toDataURL('image/png');
          pdf.addImage(pageImg, 'PNG', 0, 0, pdfWidth, destH);
        }

        position += pdfHeight;
        page++;
      }

      return pdf.output('datauristring').split(',')[1];
    } catch (err) {
      console.error('PDF generation failed:', err);
      return null;
    }
  };

  const handleSign = async () => {
    if (!signTask || !signatureData) return;
    setSigning(true);
    try {
      const docId = signTask.legal_document_id || signTask.ref_id;
      const signBody: Record<string, unknown> = {
        action: "signLegalDocument", sessionToken, documentId: docId, signatureBase64: signatureData || undefined,
        noConforme,
        negadoFirmar,
      };
      if (negadoFirmar) {
        signBody.testigo1 = { nombre: testigo1Nombre, dni: testigo1Dni, firma: testigo1Firma };
        signBody.testigo2 = { nombre: testigo2Nombre, dni: testigo2Dni, firma: testigo2Firma };
      }
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: signBody,
      });
      if (data?.success) {
        // Generate the PDF with the signature already embedded in the document
        const pdfBase64 = await generatePdfBase64();
        if (pdfBase64) {
          await supabase.functions.invoke("incidencias-operations", {
            body: { action: "uploadSignedPdf", sessionToken, documentId: docId, pdfBase64 },
          });
        }
        toast.success("Documento firmado correctamente");
        setSignStep('email');
        fetchTasks();
      } else {
        toast.error(data?.error || "Error al firmar");
      }
    } catch { toast.error("Error al firmar"); }
    finally { setSigning(false); }
  };

  const handleSendEmail = async () => {
    if (!signTask || !emailAddress.trim()) return;
    setSendingEmail(true);
    try {
      const docId = signTask.legal_document_id || signTask.ref_id;
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "sendLegalDocumentCopy", sessionToken, documentId: docId, email: emailAddress.trim() },
      });
      if (data?.success) {
        toast.success("Copia enviada por email");
        setSignTask(null);
        fetchTasks();
      } else {
        toast.error(data?.error || "Error al enviar");
      }
    } catch { toast.error("Error al enviar email"); }
    finally { setSendingEmail(false); }
  };

  const typeFilters: { id: FilterType; label: string }[] = [
    { id: 'all', label: 'Todas' },
    { id: 'evaluar_reincidencia', label: 'Reincidencia' },
    { id: 'revisar_propuesta', label: 'Propuestas' },
    { id: 'prescripcion', label: 'Prescripción' },
    { id: 'recordatorio_rrhh', label: 'Recordatorio' },
    { id: 'firma_documento', label: 'Firma doc.' },
  ];

  const statusFilters: { id: FilterStatus; label: string }[] = [
    { id: 'all', label: 'Todas' },
    { id: 'pending', label: `Pendientes (${stats.pending})` },
    { id: 'completed', label: `Finalizadas (${stats.completed})` },
    { id: 'dismissed', label: `Descartadas (${stats.dismissed})` },
  ];

  const periodFilters: { id: PeriodFilter; label: string }[] = [
    { id: 'all', label: 'Todas' },
    { id: 'today', label: 'Hoy' },
    { id: 'week', label: 'Semana' },
    { id: 'month', label: 'Mes' },
  ];

  const filterByPeriod = (taskList: Task[]) => {
    if (periodFilter === 'all') return taskList;
    return taskList.filter(t => {
      try {
        const d = parseISO(t.created_at);
        if (periodFilter === 'today') return isToday(d);
        if (periodFilter === 'week') return isThisWeek(d, { weekStartsOn: 1 });
        if (periodFilter === 'month') return isThisMonth(d);
      } catch { return true; }
      return true;
    });
  };

  const filteredTasks = filterByPeriod(tasks);

  // Downloadable tasks: completed firma_documento with pdf_url
  const downloadableTasks = filteredTasks.filter(t => t.status === 'completed' && t.type === 'firma_documento' && t.pdf_url);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(downloadableTasks.map(t => t.legal_document_id || t.ref_id || t.id)));
  };

  const deselectAll = () => setSelectedIds(new Set());

  const handleDownloadSingle = async (task: Task) => {
    const docId = task.legal_document_id || task.ref_id;
    if (!docId) return;
    setDownloading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "downloadSignedPdfs", sessionToken, documentIds: [docId] },
      });
      if (data?.success && data.downloads?.length > 0) {
        window.open(data.downloads[0].url, '_blank');
      } else {
        toast.error("No se pudo obtener el PDF");
      }
    } catch { toast.error("Error al descargar"); }
    finally { setDownloading(false); }
  };

  const handleDownloadBatch = async () => {
    if (selectedIds.size === 0) return;
    setDownloading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "downloadSignedPdfs", sessionToken, documentIds: Array.from(selectedIds) },
      });
      if (data?.success && data.downloads?.length > 0) {
        for (const dl of data.downloads) {
          const a = document.createElement('a');
          a.href = dl.url;
          a.download = `documento-${dl.workerName || dl.documentId}.pdf`;
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          await new Promise(r => setTimeout(r, 500));
        }
        toast.success(`${data.downloads.length} PDF(s) descargados`);
      } else {
        toast.error("No se pudieron obtener los PDFs");
      }
    } catch { toast.error("Error al descargar"); }
    finally { setDownloading(false); }
  };

  const handleBatchFinalize = async () => {
    if (selectedIds.size === 0) return;
    setActioning('batch');
    let success = 0;
    for (const taskId of selectedIds) {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "completeTask", sessionToken, taskId, taskAction: 'complete' },
      });
      if (data?.success) success++;
    }
    toast.success(`${success} tarea(s) finalizada(s)`);
    setSelectedIds(new Set());
    setActioning(null);
    fetchTasks();
  };

  // Email config dialog state — separated by purpose
  const [emailConfigOpen, setEmailConfigOpen] = useState(false);
  const [configEmails, setConfigEmails] = useState<Array<{ id: string; email: string; is_primary: boolean; purpose?: string }>>([]);
  const [newConfigEmailFirma, setNewConfigEmailFirma] = useState("");
  const [newConfigEmailSusp, setNewConfigEmailSusp] = useState("");
  const [emailConfigLoading, setEmailConfigLoading] = useState(false);

  const loadEmailConfig = useCallback(async () => {
    setEmailConfigLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "getEmailConfig", sessionToken },
      });
      setConfigEmails(data?.emails || []);
    } catch { /* ignore */ }
    finally { setEmailConfigLoading(false); }
  }, [sessionToken]);

  const handleAddConfigEmail = async (purpose: 'firma_entrega' | 'suspension_aviso') => {
    const value = (purpose === 'firma_entrega' ? newConfigEmailFirma : newConfigEmailSusp).trim();
    if (!value || !value.includes('@')) { toast.error("Email no válido"); return; }
    setEmailConfigLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "addEmailConfig", sessionToken, email: value, purpose },
      });
      if (data?.success) {
        setConfigEmails(prev => [...prev, data.email]);
        if (purpose === 'firma_entrega') setNewConfigEmailFirma("");
        else setNewConfigEmailSusp("");
        toast.success("Email añadido");
      } else toast.error(data?.error || "Error");
    } catch { toast.error("Error"); }
    finally { setEmailConfigLoading(false); }
  };

  const handleRemoveConfigEmail = async (emailId: string) => {
    setEmailConfigLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "removeEmailConfig", sessionToken, emailId },
      });
      if (data?.success) { setConfigEmails(prev => prev.filter(e => e.id !== emailId)); toast.success("Email eliminado"); }
      else toast.error(data?.error || "Error");
    } catch { toast.error("Error"); }
    finally { setEmailConfigLoading(false); }
  };

  const handleSetPrimaryConfigEmail = async (emailId: string) => {
    setEmailConfigLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "setPrimaryEmail", sessionToken, emailId },
      });
      if (data?.success) {
        // Only flip primary within the same purpose group
        const target = configEmails.find(e => e.id === emailId);
        const targetPurpose = target?.purpose || 'firma_entrega';
        setConfigEmails(prev => prev.map(e => {
          const ePurpose = e.purpose || 'firma_entrega';
          if (ePurpose !== targetPurpose) return e;
          return { ...e, is_primary: e.id === emailId };
        }));
        toast.success("Principal actualizado");
      } else toast.error(data?.error || "Error");
    } catch { toast.error("Error"); }
    finally { setEmailConfigLoading(false); }
  };

  // Deliver to RRHH handler
  const handleDeliverToRRHH = async (task: Task) => {
    setActioning(task.id);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "deliverToRRHH", sessionToken, taskId: task.id },
      });
      if (data?.success) {
        toast.success("Documento entregado a RRHH");
        fetchTasks();
      } else {
        toast.error(data?.error || "Error al entregar");
      }
    } catch { toast.error("Error al entregar a RRHH"); }
    finally { setActioning(null); }
  };

  const kanbanCols = [
    { id: 'pending', label: 'Pendiente', dotColor: 'bg-amber-500' },
    { id: 'printed', label: 'Imprimido', dotColor: 'bg-sky-500' },
    { id: 'awaiting_signature', label: 'Pte. firma', dotColor: 'bg-violet-500' },
    { id: 'completed', label: 'Firmado', dotColor: 'bg-blue-500' },
    { id: 'delivered_rrhh', label: 'Doc. entregado', dotColor: 'bg-primary' },
  ];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkScanInputRef = useRef<HTMLInputElement>(null);
  const [uploadingTaskId, setUploadingTaskId] = useState<string | null>(null);
  const [printingTaskId, setPrintingTaskId] = useState<string | null>(null);
  const [resendingAvisoId, setResendingAvisoId] = useState<string | null>(null);

  const handleResendSuspensionAviso = useCallback(async (task: Task) => {
    if (!task.ref_id) {
      toast.error('No se puede identificar la propuesta asociada');
      return;
    }
    if (!window.confirm('¿Reenviar el aviso de suspensión a RRHH?\n\nSe volverá a enviar el correo con el enlace al documento de la sanción.')) return;
    setResendingAvisoId(task.id);
    try {
      const { data, error } = await supabase.functions.invoke('incidencias-operations', {
        body: { action: 'resendSuspensionAviso', sessionToken, propuestaId: task.ref_id },
      });
      if (error) throw error;
      if (data?.success === false || data?.error) throw new Error(data?.error || 'Error desconocido');
      toast.success('Aviso de suspensión reenviado correctamente');
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo reenviar el aviso');
    } finally {
      setResendingAvisoId(null);
    }
  }, [sessionToken]);

  // Bulk scan state — split a single PDF across multiple "Pte. firma" tasks
  type BulkAssignment = {
    taskId: string;
    pageStart: number;
    pageEnd: number;
    matched_name?: string;
    matched_tipo?: string;
    confidence?: 'high' | 'medium' | 'low';
    reason?: string;
    page_marker?: string | null;
    document_total_pages?: number | null;
    warning?: string | null;
  };
  type BulkTaskInfo = {
    taskId: string;
    worker_name: string;
    documento_tipo: 'amonestacion' | 'sancion' | null;
    gravedad?: string | null;
  };
  type BulkPageReading = {
    pdf_page: number;
    worker_name?: string | null;
    footer_worker_name?: string | null;
    marker_current?: number | null;
    marker_total?: number | null;
    marker_literal?: string | null;
    raw_footer_text?: string | null;
    confidence?: 'high' | 'medium' | 'low';
  };
  const [bulkScanOpen, setBulkScanOpen] = useState(false);
  const [bulkScanStep, setBulkScanStep] = useState<'analyzing' | 'review' | 'confirm' | 'uploading' | 'done' | 'error'>('analyzing');
  const [bulkScanError, setBulkScanError] = useState<string | null>(null);
  const [bulkScanPdfBase64, setBulkScanPdfBase64] = useState<string | null>(null);
  const [bulkScanPdfSize, setBulkScanPdfSize] = useState<number>(0);
  const [bulkScanFileName, setBulkScanFileName] = useState<string>("");
  const [bulkScanAssignments, setBulkScanAssignments] = useState<BulkAssignment[]>([]);
  const [bulkScanCandidates, setBulkScanCandidates] = useState<BulkTaskInfo[]>([]);
  const [bulkScanUnassigned, setBulkScanUnassigned] = useState<number[]>([]);
  const [bulkScanTotalPages, setBulkScanTotalPages] = useState<number | null>(null);
  const [bulkScanResult, setBulkScanResult] = useState<{ uploaded: number; total: number; results: Array<{ taskId: string; success: boolean; error?: string }> } | null>(null);
  // New: split-view + chat state
  const [bulkScanInitialAssignments, setBulkScanInitialAssignments] = useState<BulkAssignment[]>([]);
  const [bulkScanSelectedIdx, setBulkScanSelectedIdx] = useState<number | null>(null);
  const [bulkScanPdfBlobUrl, setBulkScanPdfBlobUrl] = useState<string | null>(null);
  const [bulkScanChat, setBulkScanChat] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [bulkScanChatInput, setBulkScanChatInput] = useState<string>("");
  const [bulkScanRecalculating, setBulkScanRecalculating] = useState<boolean>(false);
  const [bulkScanPageReadings, setBulkScanPageReadings] = useState<BulkPageReading[]>([]);
  const [bulkScanShowReadings, setBulkScanShowReadings] = useState<boolean>(false);
  // Per-assignment preview blob URLs, keyed by `${pageStart}-${pageEnd}`.
  // Each entry is a real sub-PDF containing ONLY that worker's pages, so the
  // visor on the right can show what every individual file will look like
  // before confirming.
  const [bulkScanSubPdfUrls, setBulkScanSubPdfUrls] = useState<Record<string, string>>({});

  // Custom signature date (only used for tasks already prescribed, where the
  // user wants the document to display a back-dated "fecha de firma" within
  // the legal window). Map of taskId → ISO date string (yyyy-mm-dd).
  const [customSignDates, setCustomSignDates] = useState<Record<string, string>>({});
  const [dateEditTask, setDateEditTask] = useState<Task | null>(null);
  const [dateEditValue, setDateEditValue] = useState<string>("");

  // Helper: inject a signature date into document HTML (reused for preview + print).
  // If `overrideDate` is provided (e.g. a back-dated fecha for prescribed
  // tasks), it is used instead of "today". Falls back to today otherwise.
  const injectPrintDate = (html: string, overrideDate?: Date) => {
    const now = overrideDate instanceof Date && !isNaN(overrideDate.getTime()) ? overrideDate : new Date();
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const datePhrase = `En Algemesí, a ${now.getDate()} de ${meses[now.getMonth()]} de ${now.getFullYear()}`;
    let result = html;
    result = result.replace(
      /<div[^>]*class="[^"]*firma-section[^"]*"/i,
      `<p style="text-align:left;font-size:12px;margin:30px 0 10px 0;font-family:'Poppins',sans-serif;font-weight:400;letter-spacing:0.01em">${datePhrase}</p>$&`
    );
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const formattedToday = `${dd}/${mm}/${yyyy}`;
    result = result.replace(
      /(firma-section[\s\S]*?Fecha[:\s]*(?:<[^>]*>)?\s*)\d{1,2}\/\d{1,2}\/\d{4}/i,
      `$1${formattedToday}`
    );
    return result;
  };

  // Parse a yyyy-mm-dd string as a LOCAL date (avoid UTC shift).
  const parseLocalDate = (iso: string | undefined): Date | undefined => {
    if (!iso) return undefined;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return undefined;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? undefined : d;
  };

  const formatDateEs = (d: Date) =>
    d.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

  const openDateEditor = (task: Task) => {
    const existing = customSignDates[task.id];
    if (existing) {
      setDateEditValue(existing);
    } else {
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      setDateEditValue(`${today.getFullYear()}-${mm}-${dd}`);
    }
    setDateEditTask(task);
  };

  const saveDateEditor = () => {
    if (!dateEditTask) return;
    const parsed = parseLocalDate(dateEditValue);
    if (!parsed) {
      toast.error('Fecha no válida');
      return;
    }
    setCustomSignDates((prev) => ({ ...prev, [dateEditTask.id]: dateEditValue }));
    toast.success(`Fecha del documento: ${formatDateEs(parsed)}`);
    setDateEditTask(null);
  };

  const clearCustomDate = (taskId: string) => {
    setCustomSignDates((prev) => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
    setDateEditTask(null);
    toast.message('Se usará la fecha de hoy');
  };

  const getTaskPrintMeta = (task: Task) => ({
    tipoLabel:
      task.documento_tipo === 'amonestacion'
        ? 'AMONESTACIÓN'
        : task.documento_tipo === 'sancion'
          ? 'SANCIÓN'
          : '',
    workerName: task.worker_name || '',
    workerNumber: task.worker_number || '',
    fecha: new Date(task.document_created_at || task.created_at).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }),
  });

  const getTaskPrintFileName = (task: Task) => {
    const tipoDoc = task.documento_tipo === 'amonestacion' ? 'Amonestación' : 'Sanción';
    const nombre = (task.worker_name || 'Trabajador').trim();
    const d = new Date(task.document_created_at || task.created_at);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${tipoDoc} - ${nombre} (${dd}-${mm}-${yy}).pdf`;
  };

  const handlePrint = async (task: Task) => {
    if (!task.html_content) {
      toast.error('No hay documento asociado');
      return;
    }

    setPrintingTaskId(task.id);

    try {
      const overrideDate = parseLocalDate(customSignDates[task.id]);
      const paginatedDocument = await paginateLegalDocument(
        injectPrintDate(task.html_content, overrideDate),
        getTaskPrintMeta(task),
      );

      if (!paginatedDocument.pages.length) {
        throw new Error('No hay páginas listas para imprimir');
      }

      const pdfFileName = getTaskPrintFileName(task);
      const previewSrcDoc = buildLegalPreviewSrcDoc(paginatedDocument, pdfFileName, {
        fontDelta: Number(task.font_delta || 0) || 0,
      });

      await openLegalDocumentPrintPreviewFromSrcDoc(previewSrcDoc, pdfFileName);

      const { data: markData } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "markTaskPrinted", sessionToken, taskId: task.id },
      });

      if (markData?.success) {
        toast.success("Ventana de impresión abierta");
        fetchTasks();
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Error al preparar la impresión");
    } finally {
      setPrintingTaskId(null);
    }
  };

  const handleUploadPhoto = async (task: Task, file: File) => {
    setUploadingTaskId(task.id);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "uploadSignedPhoto", sessionToken, taskId: task.id, photoBase64: base64, fileName: file.name },
      });
      if (data?.success) {
        toast.success(`Foto subida (${data.totalPhotos || 1} total)`);
        fetchTasks();
      } else {
        toast.error(data?.error || "Error al subir foto");
      }
    } catch { toast.error("Error al subir foto"); }
    finally { setUploadingTaskId(null); }
  };

  const handleFinalizeTask = async (task: Task) => {
    setActioning(task.id);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "finalizeSignedTask", sessionToken, taskId: task.id },
      });
      if (data?.success) {
        toast.success("Tarea finalizada correctamente");
        fetchTasks();
      } else {
        toast.error(data?.error || "Error al finalizar");
      }
    } catch { toast.error("Error al finalizar"); }
    finally { setActioning(null); }
  };

  const handleViewSignedPhotos = async (task: Task) => {
    const paths = task.signed_photo_urls?.length ? task.signed_photo_urls : (task.signed_photo_url ? [task.signed_photo_url] : []);
    if (paths.length === 0) return;
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "getSignedPhotoUrls", sessionToken, storagePaths: paths },
      });
      if (data?.urls?.length) {
        for (const u of data.urls) {
          window.open(u.url, '_blank');
        }
      }
    } catch { toast.error("Error al obtener fotos"); }
  };

  const handleViewSignedPhoto = async (task: Task) => {
    if (!task.signed_photo_url) return;
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "getSignedPhotoUrl", sessionToken, storagePath: task.signed_photo_url },
      });
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch { toast.error("Error al obtener foto"); }
  };

  const handleUploadScannedPdf = async (task: Task, file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error('El archivo debe ser un PDF');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error('El PDF no puede superar los 15 MB');
      return;
    }
    setUploadingTaskId(task.id);
    try {
      const reader = new FileReader();
      const base64: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string));
        reader.onerror = () => reject(new Error('read error'));
        reader.readAsDataURL(file);
      });
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "uploadScannedSignedPdf", sessionToken, taskId: task.id, pdfBase64: base64, fileName: file.name },
      });
      if (data?.success) {
        toast.success('PDF escaneado subido — marcando como firmado…');
        // Auto-finalizar: pasar a "Firmado" y enviar el correo a RRHH con el PDF adjunto
        if (task.status === 'awaiting_signature') {
          await handleFinalizeTask({ ...task, scanned_signed_pdf_url: 'uploaded' } as Task);
        } else {
          fetchTasks();
        }
      } else {
        toast.error(data?.error || 'Error al subir PDF');
      }
    } catch {
      toast.error('Error al subir PDF');
    } finally {
      setUploadingTaskId(null);
    }
  };

  const handleViewScannedPdf = async (task: Task) => {
    if (!task.scanned_signed_pdf_url) return;
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "getScannedSignedPdfUrl", sessionToken, taskId: task.id },
      });
      if (data?.url) {
        window.open(data.url, '_blank');
      } else {
        toast.error('No se pudo abrir el PDF');
      }
    } catch { toast.error('Error al abrir PDF'); }
  };

  const handleDeleteScannedPdf = async (task: Task) => {
    if (!confirm('¿Eliminar el PDF escaneado? Tendrás que volver a subirlo si quieres adjuntarlo al correo.')) return;
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "deleteScannedSignedPdf", sessionToken, taskId: task.id },
      });
      if (data?.success) {
        toast.success('PDF eliminado');
        fetchTasks();
      }
    } catch { toast.error('Error al eliminar PDF'); }
  };

  // ── Bulk scan: build per-assignment sub-PDF blob URLs ─────────────
  // Whenever the assignments or the source PDF change, regenerate one
  // independent PDF blob per assignment so the visor can show EXACTLY what
  // each worker's split file will contain — not just a page jump inside the
  // original scanned PDF.
  useEffect(() => {
    if (!bulkScanPdfBase64 || bulkScanAssignments.length === 0) {
      // Nothing to preview: revoke whatever was around.
      setBulkScanSubPdfUrls((prev) => {
        Object.values(prev).forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* noop */ } });
        return {};
      });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const bin = atob(bulkScanPdfBase64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const total = source.getPageCount();

        // Compute the keys we want to keep alive after this regeneration.
        const wantedKeys = new Set(
          bulkScanAssignments.map((a) => `${a.pageStart}-${a.pageEnd}`)
        );

        // Build any missing entry.
        const next: Record<string, string> = {};
        const reused = new Set<string>();
        setBulkScanSubPdfUrls((prev) => {
          for (const k of wantedKeys) {
            if (prev[k]) { next[k] = prev[k]; reused.add(k); }
          }
          // Revoke entries that are no longer needed.
          for (const [k, url] of Object.entries(prev)) {
            if (!wantedKeys.has(k)) { try { URL.revokeObjectURL(url); } catch { /* noop */ } }
          }
          return next;
        });

        for (const a of bulkScanAssignments) {
          if (cancelled) return;
          const key = `${a.pageStart}-${a.pageEnd}`;
          if (reused.has(key)) continue;
          if (a.pageStart < 1 || a.pageEnd > total || a.pageStart > a.pageEnd) continue;
          const sub = await PDFDocument.create();
          const indices: number[] = [];
          for (let p = a.pageStart - 1; p <= a.pageEnd - 1; p++) indices.push(p);
          const copied = await sub.copyPages(source, indices);
          for (const cp of copied) sub.addPage(cp);
          const subBytes = await sub.save();
          const blob = new Blob([subBytes as BlobPart], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          if (cancelled) { try { URL.revokeObjectURL(url); } catch { /* noop */ } return; }
          setBulkScanSubPdfUrls((prev) => ({ ...prev, [key]: url }));
        }
      } catch (e) {
        console.error('[bulk-scan] sub-pdf preview failed', e);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkScanPdfBase64, JSON.stringify(bulkScanAssignments.map(a => [a.pageStart, a.pageEnd]))]);

  // ── Bulk scan: split one multi-document PDF across awaiting_signature tasks ──
  const handleBulkScanFile = async (file: File, awaitingTasks: Task[]) => {
    if (file.type !== 'application/pdf') { toast.error('El archivo debe ser un PDF'); return; }
    if (file.size > 25 * 1024 * 1024) { toast.error('El PDF no puede superar los 25 MB'); return; }
    if (awaitingTasks.length === 0) { toast.error('No hay tareas pendientes de firma'); return; }

    // Build a blob URL for the embedded viewer
    if (bulkScanPdfBlobUrl) URL.revokeObjectURL(bulkScanPdfBlobUrl);
    const blobUrl = URL.createObjectURL(file);
    setBulkScanPdfBlobUrl(blobUrl);

    setBulkScanFileName(file.name);
    setBulkScanPdfSize(file.size);
    setBulkScanOpen(true);
    setBulkScanStep('analyzing');
    setBulkScanError(null);
    setBulkScanResult(null);
    setBulkScanChat([]);
    setBulkScanChatInput("");
    setBulkScanSelectedIdx(null);

    try {
      const reader = new FileReader();
      const base64: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('read error'));
        reader.readAsDataURL(file);
      });

      // Store the ORIGINAL base64. We never normalize/rotate the PDF — the
      // scanner output must reach each task untouched.
      const originalB64 = base64.includes(',') ? base64.split(',')[1] : base64;
      setBulkScanPdfBase64(originalB64);

      const { data, error } = await supabase.functions.invoke("incidencias-bulk-scan-split", {
        body: { sessionToken, pdfBase64: originalB64, taskIds: awaitingTasks.map(t => t.id) },
      });

      if (error || !data?.success) {
        setBulkScanStep('error');
        setBulkScanError(data?.error || error?.message || 'Error analizando el PDF');
        return;
      }

      const initialAssigns = data.assignments || [];
      setBulkScanCandidates(data.tasks || []);
      setBulkScanAssignments(initialAssigns);
      setBulkScanInitialAssignments(initialAssigns);
      setBulkScanUnassigned(data.unassigned_pages || []);
      setBulkScanTotalPages(data.total_pages_seen || null);
      setBulkScanPageReadings(Array.isArray(data.page_readings) ? data.page_readings : []);
      setBulkScanSelectedIdx(initialAssigns.length > 0 ? 0 : null);
      setBulkScanChat([{
        role: 'assistant',
        content: data.assistant_message || `He leído el PDF y he agrupado ${initialAssigns.length} documento${initialAssigns.length === 1 ? '' : 's'} usando los marcadores "Página 1 de N" del pie. Si algo no cuadra, dímelo aquí y recalculo.`,
      }]);
      setBulkScanStep('review');
    } catch (e) {
      setBulkScanStep('error');
      setBulkScanError(e instanceof Error ? e.message : 'Error inesperado');
    }
  };

  // Recalculate assignments after the user typed a correction in the chat.
  const handleBulkScanRecalculate = async () => {
    const trimmed = bulkScanChatInput.trim();
    if (!trimmed && bulkScanChat.filter(m => m.role === 'user').length === 0) return;
    if (!bulkScanPdfBase64) return;

    const newChat: Array<{ role: 'user' | 'assistant'; content: string }> = trimmed
      ? [...bulkScanChat, { role: 'user', content: trimmed }]
      : bulkScanChat;
    setBulkScanChat(newChat);
    setBulkScanChatInput("");
    setBulkScanRecalculating(true);

    try {
      const { data, error } = await supabase.functions.invoke("incidencias-bulk-scan-split", {
        body: {
          sessionToken,
          pdfBase64: bulkScanPdfBase64,
          taskIds: bulkScanCandidates.map(c => c.taskId),
          chat: newChat,
          currentAssignments: bulkScanAssignments.map(a => ({ taskId: a.taskId, pageStart: a.pageStart, pageEnd: a.pageEnd })),
        },
      });
      if (error || !data?.success) {
        setBulkScanChat([...newChat, { role: 'assistant', content: `No he podido recalcular: ${data?.error || error?.message || 'error desconocido'}` }]);
        return;
      }
      setBulkScanAssignments(data.assignments || []);
      setBulkScanUnassigned(data.unassigned_pages || []);
      if (data.total_pages_seen) setBulkScanTotalPages(data.total_pages_seen);
      if (Array.isArray(data.page_readings)) setBulkScanPageReadings(data.page_readings);
      // We do NOT replace the PDF blob URL: the visor must keep showing the
      // original scanned file untouched.
      setBulkScanChat([
        ...newChat,
        { role: 'assistant', content: data.assistant_message || 'He actualizado el reparto según tus indicaciones.' },
      ]);
    } catch (e) {
      setBulkScanChat([...newChat, { role: 'assistant', content: 'Error al recalcular: ' + (e instanceof Error ? e.message : 'desconocido') }]);
    } finally {
      setBulkScanRecalculating(false);
    }
  };

  const handleConfirmBulkSplit = async () => {
    if (!bulkScanPdfBase64 || bulkScanAssignments.length === 0) return;
    setBulkScanStep('uploading');
    try {
      const { data, error } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "splitAndAttachScannedPdf",
          sessionToken,
          pdfBase64: bulkScanPdfBase64,
          assignments: bulkScanAssignments.map(a => ({ taskId: a.taskId, pageStart: a.pageStart, pageEnd: a.pageEnd })),
        },
      });
      if (error || !data?.success) {
        setBulkScanStep('error');
        setBulkScanError(data?.error || error?.message || 'Error al repartir el PDF');
        return;
      }
      setBulkScanResult({ uploaded: data.uploaded, total: data.total, results: data.results || [] });
      setBulkScanStep('done');
      toast.success(`PDF repartido: ${data.uploaded}/${data.total} tareas firmadas`);

      // Save the correction (lessons-learnt) — fire and forget.
      try {
        await supabase.functions.invoke("incidencias-operations", {
          body: {
            action: "saveBulkScanCorrection",
            sessionToken,
            pdfFilename: bulkScanFileName,
            totalPages: bulkScanTotalPages,
            initialAssignments: bulkScanInitialAssignments,
            finalAssignments: bulkScanAssignments,
            chat: bulkScanChat,
          },
        });
      } catch { /* non-blocking */ }

      fetchTasks();
    } catch (e) {
      setBulkScanStep('error');
      setBulkScanError(e instanceof Error ? e.message : 'Error inesperado');
    }
  };

  const closeBulkScan = () => {
    setBulkScanOpen(false);
    setBulkScanPdfBase64(null);
    setBulkScanPdfSize(0);
    setBulkScanAssignments([]);
    setBulkScanInitialAssignments([]);
    setBulkScanCandidates([]);
    setBulkScanUnassigned([]);
    setBulkScanResult(null);
    setBulkScanError(null);
    setBulkScanFileName("");
    setBulkScanSelectedIdx(null);
    setBulkScanChat([]);
    setBulkScanChatInput("");
    setBulkScanPageReadings([]);
    setBulkScanShowReadings(false);
    if (bulkScanPdfBlobUrl) {
      URL.revokeObjectURL(bulkScanPdfBlobUrl);
      setBulkScanPdfBlobUrl(null);
    }
    // Revoke per-assignment preview blob URLs.
    setBulkScanSubPdfUrls((prev) => {
      Object.values(prev).forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* noop */ } });
      return {};
    });
    if (bulkScanInputRef.current) bulkScanInputRef.current.value = "";
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    setDragOverCol(null);
    const taskId = e.dataTransfer.getData('taskId');
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === targetStatus) return;

    const phases = ['pending', 'printed', 'awaiting_signature', 'completed', 'delivered_rrhh'];
    const fromIdx = phases.indexOf(task.status);
    const toIdx = phases.indexOf(targetStatus);
    if (fromIdx < 0 || toIdx < 0) return;

    // Backward movement → reopen task to target status
    if (toIdx < fromIdx) {
      setActioning(taskId);
      try {
        const { data } = await supabase.functions.invoke("incidencias-operations", {
          body: { action: "reopenTask", sessionToken, taskId, targetStatus },
        });
        if (data?.success) {
          toast.success('Tarea reabierta');
          fetchTasks();
        } else {
          toast.error(data?.error || 'Error al reabrir');
        }
      } catch { toast.error('Error al reabrir tarea'); }
      finally { setActioning(null); }
      return;
    }

    // Forward movement
    if (targetStatus === 'printed') {
      handlePrint(task);
    } else if (targetStatus === 'awaiting_signature') {
      setActioning(taskId);
      try {
        const { data } = await supabase.functions.invoke("incidencias-operations", {
          body: { action: "reopenTask", sessionToken, taskId, targetStatus },
        });
        if (data?.success) {
          toast.success('Tarea movida a pendiente de firma');
          fetchTasks();
        } else {
          toast.error(data?.error || 'Error al mover a pendiente de firma');
        }
      } catch {
        toast.error('Error al mover a pendiente de firma');
      } finally {
        setActioning(null);
      }
    } else if (targetStatus === 'completed') {
      // Always use finalize flow for firma tasks so the legal document
      // is marked as firmado AND the notification email is sent.
      if (task.legal_document_id || task.status === 'awaiting_signature') {
        handleFinalizeTask(task);
      } else {
        handleAction(taskId, 'complete');
      }
    } else if (targetStatus === 'delivered_rrhh') {
      if (task.status === 'completed') {
        handleDeliverToRRHH(task);
      }
    }
  };

  // ── Prepare document HTML: extract body, personalize, split sections ──
  const prepareDocumentHtml = (htmlContent: string) => {
    const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : htmlContent;

    // Remove existing styles from HTML (we apply our own)
    const cleanedBody = bodyContent.replace(/<style[\s\S]*?<\/style>/gi, '');

    // Personalize "Recibí" with the worker name
    const workerName = signTask?.worker_name || '';
    const personalizedContent = cleanedBody
      .replace(/Recibí — El\/La Trabajador\/a/g, `Recibí — ${workerName}`)
      .replace(/Recibí — [^<]*/g, `Recibí — ${workerName}`);

    // Hide original firma-trabajador content (we'll inject our own signature)
    // Remove the firma-section entirely so we can rebuild it
    const withoutFirmaSection = personalizedContent
      .replace(/<div class="firma-section">[\s\S]*?<\/div>\s*<\/div>/gi, '<!-- firma-removed -->');

    // Split footer
    const footerSplit = withoutFirmaSection.split(/<div class="footer">/i);
    const mainContent = footerSplit[0] || withoutFirmaSection;
    const footerHtml = footerSplit.length > 1 ? '<div class="footer">' + footerSplit[1] : '';

    return { mainContent, footerHtml };
  };

  // ── Build the firma section HTML with embedded signature image ──
  const buildFirmaHtml = () => {
    const workerName = signTask?.worker_name || 'El/La Trabajador/a';

    if (negadoFirmar) {
      // Witnesses section
      const t1FirmaImg = testigo1Firma ? `<img src="${testigo1Firma}" class="testigo-firma-img" alt="Firma testigo 1" />` : '';
      const t2FirmaImg = testigo2Firma ? `<img src="${testigo2Firma}" class="testigo-firma-img" alt="Firma testigo 2" />` : '';
      return `
        <div class="firma-section">
          <div class="firma-box">
            <strong>Verdnatura Levante S.L.</strong>
          </div>
          <div class="firma-box firma-trabajador">
            <strong>Recibí — ${workerName}</strong>
            <p style="color: #dc2626; font-weight: 700; font-size: 12px;">Se niega a firmar</p>
          </div>
        </div>
        <div class="testigos-section">
          <p class="testigo-header">${workerName} se niega a firmar — Testigos presenciales:</p>
          <div class="testigos-grid">
            <div class="testigo-col">
              <p class="testigo-label">Testigo 1</p>
              <p class="testigo-name">${testigo1Nombre || '—'}</p>
              <p class="testigo-dni">DNI: ${testigo1Dni || '—'}</p>
              ${t1FirmaImg}
            </div>
            <div class="testigo-col">
              <p class="testigo-label">Testigo 2</p>
              <p class="testigo-name">${testigo2Nombre || '—'}</p>
              <p class="testigo-dni">DNI: ${testigo2Dni || '—'}</p>
              ${t2FirmaImg}
            </div>
          </div>
        </div>
      `;
    }

    // Normal signature
    const signatureImg = signatureData
      ? `<img src="${signatureData}" class="signature-embed" alt="Firma del trabajador" />`
      : '<p style="height: 60px; color: #ccc; font-size: 10px; padding-top: 20px;">Pendiente de firma</p>';

    const noConformeLabel = noConforme
      ? '<p class="no-conforme-label">No conforme</p>'
      : '';

    return `
      <div class="firma-section">
        <div class="firma-box">
            <strong>Verdnatura Levante S.L.</strong>
        </div>
        <div class="firma-box firma-trabajador">
          <strong>Recibí — ${workerName}</strong>
          ${signatureImg}
          ${noConformeLabel}
        </div>
      </div>
    `;
  };

  // ── Render the A4-paginated document for signing ──
  const renderDocumentForSigning = () => {
    if (!signTask?.html_content) {
      return (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-8">
          No hay contenido del documento disponible.
        </div>
      );
    }

    const { mainContent, footerHtml } = prepareDocumentHtml(signTask.html_content);
    const firmaHtml = buildFirmaHtml();

    return (
      <div
        ref={documentRef}
        className="a4-doc"
        style={{
          width: '793px',
          minHeight: '297mm',
          margin: '0 auto',
          padding: '28mm 25mm 20mm',
          backgroundColor: '#ffffff',
          fontFamily: "'Poppins', 'Helvetica Neue', Arial, sans-serif",
        }}
      >
        <style dangerouslySetInnerHTML={{ __html: A4_DOC_STYLES }} />
        {/* Main document content */}
        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(mainContent) }} />
        {/* Firma section with embedded signature */}
        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(firmaHtml) }} />
        {/* Footer */}
        {footerHtml && <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(footerHtml) }} />}
      </div>
    );
  };

  const getTaskWorkerNumber = (task?: Partial<Task> | null) => {
    if (!task) return null;
    if (typeof task.worker_number === "string" && task.worker_number.trim()) return task.worker_number.trim();
    if (typeof task.html_content !== "string" || !task.html_content) return null;

    const match = task.html_content.match(/data-worker-number="([^"]+)"/i);
    if (match?.[1]?.trim()) return match[1].trim();
    // Try extracting from Salix URL in html_content
    const salixMatch = task.html_content.match(/salix\.verdnatura\.es\/#!\/worker\/(\d+)/i);
    if (salixMatch?.[1]?.trim()) return salixMatch[1].trim();
    // Try extracting from "Nº Fichar" or similar patterns
    const ficharMatch = task.html_content.match(/(?:N[º°]\s*(?:de\s+)?Fichar|Número\s+de\s+fichar)[:\s]*(\d+)/i);
    return ficharMatch?.[1]?.trim() || null;
  };

  const renderTaskCard = (task: Task, draggable = false, isKanban = false) => {
    const cfg = typeConfig[task.type] || { icon: ListTodo, label: task.type };
    const Icon = cfg.icon;
    const isOverdue = task.due_at && new Date(task.due_at) < new Date() && task.status === 'pending';
    const isFirma = task.type === 'firma_documento';
    const effectiveWorkerNumber = getTaskWorkerNumber(task);
    const salixUrl = effectiveWorkerNumber ? `https://salix.verdnatura.es/#!/worker/${effectiveWorkerNumber}/summary` : null;
    const isCompleted = task.status === 'completed';
    const isDelivered = task.status === 'delivered_rrhh';

    // Clean title: remove "Documento: " prefix
    const cleanTitle = task.title.replace(/^Documento:\s*/i, '');

    // Kanban: minimal card
    if (isKanban) {
      return (
        <div
          key={task.id}
          draggable
          onDragStart={(e) => handleDragStart(e, task.id)}
          className={cn(
            "group rounded-xl p-3 border transition-all cursor-grab active:cursor-grabbing select-none",
            isDelivered
              ? "bg-muted/30 border-border/20 opacity-40 hover:opacity-70"
              : "bg-card border-border/30 hover:border-border/50 hover:shadow-sm",
            isOverdue && "border-destructive/30",
          )}
        >
          {/* Top row: name + action icons */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {salixUrl ? (
                <a
                  href={salixUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    "text-[12px] font-medium leading-snug line-clamp-2 hover:underline transition-colors",
                    isDelivered ? "text-muted-foreground hover:text-muted-foreground/80" : "text-foreground hover:text-primary"
                  )}
                >
                  {cleanTitle}
                </a>
              ) : (
                <p className={cn("text-[12px] font-medium leading-snug line-clamp-2", isDelivered && "text-muted-foreground")}>{cleanTitle}</p>
              )}
            </div>

            {/* Always-visible action icons */}
            <div className="flex gap-0.5 shrink-0 -mt-0.5 -mr-1">
              {isFirma && task.html_content && (
                <button
                  onClick={(e) => { e.stopPropagation(); setPreviewTask(task); setLiveHtmlContent(task.html_content || ""); setShowEditChat(false); }}
                  className="h-6 w-6 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors"
                  title="Ver documento"
                >
                  <Eye className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Prescription badge */}
          {(() => {
            const prescInfo = getPrescriptionInfo(task);
            if (!prescInfo) return null;
            return (
              <div className={cn("flex items-center gap-1 mt-1.5 text-[10px] font-medium", prescInfo.color, prescInfo.blink && "animate-pulse")}>
                <Clock className="h-2.5 w-2.5" />
                {prescInfo.label}
              </div>
            );
          })()}

          {/* Type + severity badge + signature deadline (compact, same row) */}
          {(() => {
            if (!isFirma) return null;
            const normalizedTipo = String(task.documento_tipo || '').trim().toLowerCase();
            const normalizedGravedad = String(task.gravedad_final || '').trim().toLowerCase();
            const inferredTipo = normalizedTipo === 'sancion' || normalizedTipo === 'amonestacion'
              ? normalizedTipo
              : normalizedGravedad === 'grave' || normalizedGravedad === 'muy_grave'
                ? 'sancion'
                : normalizedGravedad
                  ? 'amonestacion'
                  : '';
            const hasTypeBadge = !!(inferredTipo || normalizedGravedad);
            const dl = getSignatureDeadline(task);
            if (!hasTypeBadge && !dl) return null;

            const shortDate = dl
              ? dl.deadlineDate.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')
              : '';
            const dlText = dl ? (dl.isOverdue ? 'Vencido' : dl.isToday ? 'Hoy' : shortDate) : '';
            const dlTone = dl
              ? (isDelivered
                ? "border-border/30 bg-muted/40 text-muted-foreground"
                : dl.isOverdue || dl.isToday
                  ? "border-destructive/40 bg-destructive/10 text-destructive animate-pulse"
                  : dl.daysLeft <= 2
                    ? "border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400")
              : '';
            const dlTitle = dl
              ? `La suspensión de empleo y sueldo (${task.suspension_dias} día${task.suspension_dias === 1 ? '' : 's'}) comienza el ${dl.suspStartLabel}. El documento debe firmarse antes de esa fecha.`
              : '';

            return (
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                {hasTypeBadge && (
                  <span
                    className={cn(
                      "inline-block text-[9px] font-medium px-2 py-0.5 rounded-full border leading-tight",
                      isDelivered
                        ? "border-border/30 text-muted-foreground bg-muted/50"
                        : inferredTipo === 'sancion'
                          ? "border-destructive/30 text-destructive/80 bg-destructive/5"
                          : "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5"
                    )}
                  >
                    {inferredTipo === 'sancion' ? 'Sanción' : 'Amonestación'}
                    {normalizedGravedad && ` · ${normalizedGravedad === 'muy_grave' ? 'Muy grave' : normalizedGravedad.charAt(0).toUpperCase() + normalizedGravedad.slice(1)}`}
                  </span>
                )}
                {dl && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-medium leading-tight max-w-full",
                      dlTone
                    )}
                    title={dlTitle}
                  >
                    <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{dlText}</span>
                  </span>
                )}
              </div>
            );
          })()}

          {/* Footer: time only (remove department if "Desconocido") */}
          <div className={cn("flex items-center gap-1.5 mt-2 text-[10px]", isDelivered ? "text-muted-foreground/40" : "text-muted-foreground")}>
            {task.department_name && task.department_name !== 'Desconocido' && (
              <>
                <span className="truncate">{task.department_name}</span>
                <span>·</span>
              </>
            )}
            <span className="shrink-0">{formatDistanceToNow(new Date(task.created_at), { addSuffix: true, locale: es })}</span>
          </div>

          {/* Kanban action buttons (always visible) */}
          {!isCompleted && !isDelivered && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {canResendSuspensionAviso(task) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px] rounded-lg gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 dark:text-amber-400 dark:hover:text-amber-300 transition-colors"
                  onClick={(e) => { e.stopPropagation(); handleResendSuspensionAviso(task); }}
                  disabled={resendingAvisoId === task.id}
                  title="Reenviar a RRHH el aviso anticipado de suspensión con el enlace al documento"
                >
                  {resendingAvisoId === task.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Send className="h-2.5 w-2.5" />}
                  Reenviar aviso
                </Button>
              )}
              {isFirma && task.status === 'pending' && (
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] rounded-lg gap-1 text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors" onClick={(e) => { e.stopPropagation(); handlePrint(task); }} disabled={printingTaskId === task.id}>
                  {printingTaskId === task.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Printer className="h-2.5 w-2.5" />}
                  Imprimir
                </Button>
              )}
              {isFirma && task.status === 'pending' && (() => {
                 const custom = customSignDates[task.id];
                 const customDate = parseLocalDate(custom);
                 return (
                   <Button
                     size="sm"
                     variant="ghost"
                     className={cn(
                       "h-6 px-2 text-[10px] rounded-lg gap-1 transition-colors",
                       customDate
                         ? "text-primary bg-primary/10 hover:bg-primary/15"
                         : "text-muted-foreground/50 hover:text-primary hover:bg-primary/10"
                     )}
                     onClick={(e) => { e.stopPropagation(); openDateEditor(task); }}
                     title="Cambiar la fecha que aparece en el documento"
                   >
                     <Clock className="h-2.5 w-2.5" />
                     {customDate ? formatDateEs(customDate) : 'Fecha doc.'}
                   </Button>
                 );
               })()}
              {isFirma && task.status === 'printed' && (
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] rounded-lg gap-1 text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors" onClick={(e) => {
                  e.stopPropagation();
                  const input = document.createElement('input');
                  input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
                  input.onchange = (ev) => { const file = (ev.target as HTMLInputElement).files?.[0]; if (file) handleUploadPhoto(task, file); };
                  input.click();
                }} disabled={uploadingTaskId === task.id}>
                  {uploadingTaskId === task.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Camera className="h-2.5 w-2.5" />}
                  Foto
                </Button>
              )}
              {isFirma && task.status === 'awaiting_signature' && (
                <>
                  {!task.scanned_signed_pdf_url ? (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] rounded-lg gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 dark:text-amber-400" onClick={(e) => {
                      e.stopPropagation();
                      const input = document.createElement('input');
                      input.type = 'file'; input.accept = 'application/pdf';
                      input.onchange = (ev) => { const file = (ev.target as HTMLInputElement).files?.[0]; if (file) handleUploadScannedPdf(task, file); };
                      input.click();
                    }} disabled={uploadingTaskId === task.id} title="Subir PDF firmado escaneado">
                      {uploadingTaskId === task.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <ScanLine className="h-2.5 w-2.5" />}
                      Escanear
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] rounded-lg gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400" onClick={(e) => { e.stopPropagation(); handleViewScannedPdf(task); }} title="PDF escaneado subido — click para ver">
                      <FileText className="h-2.5 w-2.5" />
                      PDF ✓
                    </Button>
                  )}
                </>
              )}
              {!isFirma && task.status === 'pending' && (
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] rounded-lg gap-1 text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors" onClick={(e) => { e.stopPropagation(); handleAction(task.id, 'complete'); }} disabled={actioning === task.id}>
                  {actioning === task.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Check className="h-2.5 w-2.5" />}
                  Hecho
                </Button>
              )}
            </div>
          )}

          {/* Completed: deliver to RRHH + download/view */}
          {isCompleted && isFirma && (
            <div className="flex gap-1 mt-2">
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] rounded-lg gap-1 text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors" onClick={(e) => { e.stopPropagation(); handleDeliverToRRHH(task); }} disabled={actioning === task.id}>
                {actioning === task.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <FileCheck className="h-2.5 w-2.5" />}
                Subir a RRHH
              </Button>
              {(task.signed_photo_urls?.length || task.signed_photo_url) && (
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 rounded-lg text-muted-foreground/50 hover:text-primary" onClick={(e) => { e.stopPropagation(); handleViewSignedPhotos(task); }}>
                  <Image className="h-3 w-3" />
                </Button>
              )}
              {task.pdf_url && (
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 rounded-lg text-muted-foreground/50 hover:text-primary" onClick={(e) => { e.stopPropagation(); handleDownloadSingle(task); }} disabled={downloading}>
                  <Download className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
        </div>
      );
    }

    // List view card (unchanged structure)
    return (
      <Card
        key={task.id}
        draggable={draggable}
        onDragStart={draggable ? (e) => handleDragStart(e, task.id) : undefined}
        onClick={isFirma && task.html_content ? () => {
          setPreviewTask(task);
          setLiveHtmlContent(task.html_content || "");
          setShowEditChat(false);
        } : undefined}
        className={cn(
          "rounded-2xl border-border/30 transition-all",
          isOverdue && "ring-1 ring-destructive/20",
          draggable && "cursor-grab active:cursor-grabbing",
          isFirma && task.html_content && "cursor-pointer hover:border-primary/30",
        )}
      >
        <CardContent className="p-3">
          <div className="flex items-start gap-2.5">
            {/* Selection circle */}
            {((task.status === 'completed' && isFirma && task.signed_photo_url) || (task.status === 'pending') || (task.status === 'awaiting_signature')) && (
              <button
                onClick={(e) => { e.stopPropagation(); toggleSelect(task.id); }}
                className={cn(
                  "mt-0.5 h-5 w-5 rounded-full border shrink-0 flex items-center justify-center transition-all duration-150",
                  selectedIds.has(task.id)
                    ? "bg-primary border-primary"
                    : "border-border/60 hover:border-muted-foreground/50"
                )}
              >
                {selectedIds.has(task.id) && <Check className="h-3 w-3 text-primary-foreground" />}
              </button>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {salixUrl ? (
                  <a href={salixUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-sm font-medium truncate hover:text-primary hover:underline transition-colors">
                    {cleanTitle}
                  </a>
                ) : (
                  <p className="text-sm font-medium truncate">{cleanTitle}</p>
                )}
                {task.status !== 'pending' && (
                  <Badge 
                    variant="secondary" 
                    className={cn(
                      "text-[10px] shrink-0",
                      task.status === 'printed' && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                      task.status === 'awaiting_signature' && "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
                      task.status === 'completed' && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                      task.status === 'delivered_rrhh' && "bg-primary/10 text-primary",
                    )}
                  >
                    {task.status === 'printed' && 'Imprimido'}
                    {task.status === 'awaiting_signature' && `Pte. firma${(task.signed_photo_urls?.length || 0) > 0 ? ` (${task.signed_photo_urls!.length} foto${task.signed_photo_urls!.length > 1 ? 's' : ''})` : ''}`}
                    {task.status === 'completed' && 'Firmado'}
                    {task.status === 'delivered_rrhh' && 'Doc. entregado'}
                  </Badge>
                )}
                {/* Prescription indicator */}
                {(() => {
                  const prescInfo = getPrescriptionInfo(task);
                  if (!prescInfo) return null;
                  return (
                    <span className={cn("text-[10px] shrink-0 flex items-center gap-0.5 font-medium", prescInfo.color, prescInfo.blink && "animate-pulse")}>
                      <Clock className="h-2.5 w-2.5" />
                      {prescInfo.label}
                    </span>
                  );
                })()}
                {/* Document type + severity badge */}
                {(() => {
                  if (!isFirma) return null;
                  const normalizedTipo = String(task.documento_tipo || '').trim().toLowerCase();
                  const normalizedGravedad = String(task.gravedad_final || '').trim().toLowerCase();
                  const inferredTipo = normalizedTipo === 'sancion' || normalizedTipo === 'amonestacion'
                    ? normalizedTipo
                    : normalizedGravedad === 'grave' || normalizedGravedad === 'muy_grave'
                      ? 'sancion'
                      : normalizedGravedad
                        ? 'amonestacion'
                        : '';
                  if (!inferredTipo && !normalizedGravedad) return null;
                  return (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] shrink-0 font-medium px-1.5 py-0 h-4 rounded-full border",
                        inferredTipo === 'sancion'
                          ? "border-destructive/40 text-destructive bg-destructive/5"
                          : "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/5"
                      )}
                    >
                      {inferredTipo === 'sancion' ? 'Sanción' : 'Amonestación'}
                      {normalizedGravedad && ` · ${normalizedGravedad === 'muy_grave' ? 'Muy grave' : normalizedGravedad.charAt(0).toUpperCase() + normalizedGravedad.slice(1)}`}
                    </Badge>
                  );
                })()}
              </div>
              {task.description && (
                <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1 ml-5.5">{task.description}</p>
              )}
              <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground ml-5.5">
                <span>{task.department_name}</span>
                <span>·</span>
                <span>{formatDistanceToNow(new Date(task.created_at), { addSuffix: true, locale: es })}</span>
                {task.due_at && (
                  <>
                    <span>·</span>
                    <span className={isOverdue ? 'text-destructive font-medium' : ''}>
                      Vence {new Date(task.due_at).toLocaleDateString('es-ES')}
                    </span>
                  </>
                )}
                {salixUrl && (
                  <>
                    <span>·</span>
                    <a href={salixUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                      Salix <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </>
                )}
                {task.completed_by && (
                  <>
                    <span>·</span>
                    <span>Por: {task.completed_by}</span>
                  </>
                )}
                {/* Fecha límite de firma para sanciones con suspensión */}
                {isFirma && (() => {
                  const dl = getSignatureDeadline(task);
                  if (!dl) return null;
                  const shortDate = dl.deadlineDate
                    .toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
                    .replace(/\./g, '');
                  const dlText = dl.isOverdue ? 'Vencido' : dl.isToday ? 'Hoy' : shortDate;
                  const tone = dl.isOverdue || dl.isToday
                    ? "border-destructive/40 bg-destructive/10 text-destructive animate-pulse"
                    : dl.daysLeft <= 2
                      ? "border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400";
                  return (
                    <>
                      <span>·</span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-medium leading-tight",
                          tone
                        )}
                        title={`La suspensión de empleo y sueldo (${task.suspension_dias} día${task.suspension_dias === 1 ? '' : 's'}) comienza el ${dl.suspStartLabel}. El documento debe firmarse antes de esa fecha.`}
                      >
                        <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                        {dlText}
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>
            {/* Actions based on task phase */}
            <div className="flex gap-1.5 shrink-0 flex-wrap items-center">
              {/* SUSPENSION: Resend aviso anticipado a RRHH (visible mientras no esté firmado) */}
              {canResendSuspensionAviso(task) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2.5 text-[11px] rounded-lg gap-1 shrink-0 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 dark:text-amber-400 dark:hover:text-amber-300 transition-colors"
                  onClick={(e) => { e.stopPropagation(); handleResendSuspensionAviso(task); }}
                  disabled={resendingAvisoId === task.id}
                  title="Reenviar a RRHH el aviso anticipado de suspensión con el enlace al documento"
                >
                  {resendingAvisoId === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Reenviar aviso
                </Button>
              )}
              {/* PENDING: Print button */}
              {isFirma && task.status === 'pending' && (
                <Button size="sm" variant="ghost" className="h-7 px-2.5 text-[11px] rounded-lg gap-1 shrink-0 text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors" onClick={(e) => { e.stopPropagation(); handlePrint(task); }} disabled={printingTaskId === task.id}>
                  {printingTaskId === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
                  Imprimir
                </Button>
              )}
              {isFirma && task.status === 'pending' && (() => {
                 const custom = customSignDates[task.id];
                 const customDate = parseLocalDate(custom);
                 return (
                   <Button
                     size="sm"
                     variant="ghost"
                     className={cn(
                       "h-7 px-2.5 text-[11px] rounded-lg gap-1 shrink-0 transition-colors",
                       customDate
                         ? "text-primary bg-primary/10 hover:bg-primary/15"
                         : "text-muted-foreground/50 hover:text-primary hover:bg-primary/10"
                     )}
                     onClick={(e) => { e.stopPropagation(); openDateEditor(task); }}
                     title="Cambiar la fecha que aparece en el documento"
                   >
                     <Clock className="h-3 w-3" />
                     {customDate ? formatDateEs(customDate) : 'Cambiar fecha doc.'}
                   </Button>
                 );
               })()}
              {/* PRINTED: Upload photo button */}
              {isFirma && task.status === 'printed' && (
                <Button size="sm" variant="ghost" className="h-7 px-2.5 text-[11px] rounded-lg gap-1 shrink-0 text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors" onClick={(e) => {
                  e.stopPropagation();
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.capture = 'environment';
                  input.onchange = (ev) => {
                    const file = (ev.target as HTMLInputElement).files?.[0];
                    if (file) handleUploadPhoto(task, file);
                  };
                  input.click();
                }} disabled={uploadingTaskId === task.id}>
                  {uploadingTaskId === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                  Subir foto firma
                </Button>
              )}
              {/* AWAITING_SIGNATURE: View photos + Add more + Finalize */}
              {isFirma && task.status === 'awaiting_signature' && (
                <>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-primary shrink-0"
                    onClick={(e) => { e.stopPropagation(); handleViewSignedPhotos(task); }}
                    title={`Ver ${task.signed_photo_urls?.length || 1} foto(s)`}
                  >
                    <Image className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] rounded-lg gap-1 shrink-0" onClick={(e) => {
                    e.stopPropagation();
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.capture = 'environment';
                    input.onchange = (ev) => {
                      const file = (ev.target as HTMLInputElement).files?.[0];
                      if (file) handleUploadPhoto(task, file);
                    };
                    input.click();
                  }} disabled={uploadingTaskId === task.id}>
                    {uploadingTaskId === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                    + Foto
                  </Button>
                  {/* Scanned signed PDF: upload, view, replace, delete */}
                  {!task.scanned_signed_pdf_url ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px] rounded-lg gap-1 shrink-0 border-amber-500/40 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
                      onClick={(e) => {
                        e.stopPropagation();
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'application/pdf';
                        input.onchange = (ev) => {
                          const file = (ev.target as HTMLInputElement).files?.[0];
                          if (file) handleUploadScannedPdf(task, file);
                        };
                        input.click();
                      }}
                      disabled={uploadingTaskId === task.id}
                      title="Subir PDF escaneado de la sanción/amonestación firmada — se adjuntará al correo de RRHH"
                    >
                      {uploadingTaskId === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ScanLine className="h-3 w-3" />}
                      Escanear
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0 px-2 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                      <FileText className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">PDF firmado</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleViewScannedPdf(task); }}
                        className="ml-1 text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-200 transition-colors"
                        title="Ver PDF escaneado"
                      >
                        <Eye className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = 'application/pdf';
                          input.onchange = (ev) => {
                            const file = (ev.target as HTMLInputElement).files?.[0];
                            if (file) handleUploadScannedPdf(task, file);
                          };
                          input.click();
                        }}
                        className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-200 transition-colors"
                        title="Reemplazar PDF escaneado"
                        disabled={uploadingTaskId === task.id}
                      >
                        {uploadingTaskId === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ScanLine className="h-3 w-3" />}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteScannedPdf(task); }}
                        className="text-emerald-600/70 hover:text-destructive transition-colors"
                        title="Eliminar PDF escaneado"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </>
              )}
              {/* COMPLETED: View signed photos */}
              {/* COMPLETED: Deliver to RRHH + View photos + Download */}
              {isFirma && task.status === 'completed' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2.5 text-[11px] rounded-lg gap-1 shrink-0 text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors"
                  onClick={(e) => { e.stopPropagation(); handleDeliverToRRHH(task); }}
                  disabled={actioning === task.id}
                >
                  {actioning === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCheck className="h-3 w-3" />}
                  Subir a RRHH
                </Button>
              )}
              {isFirma && (task.status === 'completed' || task.status === 'delivered_rrhh') && (task.signed_photo_urls?.length || task.signed_photo_url) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-primary shrink-0"
                  onClick={(e) => { e.stopPropagation(); handleViewSignedPhotos(task); }}
                  title="Ver fotos de firma"
                >
                  <Image className="h-3.5 w-3.5" />
                </Button>
              )}
              {/* Download PDF for completed/delivered tasks */}
              {isFirma && (task.status === 'completed' || task.status === 'delivered_rrhh') && task.pdf_url && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-primary shrink-0"
                  onClick={(e) => { e.stopPropagation(); handleDownloadSingle(task); }}
                  disabled={downloading}
                  title="Descargar PDF"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              )}
              {/* Non-firma tasks: original buttons */}
              {task.status === 'pending' && !isFirma && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-destructive"
                    onClick={() => handleAction(task.id, 'dismiss')}
                    disabled={actioning === task.id}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 px-2.5 text-[11px] rounded-lg gap-1"
                    onClick={() => handleAction(task.id, 'complete')}
                    disabled={actioning === task.id}
                  >
                    {actioning === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Hecho
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Tareas automáticas</h2>
            <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
              Generadas por el sistema: reincidencias detectadas, propuestas pendientes, prescripciones próximas, recordatorios y documentos pendientes de firma.
            </p>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => { setEmailConfigOpen(true); loadEmailConfig(); }}
            className="p-1.5 rounded-lg transition-colors text-muted-foreground hover:bg-muted"
            title="Configurar emails"
          >
            <Mail className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn("p-1.5 rounded-lg transition-colors", viewMode === 'list' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            title="Vista lista"
          >
            <LayoutList className="h-4 w-4" />
          </button>
          <button
            onClick={() => { setViewMode('kanban'); setFilterStatus('all'); }}
            className={cn("p-1.5 rounded-lg transition-colors", viewMode === 'kanban' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            title="Vista Kanban"
          >
            <Columns3 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1 flex-wrap">
        {typeFilters.map(f => (
          <button
            key={f.id}
            onClick={() => setFilterType(f.id)}
            className={cn(
              "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors",
              filterType === f.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
        {viewMode === 'list' && (
          <>
            <span className="text-border mx-1">|</span>
            {statusFilters.map(f => (
              <button
                key={f.id}
                onClick={() => { setFilterStatus(f.id); setSelectedIds(new Set()); }}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors",
                  filterStatus === f.id ? "bg-foreground text-background" : "bg-muted/50 text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
            <span className="text-border mx-1">|</span>
            {periodFilters.map(f => (
              <button
                key={f.id}
                onClick={() => { setPeriodFilter(f.id); setSelectedIds(new Set()); }}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors",
                  periodFilter === f.id ? "bg-primary/15 text-primary" : "bg-muted/50 text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Selection action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/40 border border-border/30">
          <span className="text-[11px] text-muted-foreground">
            {selectedIds.size} seleccionado{selectedIds.size > 1 ? 's' : ''}
          </span>
          <div className="flex gap-1.5 ml-auto">
            <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={deselectAll}>Deseleccionar</Button>
            <Button size="sm" className="h-7 text-[11px] gap-1" onClick={handleBatchFinalize} disabled={actioning === 'batch'}>
              {actioning === 'batch' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Finalizar ({selectedIds.size})
            </Button>
            {filterStatus === 'completed' && (
              <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={handleDownloadBatch} disabled={downloading}>
                {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                Descargar ({selectedIds.size})
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-2">
          {/* Staggered skeleton task cards */}
          {Array.from({ length: 6 }).map((_, i) => (
            <Card
              key={i}
              className="rounded-2xl border-border/30 animate-pulse"
              style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'backwards' }}
            >
              <CardContent className="p-3">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 h-5 w-5 rounded-full bg-muted/60 shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-3.5 w-3.5 rounded bg-muted/50 shrink-0" />
                      <div className="h-4 rounded-md bg-muted/60" style={{ width: `${140 + (i % 3) * 40}px` }} />
                      <div className="h-4 w-16 rounded-full bg-muted/40 shrink-0" />
                    </div>
                    <div className="flex items-center gap-2 ml-5">
                      <div className="h-3 w-20 rounded bg-muted/40" />
                      <div className="h-3 w-1 rounded bg-muted/30" />
                      <div className="h-3 w-16 rounded bg-muted/40" />
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <div className="h-7 w-20 rounded-lg bg-muted/50" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {kanbanCols.map(col => {
            const colTasks = filteredTasks
              .filter(t => t.status === col.id)
              .slice()
              .sort((a, b) => {
                // Order by prescription days remaining (ascending: most urgent first).
                // Tasks without prescription info go to the end, sorted by creation date desc.
                const infoA = getPrescriptionInfo(a);
                const infoB = getPrescriptionInfo(b);
                if (infoA && infoB) return infoA.daysLeft - infoB.daysLeft;
                if (infoA) return -1;
                if (infoB) return 1;
                const dA = new Date(a.created_at || 0).getTime();
                const dB = new Date(b.created_at || 0).getTime();
                return dB - dA;
              });
            const isCompletedCol = false;
            return (
              <div
                key={col.id}
                className={cn(
                  "rounded-2xl p-3 min-h-[240px] transition-all",
                  dragOverCol === col.id
                    ? "bg-primary/5 ring-2 ring-primary/30"
                    : isCompletedCol
                      ? "bg-muted/10"
                      : "bg-muted/20"
                )}
                onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.id); }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={(e) => handleDrop(e, col.id)}
              >
                 <div className="flex items-center gap-2 mb-3 px-1">
                   <div className={cn("w-1.5 h-1.5 rounded-full", col.dotColor)} />
                   <span className={cn("text-[11px] font-semibold tracking-[-0.01em]", isCompletedCol && "text-muted-foreground/60")}>{col.label}</span>
                   <span className={cn("text-[10px] font-medium ml-auto tabular-nums", isCompletedCol ? "text-muted-foreground/40" : "text-muted-foreground")}>{colTasks.length}</span>
                   {col.id === 'awaiting_signature' && colTasks.length > 0 && (
                     <button
                       type="button"
                       onClick={() => bulkScanInputRef.current?.click()}
                       className="ml-1 inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 hover:bg-violet-100 transition-colors dark:border-violet-900/40 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950/60"
                       title="Escanear un PDF que contenga varias firmas y repartirlo automáticamente"
                     >
                       <ScanLine className="h-3 w-3" />
                       Escanear todas
                     </button>
                   )}
                 </div>
                <div className="space-y-2">
                  {colTasks.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground/30 text-center py-8">Sin tareas</p>
                  ) : (
                    colTasks.map(task => renderTaskCard(task, true, true))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center py-8 gap-1.5 opacity-0 animate-scale-in">
          <CheckCircle className="h-7 w-7 text-primary" />
          <p className="text-sm font-medium">Todo al día</p>
          <p className="text-[11px] text-muted-foreground">No hay tareas con estos filtros</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTasks.map(task => renderTaskCard(task))}
        </div>
      )}

      {/* Signature Dialog */}
      <Dialog open={!!signTask} onOpenChange={open => { if (!open) { setSignTask(null); setSignStep('sign'); } }}>
        <DialogContent aria-describedby={undefined} className="max-w-4xl w-[calc(100vw-2rem)] max-h-[88vh] my-auto rounded-xl flex flex-col p-0 gap-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-border/30">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold truncate">
                {signStep === 'sign' ? 'Firma del documento' : 'Enviar copia firmada'}
                {signTask?.worker_name && ` — ${signTask.worker_name}`}
              </h3>
            </div>
            {(() => {
              const signTaskWorkerNumber = getTaskWorkerNumber(signTask);
              const signTaskSalixUrl = signTaskWorkerNumber ? `https://salix.verdnatura.es/#!/worker/${signTaskWorkerNumber}/summary` : null;
              if (!signTaskSalixUrl) return null;

              return (
                <a
                  href={signTaskSalixUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 shrink-0 mr-8"
                  onClick={e => e.stopPropagation()}
                >
                  Salix <ExternalLink className="h-3 w-3" />
                </a>
              );
            })()}
          </div>

          {/* Toggles bar */}
          {signStep === 'sign' && (
            <div className="flex items-center gap-5 px-5 py-2 border-b border-border/20 bg-muted/30">
              <div className="flex items-center gap-2">
                <Switch id="no-conforme" checked={noConforme} onCheckedChange={setNoConforme} disabled={negadoFirmar} />
                <Label htmlFor="no-conforme" className="text-[11px] font-medium cursor-pointer">No conforme</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="negado-firmar" checked={negadoFirmar} onCheckedChange={(v) => { setNegadoFirmar(v); if (v) { setNoConforme(false); setSignatureData(null); } }} />
                <Label htmlFor="negado-firmar" className="text-[11px] font-medium cursor-pointer flex items-center gap-1">
                  <Users className="h-3 w-3" /> Se niega a firmar (testigos)
                </Label>
              </div>
            </div>
          )}

          {/* Step indicators */}
          <div className="flex items-center gap-2 px-5 py-2.5 border-b border-border/20">
            {(['sign', 'email'] as SignStep[]).map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                {i > 0 && <div className="w-8 h-px bg-border" />}
                <div className={cn(
                  "flex items-center gap-1.5 text-[11px] font-medium",
                  signStep === step ? "text-primary" : "text-muted-foreground/40"
                )}>
                  <span className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[10px]",
                    signStep === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}>
                    {i + 1}
                  </span>
                  {step === 'sign' && 'Leer y firmar'}
                  {step === 'email' && 'Enviar'}
                </div>
              </div>
            ))}
          </div>

          {/* Content */}
          {signStep === 'sign' && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* A4 Document Preview (scaled to fit viewport, scrollable + pinch-to-zoom) */}
              <div
                className="flex-1 overflow-auto bg-neutral-200 dark:bg-neutral-800"
                style={{ touchAction: "pan-x pan-y pinch-zoom" }}
                ref={(container) => {
                  if (!container) return;
                  const docEl = container.querySelector('.a4-scale-wrapper') as HTMLElement;
                  if (!docEl) return;
                  const fit = () => {
                    const cw = container.clientWidth;
                    const dw = 793;
                    const s = Math.min(1, (cw - 48) / dw);
                    const scaledWidth = dw * s;
                    const leftOffset = Math.max(0, (cw - scaledWidth) / 2);
                    docEl.style.transform = `scale(${s})`;
                    docEl.style.transformOrigin = 'top left';
                    docEl.style.marginLeft = `${leftOffset}px`;
                    docEl.style.marginRight = '0';
                    docEl.style.marginTop = '8px';
                    docEl.style.marginBottom = `-${docEl.scrollHeight * (1 - s) - 8}px`;
                  };
                  fit();
                  const ro = new ResizeObserver(fit);
                  ro.observe(container);
                }}
              >
                <div className="a4-scale-wrapper bg-white shadow-xl rounded-sm" style={{ width: '793px' }}>
                  {renderDocumentForSigning()}
                </div>
              </div>

              {/* Signature preview (shown when signature captured) */}
              {signatureData && !negadoFirmar && (
                <div className="flex items-center gap-3 px-5 py-3 border-t border-border/30 bg-primary/5">
                  <img src={signatureData} alt="Firma" className="h-10 border border-border/50 rounded bg-white px-2" />
                  <Badge variant="secondary" className="text-[10px]">Firma capturada{noConforme ? ' — No conforme' : ''}</Badge>
                  <Button variant="ghost" size="sm" className="text-[11px] ml-auto" onClick={() => setFirmaPopupOpen(true)}>Volver a firmar</Button>
                </div>
              )}

              {negadoFirmar && testigo1Firma && testigo2Firma && (
                <div className="flex items-center gap-3 px-5 py-3 border-t border-border/30 bg-primary/5">
                  <Badge variant="secondary" className="text-[10px]">Testigos capturados</Badge>
                  <Button variant="ghost" size="sm" className="text-[11px] ml-auto" onClick={() => setFirmaPopupOpen(true)}>Editar testigos</Button>
                </div>
              )}

              {/* Actions fixed at bottom */}
              <div className="flex gap-2 justify-end px-5 py-3 border-t border-border/30 bg-background shrink-0">
                <Button variant="outline" size="sm" onClick={() => setSignTask(null)}>Cancelar</Button>
                <button
                  type="button"
                  onClick={() => setFirmaPopupOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                >
                  <PenTool className="h-3 w-3" />
                  {negadoFirmar ? 'Firmar (testigos)' : 'Firmar'}
                </button>
                {(() => {
                  const hasAllData = negadoFirmar
                    ? (testigo1Firma && testigo2Firma && testigo1Nombre.trim() && testigo2Nombre.trim() && testigo1Dni.trim() && testigo2Dni.trim())
                    : !!signatureData;
                  if (!hasAllData) return null;
                  return (
                    <Button size="sm" onClick={handleSign} disabled={signing} className="gap-1">
                      {signing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3 w-3" />}
                      Enviar documento
                    </Button>
                  );
                })()}
              </div>

              {/* Signature Popup Dialog */}
              <Dialog open={firmaPopupOpen} onOpenChange={setFirmaPopupOpen} modal={false}>
                <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-sm">
                      {negadoFirmar ? 'Firma de testigos' : (signTask?.worker_name || 'Firma del trabajador')}
                    </DialogTitle>
                  </DialogHeader>
                  {negadoFirmar ? (
                    <div className="space-y-4">
                      <p className="text-xs text-muted-foreground">
                        {signTask?.worker_name || 'El/La trabajador/a'} se niega a firmar — Testigos presenciales:
                      </p>
                      {([
                        { label: 'Testigo 1', nombre: testigo1Nombre, setNombre: setTestigo1Nombre, dni: testigo1Dni, setDni: setTestigo1Dni, firma: testigo1Firma, setFirma: setTestigo1Firma },
                        { label: 'Testigo 2', nombre: testigo2Nombre, setNombre: setTestigo2Nombre, dni: testigo2Dni, setDni: setTestigo2Dni, firma: testigo2Firma, setFirma: setTestigo2Firma },
                      ] as const).map((t, i) => (
                        <div key={i} className={cn("space-y-2", i === 0 && "pb-4 border-b border-border/30")}>
                          <p className="text-[11px] font-semibold">{t.label}</p>
                          <div className="flex gap-2">
                            <Input placeholder="Nombre y apellidos" value={t.nombre} onChange={e => t.setNombre(e.target.value)} className="text-xs h-8" />
                            <Input placeholder="DNI" value={t.dni} onChange={e => t.setDni(e.target.value)} className="text-xs h-8 w-32" />
                          </div>
                          <SignatureCanvas onSignatureChange={t.setFirma} height={100} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <SignatureCanvas onSignatureChange={(sig) => { setSignatureData(sig); if (sig) setFirmaPopupOpen(false); }} height={120} />
                      {noConforme && signatureData && (
                        <p className="text-center text-destructive font-bold text-xs">No conforme</p>
                      )}
                    </div>
                  )}
                  <DialogFooter>
                    <Button size="sm" variant="outline" onClick={() => setFirmaPopupOpen(false)}>Cerrar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {signStep === 'email' && (
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
                <Check className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Documento firmado correctamente</span>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Email del trabajador (editable)</label>
                <Input placeholder="email@ejemplo.com" value={emailAddress} onChange={e => setEmailAddress(e.target.value)} className="rounded-xl" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setSignTask(null)}>Cerrar</Button>
                <Button size="sm" onClick={handleSendEmail} disabled={sendingEmail || !emailAddress.trim()} className="gap-1">
                  {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-3 w-3" /> Guardar y enviar</>}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Document Preview Dialog */}
      <Dialog open={!!previewTask} onOpenChange={open => { if (!open) { setPreviewTask(null); setShowEditChat(false); fetchTasks(); } }}>
        <DialogContent className="max-w-7xl w-[calc(100vw-2rem)] max-h-[92vh] my-auto rounded-xl flex flex-col p-0 gap-0 overflow-hidden" hideCloseButton>
          {/* Header */}
          <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-border/30 shrink-0">
            <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold truncate">
                {previewTask?.title}
                {previewTask?.worker_name && ` — ${previewTask.worker_name}`}
              </h3>
            </div>
            <div className="flex gap-1.5 shrink-0">
              {previewTask?.legal_document_id && (
                <Button
                  size="sm"
                  variant={showEditChat ? "default" : "outline"}
                  className="h-7 px-2.5 text-[11px] rounded-lg gap-1"
                  onClick={() => setShowEditChat(v => !v)}
                >
                  <Bot className="h-3 w-3" />
                  {showEditChat ? 'Cerrar editor' : 'Editar con IA'}
                </Button>
              )}
              {previewTask && previewTask.type === 'firma_documento' && previewTask.status === 'pending' && (() => {
                 const custom = customSignDates[previewTask.id];
                 const customDate = parseLocalDate(custom);
                 return (
                   <Button
                     size="sm"
                     variant="outline"
                     className={cn(
                       "h-7 px-2.5 text-[11px] rounded-lg gap-1",
                       customDate && "border-primary/40 text-primary hover:bg-primary/5"
                     )}
                     onClick={() => openDateEditor(previewTask)}
                     title="Cambiar la fecha que aparece en el documento"
                   >
                     <Clock className="h-3 w-3" />
                     {customDate ? formatDateEs(customDate) : 'Cambiar fecha doc.'}
                   </Button>
                 );
               })()}
              <Button
                size="sm"
                className="h-7 px-2.5 text-[11px] rounded-lg gap-1"
                onClick={() => { if (previewTask) handlePrint({ ...previewTask, html_content: liveHtmlContent || previewTask.html_content }); }}
                disabled={printingTaskId === previewTask?.id}
              >
                {printingTaskId === previewTask?.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
                Imprimir
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg" onClick={() => { setPreviewTask(null); setShowEditChat(false); }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Body: iframe + optional side panel */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Document preview */}
            <div className={cn("transition-all duration-200 overflow-auto bg-neutral-200 dark:bg-neutral-800 p-4 flex justify-center", showEditChat ? "w-3/5" : "w-full")}>
              <iframe
                key={`${liveHtmlContent?.length || 0}-${showEditChat}-${previewTask?.id ? customSignDates[previewTask.id] || '' : ''}`}
                srcDoc={injectPrintDate(liveHtmlContent || previewTask?.html_content || '', previewTask ? parseLocalDate(customSignDates[previewTask.id]) : undefined)}
                className="bg-white shadow-xl rounded-sm border-0 shrink-0"
                style={{ width: '793px', minHeight: '1122px', border: 'none' }}
                title="Previsualización del documento"
              />
            </div>

            {/* AI Edit Chat panel */}
            {showEditChat && previewTask?.legal_document_id && (
              <div className="w-2/5 border-l border-border/30 flex flex-col bg-background">
                <LegalDocumentEditChat
                  documentId={previewTask.legal_document_id}
                  htmlContent={liveHtmlContent || previewTask.html_content || ''}
                  onDocumentUpdated={(newHtml) => {
                    setLiveHtmlContent(newHtml);
                  }}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Email Config Dialog — two purposes */}
      <Dialog open={emailConfigOpen} onOpenChange={setEmailConfigOpen}>
        <DialogContent className="max-w-md rounded-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Emails de notificación RRHH
            </DialogTitle>
          </DialogHeader>

          {(() => {
            const renderSection = (
              purpose: 'firma_entrega' | 'suspension_aviso',
              title: string,
              description: string,
              accentClass: string,
              inputValue: string,
              setInputValue: (v: string) => void,
            ) => {
              const list = configEmails.filter(e => (e.purpose || 'firma_entrega') === purpose);
              return (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-1.5 w-1.5 rounded-full", accentClass)} />
                    <h3 className="text-xs font-semibold">{title}</h3>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{description}</p>
                  {list.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground/70 italic py-1">No hay emails configurados.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {list.map(e => (
                        <div key={e.id} className="flex items-center justify-between gap-2 rounded-xl bg-muted/30 px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              className={cn("h-6 w-6 shrink-0 rounded-full flex items-center justify-center", e.is_primary ? "text-primary" : "text-muted-foreground")}
                              onClick={() => handleSetPrimaryConfigEmail(e.id)}
                              disabled={emailConfigLoading}
                              title={e.is_primary ? "Principal (TO)" : "Marcar como principal"}
                            >
                              <Star className={cn("h-3 w-3", e.is_primary && "fill-current")} />
                            </button>
                            <span className="truncate text-sm">{e.email}</span>
                            <Badge variant={e.is_primary ? "default" : "secondary"} className="text-[9px] px-1.5 py-0">
                              {e.is_primary ? "TO" : "CC"}
                            </Badge>
                          </div>
                          <Button size="sm" variant="ghost" className="h-6 w-6 shrink-0 p-0" onClick={() => handleRemoveConfigEmail(e.id)} disabled={emailConfigLoading}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      type="email" value={inputValue} onChange={ev => setInputValue(ev.target.value)}
                      className="h-8 rounded-xl flex-1 text-sm" placeholder="email@ejemplo.com"
                      onKeyDown={ev => ev.key === 'Enter' && handleAddConfigEmail(purpose)}
                    />
                    <Button size="sm" className="h-8 rounded-xl gap-1" onClick={() => handleAddConfigEmail(purpose)} disabled={emailConfigLoading}>
                      <Plus className="h-3 w-3" /> Añadir
                    </Button>
                  </div>
                </div>
              );
            };

            return (
              <div className="space-y-5">
                {emailConfigLoading && configEmails.length === 0 && (
                  <div className="flex justify-center py-2"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                )}
                {renderSection(
                  'firma_entrega',
                  'Aviso de firma / entrega',
                  'Reciben la notificación cuando la sanción se finaliza y se entrega el documento ya firmado.',
                  'bg-primary',
                  newConfigEmailFirma,
                  setNewConfigEmailFirma,
                )}
                <div className="border-t border-border/40" />
                {renderSection(
                  'suspension_aviso',
                  'Aviso de suspensión empleo y sueldo',
                  'Reciben un aviso informativo, con el documento aún sin firmar adjunto, en cuanto se aprueba una sanción con suspensión, para preparar la baja en Seguridad Social.',
                  'bg-amber-500',
                  newConfigEmailSusp,
                  setNewConfigEmailSusp,
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Edit signature date Dialog (only for prescribed tasks) */}
      <Dialog open={!!dateEditTask} onOpenChange={open => { if (!open) setDateEditTask(null); }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Fecha del documento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Ajusta la fecha que aparecerá impresa como "fecha de firma" en el documento. Debe corresponder a una fecha real dentro del plazo legal en la que el trabajador firme.
            </p>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Fecha de firma</Label>
              <div className="rounded-xl border border-border/60 bg-muted/30 p-2 flex justify-center">
                <Calendar
                  mode="single"
                  locale={es}
                  weekStartsOn={1}
                  selected={parseLocalDate(dateEditValue)}
                  onSelect={(d) => {
                    if (!d) return;
                    const dd = String(d.getDate()).padStart(2, '0');
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    setDateEditValue(`${d.getFullYear()}-${mm}-${dd}`);
                  }}
                  initialFocus
                  className={cn("p-2 pointer-events-auto")}
                />
              </div>
              {parseLocalDate(dateEditValue) && (
                <p className="text-[11px] text-muted-foreground text-center">
                  Aparecerá como: <span className="font-medium text-foreground">{formatDateEs(parseLocalDate(dateEditValue)!)}</span>
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            {dateEditTask && customSignDates[dateEditTask.id] && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => dateEditTask && clearCustomDate(dateEditTask.id)}
              >
                Quitar (usar hoy)
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setDateEditTask(null)}>
              Cancelar
            </Button>
            <Button size="sm" className="h-8 text-xs gap-1" onClick={saveDateEditor} disabled={!dateEditValue}>
              <Check className="h-3 w-3" /> Guardar fecha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden file input for bulk scan */}
      <input
        ref={bulkScanInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const awaitingTasks = tasks.filter(t => t.status === 'awaiting_signature');
          handleBulkScanFile(file, awaitingTasks);
          if (bulkScanInputRef.current) bulkScanInputRef.current.value = "";
        }}
      />

      {/* Bulk scan review dialog */}
      <Dialog open={bulkScanOpen} onOpenChange={(open) => { if (!open) closeBulkScan(); }}>
        <DialogContent className={cn(
          "rounded-xl flex flex-col p-0 gap-0 overflow-hidden my-auto",
          bulkScanStep === 'review'
            ? "max-w-7xl w-[calc(100vw-2rem)] h-[92vh] max-h-[92vh]"
            : "max-w-3xl w-[calc(100vw-2rem)] max-h-[88vh]"
        )}>
          <DialogHeader className="px-5 py-3 border-b border-border/40">
            <DialogTitle className="text-sm font-semibold tracking-[-0.01em] flex items-center gap-2">
              <ScanLine className="h-4 w-4 text-violet-600" />
              Reparto automático de PDF firmado
            </DialogTitle>
            {bulkScanFileName && (
              <p className="text-[11px] text-muted-foreground truncate">{bulkScanFileName}</p>
            )}
          </DialogHeader>

          <div className={cn(
            "flex-1 min-h-0",
            bulkScanStep === 'review' ? "overflow-hidden" : "overflow-y-auto px-5 py-4"
          )}>
            {bulkScanStep === 'analyzing' && (
              <div className="flex flex-col items-center justify-center gap-3 py-12">
                <Loader2 className="h-7 w-7 animate-spin text-violet-600" />
                <p className="text-sm font-medium">Analizando PDF con IA…</p>
                <p className="text-[11px] text-muted-foreground text-center max-w-sm">
                  Identificando trabajadores y emparejando cada documento con su tarea correspondiente.
                </p>
              </div>
            )}

            {bulkScanStep === 'error' && (
              <div className="flex flex-col items-center justify-center gap-3 py-12">
                <AlertTriangle className="h-7 w-7 text-destructive" />
                <p className="text-sm font-medium">No se pudo procesar</p>
                <p className="text-[11px] text-muted-foreground text-center max-w-md">
                  {bulkScanError || 'Error desconocido'}
                </p>
              </div>
            )}

            {bulkScanStep === 'review' && (() => {
              const sel = bulkScanSelectedIdx != null ? bulkScanAssignments[bulkScanSelectedIdx] : null;
              const subKey = sel ? `${sel.pageStart}-${sel.pageEnd}` : null;
              const subUrl = subKey ? bulkScanSubPdfUrls[subKey] : null;
              const pdfSrc = sel
                ? (subUrl ? `${subUrl}#view=FitH` : null)
                : (bulkScanPdfBlobUrl ? `${bulkScanPdfBlobUrl}#view=FitH` : null);

              return (
                <div className="flex h-full min-h-0 divide-x divide-border/40">
                  {/* LEFT — Proposals list */}
                  <div className="w-[42%] min-w-0 flex flex-col">
                    <div className="px-4 py-2.5 border-b border-border/40 bg-muted/20 text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span><strong className="text-foreground">{bulkScanAssignments.length}</strong> documento{bulkScanAssignments.length !== 1 ? 's' : ''}</span>
                      {bulkScanTotalPages != null && (
                        <span>· <strong className="text-foreground">{bulkScanTotalPages}</strong> págs.</span>
                      )}
                      {bulkScanUnassigned.length > 0 && (
                        <span className="text-amber-600 dark:text-amber-400">
                          · {bulkScanUnassigned.length} sin asignar
                        </span>
                      )}
                      <button
                        type="button"
                        className="ml-auto text-[10px] text-violet-600 hover:underline"
                        onClick={() => setBulkScanShowReadings(v => !v)}
                      >
                        {bulkScanShowReadings ? 'Ocultar lectura' : 'Lectura página a página'}
                      </button>
                      <button
                        type="button"
                        className="text-[10px] text-violet-600 hover:underline"
                        onClick={() => setBulkScanSelectedIdx(null)}
                      >
                        Ver PDF completo
                      </button>
                    </div>

                    {bulkScanShowReadings && bulkScanPageReadings.length > 0 && (
                      <div className="px-3 py-2 border-b border-border/40 bg-muted/10 max-h-[180px] overflow-y-auto">
                        <table className="w-full text-[10.5px]">
                          <thead className="text-muted-foreground/70">
                            <tr><th className="text-left font-medium pr-2 py-0.5">#</th><th className="text-left font-medium pr-2">Trabajador leído</th><th className="text-left font-medium">Marcador</th></tr>
                          </thead>
                          <tbody>
                            {bulkScanPageReadings.sort((a,b) => a.pdf_page - b.pdf_page).map((pr) => {
                              const marker = (pr.marker_current && pr.marker_total)
                                ? `Página ${pr.marker_current} de ${pr.marker_total}`
                                : (pr.marker_literal || '—');
                              const isStart = pr.marker_current === 1;
                              return (
                                <tr key={pr.pdf_page} className="border-t border-border/20">
                                  <td className="pr-2 py-0.5 tabular-nums text-muted-foreground">{pr.pdf_page}</td>
                                  <td className="pr-2 py-0.5 truncate max-w-[160px]">{pr.worker_name || pr.footer_worker_name || '—'}</td>
                                  <td className={cn("py-0.5", isStart ? "font-semibold text-violet-700 dark:text-violet-400" : "text-muted-foreground")}>{marker}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                      {bulkScanAssignments.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-sm font-medium">No he detectado ningún "Página 1 de N" en el pie</p>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Comprueba que el PDF lleva el pie con el nombre y la paginación. Puedes guiar a la IA por el chat.
                          </p>
                        </div>
                      ) : (() => {
                        // Detect overlapping pages between assignments
                        const pageCount = new Map<number, number>();
                        for (const x of bulkScanAssignments) {
                          for (let p = x.pageStart; p <= x.pageEnd; p++) {
                            pageCount.set(p, (pageCount.get(p) || 0) + 1);
                          }
                        }
                        const overlapPages = new Set<number>();
                        pageCount.forEach((c, p) => { if (c > 1) overlapPages.add(p); });
                        return bulkScanAssignments.map((a, idx) => {
                        const candidate = bulkScanCandidates.find(c => c.taskId === a.taskId);
                        const confColor =
                          a.confidence === 'high' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                          : a.confidence === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                          : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400';
                        const isSelected = bulkScanSelectedIdx === idx;
                        let hasOverlap = false;
                        for (let p = a.pageStart; p <= a.pageEnd; p++) {
                          if (overlapPages.has(p)) { hasOverlap = true; break; }
                        }
                        return (
                          <div
                            key={idx}
                            onClick={() => setBulkScanSelectedIdx(idx)}
                            className={cn(
                              "rounded-lg border bg-card px-3 py-2.5 flex items-start gap-3 cursor-pointer transition-all",
                              hasOverlap
                                ? "border-rose-400 dark:border-rose-600 ring-2 ring-rose-200 dark:ring-rose-900/50"
                                : isSelected
                                ? "border-violet-400 dark:border-violet-600 ring-2 ring-violet-200 dark:ring-violet-900/50 shadow-sm"
                                : "border-border/50 hover:border-border"
                            )}
                          >
                            <div className="flex flex-col items-center justify-center min-w-[58px] rounded-md bg-violet-50 dark:bg-violet-950/40 px-2 py-1.5">
                              <span className="text-[9px] font-medium text-violet-700/70 dark:text-violet-400/70 uppercase tracking-wider">Págs.</span>
                              <span className="text-xs font-semibold text-violet-700 dark:text-violet-400 tabular-nums">
                                {a.pageStart === a.pageEnd ? a.pageStart : `${a.pageStart}–${a.pageEnd}`}
                              </span>
                              <div className="flex items-center gap-0.5 mt-1">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setBulkScanAssignments(prev => prev.map((x, i) => i === idx ? { ...x, pageStart: Math.max(1, x.pageStart - 1) } : x)); }}
                                  className="text-[10px] w-4 h-4 rounded bg-white/60 dark:bg-violet-900/30 hover:bg-white"
                                  title="Página inicial −"
                                >−</button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setBulkScanAssignments(prev => prev.map((x, i) => i === idx ? { ...x, pageEnd: x.pageEnd + 1 } : x)); }}
                                  className="text-[10px] w-4 h-4 rounded bg-white/60 dark:bg-violet-900/30 hover:bg-white"
                                  title="Página final +"
                                >+</button>
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-semibold truncate">{candidate?.worker_name || '—'}</p>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className="text-[10.5px] text-muted-foreground">
                                  {candidate?.documento_tipo === 'sancion' ? 'Sanción' : candidate?.documento_tipo === 'amonestacion' ? 'Amonestación' : '—'}
                                  {candidate?.gravedad ? ` · ${candidate.gravedad}` : ''}
                                </span>
                                {a.confidence && (
                                  <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider", confColor)}>
                                    {a.confidence}
                                  </span>
                                )}
                                {hasOverlap && (
                                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                                    Solapa con otra tarea
                                  </span>
                                )}
                              </div>
                              <select
                                value={a.taskId}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  const newId = e.target.value;
                                  setBulkScanAssignments(prev => prev.map((x, i) => i === idx ? { ...x, taskId: newId } : x));
                                }}
                                className="mt-1.5 w-full text-[10.5px] bg-transparent border border-border/40 rounded-md px-1.5 py-0.5"
                              >
                                {bulkScanCandidates.map(c => (
                                  <option key={c.taskId} value={c.taskId}>
                                    {c.worker_name} {c.documento_tipo ? `· ${c.documento_tipo}` : ''}
                                  </option>
                                ))}
                              </select>
                              {a.matched_name && (
                                <p className="text-[10.5px] text-muted-foreground mt-1 truncate">
                                  <span className="text-muted-foreground/60">IA leyó:</span> {a.matched_name}
                                  {a.matched_tipo && <> · {a.matched_tipo}</>}
                                </p>
                              )}
                              {a.page_marker && (() => {
                                const pages = a.pageEnd - a.pageStart + 1;
                                const expected = a.document_total_pages || pages;
                                const mismatch = expected !== pages;
                                return (
                                  <p className={cn(
                                    "text-[10px] mt-0.5 truncate",
                                    mismatch ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground/70"
                                  )}>
                                    <span className="text-muted-foreground/60">Marcador:</span> {a.page_marker}
                                    {mismatch && <> · ⚠ asignadas {pages}, esperadas {expected}</>}
                                  </p>
                                );
                              })()}
                              {a.reason && (
                                <p className="text-[10px] text-muted-foreground/70 mt-0.5 italic">{a.reason}</p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setBulkScanAssignments(prev => prev.filter((_, i) => i !== idx)); if (bulkScanSelectedIdx === idx) setBulkScanSelectedIdx(null); }}
                              className="text-muted-foreground/50 hover:text-destructive p-1"
                              title="Descartar este emparejamiento"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      });
                      })()}

                      {bulkScanUnassigned.length > 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/40 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                          <p className="font-medium mb-1">Páginas sin asignar:</p>
                          <div className="flex flex-wrap gap-1">
                            {bulkScanUnassigned.map(p => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => {
                                  setBulkScanSelectedIdx(null);
                                  if (bulkScanPdfBlobUrl) {
                                    const iframe = document.getElementById('bulk-scan-pdf-iframe') as HTMLIFrameElement | null;
                                    if (iframe) iframe.src = `${bulkScanPdfBlobUrl}#page=${p}&view=FitH`;
                                  }
                                }}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200"
                              >
                                pág. {p}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RIGHT — PDF viewer + chat */}
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex-1 min-h-0 bg-muted/40 relative">
                      {pdfSrc ? (
                        <iframe
                          id="bulk-scan-pdf-iframe"
                          key={pdfSrc}
                          src={pdfSrc}
                          title={sel ? "PDF separado del trabajador" : "PDF original (todas las páginas)"}
                          className="w-full h-full border-0"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[11px] text-muted-foreground gap-2">
                          {sel ? <><Loader2 className="h-3 w-3 animate-spin" /> Generando vista previa…</> : 'PDF no disponible'}
                        </div>
                      )}
                      {sel ? (
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-violet-600/90 text-white backdrop-blur border border-violet-700/50 text-[10.5px] font-medium shadow-sm pointer-events-none">
                          PDF separado · pág. {sel.pageStart === sel.pageEnd ? sel.pageStart : `${sel.pageStart}–${sel.pageEnd}`} del original
                        </div>
                      ) : (
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-background/90 backdrop-blur border border-border/50 text-[10.5px] font-medium shadow-sm pointer-events-none">
                          PDF original completo
                        </div>
                      )}
                    </div>

                    {/* Chat */}
                    <div className="border-t border-border/40 flex flex-col" style={{ height: '38%' }}>
                      <div className="px-3 py-2 border-b border-border/30 flex items-center gap-2 bg-muted/20">
                        <Bot className="h-3.5 w-3.5 text-violet-600" />
                        <span className="text-[11px] font-medium">Hablar con la IA · corregir reparto</span>
                        {bulkScanRecalculating && <Loader2 className="h-3 w-3 animate-spin text-violet-600 ml-auto" />}
                      </div>
                      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                        {bulkScanChat.map((m, i) => (
                          <div key={i} className={cn(
                            "max-w-[85%] rounded-lg px-2.5 py-1.5 text-[11.5px] leading-snug whitespace-pre-wrap",
                            m.role === 'user'
                              ? "ml-auto bg-violet-600 text-white"
                              : "bg-muted/60 text-foreground"
                          )}>
                            {m.content}
                          </div>
                        ))}
                      </div>
                      <div className="px-3 py-2 border-t border-border/30 flex items-end gap-2">
                        <textarea
                          value={bulkScanChatInput}
                          onChange={(e) => setBulkScanChatInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              if (!bulkScanRecalculating && bulkScanChatInput.trim()) handleBulkScanRecalculate();
                            }
                          }}
                          placeholder="Ej.: «la propuesta de Juan son las páginas 7-8»"
                          rows={2}
                          className="flex-1 text-[11.5px] resize-none rounded-md border border-border/50 bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
                          disabled={bulkScanRecalculating}
                        />
                        <Button
                          size="sm"
                          className="h-8 text-xs gap-1 shrink-0"
                          onClick={handleBulkScanRecalculate}
                          disabled={bulkScanRecalculating || !bulkScanChatInput.trim()}
                        >
                          {bulkScanRecalculating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                          Recalcular
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {bulkScanStep === 'confirm' && (() => {
              const totalPagesAssigned = bulkScanAssignments.reduce((acc, a) => acc + (a.pageEnd - a.pageStart + 1), 0);
              const totalPdfPages = bulkScanTotalPages || totalPagesAssigned || 1;
              const bytesPerPage = bulkScanPdfSize > 0 ? bulkScanPdfSize / totalPdfPages : 0;
              const fmtSize = (bytes: number) => {
                if (bytes <= 0) return '—';
                if (bytes < 1024) return `${Math.round(bytes)} B`;
                if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
                return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
              };
              const totalEstSize = bytesPerPage * totalPagesAssigned;
              return (
                <div className="space-y-3 py-2">
                  <div className="rounded-lg border border-violet-200 dark:border-violet-900/50 bg-violet-50/60 dark:bg-violet-950/20 px-3 py-2.5">
                    <p className="text-xs font-medium text-violet-900 dark:text-violet-200">
                      Vas a crear {bulkScanAssignments.length} archivo{bulkScanAssignments.length !== 1 ? 's' : ''} PDF independiente{bulkScanAssignments.length !== 1 ? 's' : ''}
                    </p>
                    <p className="text-[11px] text-violet-700/80 dark:text-violet-300/70 mt-0.5">
                      {totalPagesAssigned} página{totalPagesAssigned !== 1 ? 's' : ''} en total · ≈ {fmtSize(totalEstSize)} aprox.
                    </p>
                  </div>

                  <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                    {bulkScanAssignments.map((a, idx) => {
                      const c = bulkScanCandidates.find(x => x.taskId === a.taskId);
                      const pages = a.pageEnd - a.pageStart + 1;
                      const estSize = bytesPerPage * pages;
                      return (
                        <div key={idx} className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-muted/20 px-2.5 py-1.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-medium truncate">{c?.worker_name || a.taskId}</p>
                            <p className="text-[10.5px] text-muted-foreground">
                              {c?.documento_tipo === 'sancion' ? 'Sanción' : c?.documento_tipo === 'amonestacion' ? 'Amonestación' : '—'} · pág. {a.pageStart}{pages > 1 ? `–${a.pageEnd}` : ''}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[11px] font-semibold tabular-nums">{fmtSize(estSize)}</p>
                            <p className="text-[10px] text-muted-foreground">{pages} pág.</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {bulkScanUnassigned.length > 0 && (
                    <p className="text-[10.5px] text-amber-700 dark:text-amber-400">
                      ⚠ {bulkScanUnassigned.length} página{bulkScanUnassigned.length !== 1 ? 's' : ''} sin asignar se descartarán.
                    </p>
                  )}
                  <p className="text-[10.5px] text-muted-foreground">
                    Esta acción adjuntará los PDFs a sus tareas y disparará los emails de finalización. No se puede deshacer.
                  </p>
                </div>
              );
            })()}

            {bulkScanStep === 'uploading' && (
              <div className="flex flex-col items-center justify-center gap-3 py-12">
                <Loader2 className="h-7 w-7 animate-spin text-violet-600" />
                <p className="text-sm font-medium">Dividiendo y subiendo archivos…</p>
                <p className="text-[11px] text-muted-foreground">No cierres esta ventana.</p>
              </div>
            )}

            {bulkScanStep === 'done' && bulkScanResult && (
              <div className="space-y-3 py-2">
                <div className="flex flex-col items-center justify-center gap-2 py-4">
                  <CheckCircle className="h-8 w-8 text-emerald-500" />
                  <p className="text-sm font-medium">
                    {bulkScanResult.uploaded} de {bulkScanResult.total} documentos repartidos
                  </p>
                </div>
                {bulkScanResult.results.some(r => !r.success) && (
                  <div className="space-y-1">
                    {bulkScanResult.results.filter(r => !r.success).map((r, i) => {
                      const c = bulkScanCandidates.find(x => x.taskId === r.taskId);
                      return (
                        <div key={i} className="text-[11px] text-rose-600 dark:text-rose-400">
                          ✗ {c?.worker_name || r.taskId}: {r.error || 'Error'}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="px-5 py-3 border-t border-border/40 gap-2 sm:gap-2">
            {bulkScanStep === 'review' && (() => {
              const pageCount = new Map<number, number>();
              for (const x of bulkScanAssignments) {
                for (let p = x.pageStart; p <= x.pageEnd; p++) pageCount.set(p, (pageCount.get(p) || 0) + 1);
              }
              const hasAnyOverlap = Array.from(pageCount.values()).some(c => c > 1);
              return (
              <>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={closeBulkScan}>
                  Cancelar
                </Button>
                {hasAnyOverlap && (
                  <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium px-2">
                    Hay páginas asignadas a más de una tarea
                  </span>
                )}
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => setBulkScanStep('confirm')}
                  disabled={bulkScanAssignments.length === 0 || hasAnyOverlap}
                  title={hasAnyOverlap ? 'Hay páginas asignadas a más de una tarea' : undefined}
                >
                  Continuar ({bulkScanAssignments.length})
                </Button>
              </>
              );
            })()}
            {bulkScanStep === 'confirm' && (
              <>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setBulkScanStep('review')}>
                  Volver
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={handleConfirmBulkSplit}
                  disabled={bulkScanAssignments.length === 0}
                >
                  <Check className="h-3 w-3" />
                  Confirmar y subir ({bulkScanAssignments.length})
                </Button>
              </>
            )}
            {(bulkScanStep === 'done' || bulkScanStep === 'error') && (
              <Button size="sm" className="h-8 text-xs" onClick={() => { closeBulkScan(); fetchTasks(); }}>
                Cerrar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
