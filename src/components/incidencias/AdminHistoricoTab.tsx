import { useState, useEffect, useCallback } from "react";
import { Clock, Search, Loader2, Pencil, Trash2, ExternalLink, CalendarIcon, FileSpreadsheet, DollarSign, Check, AlertTriangle, RotateCcw, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MobileCalendar } from "@/components/MobileCalendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow, format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LegalDocumentViewerDialog } from "./LegalDocumentViewerDialog";

const SUSPENSION_LIMITS: Record<string, { min: number; max: number }> = {
  leve: { min: 0, max: 2 },
  grave: { min: 3, max: 14 },
  muy_grave: { min: 14, max: 30 },
};

type Filtro = "todas" | "hoy" | "semana" | "mes";
type AccionFilter = "todas" | "solo_incidencia" | "amonestacion" | "sancion" | "nspp";
type GravedadFilter = "todas" | "leve" | "grave" | "muy_grave";
type FirmaFilter = "todas" | "firmadas" | "pendientes";

const filtros: { id: Filtro; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mes" },
  { id: "todas", label: "Todas" },
];

const accionFiltros: { id: AccionFilter; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "solo_incidencia", label: "Registro" },
  { id: "amonestacion", label: "Amonestación" },
  { id: "sancion", label: "Sanción" },
  { id: "nspp", label: "NSPP" },
];

const SALIX_BASE = "https://salix.verdnatura.es/#/worker/";

