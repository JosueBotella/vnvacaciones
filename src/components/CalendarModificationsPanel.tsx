import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { es } from "date-fns/locale";
import { safeFormatBackendDate } from "@/lib/dates";
import { 
  FileEdit, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  FileText, 
  RefreshCw,
  Search,
  ChevronDown,
  Calendar,
  Mail,
  Building2,
  PenLine,
  Pencil,
  MoreHorizontal,
  Send,
  CheckSquare,
  Download,
  Trash2
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { EmbeddedWorkerCalendar, CalendarModification } from "./EmbeddedWorkerCalendar";

interface CalendarModificationsPanelProps {
  sessionToken: string;
  onSessionExpired?: () => void;
}

export function CalendarModificationsPanel({ sessionToken, onSessionExpired }: CalendarModificationsPanelProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [modifications, setModifications] = useState<CalendarModification[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  
  // Collapsible sections
  const [signedOpen, setSignedOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(true);
  const [draftOpen, setDraftOpen] = useState(false);
  const [rejectedOpen, setRejectedOpen] = useState(false);
  
  // Document viewer (replaced old signature dialog)
  
  // Calendar popup dialog
  const [calendarDialogOpen, setCalendarDialogOpen] = useState(false);
  const [selectedWorkerForCalendar, setSelectedWorkerForCalendar] = useState<{ id: string; name: string; workerNumber: string } | null>(null);
  const [selectedModificationForCalendar, setSelectedModificationForCalendar] = useState<CalendarModification | null>(null);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);

  // Multi-select for bulk resend
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkResending, setBulkResending] = useState(false);

  const fetchModifications = useCallback(async () => {
    setLoading(true);
    try {
      const { data: response, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "getCalendarModifications",
          sessionToken,
          data: {}
        }
      });

      if (error || !response?.success) {
        if (response?.error === "Invalid session" || response?.error === "Session expired") {
          onSessionExpired?.();
          return;
        }
        toast.error("Error al cargar modificaciones");
        return;
      }

      setModifications(response.modifications || []);
      
      // Extract unique departments
      const depts = new Map<string, string>();
      (response.modifications || []).forEach((m: CalendarModification) => {
        if (m.department) {
          depts.set(m.department.id, m.department.name);
        }
      });
      setDepartments(Array.from(depts, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      console.error("Error fetching modifications:", err);
      toast.error("Error al cargar modificaciones");
    } finally {
      setLoading(false);
    }
  }, [sessionToken, onSessionExpired]);

  useEffect(() => {
    if (sessionToken) {
      fetchModifications();
    }
  }, [sessionToken, fetchModifications]);

  const handleResendEmail = async (modification: CalendarModification) => {
    try {
      const { data: response, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "resendCalendarModificationEmail",
          sessionToken,
          data: { modificationId: modification.id }
        }
      });

      if (error || !response?.success) {
        toast.error(response?.error || "Error al reenviar email");
        return;
      }

      toast.success("Email reenviado correctamente");
      fetchModifications();
    } catch (err) {
      console.error("Error resending email:", err);
      toast.error("Error al reenviar email");
    }
  };

  const handleBulkResend = async () => {
    if (selectedIds.size === 0) return;
    setBulkResending(true);
    let successCount = 0;
    let failCount = 0;
    
    for (const modId of selectedIds) {
      try {
        const { data: response, error } = await supabase.functions.invoke("admin-operations", {
          body: {
            action: "resendCalendarModificationEmail",
            sessionToken,
            data: { modificationId: modId }
          }
        });
        if (error || !response?.success) {
          failCount++;
        } else {
          successCount++;
        }
      } catch {
        failCount++;
      }
    }
    
    setBulkResending(false);
    setSelectedIds(new Set());
    
    if (failCount === 0) {
      toast.success(`${successCount} emails reenviados correctamente`);
    } else {
      toast.warning(`${successCount} enviados, ${failCount} fallidos`);
    }
    fetchModifications();
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (items: CalendarModification[]) => {
    const allSelected = items.every(m => selectedIds.has(m.id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        items.forEach(m => next.delete(m.id));
      } else {
        items.forEach(m => next.add(m.id));
      }
      return next;
    });
  };

  const handleApplyDirectly = async (modification: CalendarModification) => {
    try {
      const { data: response, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "applyCalendarModificationDirectly",
          sessionToken,
          data: { modificationId: modification.id }
        }
      });

      if (error || !response?.success) {
        toast.error(response?.error || "Error al aplicar modificación");
        return;
      }

      toast.success("Modificación aplicada correctamente");
      setCalendarRefreshKey(k => k + 1);
      fetchModifications();
    } catch (err) {
      console.error("Error applying modification:", err);
      toast.error("Error al aplicar modificación");
    }
  };

  const handleViewDocument = async (modification: CalendarModification) => {
    try {
      const { data: response, error } = await supabase.functions.invoke("admin-operations", {
        body: { action: "generateCalendarModificationDocument", sessionToken, data: { modificationId: modification.id } }
      });
      if (error || !response?.success || !response?.html) {
        toast.error("Error al generar documento");
        return;
      }
      const w = window.open("", "_blank");
      if (w) { w.document.write(response.html); w.document.close(); }
      else toast.error("Permite ventanas emergentes para ver el documento");
    } catch { toast.error("Error al generar documento"); }
  };

  const handleDownloadDocument = async (modification: CalendarModification) => {
    try {
      const { data: response, error } = await supabase.functions.invoke("admin-operations", {
        body: { action: "generateCalendarModificationDocument", sessionToken, data: { modificationId: modification.id } }
      });
      if (error || !response?.success || !response?.html) {
        toast.error("Error al generar documento");
        return;
      }
      const w = window.open("", "_blank");
      if (w) { w.document.write(response.html); w.document.close(); setTimeout(() => w.print(), 500); }
      else toast.error("Permite ventanas emergentes para descargar");
    } catch { toast.error("Error al generar documento"); }
  };

  const handleDeleteModification = async (modification: CalendarModification) => {
    if (!confirm(`¿Eliminar la modificación de ${modification.worker?.name || 'este trabajador'}? Esta acción no se puede deshacer.`)) return;
    try {
      const { data: response, error } = await supabase.functions.invoke("admin-operations", {
        body: { action: "deleteCalendarModification", sessionToken, data: { modificationId: modification.id } }
      });
      if (error || !response?.success) {
        toast.error(response?.error || "Error al eliminar");
        return;
      }
      toast.success("Modificación eliminada");
      fetchModifications();
    } catch { toast.error("Error al eliminar modificación"); }
  };

  const handleOpenCalendarWithModification = (modification: CalendarModification) => {
    setSelectedWorkerForCalendar({
      id: modification.worker_id,
      name: modification.worker?.name || "Trabajador",
      workerNumber: modification.worker?.worker_number || ""
    });
    setSelectedModificationForCalendar(modification);
    setCalendarRefreshKey(k => k + 1);
    setCalendarDialogOpen(true);
  };

  // Filter modifications
  const filteredModifications = modifications.filter(m => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matches = 
        m.worker?.name?.toLowerCase().includes(query) ||
        m.worker?.worker_number?.toLowerCase().includes(query) ||
        m.admin_reason?.toLowerCase().includes(query);
      if (!matches) return false;
    }
    if (statusFilter !== "all" && m.status !== statusFilter) return false;
    if (departmentFilter !== "all" && m.department_id !== departmentFilter) return false;
    return true;
  });

  // Group by status
  const signed = filteredModifications.filter(m => m.status === "signed");
  const pending = filteredModifications.filter(m => m.status === "pending_signature");
  const drafts = filteredModifications.filter(m => m.status === "draft");
  const rejected = filteredModifications.filter(m => m.status === "rejected");

  const getModificationTypeLabel = (type: string) => {
    switch (type) {
      case "remove_group_days": return "Quitar días";
      case "add_personal_days": return "Añadir días libres";
      case "change_group": return "Cambio de grupo";
      case "mixed": return "Mixto";
      default: return type;
    }
  };

  const renderModificationCard = (m: CalendarModification, selectable = false) => (
    <Card 
      key={m.id} 
      className="border-border/40 hover:border-border/60 transition-colors bg-card/50 cursor-pointer"
      onClick={() => handleOpenCalendarWithModification(m)}
    >
      <CardContent className="p-3">
        {/* Compact header row */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {selectable && (
              <Checkbox
                checked={selectedIds.has(m.id)}
                onCheckedChange={() => toggleSelection(m.id)}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0"
              />
            )}
            <span className="font-medium text-foreground truncate">
              {m.worker?.name || "Trabajador desconocido"}
            </span>
            <a
              href={`https://salix.verdnatura.es/#/worker/${m.worker?.worker_number}/calendar`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-muted-foreground shrink-0 hover:text-primary hover:underline transition-colors"
            >
              #{m.worker?.worker_number}
            </a>
          </div>
          
          {/* Actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {m.status === "signed" && (
                <>
                  <DropdownMenuItem onClick={() => handleViewDocument(m)}>
                    <FileText className="h-4 w-4 mr-2" />
                    Ver documento
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDownloadDocument(m)}>
                    <Download className="h-4 w-4 mr-2" />
                    Descargar PDF
                  </DropdownMenuItem>
                </>
              )}
              {(m.status === "signed" || m.status === "pending_signature") && (
                <DropdownMenuItem onClick={() => handleResendEmail(m)}>
                  <Mail className="h-4 w-4 mr-2" />
                  Reenviar email
                </DropdownMenuItem>
              )}
              {m.status === "pending_signature" && (
                <DropdownMenuItem onClick={() => handleApplyDirectly(m)} className="text-primary">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Aplicar sin firma
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => {
                const url = new URL(`/admin/worker-calendar/${m.worker_id}`, window.location.origin);
                url.searchParams.set('returnTo', '/admin');
                url.searchParams.set('returnTab', 'modifications');
                window.open(url.toString(), '_blank', 'noopener,noreferrer');
              }}>
                <Pencil className="h-4 w-4 mr-2" />
                Editar calendario
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleDeleteModification(m)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar modificación
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {/* Info row */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2 flex-wrap">
          <span className="flex items-center gap-1">
            <Building2 className="h-3 w-3" />
            {m.department?.name}
          </span>
          <span>•</span>
          <span>{m.year}</span>
          <span>•</span>
          <span>{getModificationTypeLabel(m.modification_type)}</span>
        </div>
        
        {/* Reason - truncated */}
        <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
          {m.admin_reason}
        </p>
        
        {/* Status row */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {safeFormatBackendDate(m.created_at, "d MMM yyyy", { locale: es })} por {m.admin_name}
          </span>
          
          {m.status === "signed" && m.signed_at ? (
            <span className="text-[10px] text-primary flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {safeFormatBackendDate(m.signed_at, "d MMM HH:mm", { locale: es })}
            </span>
          ) : m.status === "pending_signature" && m.email_sent_at ? (
            <span className="text-[10px] text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
              <Mail className="h-3 w-3" />
              Email enviado
            </span>
          ) : m.status === "rejected" ? (
            <span className="text-[10px] text-red-500 flex items-center gap-1">
              <XCircle className="h-3 w-3" />
              Rechazada
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );

  const renderSection = (
    title: string,
    items: CalendarModification[],
    isOpen: boolean,
    setIsOpen: (open: boolean) => void,
    icon: React.ReactNode,
    colorClass: string,
    selectable = false
  ) => {
    const allSelected = selectable && items.length > 0 && items.every(m => selectedIds.has(m.id));
    const sectionSelectedCount = selectable ? [...selectedIds].filter(id => items.some(m => m.id === id)).length : 0;
    
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-2">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className={cn("w-full justify-between p-3 h-auto", colorClass)}>
            <div className="flex items-center gap-2">
              {icon}
              <span className="font-semibold">{title}</span>
              <Badge variant="secondary" className="ml-2">{items.length}</Badge>
            </div>
            <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2">
          {selectable && items.length > 0 && (
            <div className="flex items-center gap-3 px-1 py-1">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-7 text-xs"
                onClick={() => toggleSelectAll(items)}
              >
                <CheckSquare className="h-3.5 w-3.5" />
                {allSelected ? "Deseleccionar todos" : "Seleccionar todos"}
              </Button>
              {sectionSelectedCount > 0 && (
                <Button
                  size="sm"
                  className="gap-1.5 h-7 text-xs"
                  onClick={handleBulkResend}
                  disabled={bulkResending}
                >
                  <Send className="h-3.5 w-3.5" />
                  {bulkResending ? "Enviando..." : `Reenviar (${sectionSelectedCount})`}
                </Button>
              )}
            </div>
          )}
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No hay modificaciones</p>
          ) : (
            items.map(m => renderModificationCard(m, selectable))
          )}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="h-8 w-32 bg-muted animate-pulse rounded" />
        </div>
        {[1, 2, 3].map(i => (
          <Card key={i} className="border-border/50">
            <CardContent className="p-4">
              <div className="h-24 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <FileEdit className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Modificaciones de Calendario</h2>
        </div>
        
        <Button size="sm" variant="outline" onClick={fetchModifications} className="gap-1">
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </Button>
      </div>
      
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o número..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <XCircle className="h-4 w-4" />
            </button>
          )}
        </div>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="signed">Firmadas</SelectItem>
            <SelectItem value="pending_signature">Pendientes</SelectItem>
            <SelectItem value="draft">Borradores</SelectItem>
            <SelectItem value="rejected">Rechazadas</SelectItem>
          </SelectContent>
        </Select>
        
        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger className="w-[180px]">
            <Building2 className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Departamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los departamentos</SelectItem>
            {departments.map(d => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {renderSection(
          "Firmadas",
          signed,
          signedOpen,
          setSignedOpen,
          <CheckCircle2 className="h-5 w-5 text-primary" />,
          "bg-primary/10 hover:bg-primary/20 text-primary",
          true
        )}
        
        {renderSection(
          "Pendientes de firma",
          pending,
          pendingOpen,
          setPendingOpen,
          <Clock className="h-5 w-5 text-yellow-600" />,
          "bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400",
          true
        )}
        
        {renderSection(
          "Borradores",
          drafts,
          draftOpen,
          setDraftOpen,
          <FileText className="h-5 w-5 text-blue-600" />,
          "bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-400"
        )}
        
        {renderSection(
          "Rechazadas",
          rejected,
          rejectedOpen,
          setRejectedOpen,
          <XCircle className="h-5 w-5 text-red-600" />,
          "bg-red-500/10 hover:bg-red-500/20 text-red-700 dark:text-red-400"
        )}
      </div>

      {/* Signature dialog removed — replaced by legal document viewer */}

      {/* Calendar Preview Dialog with integrated modification details */}
      <Dialog open={calendarDialogOpen} onOpenChange={setCalendarDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden p-0" hideCloseButton>
          <ScrollArea className="max-h-[85vh]">
            <div className="p-6">
              <DialogHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <DialogTitle className="flex items-center gap-2 text-base min-w-0">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span className="truncate">{selectedWorkerForCalendar?.name}</span>
                    <span className="text-muted-foreground font-normal text-sm shrink-0">
                      #{selectedWorkerForCalendar?.workerNumber}
                    </span>
                  </DialogTitle>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!selectedWorkerForCalendar?.id) return;
                        const url = new URL(`/admin/worker-calendar/${selectedWorkerForCalendar.id}`, window.location.origin);
                        url.searchParams.set('returnTo', '/admin');
                        url.searchParams.set('returnTab', 'modifications');
                        window.open(url.toString(), '_blank', 'noopener,noreferrer');
                      }}
                      disabled={!selectedWorkerForCalendar?.id}
                      className="gap-1.5 h-7 text-xs"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </Button>
                    <DialogClose asChild>
                      <Button size="icon" variant="ghost" className="h-7 w-7">
                        <XCircle className="h-4 w-4" />
                        <span className="sr-only">Cerrar</span>
                      </Button>
                    </DialogClose>
                  </div>
                </div>
              </DialogHeader>

              {selectedWorkerForCalendar && (
                <EmbeddedWorkerCalendar 
                  key={`${selectedWorkerForCalendar.id}-${calendarRefreshKey}`}
                  workerId={selectedWorkerForCalendar.id} 
                  sessionToken={sessionToken}
                  onSessionExpired={() => {
                    setCalendarDialogOpen(false);
                    onSessionExpired?.();
                  }}
                  modification={selectedModificationForCalendar}
                  onViewSignature={handleViewDocument}
                />
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
