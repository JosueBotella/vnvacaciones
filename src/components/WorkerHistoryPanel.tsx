import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, User, Calendar, ChevronDown, ChevronUp, Search } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type WorkerSummary = {
  worker_number: string;
  employee_name: string;
  department_id: string;
  department_name: string;
  max_days: number;
  require_all_days: boolean;
  used_days: number;
  requests: Array<{
    id: string;
    status: string;
    dates: string[];
    created_at: string;
    manager_action_by: string | null;
  }>;
};

type Department = {
  id: string;
  name: string;
  max_days_per_employee: number;
  require_all_days: boolean;
};

export const WorkerHistoryPanel = () => {
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [workerNumberFilter, setWorkerNumberFilter] = useState<string>("");
  const [workerSummaries, setWorkerSummaries] = useState<WorkerSummary[]>([]);
  const [expandedWorkers, setExpandedWorkers] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<{ id: string; workerNumber: string } | null>(null);

  // Filter summaries by worker number
  const filteredSummaries = useMemo(() => {
    if (!workerNumberFilter.trim()) return workerSummaries;
    const filter = workerNumberFilter.trim().toLowerCase();
    return workerSummaries.filter(s => 
      s.worker_number.toLowerCase().includes(filter) || 
      s.employee_name.toLowerCase().includes(filter)
    );
  }, [workerSummaries, workerNumberFilter]);

  useEffect(() => {
    fetchDepartments();
  }, []);

  useEffect(() => {
    if (departments.length > 0) {
      fetchWorkerHistory();
    }
  }, [selectedDepartment, departments]);

  const fetchDepartments = async () => {
    const { data, error } = await supabase.rpc('get_public_departments');
    if (error) {
      console.error("Error fetching departments:", error);
      return;
    }
    const depts = (data || []).map((d: any) => ({
      id: d.id,
      name: d.name,
      max_days_per_employee: d.max_days_per_employee,
      require_all_days: d.require_all_days
    }));
    depts.sort((a: any, b: any) => a.name.localeCompare(b.name));
    setDepartments(depts);
  };

  const fetchWorkerHistory = async () => {
    setLoading(true);
    const sessionToken = localStorage.getItem("manager_session_token");
    
    try {
      const { data: response, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "getWorkerHistory",
          sessionToken,
          data: {
            departmentId: selectedDepartment
          }
        }
      });

      if (error || !response?.success) {
        console.error("Error fetching worker history:", error || response?.error);
        toast.error("Error al cargar histórico");
        setLoading(false);
        return;
      }

      // Process data to group by worker and department
      const requestsData = response.requests || [];
      const summaryMap = new Map<string, WorkerSummary>();

      for (const req of requestsData) {
        const key = `${req.worker_number}-${req.department_id}`;
        const dept = departments.find(d => d.id === req.department_id);
        
        if (!summaryMap.has(key)) {
          summaryMap.set(key, {
            worker_number: req.worker_number,
            employee_name: req.employee_name,
            department_id: req.department_id,
            department_name: dept?.name || "Desconocido",
            max_days: dept?.max_days_per_employee || 0,
            require_all_days: dept?.require_all_days ?? true,
            used_days: 0,
            requests: []
          });
        }

        const summary = summaryMap.get(key)!;
        const dates = req.vacation_request_dates?.map((d: any) => d.date) || [];
        
        summary.requests.push({
          id: req.id,
          status: req.status,
          dates,
          created_at: req.created_at,
          manager_action_by: req.manager_action_by || null
        });

        // Only count approved requests
        if (req.status === "APPROVED") {
          summary.used_days += dates.length;
        }
      }

      setWorkerSummaries(Array.from(summaryMap.values()));
    } catch (err) {
      console.error("Error fetching worker history:", err);
      toast.error("Error al cargar histórico");
    }
    
    setLoading(false);
  };

  const toggleWorkerExpanded = (key: string) => {
    const newExpanded = new Set(expandedWorkers);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedWorkers(newExpanded);
  };

  const handleDeleteRequest = (requestId: string, workerNumber: string) => {
    setRequestToDelete({ id: requestId, workerNumber });
    setDeleteDialogOpen(true);
  };

  const confirmDeleteRequest = async () => {
    if (!requestToDelete) return;

    try {
      const sessionToken = localStorage.getItem("manager_session_token");
      const { data: response, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "deleteVacationRequest",
          sessionToken,
          data: { requestId: requestToDelete.id }
        }
      });

      if (error || !response?.success) {
        toast.error("Error al eliminar solicitud");
        return;
      }

      toast.success("Solicitud eliminada");
      fetchWorkerHistory();
    } catch (err) {
      console.error("Error deleting request:", err);
      toast.error("Error al eliminar solicitud");
    }
    
    setDeleteDialogOpen(false);
    setRequestToDelete(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "APPROVED":
        return <Badge variant="default" className="text-[10px]">Aprobada</Badge>;
      case "REJECTED":
        return <Badge variant="destructive" className="text-[10px]">Rechazada</Badge>;
      default:
        return <Badge variant="secondary" className="text-[10px]">Pendiente</Badge>;
    }
  };

  const getDaysProgressColor = (used: number, max: number, requireAll: boolean) => {
    if (requireAll && used >= max) return "text-primary";
    if (used === 0) return "text-muted-foreground";
    if (used >= max) return "text-primary";
    return "text-yellow-600";
  };

  return (
    <Card className="shadow-md opacity-0 animate-fade-in-up animation-delay-600">
      <CardHeader>
        <div className="flex flex-col gap-3 md:gap-4">
          <div className="flex flex-col sm:flex-row gap-3 md:gap-4 items-start sm:items-center justify-between">
            <CardTitle className="text-lg md:text-xl font-semibold tracking-tight flex items-center gap-2">
              <User className="h-5 w-5" />
              Histórico por Trabajador
            </CardTitle>
            <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
              <SelectTrigger className="w-full sm:w-[200px] rounded-xl">
                <SelectValue placeholder="Departamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los departamentos</SelectItem>
                {departments.map(dept => (
                  <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative w-full sm:w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nº trabajador o nombre..."
              value={workerNumberFilter}
              onChange={(e) => setWorkerNumberFilter(e.target.value)}
              className="pl-9 rounded-xl"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-6 sm:py-8 text-muted-foreground animate-pulse">Cargando...</div>
        ) : filteredSummaries.length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-muted-foreground opacity-0 animate-fade-in">
            {workerNumberFilter ? "No hay resultados para esa búsqueda" : "No hay solicitudes registradas"}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSummaries.map((summary, index) => {
              const key = `${summary.worker_number}-${summary.department_id}`;
              const isExpanded = expandedWorkers.has(key);
              const canSubmitMore = !summary.require_all_days || summary.used_days < summary.max_days;
              const remainingDays = summary.max_days - summary.used_days;

              return (
                <Card 
                  key={key}
                  className="border-border/50 opacity-0 animate-fade-in-up"
                  style={{ animationDelay: `${(index % 10) * 30}ms` }}
                >
                  <CardContent className="p-3 sm:p-4">
                    <div 
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => toggleWorkerExpanded(key)}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 text-primary flex-shrink-0">
                          <User className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-semibold text-sm sm:text-base truncate">{summary.employee_name}</h4>
                            <Badge variant="outline" className="text-[10px] sm:text-xs flex-shrink-0">
                              Nº {summary.worker_number}
                            </Badge>
                          </div>
                          <p className="text-xs sm:text-sm text-muted-foreground truncate">{summary.department_name}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                        <div className="text-right">
                          <p className={`text-lg sm:text-xl font-bold ${getDaysProgressColor(summary.used_days, summary.max_days, summary.require_all_days)}`}>
                            {summary.used_days}/{summary.max_days}
                          </p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground">días usados</p>
                        </div>
                        {!summary.require_all_days && remainingDays > 0 && (
                          <Badge variant="secondary" className="hidden sm:flex text-xs">
                            {remainingDays} restantes
                          </Badge>
                        )}
                        {summary.require_all_days && summary.used_days >= summary.max_days && (
                          <Badge variant="default" className="hidden sm:flex text-xs bg-primary/20 text-primary">
                            Completo
                          </Badge>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>{summary.requests.length} solicitud{summary.requests.length !== 1 ? 'es' : ''}</span>
                          {summary.require_all_days ? (
                            <Badge variant="outline" className="text-[10px]">Obligatorio todos los días</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">Días opcionales</Badge>
                          )}
                        </div>
                        
                        {summary.requests
                          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                          .map((req) => (
                          <div 
                            key={req.id} 
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-muted/30 rounded-lg"
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                {getStatusBadge(req.status)}
                                <span className="text-[10px] sm:text-xs text-muted-foreground">
                                  {format(new Date(req.created_at), "d MMM yyyy", { locale: es })}
                                </span>
                                {req.manager_action_by && req.status !== "PENDING" && (
                                  <span className="text-[10px] sm:text-xs text-muted-foreground italic">
                                    por {req.manager_action_by}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {req.dates
                                  .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
                                  .map((date, idx) => (
                                  <span 
                                    key={idx} 
                                    className={`inline-flex items-center justify-center h-6 min-w-[28px] px-2 rounded-md border text-[10px] font-medium ${
                                      req.status === "REJECTED" 
                                        ? "border-muted-foreground/30 text-muted-foreground/50 line-through bg-transparent" 
                                        : req.status === "APPROVED"
                                          ? "border-primary/50 text-primary bg-primary/5"
                                          : "border-muted-foreground/50 text-muted-foreground bg-transparent"
                                    }`}
                                  >
                                    {format(new Date(date), "d MMM", { locale: es })}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRequest(req.id, summary.worker_number);
                              }}
                              className="h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              <span className="text-xs">Eliminar</span>
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Solicitud</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar esta solicitud del trabajador {requestToDelete?.workerNumber}? Esta acción no se puede deshacer y los días serán liberados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDeleteRequest}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
