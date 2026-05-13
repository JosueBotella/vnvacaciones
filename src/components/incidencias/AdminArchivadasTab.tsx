import { useState, useEffect, useCallback, useMemo } from "react";
import { Archive, Loader2, RotateCcw, Trash2, Search, Calendar, FileText, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getManagerSessionToken } from "@/lib/sessionHelpers";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

type Department = { id: string; name: string };

type ArchivedPropuesta = {
  id: string;
  record_id: string | null;
  department_id: string;
  tipo: string;
  gravedad: string;
  estado: string;
  archivada_at: string;
  archivada_por: string | null;
  archivada_motivo: string | null;
  created_at: string;
  nspp_worker_name: string | null;
  record: {
    id: string;
    fecha: string;
    descripcion: string | null;
    custom_category_name: string | null;
    created_by_name: string | null;
    accion_propuesta: string | null;
  } | null;
};

const tipoLabels: Record<string, string> = {
  amonestacion: "Amonestación",
  sancion: "Sanción",
  nspp: "NSPP",
};

const gravedadColors: Record<string, string> = {
  leve: "#93d600",
  grave: "#d97706",
  muy_grave: "#dc2626",
};

export function AdminArchivadasTab() {
  const sessionToken = getManagerSessionToken() || "";
  const [items, setItems] = useState<ArchivedPropuesta[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState<ArchivedPropuesta | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ArchivedPropuesta | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "listArchivedPropuestas", sessionToken, departmentId: deptFilter === "all" ? null : deptFilter },
      });
      if (data?.success) {
        setItems(data.propuestas || []);
        if (Array.isArray(data.departments)) setDepartments(data.departments);
      } else {
        toast.error(data?.error || "Error al cargar archivadas");
      }
    } catch {
      toast.error("Error al cargar archivadas");
    } finally {
      setLoading(false);
    }
  }, [sessionToken, deptFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const needle = search.trim().toLowerCase();
    return items.filter((p) => {
      const name = (p.nspp_worker_name || p.record?.created_by_name || "").toLowerCase();
      const desc = (p.record?.descripcion || "").toLowerCase();
      const motivo = (p.archivada_motivo || "").toLowerCase();
      return name.includes(needle) || desc.includes(needle) || motivo.includes(needle);
    });
  }, [items, search]);

  const departmentName = (id: string) => departments.find((d) => d.id === id)?.name || "—";

  const handleRestore = async () => {
    if (!restoreConfirm) return;
    setActionLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "restorePropuesta", sessionToken, propuestaId: restoreConfirm.id },
      });
      if (data?.success) {
        toast.success("Propuesta restaurada");
        setRestoreConfirm(null);
        load();
      } else {
        toast.error(data?.error || "Error al restaurar");
      }
    } catch { toast.error("Error al restaurar"); }
    finally { setActionLoading(false); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setActionLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "deletePropuesta", sessionToken, propuestaId: deleteConfirm.id },
      });
      if (data?.success) {
        toast.success("Propuesta eliminada definitivamente");
        setDeleteConfirm(null);
        load();
      } else {
        toast.error(data?.error || "Error al eliminar");
      }
    } catch { toast.error("Error al eliminar"); }
    finally { setActionLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[240px] space-y-1.5">
          <label className="text-xs text-muted-foreground">Buscar</label>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Trabajador, descripción o motivo…"
              className="rounded-xl pl-9 h-9 text-sm"
            />
          </div>
        </div>
        <div className="space-y-1.5 min-w-[200px]">
          <label className="text-xs text-muted-foreground">Departamento</label>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="rounded-xl h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-muted-foreground pb-2">
          {filtered.length} {filtered.length === 1 ? "propuesta archivada" : "propuestas archivadas"}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : filtered.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-16 flex flex-col items-center text-center gap-3 text-muted-foreground">
            <Archive className="h-10 w-10 opacity-40" />
            <div className="text-sm">No hay propuestas archivadas{search || deptFilter !== "all" ? " con esos filtros" : ""}.</div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => {
            const isOpen = !!expanded[p.id];
            const workerName = p.nspp_worker_name || p.record?.created_by_name || "Trabajador";
            return (
              <Card key={p.id} className="rounded-2xl border-muted-foreground/10">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => setExpanded((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                      className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={isOpen ? "Colapsar" : "Expandir"}
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm">{workerName}</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground text-[10px] uppercase tracking-wide">
                          <Archive className="h-3 w-3 mr-1" /> Archivada
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px]" style={{ backgroundColor: `${gravedadColors[p.gravedad] || "#999"}22`, color: gravedadColors[p.gravedad] || "#999" }}>
                          {p.gravedad === "muy_grave" ? "Muy grave" : p.gravedad === "grave" ? "Grave" : "Leve"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{tipoLabels[p.tipo] || p.tipo}</span>
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>{departmentName(p.department_id)}</span>
                        {p.record?.fecha && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> Incidencia: {format(new Date(p.record.fecha), "d MMM yyyy", { locale: es })}
                          </span>
                        )}
                        <span>
                          Archivada {formatDistanceToNow(new Date(p.archivada_at), { locale: es, addSuffix: true })}
                          {p.archivada_por ? ` por ${p.archivada_por}` : ""}
                        </span>
                      </div>
                      {p.archivada_motivo && (
                        <div className="text-xs italic text-muted-foreground/90">"{p.archivada_motivo}"</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="rounded-xl h-8 gap-1.5 text-xs" onClick={() => setRestoreConfirm(p)}>
                        <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                      </Button>
                      <Button size="sm" variant="ghost" className="rounded-xl h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteConfirm(p)} aria-label="Eliminar definitivamente">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="mt-3 pl-7 space-y-2 text-xs">
                      {p.record?.descripcion ? (
                        <div className="rounded-xl bg-muted/30 p-3 whitespace-pre-wrap">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                            <FileText className="h-3 w-3" /> Descripción original
                          </div>
                          {p.record.descripcion}
                        </div>
                      ) : (
                        <div className="text-muted-foreground italic">Sin descripción asociada.</div>
                      )}
                      <div className="text-muted-foreground">
                        Creada {formatDistanceToNow(new Date(p.created_at), { locale: es, addSuffix: true })}.
                        {p.record?.created_by_name ? ` Reportada por ${p.record.created_by_name}.` : ""}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!restoreConfirm} onOpenChange={(o) => { if (!o) setRestoreConfirm(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Restaurar propuesta</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>La propuesta volverá a estado <strong>Pendiente</strong> y la incidencia asociada a <strong>Abierta</strong>.</p>
            <p>Aparecerá de nuevo en el listado de propuestas activas.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl" onClick={() => setRestoreConfirm(null)} disabled={actionLoading}>Cancelar</Button>
            <Button className="rounded-xl gap-1.5" onClick={handleRestore} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Restaurar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={(o) => { if (!o) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><Trash2 className="h-4 w-4" /> Eliminar definitivamente</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Esta acción <strong>no se puede deshacer</strong>. Se eliminarán la propuesta, sus documentos legales asociados y los registros de auditoría relacionados.</p>
            <p>¿Seguro que quieres continuar?</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl" onClick={() => setDeleteConfirm(null)} disabled={actionLoading}>Cancelar</Button>
            <Button variant="destructive" className="rounded-xl gap-1.5" onClick={handleDelete} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Eliminar definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
