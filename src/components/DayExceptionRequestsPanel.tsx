import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle, XCircle, Clock, AlertTriangle, Calendar, ExternalLink, Filter, Trash2 } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";

type DayExceptionRequest = {
  id: string;
  worker_number: string;
  worker_name: string;
  worker_email: string | null;
  department_id: string;
  department_name: string;
  request_date: string;
  reason: string;
  status: string;
  manager_status: string | null;
  manager_action_by: string | null;
  manager_action_at: string | null;
  manager_rejection_reason: string | null;
  admin_status: string | null;
  admin_action_by: string | null;
  admin_action_at: string | null;
  admin_rejection_reason: string | null;
  created_at: string;
};

interface DayExceptionRequestsPanelProps {
  onUpdate?: () => void;
  isManager?: boolean; // If true, show manager view; otherwise show admin view
}

export const DayExceptionRequestsPanel = ({ onUpdate, isManager = false }: DayExceptionRequestsPanelProps) => {
  const [requests, setRequests] = useState<DayExceptionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pending");
  
  // Filters (admin only)
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<string>("all");
  
  // Dialog state
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<DayExceptionRequest | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject">("approve");
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRequests();
  }, []);

  // Extract unique departments for filter
  const departments = useMemo(() => {
    const deptMap = new Map<string, string>();
    requests.forEach(r => deptMap.set(r.department_id, r.department_name));
    return Array.from(deptMap, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [requests]);

  // Extract unique months for filter
  const months = useMemo(() => {
    const monthSet = new Set<string>();
    requests.forEach(r => {
      const date = new Date(r.request_date + 'T00:00:00');
      monthSet.add(format(date, 'yyyy-MM'));
    });
    return Array.from(monthSet).sort().reverse();
  }, [requests]);

  const fetchRequests = async () => {
    setLoading(true);
    const sessionToken = localStorage.getItem("manager_session_token");
    
    try {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "getDayExceptionRequests",
          sessionToken,
          data: {}
        }
      });

      if (data?.success) {
        setRequests(data.requests || []);
      } else {
        console.error("Error fetching exception requests:", data?.error);
      }
    } catch (err) {
      console.error("Error fetching exception requests:", err);
      toast.error("Error al cargar solicitudes de excepción");
    }
    setLoading(false);
  };

  const handleOpenAction = (request: DayExceptionRequest, type: "approve" | "reject") => {
    setSelectedRequest(request);
    setActionType(type);
    setRejectionReason("");
    setActionDialogOpen(true);
  };

  const handleAction = async () => {
    if (!selectedRequest) return;
    
    if (actionType === "reject" && !rejectionReason.trim()) {
      toast.error("Debes indicar un motivo de rechazo");
      return;
    }
    
    setProcessing(true);
    const sessionToken = localStorage.getItem("manager_session_token");
    
    try {
      const actionName = isManager ? "managerActionDayException" : "adminActionDayException";
      
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: actionName,
          sessionToken,
          data: {
            requestId: selectedRequest.id,
            approved: actionType === "approve",
            rejectionReason: actionType === "reject" ? rejectionReason.trim() : null
          }
        }
      });

      if (data?.success) {
        toast.success(
          actionType === "approve" 
            ? (isManager ? "Solicitud aprobada y enviada al admin" : "Excepción aprobada correctamente")
            : "Solicitud rechazada"
        );
        setActionDialogOpen(false);
        fetchRequests();
        onUpdate?.();
      } else {
        toast.error(data?.error || "Error al procesar solicitud");
      }
    } catch (err) {
      console.error("Error processing request:", err);
      toast.error("Error al procesar solicitud");
    }
    setProcessing(false);
  };

  const handleDelete = async () => {
    if (!selectedRequest) return;
    
    setDeletingId(selectedRequest.id);
    const sessionToken = localStorage.getItem("manager_session_token");
    
    try {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "deleteDayExceptionRequest",
          sessionToken,
          data: { requestId: selectedRequest.id }
        }
      });

      if (data?.success) {
        toast.success("Solicitud eliminada");
        setDeleteDialogOpen(false);
        setRequests(prev => prev.filter(r => r.id !== selectedRequest.id));
        onUpdate?.();
      } else {
        toast.error(data?.error || "Error al eliminar solicitud");
      }
    } catch (err) {
      console.error("Error deleting request:", err);
      toast.error("Error al eliminar solicitud");
    }
    setDeletingId(null);
  };

  // Filter requests based on view mode, status, and additional filters
  const getFilteredRequests = () => {
    let filtered = requests;
    
    // Status filter
    if (isManager) {
      if (activeTab === "pending") {
        filtered = filtered.filter(r => r.status === "PENDING_MANAGER");
      } else {
        filtered = filtered.filter(r => r.status !== "PENDING_MANAGER");
      }
    } else {
      if (activeTab === "pending") {
        filtered = filtered.filter(r => r.status === "PENDING_MANAGER" || r.status === "PENDING_ADMIN");
      } else {
        filtered = filtered.filter(r => r.status === "APPROVED" || r.status === "REJECTED");
      }
    }
    
    // Admin filters
    if (!isManager) {
      if (filterDepartment !== "all") {
        filtered = filtered.filter(r => r.department_id === filterDepartment);
      }
      if (filterMonth !== "all") {
        filtered = filtered.filter(r => {
          const date = new Date(r.request_date + 'T00:00:00');
          return format(date, 'yyyy-MM') === filterMonth;
        });
      }
    }
    
    return filtered;
  };

  const pendingRequests = getFilteredRequests();
  const pendingCount = isManager 
    ? requests.filter(r => r.status === "PENDING_MANAGER").length
    : requests.filter(r => r.status === "PENDING_MANAGER" || r.status === "PENDING_ADMIN").length;

  const getStatusBadge = (request: DayExceptionRequest) => {
    switch (request.status) {
      case "PENDING_MANAGER":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">Pendiente Encargado</Badge>;
      case "PENDING_ADMIN":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">Pendiente Admin</Badge>;
      case "APPROVED":
        return <Badge variant="default" className="bg-primary">Aprobada</Badge>;
      case "REJECTED":
        return <Badge variant="destructive">Rechazada</Badge>;
      default:
        return <Badge variant="outline">{request.status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const renderRequestCard = (request: DayExceptionRequest, showActions: boolean) => (
    <Card key={request.id} className={
      request.status === "PENDING_MANAGER" || request.status === "PENDING_ADMIN"
        ? "border-yellow-500/30" 
        : ""
    }>
      <CardContent className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-2 flex-1">
            {/* Worker info */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground">{request.worker_name}</span>
              <a 
                href={`https://salix.verdnatura.es/#/worker/${request.worker_number}/calendar`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline text-sm flex items-center gap-1"
              >
                #{request.worker_number}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            
            {/* Department */}
            <p className="text-sm text-muted-foreground">{request.department_name}</p>
            
            {/* Date requested */}
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="font-medium">
                {format(new Date(request.request_date + 'T00:00:00'), "EEEE d 'de' MMMM yyyy", { locale: es })}
              </span>
            </div>
            
            {/* Reason */}
            <div className="bg-muted/50 rounded-lg p-3 mt-2">
              <p className="text-xs text-muted-foreground mb-1">Motivo de la solicitud:</p>
              <p className="text-sm">{request.reason}</p>
            </div>
            
            {/* Status and history */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {getStatusBadge(request)}
              
              {request.manager_action_by && (
                <span className="text-xs text-muted-foreground">
                  Encargado: {request.manager_action_by}
                  {request.manager_action_at && ` (${format(new Date(request.manager_action_at), "d/MM HH:mm")})`}
                </span>
              )}
              
              {request.admin_action_by && (
                <span className="text-xs text-muted-foreground">
                  Admin: {request.admin_action_by}
                  {request.admin_action_at && ` (${format(new Date(request.admin_action_at), "d/MM HH:mm")})`}
                </span>
              )}
            </div>
            
            {/* Rejection reasons */}
            {request.manager_rejection_reason && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2 mt-2">
                <p className="text-xs text-destructive font-medium">Motivo rechazo encargado:</p>
                <p className="text-sm text-destructive/80">{request.manager_rejection_reason}</p>
              </div>
            )}
            {request.admin_rejection_reason && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2 mt-2">
                <p className="text-xs text-destructive font-medium">Motivo rechazo admin:</p>
                <p className="text-sm text-destructive/80">{request.admin_rejection_reason}</p>
              </div>
            )}
            
            {/* Created date */}
            <p className="text-xs text-muted-foreground pt-1">
              Solicitado: {format(new Date(request.created_at), "d MMM yyyy HH:mm", { locale: es })}
            </p>
          </div>
          
          {/* Actions */}
          <div className="flex gap-2 lg:flex-col items-center">
            {showActions && (
              <>
                <Button 
                  size="sm" 
                  onClick={() => handleOpenAction(request, "approve")}
                  className="flex-1 lg:flex-none gap-1"
                >
                  <CheckCircle className="h-4 w-4" />
                  Aprobar
                </Button>
                <Button 
                  size="sm" 
                  variant="destructive"
                  onClick={() => handleOpenAction(request, "reject")}
                  className="flex-1 lg:flex-none gap-1"
                >
                  <XCircle className="h-4 w-4" />
                  Rechazar
                </Button>
              </>
            )}
            {!isManager && (
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => {
                  setSelectedRequest(request);
                  setDeleteDialogOpen(true);
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="h-5 w-5 text-amber-500" />
        <h3 className="font-semibold text-lg">Solicitudes de Excepción de Días</h3>
        {pendingCount > 0 && (
          <Badge variant="destructive" className="ml-2">{pendingCount} pendientes</Badge>
        )}
      </div>
      
      {/* Admin filters */}
      {!isManager && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filterDepartment} onValueChange={setFilterDepartment}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="Departamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los departamentos</SelectItem>
              {departments.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Mes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los meses</SelectItem>
              {months.map(m => (
                <SelectItem key={m} value={m}>
                  {format(new Date(m + '-01'), 'MMMM yyyy', { locale: es })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            Pendientes
            {pendingCount > 0 && (
              <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-xs">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="processed" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            Procesadas
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="pending" className="mt-4">
          {pendingRequests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No hay solicitudes pendientes</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map(request => renderRequestCard(request, true))}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="processed" className="mt-4">
          {getFilteredRequests().length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No hay solicitudes procesadas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {getFilteredRequests().map(request => renderRequestCard(request, false))}
            </div>
          )}
        </TabsContent>
      </Tabs>
      
      {/* Action Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={actionType === "approve" ? "text-primary" : "text-destructive"}>
              {actionType === "approve" ? "Aprobar Excepción" : "Rechazar Solicitud"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "approve" 
                ? (isManager 
                    ? "La solicitud pasará al administrador para aprobación final."
                    : (selectedRequest?.status === "PENDING_MANAGER"
                        ? "Aprobarás directamente esta excepción (saltando el paso del encargado)."
                        : "Se creará una excepción para que el trabajador pueda solicitar este día bloqueado."))
                : "Indica el motivo del rechazo para informar al trabajador."
              }
            </DialogDescription>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="font-medium">{selectedRequest.worker_name}</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(selectedRequest.request_date + 'T00:00:00'), "EEEE d 'de' MMMM yyyy", { locale: es })}
                </p>
                <p className="text-sm mt-2">Motivo: {selectedRequest.reason}</p>
              </div>
              
              {actionType === "reject" && (
                <div className="space-y-2">
                  <Label htmlFor="rejectionReason">Motivo del rechazo *</Label>
                  <Textarea
                    id="rejectionReason"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Explica por qué se rechaza la solicitud..."
                    rows={3}
                  />
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)} disabled={processing}>
              Cancelar
            </Button>
            <Button 
              onClick={handleAction}
              disabled={processing || (actionType === "reject" && !rejectionReason.trim())}
              variant={actionType === "approve" ? "default" : "destructive"}
            >
              {processing ? "Procesando..." : (actionType === "approve" ? "Aprobar" : "Rechazar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Eliminar Solicitud</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que quieres eliminar esta solicitud? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="font-medium">{selectedRequest.worker_name}</p>
              <p className="text-sm text-muted-foreground">
                {format(new Date(selectedRequest.request_date + 'T00:00:00'), "EEEE d 'de' MMMM yyyy", { locale: es })}
              </p>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={!!deletingId}>
              Cancelar
            </Button>
            <Button 
              onClick={handleDelete}
              disabled={!!deletingId}
              variant="destructive"
            >
              {deletingId ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DayExceptionRequestsPanel;
