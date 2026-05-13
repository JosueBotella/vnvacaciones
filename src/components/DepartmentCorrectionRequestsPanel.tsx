import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CheckCircle, Clock, Trash2, ArrowRight, ExternalLink, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type DepartmentCorrectionRequest = {
  id: string;
  worker_id: string;
  worker_number: string;
  worker_name: string;
  current_department_id: string;
  current_department_name: string;
  requested_department_id: string;
  requested_department_name: string;
  status: string;
  created_at: string;
  processed_at: string | null;
  processed_by: string | null;
};

type Department = {
  id: string;
  name: string;
};

type WorkerTeam = {
  id: string;
  name: string;
  department_id: string;
};

interface DepartmentCorrectionRequestsPanelProps {
  onUpdate?: () => void;
}

export const DepartmentCorrectionRequestsPanel = ({ onUpdate }: DepartmentCorrectionRequestsPanelProps) => {
  const [requests, setRequests] = useState<DepartmentCorrectionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pending");
  
  const [processDialogOpen, setProcessDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<DepartmentCorrectionRequest | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<WorkerTeam[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [processing, setProcessing] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchRequests();
    fetchDepartmentsAndTeams();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    const sessionToken = localStorage.getItem("manager_session_token");
    
    try {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "getDepartmentCorrectionRequests",
          sessionToken
        }
      });

      if (data?.success) {
        setRequests(data.requests || []);
      }
    } catch (err) {
      console.error("Error fetching department correction requests:", err);
      toast.error("Error al cargar solicitudes");
    }
    setLoading(false);
  };

  const fetchDepartmentsAndTeams = async () => {
    const sessionToken = localStorage.getItem("manager_session_token");
    
    try {
      const { data: deptData } = await supabase.functions.invoke("admin-operations", {
        body: { action: "getDepartments", sessionToken }
      });
      if (deptData?.success) {
        setDepartments(deptData.departments || []);
      }
      
      const { data: teamsData } = await supabase
        .from("worker_teams")
        .select("id, name, department_id");
      setTeams(teamsData || []);
    } catch (err) {
      console.error("Error fetching departments and teams:", err);
    }
  };

  const handleOpenProcess = (request: DepartmentCorrectionRequest) => {
    setSelectedRequest(request);
    setSelectedDepartmentId(request.requested_department_id);
    setSelectedTeamId("");
    setProcessDialogOpen(true);
  };

  const handleProcessRequest = async (approve: boolean) => {
    if (!selectedRequest) return;
    
    setProcessing(true);
    const sessionToken = localStorage.getItem("manager_session_token");
    
    try {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "processDepartmentCorrectionRequest",
          sessionToken,
          data: {
            requestId: selectedRequest.id,
            workerId: selectedRequest.worker_id,
            approve,
            newDepartmentId: approve ? selectedDepartmentId : null,
            newTeamId: approve && selectedTeamId ? selectedTeamId : null
          }
        }
      });

      if (data?.success) {
        toast.success(approve ? "Trabajador movido al nuevo departamento" : "Solicitud rechazada");
        setProcessDialogOpen(false);
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
    if (!requestToDelete) return;
    
    const sessionToken = localStorage.getItem("manager_session_token");
    
    try {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "deleteDepartmentCorrectionRequest",
          sessionToken,
          data: { requestId: requestToDelete }
        }
      });

      if (data?.success) {
        toast.success("Solicitud eliminada");
        fetchRequests();
        onUpdate?.();
      } else {
        toast.error("Error al eliminar");
      }
    } catch (err) {
      toast.error("Error al eliminar");
    }
    setDeleteDialogOpen(false);
    setRequestToDelete(null);
  };

  const pendingRequests = requests.filter(r => r.status === "PENDING");
  const processedRequests = requests.filter(r => r.status !== "PENDING");
  
  const filteredTeams = teams.filter(t => t.department_id === selectedDepartmentId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const renderRequestCard = (request: DepartmentCorrectionRequest, showActions: boolean) => (
    <Card key={request.id} className={request.status === "PENDING" ? "border-amber-500/30" : ""}>
      <CardContent className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{request.worker_name}</span>
              <a
                href={`https://salix.verdnatura.es/#/worker/${request.worker_number}/calendar`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <Badge variant="outline" className="text-xs gap-1">
                  #{request.worker_number}
                  <ExternalLink className="h-3 w-3" />
                </Badge>
              </a>
              {request.status === "PENDING" ? (
                <Badge variant="secondary" className="gap-1 bg-amber-500/20 text-amber-700 dark:text-amber-400">
                  <Clock className="h-3 w-3" /> Pendiente
                </Badge>
              ) : request.status === "APPROVED" ? (
                <Badge variant="default" className="gap-1">
                  <CheckCircle className="h-3 w-3" /> Aprobada
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  Rechazada
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{request.current_department_name}</span>
              <ArrowRight className="h-4 w-4 text-primary" />
              <span className="text-foreground font-medium">{request.requested_department_name}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Solicitado: {format(new Date(request.created_at), "d MMM yyyy HH:mm", { locale: es })}
            </p>
            {request.processed_at && (
              <p className="text-xs text-muted-foreground">
                Procesado: {format(new Date(request.processed_at), "d MMM yyyy HH:mm", { locale: es })}
                {request.processed_by && ` por ${request.processed_by}`}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {showActions && (
              <Button 
                size="sm" 
                onClick={() => handleOpenProcess(request)}
                className="gap-1"
              >
                <RefreshCw className="h-4 w-4" />
                Procesar
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setRequestToDelete(request.id);
                setDeleteDialogOpen(true);
              }}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card 
          className={`cursor-pointer transition-all ${activeTab === "pending" ? "ring-2 ring-primary" : ""} ${pendingRequests.length > 0 ? "bg-amber-500/10 border-amber-500/30" : "bg-secondary/30"}`}
          onClick={() => setActiveTab("pending")}
        >
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{pendingRequests.length}</p>
            <p className="text-xs text-muted-foreground">Pendientes</p>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer transition-all ${activeTab === "processed" ? "ring-2 ring-primary" : ""} bg-secondary/30`}
          onClick={() => setActiveTab("processed")}
        >
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{processedRequests.length}</p>
            <p className="text-xs text-muted-foreground">Procesadas</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            Pendientes ({pendingRequests.length})
          </TabsTrigger>
          <TabsTrigger value="processed" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            Procesadas ({processedRequests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {pendingRequests.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <RefreshCw className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin solicitudes pendientes</h3>
                <p className="text-muted-foreground text-sm">
                  No hay solicitudes de corrección de departamento
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((request) => renderRequestCard(request, true))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="processed" className="mt-4">
          {processedRequests.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin solicitudes procesadas</h3>
                <p className="text-muted-foreground text-sm">
                  Las solicitudes procesadas aparecerán aquí
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {processedRequests.map((request) => renderRequestCard(request, false))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Process Request Dialog */}
      <Dialog open={processDialogOpen} onOpenChange={setProcessDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Procesar solicitud de corrección</DialogTitle>
            <DialogDescription>
              El trabajador solicita cambiar de departamento
            </DialogDescription>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Trabajador:</span>
                  <span className="font-medium">{selectedRequest.worker_name} (#{selectedRequest.worker_number})</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Cambio:</span>
                  <span>{selectedRequest.current_department_name}</span>
                  <ArrowRight className="h-4 w-4 text-primary" />
                  <span className="font-medium text-primary">{selectedRequest.requested_department_name}</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Departamento destino</Label>
                <Select value={selectedDepartmentId} onValueChange={(val) => {
                  setSelectedDepartmentId(val);
                  setSelectedTeamId("");
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map(dept => (
                      <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Nuevo equipo (opcional)</Label>
                <Select 
                  value={selectedTeamId || "none"} 
                  onValueChange={(val) => setSelectedTeamId(val === "none" ? "" : val)}
                  disabled={!selectedDepartmentId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin equipo asignado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin equipo asignado</SelectItem>
                    {filteredTeams.map(team => (
                      <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="destructive"
              onClick={() => handleProcessRequest(false)}
              disabled={processing}
            >
              Rechazar
            </Button>
            <Button
              onClick={() => handleProcessRequest(true)}
              disabled={processing || !selectedDepartmentId}
            >
              Aprobar y mover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar solicitud?</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
