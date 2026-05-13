import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Clock, Loader2, MoreVertical, ExternalLink, SlidersHorizontal, X, PenLine, Image, Video, ChevronDown, FileSpreadsheet, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import type { IncidenciasUserContext } from "@/modules/control-incidencias/core/types";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { useHaptic } from "@/hooks/useHaptic";
import { cn } from "@/lib/utils";

const SALIX_BASE = "https://salix.verdnatura.es/#/worker/";
const SWIPE_THRESHOLD = 80;

interface Props {
  userContext: IncidenciasUserContext;
  filterWorkerId?: string | null;
}

type Filtro = "todas" | "hoy" | "semana" | "mes";
type Gravedad = "leve" | "grave" | "muy_grave";

const filtros: { id: Filtro; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mes" },
  { id: "todas", label: "Todas" },
];

const gravedades: { id: Gravedad; label: string; color: string }[] = [
  { id: "leve", label: "Leve", color: "#93d600" },
  { id: "grave", label: "Grave", color: "#f59e0b" },
  { id: "muy_grave", label: "Muy grave", color: "#ef4444" },
];

const estadoColors: Record<string, string> = {
  abierta: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  propuesta_enviada: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  cerrada: "bg-muted text-muted-foreground",
};

const gravedadLabel: Record<string, string> = {
  leve: "Leve",
  grave: "Grave",
  muy_grave: "Muy grave",
};

// ── Detail Bottom Sheet ──────────────────────────────────────────────────────
interface DetailSheetProps {
  rec: any;
  onClose: () => void;
  onRequestEdit: (id: string) => void;
}

