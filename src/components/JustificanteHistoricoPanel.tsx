import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { 
  Download, Loader2, Search, Filter, Calendar as CalendarIcon,
  FileText, History, CheckCircle, XCircle, Clock, MessageSquare,
  Upload, RefreshCw, Trash2
} from "lucide-react";
import { toast } from "sonner";

type AuditLog = {
  id: string;
  justificante_id: string | null;
  action_type: string;
  actor_name: string;
  actor_role: string;
  worker_name: string | null;
  worker_number: string | null;
  department_name: string | null;
  tipo_justificante: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  details: string | null;
  metadata: any;
  created_at: string;
};

type Props = {
  sessionToken: string;
  isAdmin?: boolean;
};

const actionTypeLabels: Record<string, { label: string; color: string; icon: any }> = {
  created: { label: "Subido", color: "bg-blue-500/10 text-blue-600 border-blue-500/30", icon: Upload },
  gestionado: { label: "Gestionado", color: "bg-primary/10 text-primary border-primary/30", icon: CheckCircle },
  aprobado: { label: "Aprobado", color: "bg-primary/10 text-primary border-primary/30", icon: CheckCircle },
  rechazado: { label: "Rechazado", color: "bg-red-500/10 text-red-600 border-red-500/30", icon: XCircle },
  pendiente_docs: { label: "Docs. solicitada", color: "bg-orange-500/10 text-orange-600 border-orange-500/30", icon: MessageSquare },
  documentacion_solicitada: { label: "Docs. solicitada", color: "bg-orange-500/10 text-orange-600 border-orange-500/30", icon: MessageSquare },
  documentacion_aportada: { label: "Doc. aportada", color: "bg-purple-500/10 text-purple-600 border-purple-500/30", icon: FileText },
  additional_doc: { label: "Doc. adicional", color: "bg-purple-500/10 text-purple-600 border-purple-500/30", icon: FileText },
  deleted: { label: "Eliminado", color: "bg-red-500/10 text-red-600 border-red-500/30", icon: XCircle },
  reverted: { label: "Revertido", color: "bg-gray-500/10 text-gray-600 border-gray-500/30", icon: RefreshCw },
};

