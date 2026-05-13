import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CheckCircle, Clock, Trash2, UserPlus, ExternalLink, UserCheck } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type GroupJoinRequest = {
  id: string;
  worker_number: string;
  worker_name: string;
  worker_email: string | null;
  department_id: string;
  department_name: string;
  status: string;
  assigned_team_id: string | null;
  assigned_work_group_id: string | null;
  team_name: string | null;
  work_group: { id: string; name: string; color: string } | null;
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

type WorkGroup = {
  id: string;
  name: string;
  color: string;
  department_id: string;
};

type WorkGroupTeam = {
  work_group_id: string;
  worker_team_id: string;
};

interface GroupJoinRequestsPanelProps {
  onUpdate?: () => void;
}

export const GroupJoinRequestsPanel = ({ onUpdate }: GroupJoinRequestsPanelProps) => {
  const [requests, setRequests] = useState<GroupJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pending");
  
  // For complete dialog
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<GroupJoinRequest | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<WorkerTeam[]>([]);
  const [workGroups, setWorkGroups] = useState<WorkGroup[]>([]);
  const [workGroupTeams, setWorkGroupTeams] = useState<WorkGroupTeam[]>([]);
  
  const [formWorkerNumber, setFormWorkerNumber] = useState("");
  const [formWorkerName, setFormWorkerName] = useState("");
  const [formDepartmentId, setFormDepartmentId] = useState("");
  const [formTeamId, setFormTeamId] = useState("");
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
          action: "getGroupJoinRequests",
          sessionToken
        }
      });

      if (data?.success) {
        setRequests(data.requests || []);
      }
    } catch (err) {
      console.error("Error fetching group join requests:", err);
      toast.error("Error al cargar solicitudes");
    }
    setLoading(false);
  };

  const fetchDepartmentsAndTeams = async () => {
    const sessionToken = localStorage.getItem("manager_session_token");
    
    try {
      // Fetch departments
      const { data: deptData } = await supabase.functions.invoke("admin-operations", {
        body: { action: "getDepartments", sessionToken }
      });
      if (deptData?.success) {
        setDepartments(deptData.departments || []);
      }
      
      // Fetch all teams and work groups
      const [teamsRes, workGroupsRes, workGroupTeamsRes] = await Promise.all([
        supabase.from("worker_teams").select("id, name, department_id"),
        supabase.from("work_groups").select("id, name, color, department_id"),
        supabase.from("work_group_teams").select("work_group_id, worker_team_id")
      ]);
      
      setTeams(teamsRes.data || []);
      setWorkGroups(workGroupsRes.data || []);
      setWorkGroupTeams(workGroupTeamsRes.data || []);
    } catch (err) {
      console.error("Error fetching departments and teams:", err);
    }
  };

  const handleOpenComplete = (request: GroupJoinRequest) => {
    setSelectedRequest(request);
    setFormWorkerNumber(request.worker_number);
    setFormWorkerName(request.worker_name);
    setFormDepartmentId(request.department_id);
    setFormTeamId("");
    setCompleteDialogOpen(true);
  };

  const getWorkGroupForTeam = (teamId: string): WorkGroup | null => {
    const assignment = workGroupTeams.find(wgt => wgt.worker_team_id === teamId);
    if (!assignment) return null;
    return workGroups.find(wg => wg.id === assignment.work_group_id) || null;
  };

  const handleCompleteRequest = async () => {
    if (!selectedRequest || !formWorkerName.trim() || !formWorkerNumber.trim() || !formDepartmentId) {
      toast.error("Completa todos los campos obligatorios");
      return;
    }
    
    setProcessing(true);
    const sessionToken = localStorage.getItem("manager_session_token");
    
    try {
      // Get work group for the selected team
      const workGroup = formTeamId ? getWorkGroupForTeam(formTeamId) : null;
      const department = departments.find(d => d.id === formDepartmentId);
      const team = teams.find(t => t.id === formTeamId);
      
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "completeGroupJoinRequest",
          sessionToken,
          data: {
            requestId: selectedRequest.id,
            workerNumber: formWorkerNumber.trim(),
            workerName: formWorkerName.trim(),
            departmentId: formDepartmentId,
            teamId: formTeamId || null,
            workGroupId: workGroup?.id || null,
            // For email notification
            departmentName: department?.name || "",
            teamName: team?.name || "",
            workGroupName: workGroup?.name || "",
            workGroupColor: workGroup?.color || ""
          }
        }
      });

      if (data?.success) {
        toast.success("Trabajador añadido correctamente");
        setCompleteDialogOpen(false);
        fetchRequests();
        onUpdate?.();
      } else {
        toast.error(data?.error || "Error al procesar solicitud");
      }
    } catch (err) {
      console.error("Error completing request:", err);
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
          action: "deleteGroupJoinRequest",
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
  
  // Filter teams by selected department
  const filteredTeams = teams.filter(t => t.department_id === formDepartmentId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const renderRequestCard = (request: GroupJoinRequest, showActions: boolean) => (
    <Card key={request.id} className={request.status === "PENDING" ? "border-yellow-500/30" : ""}>
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
                <Badge variant="secondary" className="gap-1">
                  <Clock className="h-3 w-3" /> Pendiente
                </Badge>
              ) : (
                <Badge variant="default" className="gap-1">
                  <CheckCircle className="h-3 w-3" /> Revisado
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Departamento solicitado: <span className="text-foreground">{request.department_name}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Solicitado: {format(new Date(request.created_at), "d MMM yyyy HH:mm", { locale: es })}
            </p>
            {request.processed_at && (
              <p className="text-xs text-muted-foreground">
                Procesado: {format(new Date(request.processed_at), "d MMM yyyy HH:mm", { locale: es })}
                {request.processed_by && ` por ${request.processed_by}`}
              </p>
            )}
            {request.team_name && (
              <p className="text-xs text-muted-foreground">
                Equipo asignado: <span className="text-foreground font-medium">{request.team_name}</span>
              </p>
            )}
            {request.work_group && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Grupo vacacional:</span>
                <div 
                  className="h-3 w-3 rounded-full border border-border/50"
                  style={{ backgroundColor: request.work_group.color }}
                />
                <span className="text-foreground font-medium">{request.work_group.name}</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {showActions && (
              <Button 
                size="sm" 
                onClick={() => handleOpenComplete(request)}
                className="gap-1"
              >
                <UserCheck className="h-4 w-4" />
                Completar
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
      {/* Stats - Only Pending and Processed */}
      <div className="grid grid-cols-2 gap-3">
        <Card 
          className={`cursor-pointer transition-all ${activeTab === "pending" ? "ring-2 ring-primary" : ""} ${pendingRequests.length > 0 ? "bg-yellow-500/10 border-yellow-500/30" : "bg-secondary/30"}`}
          onClick={() => setActiveTab("pending")}
        >
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-yellow-600">{pendingRequests.length}</p>
            <p className="text-xs text-muted-foreground">Pendientes</p>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer transition-all ${activeTab === "processed" ? "ring-2 ring-primary" : ""} bg-secondary/30`}
          onClick={() => setActiveTab("processed")}
        >
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{processedRequests.length}</p>
            <p className="text-xs text-muted-foreground">Revisadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            Pendientes ({pendingRequests.length})
          </TabsTrigger>
          <TabsTrigger value="processed" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            Revisadas ({processedRequests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {pendingRequests.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <UserPlus className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin solicitudes pendientes</h3>
                <p className="text-muted-foreground text-sm">
                  No hay solicitudes de incorporación a grupos de trabajo
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
                <h3 className="text-lg font-semibold mb-2">Sin solicitudes revisadas</h3>
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

      {/* Complete Request Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Completar solicitud</DialogTitle>
            <DialogDescription>
              Añade los datos del trabajador y asígnalo a un departamento y equipo
            </DialogDescription>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="space-y-4">
              {/* Link to Salix */}
              {formWorkerNumber && (
                <a
                  href={`https://salix.verdnatura.es/#/worker/${formWorkerNumber}/calendar`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  Ver ficha en Salix
                </a>
              )}
              
              <div className="space-y-2">
                <Label>Número de fichar</Label>
                <Input
                  value={formWorkerNumber}
                  onChange={(e) => setFormWorkerNumber(e.target.value)}
                  placeholder="Número de fichar"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Nombre completo</Label>
                <Input
                  value={formWorkerName}
                  onChange={(e) => setFormWorkerName(e.target.value)}
                  placeholder="Nombre del trabajador"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Departamento *</Label>
                <Select value={formDepartmentId} onValueChange={(val) => {
                  setFormDepartmentId(val);
                  setFormTeamId(""); // Reset team when department changes
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
                <Label>Equipo de trabajo</Label>
                <Select 
                  value={formTeamId || "none"} 
                  onValueChange={(val) => setFormTeamId(val === "none" ? "" : val)}
                  disabled={!formDepartmentId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar equipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin asignar</SelectItem>
                    {filteredTeams.map(team => {
                      const workGroup = getWorkGroupForTeam(team.id);
                      return (
                        <SelectItem key={team.id} value={team.id}>
                          <div className="flex items-center gap-2">
                            {workGroup && (
                              <div 
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: workGroup.color }}
                              />
                            )}
                            {team.name}
                            {workGroup && <span className="text-muted-foreground text-xs">({workGroup.name})</span>}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {formTeamId && (
                  <p className="text-xs text-muted-foreground">
                    {getWorkGroupForTeam(formTeamId) 
                      ? `Grupo vacacional: ${getWorkGroupForTeam(formTeamId)?.name}` 
                      : "Este equipo no tiene grupo vacacional asignado"}
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)} disabled={processing}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCompleteRequest} 
              disabled={processing || !formWorkerName.trim() || !formWorkerNumber.trim() || !formDepartmentId}
            >
              {processing ? "Procesando..." : "Añadir trabajador"}
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