function WorkerSalixLink({ name, number }: { name: string; number?: string | null }) {
  if (!number) return <span className="text-sm font-medium">{name}</span>;
  return (
    <a
      href={`${SALIX_BASE}${number}/time-control`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
      onClick={e => e.stopPropagation()}
    >
      {name}
      <span className="text-[10px] text-muted-foreground font-normal">#{number}</span>
      <ExternalLink className="h-3 w-3 opacity-50" />
    </a>
  );
}

function CircularCheckbox({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onChange(!checked); }}
      disabled={disabled}
      className={cn(
        "h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200",
        checked
          ? "bg-[#93d600] border-[#93d600] text-white"
          : "border-muted-foreground/40 hover:border-primary bg-transparent",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      title={checked ? "Firmada" : "Pendiente de firma"}
    >
      {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
    </button>
  );
}


// Build a "kind" badge from accion_propuesta + legal_document.gravedad_final
function getTipoBadge(rec: any): { label: string; className: string } | null {
  const accion = rec.accion_propuesta;
  const grav = rec.legal_document?.gravedad_final || rec.incidencias_categories?.gravedad;
  if (!accion || accion === 'solo_incidencia') return null;
  if (accion === 'nspp') {
    return { label: 'NSPP', className: 'border-amber-500/40 text-amber-700 bg-amber-500/10 dark:text-amber-300' };
  }
  if (accion === 'amonestacion' || accion === 'amonestacion_escrita') {
    return { label: 'Amonestación', className: 'border-sky-500/40 text-sky-700 bg-sky-500/10 dark:text-sky-300' };
  }
  if (accion === 'sancion') {
    if (grav === 'muy_grave') return { label: 'Sanción muy grave', className: 'border-red-500/40 text-red-700 bg-red-500/10 dark:text-red-300' };
    if (grav === 'grave') return { label: 'Sanción grave', className: 'border-orange-500/40 text-orange-700 bg-orange-500/10 dark:text-orange-300' };
    if (grav === 'leve' || grav === 'moderada') return { label: 'Sanción leve', className: 'border-yellow-500/40 text-yellow-700 bg-yellow-500/10 dark:text-yellow-300' };
    return { label: 'Sanción', className: 'border-orange-500/40 text-orange-700 bg-orange-500/10 dark:text-orange-300' };
  }
  return null;
}

interface AdminHistoricoTabProps {
  initialFiltro?: Filtro;
}

export function AdminHistoricoTab({ initialFiltro }: AdminHistoricoTabProps = {}) {
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>(initialFiltro || "todas");
  const [accionFilter, setAccionFilter] = useState<AccionFilter>("todas");
  const [gravedadFilter, setGravedadFilter] = useState<GravedadFilter>("todas");
  const [firmaFilter, setFirmaFilter] = useState<FirmaFilter>("todas");
  const [searchTerm, setSearchTerm] = useState("");
  const [categories, setCategories] = useState<any[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (initialFiltro) setFiltro(initialFiltro);
  }, [initialFiltro]);

  const [editRecord, setEditRecord] = useState<any | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editFecha, setEditFecha] = useState("");
  const [editEstado, setEditEstado] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editCustomCat, setEditCustomCat] = useState("");
  const [editAccion, setEditAccion] = useState("");
  const [editGravedad, setEditGravedad] = useState("");
  const [editConSuspension, setEditConSuspension] = useState(false);
  const [editSuspensionDias, setEditSuspensionDias] = useState(0);
  const [editSuspensionFechas, setEditSuspensionFechas] = useState<Date[]>([]);
  const [saving, setSaving] = useState(false);

  const [deleteRecord, setDeleteRecord] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reopening, setReopening] = useState<string | null>(null);
  const [viewerRec, setViewerRec] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [incRes, catRes] = await Promise.all([
        supabase.functions.invoke("incidencias-operations", {
          body: { action: "listIncidencias", sessionToken, filtro: filtro === "todas" ? undefined : filtro, limit: 100 },
        }),
        supabase.functions.invoke("incidencias-operations", {
          body: { action: "listCategories", sessionToken },
        }),
      ]);
      const loadedRecords = incRes.data?.records || [];
      // Auto-mark "solo_incidencia" records as firmada (no physical signature needed)
      const needAutoFirma = loadedRecords.filter(
        (r: any) => r.accion_propuesta === 'solo_incidencia' && r.firmada === false
      );
      if (needAutoFirma.length > 0) {
        for (const r of needAutoFirma) {
          r.firmada = true;
          supabase.functions.invoke("incidencias-operations", {
            body: { action: "toggleFirmada", sessionToken, recordId: r.id, firmada: true },
          }).catch(() => {});
        }
      }
      setRecords(loadedRecords);
      setCategories(catRes.data?.categories || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, filtro]);

  useEffect(() => { load(); }, [load]);

  const toggleFirmada = async (recordId: string, currentValue: boolean) => {
    setTogglingId(recordId);
    const newValue = !currentValue;
    // Optimistic update
    setRecords(prev => prev.map(r => r.id === recordId ? { ...r, firmada: newValue } : r));
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "toggleFirmada", sessionToken, recordId, firmada: newValue },
      });
      if (!data?.success) {
        setRecords(prev => prev.map(r => r.id === recordId ? { ...r, firmada: currentValue } : r));
        toast.error("Error al cambiar estado de firma");
      }
    } catch {
      setRecords(prev => prev.map(r => r.id === recordId ? { ...r, firmada: currentValue } : r));
      toast.error("Error al cambiar estado de firma");
    } finally {
      setTogglingId(null);
    }
  };

  const filtered = records.filter(r => {
    if (accionFilter === "solo_incidencia" && r.accion_propuesta !== "solo_incidencia") return false;
    if (accionFilter === "amonestacion" && (r.accion_propuesta !== "amonestacion_escrita" && r.accion_propuesta !== "amonestacion")) return false;
    if (accionFilter === "sancion" && r.accion_propuesta !== "sancion") return false;
    if (accionFilter === "nspp" && r.accion_propuesta !== "nspp") return false;
    if (accionFilter === "sancion" && gravedadFilter !== "todas") {
      const catGravedad = r.incidencias_categories?.gravedad;
      if (catGravedad !== gravedadFilter) return false;
    }
    // Firma filter
    if (firmaFilter === "firmadas" && !r.firmada) return false;
    if (firmaFilter === "pendientes" && r.firmada) return false;
    // Search
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    const workerNames = (r.workers || []).map((w: any) => w.worker_name.toLowerCase()).join(" ");
    const deptName = (r.department_name || "").toLowerCase();
    return workerNames.includes(q) || deptName.includes(q);
  });

  const pendingCount = records.filter(r => !r.firmada).length;

  const openEdit = (rec: any) => {
    setEditRecord(rec);
    setEditDesc(rec.descripcion || "");
    setEditFecha(rec.fecha ? format(new Date(rec.fecha), "yyyy-MM-dd") : "");
    setEditEstado(rec.estado || "abierta");
    setEditCategoryId(rec.category_id || "");
    setEditCustomCat(rec.custom_category_name || "");
    setEditAccion(rec.accion_propuesta || "solo_incidencia");
    // Suspension fields
    const catGravedad = rec.incidencias_categories?.gravedad || 'leve';
    setEditGravedad(catGravedad);
    setEditConSuspension(!!rec.propuesta_suspension);
    setEditSuspensionDias(rec.suspension_dias || 0);
    const fechas = Array.isArray(rec.suspension_fechas) ? rec.suspension_fechas.map((f: string) => new Date(f)) : [];
    setEditSuspensionFechas(fechas);
  };

  const handleSave = async () => {
    if (!editRecord) return;
    setSaving(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "adminUpdateIncidencia",
          sessionToken,
          recordId: editRecord.id,
          descripcion: editDesc,
          fecha: editFecha,
          estado: editEstado,
          categoryId: editCategoryId || null,
          customCategoryName: editCustomCat,
          accionPropuesta: editAccion,
          gravedad: editGravedad,
          conSuspension: editConSuspension,
          suspensionDias: editConSuspension ? editSuspensionDias : 0,
          suspensionFechas: editConSuspension ? editSuspensionFechas.map(d => format(d, 'yyyy-MM-dd')) : [],
        },
      });
      if (data?.success) {
        toast.success("Incidencia actualizada");
        setEditRecord(null);
        load();
      } else {
        toast.error(data?.error || "Error al actualizar");
      }
    } catch {
      toast.error("Error al actualizar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteRecord) return;
    setDeleting(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "adminDeleteIncidencia", sessionToken, recordId: deleteRecord.id },
      });
      if (data?.success) {
        toast.success("Incidencia eliminada");
        setDeleteRecord(null);
        load();
      } else {
        toast.error(data?.error || "Error al eliminar");
      }
    } catch {
      toast.error("Error al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  const handleReopenPropuesta = async (rec: any) => {
    if (!rec.proposal_id) return;
    setReopening(rec.id);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "reopenPropuesta", sessionToken, propuestaId: rec.proposal_id },
      });
      if (data?.success) {
        toast.success("Propuesta reabierta — disponible en Propuestas para edición");
        load();
      } else {
        toast.error(data?.error || "Error al reabrir");
      }
    } catch {
      toast.error("Error al reabrir propuesta");
    } finally {
      setReopening(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por trabajador, departamento..."
            className="pl-9 rounded-xl h-11"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {filtros.map(f => (
          <Button
            key={f.id}
            variant={filtro === f.id ? "default" : "outline"}
            size="sm"
            className="rounded-full text-xs shrink-0"
            onClick={() => setFiltro(f.id)}
          >
            {f.label}
          </Button>
        ))}
        <span className="w-px h-5 bg-border/50 mx-1 shrink-0" />
        {accionFiltros.map(f => (
          <Button
            key={f.id}
            variant={accionFilter === f.id ? "default" : "outline"}
            size="sm"
            className="rounded-full text-xs shrink-0"
            onClick={() => { setAccionFilter(f.id); if (f.id !== 'sancion') setGravedadFilter('todas'); }}
          >
            {f.label}
          </Button>
        ))}
        {accionFilter === 'sancion' && (
          <>
            <span className="w-px h-5 bg-border/50 mx-1 shrink-0" />
            {(['todas', 'leve', 'grave', 'muy_grave'] as GravedadFilter[]).map(g => (
              <Button
                key={g}
                variant={gravedadFilter === g ? "default" : "outline"}
                size="sm"
                className="rounded-full text-xs shrink-0"
                onClick={() => setGravedadFilter(g)}
              >
                {g === 'todas' ? 'Todas' : g === 'muy_grave' ? 'Muy grave' : g.charAt(0).toUpperCase() + g.slice(1)}
              </Button>
            ))}
          </>
        )}
        <span className="w-px h-5 bg-border/50 mx-1 shrink-0" />
        {([
          { id: "todas" as FirmaFilter, label: "Todas" },
          { id: "firmadas" as FirmaFilter, label: "Firmadas" },
          { id: "pendientes" as FirmaFilter, label: `Pendientes${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
        ]).map(f => (
          <Button
            key={f.id}
            variant={firmaFilter === f.id ? "default" : "outline"}
            size="sm"
            className={cn(
              "rounded-full text-xs shrink-0",
              f.id === "pendientes" && pendingCount > 0 && firmaFilter !== "pendientes" && "border-amber-500/50 text-amber-600"
            )}
            onClick={() => setFirmaFilter(f.id)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <Clock className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {firmaFilter === "pendientes" ? "No hay incidencias pendientes de firma" : "Sin incidencias encontradas"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((rec: any) => {
            const workers = rec.workers || [];
            const isFirmada = rec.firmada !== false;
            const tipoBadge = getTipoBadge(rec);
            const legalPdfUrl = rec.legal_document?.pdf_url || rec.legal_document?.draft_pdf_url || null;
            const dias = rec.legal_document?.dias_suspension;
            return (
              <Card
                key={rec.id}
                onClick={() => setViewerRec(rec)}
                className={cn(
                  "rounded-2xl border-border/50 transition-colors cursor-pointer hover:bg-muted/30",
                  !isFirmada && "border-amber-500/30 bg-amber-500/[0.02]",
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                        {workers.length > 0 ? workers.map((w: any, i: number) => (
                          <span key={i}>
                            <WorkerSalixLink name={w.worker_name} number={w.worker_number} />
                            {i < workers.length - 1 && <span className="text-muted-foreground">,</span>}
                          </span>
                        )) : <span className="text-sm text-muted-foreground">—</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {rec.department_name && (
                          <Badge variant="outline" className="text-[10px] px-2 py-0">{rec.department_name}</Badge>
                        )}
                        {rec.incidencias_categories && (
                          <Badge variant="secondary" className="text-[10px] px-2 py-0" style={{ backgroundColor: rec.incidencias_categories.color + '20', color: rec.incidencias_categories.color }}>
                            {rec.incidencias_categories.name}{rec.custom_category_name && ` — ${rec.custom_category_name}`}
                          </Badge>
                        )}
                        {tipoBadge && (
                          <Badge variant="outline" className={cn("text-[10px] px-2 py-0 font-semibold", tipoBadge.className)}>
                            {tipoBadge.label}
                            {dias && dias > 0 ? ` · ${dias}d` : ''}
                          </Badge>
                        )}
                        {rec.origen === 'csv_import' && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 border-blue-500/30 text-blue-600 bg-blue-500/5">
                            <FileSpreadsheet className="h-2.5 w-2.5" />CSV
                          </Badge>
                         )}
                         {rec.csv_tag_value && (
                           <Badge variant="outline" className="text-[9px] px-1 py-0 gap-0.5 border-violet-500/30 text-violet-600 bg-violet-500/5">
                             Dev: {rec.csv_tag_value}
                           </Badge>
                         )}
                         {Number(rec.importe_total) > 0 && (
                           <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 border-destructive/30 text-destructive bg-destructive/5">
                             <DollarSign className="h-2.5 w-2.5" />€{Number(rec.importe_total).toFixed(2).replace('.', ',')}
                           </Badge>
                         )}
                          {rec.created_by_name && (
                           <span className="text-[10px] text-muted-foreground italic">por {rec.created_by_name}</span>
                         )}
                         <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(rec.fecha), { addSuffix: true, locale: es })}
                        </span>
                      </div>
                      {rec.descripcion && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{rec.descripcion}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {legalPdfUrl && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setViewerRec(rec); }}
                          className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                          title={rec.legal_document?.firmado ? "Ver documento firmado" : "Ver documento legal"}
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                      )}
                      {rec.proposal_id && (rec.proposal_estado === 'aprobada' || rec.proposal_estado === 'enviada') && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleReopenPropuesta(rec); }}
                          disabled={reopening === rec.id}
                          className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-amber-500/10 text-muted-foreground hover:text-amber-600 transition-colors"
                          title="Reabrir propuesta para edición"
                        >
                          {reopening === rec.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        </button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); openEdit(rec); }} className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors" title="Editar">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteRecord(rec); }} className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Eliminar">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editRecord} onOpenChange={() => setEditRecord(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar incidencia</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Descripción</label>
              <Textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} className="min-h-[80px]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Fecha</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !editFecha && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 opacity-70" />
                      {editFecha ? format(parse(editFecha, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy') : "Seleccionar fecha"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={editFecha ? parse(editFecha, 'yyyy-MM-dd', new Date()) : undefined}
                      onSelect={(date) => {
                        if (date) setEditFecha(format(date, 'yyyy-MM-dd'));
                      }}
                      locale={es}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Estado</label>
                <Select value={editEstado} onValueChange={setEditEstado}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="abierta">Abierta</SelectItem>
                    <SelectItem value="propuesta_enviada">Propuesta enviada</SelectItem>
                    <SelectItem value="cerrada">Cerrada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Categoría</label>
                <Select value={editCategoryId} onValueChange={setEditCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Acción propuesta</label>
                <Select value={editAccion} onValueChange={setEditAccion}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solo_incidencia">Solo registrar</SelectItem>
                    <SelectItem value="amonestacion">Amonestación</SelectItem>
                    <SelectItem value="sancion">Sanción</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Subcategoría (opcional)</label>
              <Input value={editCustomCat} onChange={e => setEditCustomCat(e.target.value)} placeholder="Ej: PRUEBA" />
            </div>

            {/* Gravedad */}
            {(editAccion === 'sancion' || editAccion === 'amonestacion') && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Gravedad</label>
                <Select value={editGravedad} onValueChange={v => {
                  setEditGravedad(v);
                  const limits = SUSPENSION_LIMITS[v];
                  if (limits && editConSuspension) {
                    if (editSuspensionDias < limits.min) setEditSuspensionDias(limits.min);
                    if (editSuspensionDias > limits.max) setEditSuspensionDias(limits.max);
                  }
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="leve">Leve</SelectItem>
                    <SelectItem value="grave">Grave</SelectItem>
                    <SelectItem value="muy_grave">Muy grave</SelectItem>
                  </SelectContent>
                </Select>
                {SUSPENSION_LIMITS[editGravedad] && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Convenio Art. 51: {editGravedad === 'leve' ? 'hasta 2 días' : editGravedad === 'grave' ? 'de 3 a 14 días' : 'de 14 a 30 días'} de suspensión
                  </p>
                )}
              </div>
            )}

            {/* Suspension toggle + days + calendar */}
            {editAccion === 'sancion' && (
              <div className="space-y-3 rounded-xl border border-border/50 p-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Con suspensión de empleo y sueldo</Label>
                  <Switch checked={editConSuspension} onCheckedChange={v => {
                    setEditConSuspension(v);
                    if (v && editSuspensionDias === 0) {
                      const limits = SUSPENSION_LIMITS[editGravedad];
                      if (limits) setEditSuspensionDias(limits.min || 1);
                    }
                    if (!v) { setEditSuspensionDias(0); setEditSuspensionFechas([]); }
                  }} />
                </div>
                {editConSuspension && (
                  <>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        Días de suspensión
                        {SUSPENSION_LIMITS[editGravedad] && (
                          <span className="ml-1 text-primary">({SUSPENSION_LIMITS[editGravedad].min}-{SUSPENSION_LIMITS[editGravedad].max} por convenio)</span>
                        )}
                      </label>
                      <Input
                        type="number"
                        min={SUSPENSION_LIMITS[editGravedad]?.min || 0}
                        max={SUSPENSION_LIMITS[editGravedad]?.max || 30}
                        value={editSuspensionDias}
                        onChange={e => setEditSuspensionDias(parseInt(e.target.value) || 0)}
                        className="h-9 rounded-xl"
                      />
                      {SUSPENSION_LIMITS[editGravedad] && (editSuspensionDias < SUSPENSION_LIMITS[editGravedad].min || editSuspensionDias > SUSPENSION_LIMITS[editGravedad].max) && (
                        <p className="text-[10px] text-destructive flex items-center gap-1 mt-1">
                          <AlertTriangle className="h-3 w-3" />
                          Fuera de los límites del convenio ({SUSPENSION_LIMITS[editGravedad].min}-{SUSPENSION_LIMITS[editGravedad].max} días)
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        Días concretos de suspensión ({editSuspensionFechas.length} de {editSuspensionDias} seleccionados)
                      </label>
                      <div className="border border-border/50 rounded-xl overflow-hidden">
                        <MobileCalendar
                          selected={editSuspensionFechas}
                          onSelect={(dates) => {
                            const selected = dates || [];
                            if (selected.length <= editSuspensionDias) {
                              setEditSuspensionFechas(selected);
                            } else {
                              toast.error(`Máximo ${editSuspensionDias} días de suspensión`);
                            }
                          }}
                          locale={es}
                          className="pointer-events-auto"
                        />
                      </div>
                      {editSuspensionFechas.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {editSuspensionFechas.sort((a, b) => a.getTime() - b.getTime()).map((d, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px] px-2 py-0">
                              {format(d, 'dd/MM/yyyy')}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRecord(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteRecord} onOpenChange={() => setDeleteRecord(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar incidencia?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta acción marcará la incidencia como eliminada. Se puede restaurar desde el panel de integridad.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRecord(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LegalDocumentViewerDialog
        open={!!viewerRec}
        onOpenChange={(o) => { if (!o) setViewerRec(null); }}
        legalDocument={viewerRec?.legal_document || null}
        workerName={(viewerRec?.workers || []).map((w: any) => w.worker_name).join(", ") || undefined}
      />
    </div>
  );
}