export const JustificanteHistoricoPanel = ({ sessionToken, isAdmin = false }: Props) => {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditLog[]>([]);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterActionType, setFilterActionType] = useState<string>("all");
  const [filterFechaDesde, setFilterFechaDesde] = useState<Date | undefined>();
  const [filterFechaHasta, setFilterFechaHasta] = useState<Date | undefined>();

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [logs, searchQuery, filterActionType, filterFechaDesde, filterFechaHasta]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [searchQuery, filterActionType, filterFechaDesde, filterFechaHasta]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: {
          action: "getAuditLogs",
          data: { sessionToken }
        }
      });

      if (data?.success) {
        setLogs(data.logs || []);
      } else {
        toast.error("Error al cargar historial");
      }
    } catch (error) {
      console.error("Error fetching logs:", error);
      toast.error("Error al cargar historial");
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...logs];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(log =>
        log.worker_name?.toLowerCase().includes(query) ||
        log.worker_number?.toLowerCase().includes(query) ||
        log.actor_name?.toLowerCase().includes(query) ||
        log.department_name?.toLowerCase().includes(query) ||
        log.details?.toLowerCase().includes(query)
      );
    }

    // Action type filter
    if (filterActionType !== "all") {
      filtered = filtered.filter(log => log.action_type === filterActionType);
    }

    // Date filters
    if (filterFechaDesde) {
      const desde = format(filterFechaDesde, "yyyy-MM-dd");
      filtered = filtered.filter(log => log.created_at.substring(0, 10) >= desde);
    }
    if (filterFechaHasta) {
      const hasta = format(filterFechaHasta, "yyyy-MM-dd");
      filtered = filtered.filter(log => log.created_at.substring(0, 10) <= hasta);
    }

    setFilteredLogs(filtered);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredLogs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredLogs.map(log => log.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    
    if (!confirm(`¿Eliminar ${selectedIds.size} registros del historial? Esta acción no se puede deshacer.`)) {
      return;
    }

    setDeleting(true);
    try {
      const { data } = await supabase.functions.invoke("justificantes-operations", {
        body: {
          action: "deleteAuditLogs",
          data: { sessionToken, logIds: Array.from(selectedIds) }
        }
      });

      if (data?.success) {
        toast.success(`${data.deleted} registros eliminados`);
        setSelectedIds(new Set());
        fetchLogs();
      } else {
        toast.error(data?.error || "Error al eliminar registros");
      }
    } catch (error) {
      console.error("Error deleting logs:", error);
      toast.error("Error al eliminar registros");
    } finally {
      setDeleting(false);
    }
  };

  const exportToCSV = () => {
    setExporting(true);
    try {
      const headers = [
        "Fecha/Hora",
        "Acción",
        "Realizado por",
        "Rol",
        "Trabajador",
        "Nº Fichar",
        "Departamento",
        "Tipo Justificante",
        "Fecha Inicio",
        "Fecha Fin",
        "Detalles"
      ];

      const rows = filteredLogs.map(log => [
        format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss"),
        actionTypeLabels[log.action_type]?.label || log.action_type,
        log.actor_name,
        log.actor_role,
        log.worker_name || "",
        log.worker_number || "",
        log.department_name || "",
        log.tipo_justificante || "",
        log.fecha_inicio ? format(new Date(log.fecha_inicio), "dd/MM/yyyy") : "",
        log.fecha_fin ? format(new Date(log.fecha_fin), "dd/MM/yyyy") : "",
        log.details || ""
      ]);

      const csvContent = [
        headers.join(";"),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
      ].join("\n");

      const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `historico_justificantes_${format(new Date(), "yyyy-MM-dd_HHmm")}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("CSV exportado correctamente");
    } catch (error) {
      console.error("Error exporting CSV:", error);
      toast.error("Error al exportar CSV");
    } finally {
      setExporting(false);
    }
  };

  const getActionBadge = (actionType: string) => {
    const config = actionTypeLabels[actionType] || { 
      label: actionType, 
      color: "bg-gray-500/10 text-gray-600 border-gray-500/30",
      icon: History
    };
    const Icon = config.icon;
    return (
      <Badge variant="outline" className={config.color}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, número, gestor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <Select value={filterActionType} onValueChange={setFilterActionType}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo de acción" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las acciones</SelectItem>
                <SelectItem value="created">Subido</SelectItem>
                <SelectItem value="gestionado">Gestionado</SelectItem>
                <SelectItem value="rechazado">Rechazado</SelectItem>
                <SelectItem value="pendiente_docs">Docs. solicitada</SelectItem>
                <SelectItem value="additional_doc">Doc. adicional</SelectItem>
                <SelectItem value="reverted">Revertido</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("justify-start text-left font-normal", !filterFechaDesde && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filterFechaDesde ? format(filterFechaDesde, "dd/MM/yyyy") : "Desde"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={filterFechaDesde} onSelect={setFilterFechaDesde} locale={es} />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("justify-start text-left font-normal", !filterFechaHasta && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filterFechaHasta ? format(filterFechaHasta, "dd/MM/yyyy") : "Hasta"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={filterFechaHasta} onSelect={setFilterFechaHasta} locale={es} />
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Historial Completo
            </CardTitle>
            <CardDescription>
              {filteredLogs.length} registros {filteredLogs.length !== logs.length && `(de ${logs.length} totales)`}
              {selectedIds.size > 0 && ` • ${selectedIds.size} seleccionados`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && selectedIds.size > 0 && (
              <Button 
                variant="destructive" 
                size="sm"
                onClick={handleDeleteSelected} 
                disabled={deleting}
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Eliminar ({selectedIds.size})
              </Button>
            )}
            <Button onClick={exportToCSV} disabled={exporting || filteredLogs.length === 0}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              Exportar CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay registros en el historial</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isAdmin && (
                      <TableHead className="w-10">
                        <Checkbox 
                          checked={selectedIds.size === filteredLogs.length && filteredLogs.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                    )}
                    <TableHead>Fecha/Hora</TableHead>
                    <TableHead>Acción</TableHead>
                    <TableHead>Realizado por</TableHead>
                    <TableHead>Trabajador</TableHead>
                    <TableHead>Departamento</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Fechas</TableHead>
                    <TableHead>Detalles</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id} className={cn(selectedIds.has(log.id) && "bg-primary/5")}>
                      {isAdmin && (
                        <TableCell>
                          <Checkbox 
                            checked={selectedIds.has(log.id)}
                            onCheckedChange={() => toggleSelect(log.id)}
                          />
                        </TableCell>
                      )}
                      <TableCell className="whitespace-nowrap">
                        <div className="text-sm">
                          {format(new Date(log.created_at), "dd/MM/yyyy")}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(log.created_at), "HH:mm:ss")}
                        </div>
                      </TableCell>
                      <TableCell>{getActionBadge(log.action_type)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{log.actor_name}</div>
                        <div className="text-xs text-muted-foreground">{log.actor_role}</div>
                      </TableCell>
                      <TableCell>
                        {log.worker_name ? (
                          <div>
                            <div className="font-medium">{log.worker_name}</div>
                            <div className="text-xs text-muted-foreground">#{log.worker_number}</div>
                          </div>
                        ) : "-"}
                      </TableCell>
                      <TableCell>{log.department_name || "-"}</TableCell>
                      <TableCell>
                        {log.tipo_justificante ? (
                          <Badge variant="outline">{log.tipo_justificante}</Badge>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {log.fecha_inicio ? (
                          <span className="text-sm">
                            {format(new Date(log.fecha_inicio), "dd/MM/yyyy")}
                            {log.fecha_fin && log.fecha_fin !== log.fecha_inicio && (
                              <> - {format(new Date(log.fecha_fin), "dd/MM/yyyy")}</>
                            )}
                          </span>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={log.details || ""}>
                        {log.details || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