function DetailSheet({ rec, onClose, onRequestEdit }: DetailSheetProps) {
  const gravedad = rec.incidencias_categories?.gravedad || "leve";
  const gColor = gravedad === "muy_grave" ? "#ef4444" : gravedad === "grave" ? "#f59e0b" : "#93d600";
  const estadoClass = estadoColors[rec.estado] || estadoColors.abierta;
  const workerNames = (rec.workers || []).map((w: any) => w.worker_name);
  const initial = workerNames[0]?.charAt(0)?.toUpperCase() || "?";
  const pruebas: string[] = rec.pruebas_urls || [];
  const isImage = (url: string) => /\.(jpg|jpeg|png|webp|gif|heic)(\?|$)/i.test(url);

  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (pruebas.length === 0) return;
    const sessionToken = localStorage.getItem("manager_session_token") || sessionStorage.getItem("manager_session_token") || "";
    Promise.all(pruebas.map(async (path) => {
      try {
        const { data } = await supabase.functions.invoke("incidencias-operations", {
          body: { action: "getProposalImageUrl", sessionToken, filePath: path },
        });
        return { path, url: data?.success ? data.url || null : null };
      } catch {
        return { path, url: null };
      }
    })).then(results => {
      const map: Record<string, string> = {};
      results.forEach(r => { if (r.url) map[r.path] = r.url; });
      setSignedUrls(map);
    });
  }, [pruebas.join(',')]);

  const fecha = rec.fecha ? new Date(rec.fecha) : null;

  return (
    <>
      {/* Overlay */}
      <motion.div
        className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      {/* Sheet */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: "90dvh", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        initial={{ y: "100%" }}
        animate={{ y: 0, transition: { type: "spring", stiffness: 350, damping: 36 } }}
        exit={{ y: "100%", transition: { duration: 0.22, ease: "easeIn" as const } }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-4">
          {/* Worker header */}
          <div className="flex items-center gap-3 pt-1">
            <div
              className="h-12 w-12 rounded-full flex items-center justify-center shrink-0 text-lg font-bold"
              style={{ backgroundColor: gColor + "20", color: gColor }}
            >
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap gap-x-1 gap-y-0.5">
                {(rec.workers || []).map((w: any, i: number) => (
                  <span key={i}>
                    {w.worker_number ? (
                      <a
                        href={`${SALIX_BASE}${w.worker_number}/time-control`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-primary inline-flex items-center gap-0.5"
                      >
                        {w.worker_name}
                        <ExternalLink className="h-3 w-3 opacity-50" />
                      </a>
                    ) : (
                      <span className="text-sm font-semibold">{w.worker_name}</span>
                    )}
                    {i < workerNames.length - 1 && <span className="text-muted-foreground">, </span>}
                  </span>
                ))}
                {workerNames.length === 0 && <span className="text-sm text-muted-foreground">—</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {fecha ? format(fecha, "dd MMM yyyy · HH:mm", { locale: es }) : "—"}
              </p>
            </div>
            <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground shrink-0">
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            {rec.incidencias_categories && (
              <Badge
                variant="secondary"
                className="text-xs px-3 py-1 border-0"
                style={{ backgroundColor: rec.incidencias_categories.color + "20", color: rec.incidencias_categories.color }}
              >
                {rec.incidencias_categories.name}
                {rec.custom_category_name && ` — ${rec.custom_category_name}`}
              </Badge>
            )}
            {rec.origen === 'csv_import' && (
              <Badge variant="outline" className="text-xs px-2 py-0.5 gap-0.5 border-blue-500/30 text-blue-600 bg-blue-500/5">
                <FileSpreadsheet className="h-3 w-3" />CSV
              </Badge>
            )}
            {rec.csv_tag_value && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 gap-0.5 border-violet-500/30 text-violet-600 bg-violet-500/5">
                Dev: {rec.csv_tag_value}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs px-3 py-1" style={{ color: gColor, borderColor: gColor + "50", backgroundColor: gColor + "10" }}>
              {gravedadLabel[gravedad] || gravedad}
            </Badge>
            <Badge variant="outline" className={`text-xs px-3 py-1 ${estadoClass}`}>
              {rec.estado === "abierta" ? "Pendiente" : rec.estado === "propuesta_enviada" ? "Propuesta enviada" : rec.estado === "archivada" ? "Archivada" : rec.estado}
            </Badge>
          </div>

          {/* Description */}
          {rec.descripcion && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Descripción</p>
              <p className="text-sm text-foreground leading-relaxed">{rec.descripcion}</p>
            </div>
          )}

          {/* Proofs */}
          {pruebas.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Pruebas ({pruebas.length})
              </p>
              <div className="grid grid-cols-3 gap-2">
                {pruebas.map((path, i) => {
                  const signed = signedUrls[path];
                  return (
                    <button
                      key={i}
                      onClick={() => signed && (isImage(path) ? setLightbox(signed) : window.open(signed, '_blank'))}
                      className="aspect-square rounded-xl overflow-hidden bg-muted flex items-center justify-center border border-border/30"
                    >
                      {isImage(path) ? (
                        signed ? (
                          <img src={signed} alt={`Prueba ${i+1}`} className="w-full h-full object-cover" />
                        ) : (
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        )
                      ) : (
                        <Video className="h-7 w-7 text-muted-foreground" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Lightbox */}
          {lightbox && (
            <Dialog open onOpenChange={() => setLightbox(null)}>
              <DialogContent className="max-w-[90vw] max-h-[90vh] p-2">
                <img src={lightbox} alt="Prueba" className="w-full h-full object-contain rounded-lg" />
              </DialogContent>
            </Dialog>
          )}

          {/* Acción propuesta */}
          {rec.accion_propuesta && rec.accion_propuesta !== "solo_incidencia" && (
            <div className="rounded-xl bg-muted/50 px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Acción propuesta</p>
              <p className="text-sm text-foreground capitalize">
                {rec.accion_propuesta === "amonestacion_escrita" ? "Amonestación escrita" : rec.accion_propuesta === "sancion" ? "Sanción disciplinaria" : rec.accion_propuesta}
              </p>
            </div>
          )}

          {/* Time info */}
          <p className="text-xs text-muted-foreground">
            Registrado {fecha ? formatDistanceToNow(fecha, { addSuffix: true, locale: es }) : "—"}
            {rec.created_by_name ? ` · por ${rec.created_by_name}` : ""}
          </p>

          {/* Action */}
          <Button
            variant="outline"
            className="w-full h-12 rounded-xl"
            onClick={() => { onClose(); onRequestEdit(rec.id); }}
          >
            <PenLine className="h-4 w-4 mr-2" />
            Solicitar edición/borrado
          </Button>
        </div>
      </motion.div>
    </>
  );
}

// ── Swipeable Card ──────────────────────────────────────────────────────────
interface SwipeCardProps {
  rec: any;
  onSwipeAction: (id: string) => void;
  onPress: (rec: any) => void;
}

function SwipeCard({ rec, onSwipeAction, onPress }: SwipeCardProps) {
  const haptic = useHaptic();
  const x = useMotionValue(0);
  const thresholdHit = useRef(false);
  const touchStartX = useRef(0);
  const hasDragged = useRef(false);

  const hintOpacity = useTransform(x, [0, SWIPE_THRESHOLD * 0.4, SWIPE_THRESHOLD], [0, 0.4, 1]);
  const hintScale = useTransform(x, [0, SWIPE_THRESHOLD], [0.7, 1]);

  const gravedad = rec.incidencias_categories?.gravedad || "leve";
  const gColor = gravedad === "muy_grave" ? "#ef4444" : gravedad === "grave" ? "#f59e0b" : "#93d600";
  const estadoClass = estadoColors[rec.estado] || estadoColors.abierta;
  const workerNames = (rec.workers || []).map((w: any) => w.worker_name);
  const initial = workerNames[0]?.charAt(0)?.toUpperCase() || "?";

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    hasDragged.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const delta = e.touches[0].clientX - touchStartX.current;
    const clamped = Math.max(0, delta * 0.35);
    x.set(clamped);
    if (clamped > 8) hasDragged.current = true;
    if (clamped >= SWIPE_THRESHOLD * 0.55 && !thresholdHit.current) {
      thresholdHit.current = true;
      haptic.threshold();
    } else if (clamped < SWIPE_THRESHOLD * 0.3) {
      thresholdHit.current = false;
    }
  };

  const handleTouchEnd = () => {
    if (x.get() >= SWIPE_THRESHOLD) {
      haptic.medium();
      onSwipeAction(rec.id);
    }
    x.set(0);
    thresholdHit.current = false;
  };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Swipe hint background */}
      <motion.div
        className="absolute inset-0 flex items-center justify-start pl-4 rounded-2xl pointer-events-none"
        style={{
          opacity: hintOpacity,
          backgroundColor: "hsl(var(--primary) / 0.12)",
        }}
      >
        <motion.div
          style={{ scale: hintScale }}
          className="flex items-center gap-2 bg-primary/90 text-primary-foreground rounded-xl px-3 py-2 shadow-md"
        >
          <PenLine className="h-4 w-4" />
          <span className="text-xs font-semibold">Solicitar edición</span>
        </motion.div>
      </motion.div>

      {/* Card — swipe via native touch only, mouse clicks pass through */}
      <motion.div
        style={{ x }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Card
          className="rounded-2xl border-border/30 cursor-pointer hover:bg-muted/30 transition-colors touch-pan-y"
          onClick={() => { if (!hasDragged.current) onPress(rec); }}
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: gColor + "15" }}
              >
                <span className="text-sm font-bold" style={{ color: gColor }}>{initial}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                  {workerNames.length > 0
                    ? (rec.workers || []).map((w: any, i: number) => (
                        <span key={i}>
                          {w.worker_number ? (
                            <a
                              href={`${SALIX_BASE}${w.worker_number}/time-control`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-0.5"
                              onClick={e => e.stopPropagation()}
                            >
                              {w.worker_name}
                              <ExternalLink className="h-2.5 w-2.5 opacity-50" />
                            </a>
                          ) : (
                            <span className="text-sm font-medium">{w.worker_name}</span>
                          )}
                          {i < workerNames.length - 1 && <span className="text-muted-foreground">,</span>}
                        </span>
                      ))
                    : <span className="text-sm font-medium text-muted-foreground">—</span>}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {rec.incidencias_categories && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-2 py-0 border-0"
                      style={{ backgroundColor: rec.incidencias_categories.color + "20", color: rec.incidencias_categories.color }}
                    >
                      {rec.incidencias_categories.name}
                      {rec.custom_category_name && ` — ${rec.custom_category_name}`}
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
                  <Badge variant="outline" className={`text-[10px] px-2 py-0 ${estadoClass}`}>
                    {rec.estado === "abierta" ? "Pendiente" : rec.estado === "propuesta_enviada" ? "Propuesta" : rec.estado}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(rec.fecha), { addSuffix: true, locale: es })}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {rec.pruebas_urls && rec.pruebas_urls.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">{rec.pruebas_urls.length}📎</span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onSwipeAction(rec.id); }}
                  className="h-10 w-10 rounded-xl flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export function EncargadoHistorial({ userContext, filterWorkerId }: Props) {
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [workerSearch, setWorkerSearch] = useState("");

  // Advanced filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedGravedad, setSelectedGravedad] = useState<Gravedad[]>([]);

  const [editDialog, setEditDialog] = useState<string | null>(null);
  const [editMotivo, setEditMotivo] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);

  // Detail sheet
  const [detailRecord, setDetailRecord] = useState<any | null>(null);

  const activeFilterCount = selectedGravedad.length;

  const load = useCallback(async (offset = 0, append = false) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "listIncidencias",
          sessionToken,
          filtro: filtro === "todas" ? undefined : filtro,
          limit: 20,
          offset,
          departmentIds: userContext.departmentIds,
          workerTeamIds: userContext.workerTeamIds,
        },
      });
      let recs = data?.records || [];
      if (filterWorkerId) {
        recs = recs.filter((r: any) => (r.workers || []).some((w: any) => w.worker_id === filterWorkerId));
      }
      // Client-side gravedad filter
      if (selectedGravedad.length > 0) {
        recs = recs.filter((r: any) => selectedGravedad.includes(r.incidencias_categories?.gravedad));
      }
      if (append) {
        setRecords(prev => [...prev, ...recs]);
      } else {
        setRecords(recs);
      }
      setHasMore(recs.length >= 20);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [sessionToken, filtro, filterWorkerId, selectedGravedad, userContext.departmentIds]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("encargado-historial-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "incidencias_records" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const toggleGravedad = (g: Gravedad) => {
    setSelectedGravedad(prev =>
      prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
    );
  };

  const handleSwipeAction = (id: string) => {
    setEditDialog(id);
    setEditMotivo("");
  };

  const handleRequestEdit = async () => {
    if (!editMotivo.trim() || editMotivo.trim().length < 10) {
      toast.error("Mínimo 10 caracteres");
      return;
    }
    setSendingRequest(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "requestEditIncidencia", sessionToken, recordId: editDialog, motivo: editMotivo.trim() },
      });
      if (data?.success) {
        toast.success("Solicitud enviada al administrador");
        setEditDialog(null);
        setEditMotivo("");
      } else {
        toast.error(data?.error || "Error al enviar solicitud");
      }
    } catch {
      toast.error("Error al enviar solicitud");
    } finally {
      setSendingRequest(false);
    }
  };

  // Normalize helper for accent-insensitive search
  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const filteredRecords = useMemo(() => {
    if (!workerSearch.trim()) return records;
    const q = normalize(workerSearch.trim());
    return records.filter((r: any) =>
      (r.workers || []).some((w: any) => {
        const name = normalize(w.worker_name || "");
        const num = (w.worker_number || "").toLowerCase();
        return name.includes(q) || num.includes(q);
      })
    );
  }, [records, workerSearch]);

  return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
      <h2 className="text-lg font-semibold text-foreground">Historial</h2>

      {/* Worker search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar trabajador..."
          value={workerSearch}
          onChange={e => setWorkerSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-xl border border-border/40 bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Time filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {filtros.map(f => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-medium transition-all",
              filtro === f.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-card border border-border/40 text-muted-foreground hover:border-border"
            )}
          >
            {f.label}
          </button>
        ))}

        {/* Advanced filters toggle */}
        <button
          onClick={() => setFiltersOpen(o => !o)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
            filtersOpen || activeFilterCount > 0
              ? "bg-primary text-primary-foreground border-primary shadow-sm"
              : "bg-card border-border/40 text-muted-foreground hover:border-border"
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filtros
          {activeFilterCount > 0 && (
            <span className="h-4 w-4 rounded-full bg-primary-foreground/30 text-[9px] font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Collapsible filter panel */}
      <AnimatePresence>
        {filtersOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="bg-card border border-border/30 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Gravedad</span>
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => setSelectedGravedad([])}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-3 w-3" /> Limpiar
                  </button>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {gravedades.map(g => {
                  const active = selectedGravedad.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      onClick={() => toggleGravedad(g.id)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                        active ? "border-transparent" : "border-border/40 text-muted-foreground bg-transparent"
                      )}
                      style={active ? { backgroundColor: g.color + "20", color: g.color, borderColor: g.color + "50" } : {}}
                    >
                      {g.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Swipe hint */}
      {filteredRecords.length > 0 && !loading && (
        <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
          <span>←</span> Desliza para editar · Pulsa para ver detalle
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filteredRecords.length === 0 ? (
        <Card className="rounded-2xl border-border/30">
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <Clock className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">{workerSearch.trim() ? "Sin resultados para esta búsqueda" : "Sin incidencias en este período"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredRecords.map((rec: any, i: number) => (
            <motion.div
              key={rec.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, type: "spring", stiffness: 300, damping: 28 }}
            >
              <SwipeCard
                rec={rec}
                onSwipeAction={handleSwipeAction}
                onPress={(r) => setDetailRecord(r)}
              />
            </motion.div>
          ))}

          {hasMore && records.length >= 20 && (
            <Button
              variant="outline"
              onClick={() => load(records.length, true)}
              disabled={loadingMore}
              className="w-full h-12 rounded-xl"
            >
              {loadingMore ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Cargar más
            </Button>
          )}
        </div>
      )}

      {/* Edit request dialog */}
      <Dialog open={!!editDialog} onOpenChange={() => { setEditDialog(null); setEditMotivo(""); }}>
        <DialogContent className="max-w-md p-0 gap-0 rounded-2xl overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight">Solicitar edición o borrado</DialogTitle>
            <p className="text-xs text-muted-foreground font-light mt-1">
              Explica brevemente qué cambio necesitas. Un administrador lo revisará.
            </p>
          </DialogHeader>
          <div className="px-5 pb-2">
            <Textarea
              autoFocus
              placeholder="Ej: cambiar fecha de inicio de sanción al 5 de mayo"
              value={editMotivo}
              onChange={e => setEditMotivo(e.target.value)}
              className="min-h-[120px] resize-none rounded-xl text-sm"
              maxLength={1000}
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-[11px] text-muted-foreground">Mínimo 10 caracteres</p>
              <p className={cn(
                "text-[11px] font-medium tabular-nums",
                editMotivo.trim().length >= 10 ? "text-primary" : "text-muted-foreground"
              )}>
                {editMotivo.trim().length} / 1000
              </p>
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 px-5 pb-5 pt-3 border-t border-border/40 bg-muted/20">
            <Button
              variant="ghost"
              onClick={() => { setEditDialog(null); setEditMotivo(""); }}
              className="sm:flex-1 h-11 rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleRequestEdit}
              disabled={editMotivo.trim().length < 10 || sendingRequest}
              className="sm:flex-[2] h-11 rounded-xl font-semibold tracking-tight"
            >
              {sendingRequest ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Enviar solicitud
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail bottom sheet */}
      <AnimatePresence>
        {detailRecord && (
          <DetailSheet
            rec={detailRecord}
            onClose={() => setDetailRecord(null)}
            onRequestEdit={(id) => {
              setDetailRecord(null);
              handleSwipeAction(id);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
