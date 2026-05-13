import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Users, Search, Edit, AlertTriangle, X, Filter, ExternalLink, AlertCircle, Umbrella, Timer, UserX, Building, Clock, TrendingUp } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, subDays } from "date-fns";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { calculateTrialPeriod, formatTrialPeriodDisplay, TrialPeriodInfo } from "@/lib/trialPeriod";

type Worker = {
  id: string;
  worker_number: string;
  name: string;
  email: string | null;
  role: string | null;
  typology: string | null;
  department_id: string;
  worker_team_id: string | null;
  work_group_id: string | null;
  is_on_leave: boolean;
  is_on_vacation: boolean;
  is_altillo: boolean;
  deleted_at: string | null;
  start_contract_date: string | null;
  lines_hour: number | null;
  department?: { id: string; name: string };
  worker_team?: { id: string; name: string } | null;
  work_group?: { id: string; name: string; color: string } | null;
  recentAnomalies?: {
    delays: number;
    absences: number;
    lastDelayDate?: string;
    lastAbsenceDate?: string;
  };
  trialPeriod?: TrialPeriodInfo | null;
};

type Department = { id: string; name: string };
type Team = { id: string; name: string; department_id: string };
type WorkGroup = { id: string; name: string; color: string; department_id: string };
type TeamGroupAssignment = { worker_team_id: string; work_group_id: string };
type PerformanceThreshold = { department_id: string; green_min: number; yellow_min: number };

const normalizeForSearch = (text: string): string => {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
};

export const LaborWorkersTab = () => {
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [workGroups, setWorkGroups] = useState<WorkGroup[]>([]);
  const [teamGroupAssignments, setTeamGroupAssignments] = useState<TeamGroupAssignment[]>([]);
  const [performanceThresholds, setPerformanceThresholds] = useState<PerformanceThreshold[]>([]);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "leave" | "vacation" | "no_team" | "trial" | "trial_critical">("all");
  
  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [editWorkerNumber, setEditWorkerNumber] = useState<string>("");
  const [editEmail, setEditEmail] = useState<string>("");
  const [editTeamId, setEditTeamId] = useState<string>("");
  const [editGroupId, setEditGroupId] = useState<string>("");
  const [editIsOnLeave, setEditIsOnLeave] = useState<boolean>(false);
  const [editIsOnVacation, setEditIsOnVacation] = useState<boolean>(false);
  const [editIsAltillo, setEditIsAltillo] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);

  // Settings for anomaly detection
  const [laborSettings, setLaborSettings] = useState({ delay_threshold_minutes: 5 });

  useEffect(() => {
    fetchData();
    fetchLaborSettings();
    fetchPerformanceThresholds();
  }, []);

  const fetchPerformanceThresholds = async () => {
    const sessionToken = localStorage.getItem("manager_session_token");
    if (!sessionToken) return;
    const { data } = await supabase.functions.invoke("admin-operations", {
      body: { action: "getPerformanceThresholds", sessionToken }
    });
    if (data?.success) {
      setPerformanceThresholds(data.thresholds || []);
    }
  };


  const fetchLaborSettings = async () => {
    const { data } = await supabase
      .from("labor_module_settings")
      .select("delay_threshold_minutes")
      .limit(1)
      .maybeSingle();
    if (data) {
      setLaborSettings({ delay_threshold_minutes: data.delay_threshold_minutes || 5 });
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch departments
      const { data: deptData } = await supabase.rpc("get_public_departments");
      const depts = (deptData || []).map((d: any) => ({ id: d.id, name: d.name }));
      depts.sort((a: Department, b: Department) => a.name.localeCompare(b.name));
      setDepartments(depts);

      // Fetch teams via edge function (security: RLS is now admin-only)
      const sessionToken = localStorage.getItem("manager_session_token");
      let teamsData: Team[] = [];
      let groupsData: WorkGroup[] = [];
      let assignmentsData: TeamGroupAssignment[] = [];
      
      if (sessionToken) {
        const { data: teamsResp } = await supabase.functions.invoke("admin-operations", {
          body: { action: "getAllWorkerTeams", sessionToken }
        });
        if (teamsResp?.success) {
          teamsData = teamsResp.teams || [];
        }
        
        // Fetch work groups via edge function
        const { data: groupsResp } = await supabase.functions.invoke("admin-operations", {
          body: { action: "getManagerWorkerGroups", sessionToken }
        });
        if (groupsResp?.success) {
          groupsData = (groupsResp.workGroups || []).map((g: any) => ({
            id: g.id,
            name: g.name,
            color: g.color,
            department_id: g.department_id
          }));
          assignmentsData = (groupsResp.workerTeams || [])
            .filter((t: any) => t.work_group_id)
            .map((t: any) => ({
              worker_team_id: t.id,
              work_group_id: t.work_group_id
            }));
        }
      }
      
      setTeams(teamsData);
      setWorkGroups(groupsData);
      setTeamGroupAssignments(assignmentsData);

      // Fetch recent time entries for anomaly detection (last 7 days)
      const sevenDaysAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");
      const { data: recentEntries } = await supabase
        .from("time_entries")
        .select("worker_id, entry_date, delay_minutes, is_absence")
        .gte("entry_date", sevenDaysAgo);

      // Build anomaly map
      const anomalyMap = new Map<string, { delays: number; absences: number; lastDelayDate?: string; lastAbsenceDate?: string }>();
      (recentEntries || []).forEach((entry: any) => {
        const existing = anomalyMap.get(entry.worker_id) || { delays: 0, absences: 0 };
        if (entry.is_absence) {
          existing.absences++;
          existing.lastAbsenceDate = entry.entry_date;
        }
        if (entry.delay_minutes && entry.delay_minutes >= laborSettings.delay_threshold_minutes) {
          existing.delays++;
          existing.lastDelayDate = entry.entry_date;
        }
        anomalyMap.set(entry.worker_id, existing);
      });

      // Fetch workers with relations (reuse sessionToken from above)
      const { data: response } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "getWorkers",
          sessionToken,
          data: {}
        }
      });

      if (response?.success && response?.workers) {
        // Enrich workers with department/team/group names and trial period
        // Check direct work_group_id first, then fallback to inherited from team
        const enrichedWorkers = response.workers.map((w: any) => {
          let workGroup = (groupsData || []).find((g: WorkGroup) => g.id === w.work_group_id);
          
          // If no direct group, check inherited from team
          if (!workGroup && w.worker_team_id) {
            const teamAssignment = (assignmentsData || []).find(
              (a: TeamGroupAssignment) => a.worker_team_id === w.worker_team_id
            );
            if (teamAssignment) {
              workGroup = (groupsData || []).find((g: WorkGroup) => g.id === teamAssignment.work_group_id);
            }
          }

          // Get anomaly data for this worker
          const anomalyData = anomalyMap.get(w.id);
          
          // Calculate trial period
          const trialPeriod = calculateTrialPeriod(w.start_contract_date);

          return {
            ...w,
            department: depts.find((d: Department) => d.id === w.department_id),
            worker_team: (teamsData || []).find((t: Team) => t.id === w.worker_team_id),
            work_group: workGroup || null,
            recentAnomalies: anomalyData || undefined,
            trialPeriod,
          };
        });
        setWorkers(enrichedWorkers);
      }
    } catch (err) {
      console.error("Error fetching data:", err);
      toast.error("Error al cargar datos");
    }
    setLoading(false);
  };

  const filteredWorkers = useMemo(() => {
    return workers.filter(worker => {
      // Exclude deleted workers
      if (worker.deleted_at) return false;
      
      // Status filter
      if (statusFilter === "leave" && !worker.is_on_leave) return false;
      if (statusFilter === "vacation" && !worker.is_on_vacation) return false;
      if (statusFilter === "no_team" && worker.worker_team_id) return false;
      if (statusFilter === "trial" && !worker.trialPeriod?.isInTrialPeriod) return false;
      if (statusFilter === "trial_critical" && !worker.trialPeriod?.isCritical) return false;
      
      // Search filter
      if (searchQuery) {
        const query = normalizeForSearch(searchQuery);
        const matchesName = normalizeForSearch(worker.name).includes(query);
        const matchesNumber = worker.worker_number.toLowerCase().includes(query);
        if (!matchesName && !matchesNumber) return false;
      }
      
      // Department filter
      if (selectedDepartment !== "all" && worker.department_id !== selectedDepartment) return false;
      
      // Team filter
      if (selectedTeam !== "all" && worker.worker_team_id !== selectedTeam) return false;
      
      // Group filter - check direct assignment and inherited from team
      if (selectedGroup !== "all") {
        if (worker.work_group_id === selectedGroup) {
          // Direct assignment matches
        } else if (worker.worker_team_id) {
          // Check inherited assignment
          const teamAssignment = teamGroupAssignments.find(
            a => a.worker_team_id === worker.worker_team_id
          );
          if (!teamAssignment || teamAssignment.work_group_id !== selectedGroup) {
            return false;
          }
        } else {
          return false;
        }
      }
      
      return true;
    });
  }, [workers, searchQuery, selectedDepartment, selectedTeam, selectedGroup, statusFilter, teamGroupAssignments]);

  // Filter teams and groups based on selected department
  const filteredTeams = useMemo(() => {
    if (selectedDepartment === "all") return teams;
    return teams.filter(t => t.department_id === selectedDepartment);
  }, [teams, selectedDepartment]);

  const filteredGroups = useMemo(() => {
    if (selectedDepartment === "all") return workGroups;
    return workGroups.filter(g => g.department_id === selectedDepartment);
  }, [workGroups, selectedDepartment]);

  const getPerformanceColor = (value: number | null, departmentId: string): string => {
    if (value === null || value === undefined) return "";
    const threshold = performanceThresholds.find(t => t.department_id === departmentId);
    const greenMin = threshold?.green_min ?? 80;
    const yellowMin = threshold?.yellow_min ?? 60;
    if (value >= greenMin) return "text-green-600 dark:text-green-400 font-semibold";
    if (value >= yellowMin) return "text-yellow-600 dark:text-yellow-400 font-medium";
    return "text-red-600 dark:text-red-400 font-semibold";
  };

  const handleEditWorker = (worker: Worker) => {
    setEditingWorker(worker);
    setEditName(worker.name);
    setEditWorkerNumber(worker.worker_number);
    setEditEmail(worker.email || "");
    setEditTeamId(worker.worker_team_id || "none");
    setEditGroupId(worker.work_group_id || "none");
    setEditIsOnLeave(worker.is_on_leave);
    setEditIsOnVacation(worker.is_on_vacation);
    setEditIsAltillo(worker.is_altillo || false);
    setEditDialogOpen(true);
  };

  const handleSaveWorker = async () => {
    if (!editingWorker || !editName.trim() || !editWorkerNumber.trim()) return;
    
    setSaving(true);
    try {
      const sessionToken = localStorage.getItem("manager_session_token");
      const { data: response, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "updateWorker",
          sessionToken,
          data: {
            workerId: editingWorker.id,
            name: editName.trim(),
            workerNumber: editWorkerNumber.trim(),
            email: editEmail.trim() || null,
            workerTeamId: editTeamId === "none" ? null : editTeamId,
            workGroupId: editGroupId === "none" ? null : editGroupId,
            isOnLeave: editIsOnLeave,
            isOnVacation: editIsOnVacation,
            isAltillo: editIsAltillo,
          }
        }
      });

      if (error || !response?.success) {
        throw new Error(response?.error || "Error al guardar");
      }

      toast.success("Trabajador actualizado");
      setEditDialogOpen(false);
      fetchData();
    } catch (err) {
      console.error("Error saving worker:", err);
      toast.error("Error al guardar cambios");
    }
    setSaving(false);
  };

  // Get row class based on worker status
  const getRowClass = (worker: Worker) => {
    if (worker.is_on_leave) {
      return 'bg-destructive/10 hover:bg-destructive/15';
    }
    if (worker.is_on_vacation) {
      return 'bg-cyan-500/10 hover:bg-cyan-500/15';
    }
    if (!worker.worker_team_id) {
      return 'bg-orange-500/10 hover:bg-orange-500/15';
    }
    return '';
  };

  const getStatusBadge = (worker: Worker) => {
    if (worker.is_on_leave) {
      return (
        <Badge variant="destructive" className="gap-1 text-xs">
          <AlertCircle className="h-3 w-3" />
          Baja
        </Badge>
      );
    }
    if (worker.is_on_vacation) {
      return (
        <Badge className="gap-1 text-xs bg-cyan-500/20 text-cyan-400 border-0">
          <Umbrella className="h-3 w-3" />
          Vacaciones
        </Badge>
      );
    }
    if (!worker.worker_team_id) {
      return (
        <Badge className="gap-1 text-xs bg-orange-500/20 text-orange-400 border-0">
          <AlertCircle className="h-3 w-3" />
          Sin equipo
        </Badge>
      );
    }
    return <Badge variant="outline" className="text-xs">Activo</Badge>;
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedDepartment("all");
    setSelectedTeam("all");
    setSelectedGroup("all");
    setStatusFilter("all");
  };

  const hasActiveFilters = searchQuery || selectedDepartment !== "all" || selectedTeam !== "all" || selectedGroup !== "all" || statusFilter !== "all";

  // Count workers by status for badges
  const statusCounts = useMemo(() => {
    const activeWorkers = workers.filter(w => !w.deleted_at);
    return {
      leave: activeWorkers.filter(w => w.is_on_leave).length,
      vacation: activeWorkers.filter(w => w.is_on_vacation).length,
      no_team: activeWorkers.filter(w => !w.worker_team_id).length,
      trial: activeWorkers.filter(w => w.trialPeriod?.isInTrialPeriod).length,
      trial_critical: activeWorkers.filter(w => w.trialPeriod?.isCritical).length,
    };
  }, [workers]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Trabajadores
              <Badge variant="secondary" className="ml-2">
                {filteredWorkers.length}
              </Badge>
            </CardTitle>
            
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre o número..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button
                variant={showFilters ? "secondary" : "outline"}
                size="icon"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4" />
              </Button>
              {hasActiveFilters && (
                <Button variant="ghost" size="icon" onClick={clearFilters}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Filters row */}
          {showFilters && (
            <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-border">
              <Select value={selectedDepartment} onValueChange={(v) => { setSelectedDepartment(v); setSelectedTeam("all"); setSelectedGroup("all"); }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Departamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los departamentos</SelectItem>
                  {departments.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Equipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los equipos</SelectItem>
                  {filteredTeams.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Grupo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los grupos</SelectItem>
                  {filteredGroups.map(g => (
                    <SelectItem key={g.id} value={g.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: g.color }} />
                        {g.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {/* Status filter badges */}
          <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-border">
            <Badge 
              variant={statusFilter === "all" ? "default" : "outline"} 
              className="cursor-pointer"
              onClick={() => setStatusFilter("all")}
            >
              Todos
            </Badge>
            <Badge 
              variant={statusFilter === "leave" ? "default" : "outline"} 
              className={cn(
                "cursor-pointer gap-1",
                statusFilter === "leave" ? "bg-destructive hover:bg-destructive/90" : "hover:bg-destructive/20"
              )}
              onClick={() => setStatusFilter(statusFilter === "leave" ? "all" : "leave")}
            >
              <AlertCircle className="h-3 w-3" />
              Baja ({statusCounts.leave})
            </Badge>
            <Badge 
              variant={statusFilter === "vacation" ? "default" : "outline"} 
              className={cn(
                "cursor-pointer gap-1",
                statusFilter === "vacation" ? "bg-cyan-500 hover:bg-cyan-500/90" : "hover:bg-cyan-500/20"
              )}
              onClick={() => setStatusFilter(statusFilter === "vacation" ? "all" : "vacation")}
            >
              <Umbrella className="h-3 w-3" />
              Vacaciones ({statusCounts.vacation})
            </Badge>
            <Badge 
              variant={statusFilter === "no_team" ? "default" : "outline"} 
              className={cn(
                "cursor-pointer gap-1",
                statusFilter === "no_team" ? "bg-orange-500 hover:bg-orange-500/90" : "hover:bg-orange-500/20"
              )}
              onClick={() => setStatusFilter(statusFilter === "no_team" ? "all" : "no_team")}
            >
              <AlertCircle className="h-3 w-3" />
              Sin equipo ({statusCounts.no_team})
            </Badge>
            <Badge 
              variant={statusFilter === "trial" ? "default" : "outline"} 
              className={cn(
                "cursor-pointer gap-1",
                statusFilter === "trial" ? "bg-amber-500 hover:bg-amber-500/90" : "hover:bg-amber-500/20"
              )}
              onClick={() => setStatusFilter(statusFilter === "trial" ? "all" : "trial")}
            >
              <Clock className="h-3 w-3" />
              Periodo prueba ({statusCounts.trial})
            </Badge>
            {statusCounts.trial_critical > 0 && (
              <Badge 
                variant={statusFilter === "trial_critical" ? "default" : "outline"} 
                className={cn(
                  "cursor-pointer gap-1",
                  statusFilter === "trial_critical" ? "bg-destructive hover:bg-destructive/90" : "hover:bg-destructive/20 text-destructive"
                )}
                onClick={() => setStatusFilter(statusFilter === "trial_critical" ? "all" : "trial_critical")}
              >
                <AlertTriangle className="h-3 w-3" />
                &lt;5 días ({statusCounts.trial_critical})
              </Badge>
            )}
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
              <TableRow>
                  <TableHead className="w-[100px]">ID</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Departamento</TableHead>
                  <TableHead>Equipo</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Rendimiento</TableHead>
                  <TableHead>Periodo Prueba</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-[80px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWorkers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No se encontraron trabajadores
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredWorkers.map(worker => (
                    <TableRow key={worker.id} className={cn("group", getRowClass(worker))}>
                      <TableCell className="font-mono text-sm">
                        <a
                          href={`https://salix.verdnatura.es/#/worker/${worker.worker_number}/summary`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            "font-medium hover:underline flex items-center gap-1",
                            worker.is_on_leave ? "text-destructive" : 
                            worker.is_on_vacation ? "text-cyan-400" : 
                            worker.trialPeriod?.isCritical ? "text-destructive" :
                            !worker.worker_team_id ? "text-orange-400" : "text-primary"
                          )}
                        >
                          {worker.worker_number}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <a
                            href={`https://salix.verdnatura.es/#/worker/${worker.worker_number}/summary`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              "font-medium hover:underline",
                              worker.is_on_leave ? "text-destructive" : 
                              worker.is_on_vacation ? "text-cyan-400" : 
                              worker.trialPeriod?.isCritical ? "text-destructive" :
                              !worker.worker_team_id ? "text-orange-400" : ""
                            )}
                          >
                            {worker.name}
                          </a>
                          {worker.recentAnomalies && (worker.recentAnomalies.delays > 0 || worker.recentAnomalies.absences > 0) && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1">
                                    {worker.recentAnomalies.delays > 0 && (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-amber-500/10 text-amber-500 border-amber-500/30 gap-0.5">
                                        <Timer className="h-3 w-3" />
                                        {worker.recentAnomalies.delays}
                                      </Badge>
                                    )}
                                    {worker.recentAnomalies.absences > 0 && (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-destructive/10 text-destructive border-destructive/30 gap-0.5">
                                        <UserX className="h-3 w-3" />
                                        {worker.recentAnomalies.absences}
                                      </Badge>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="text-xs space-y-1">
                                    <p className="font-medium">Últimos 7 días:</p>
                                    {worker.recentAnomalies.delays > 0 && (
                                      <p className="text-amber-400">{worker.recentAnomalies.delays} retraso(s)</p>
                                    )}
                                    {worker.recentAnomalies.absences > 0 && (
                                      <p className="text-destructive">{worker.recentAnomalies.absences} ausencia(s)</p>
                                    )}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {worker.department?.name || "-"}
                      </TableCell>
                      <TableCell>
                        {worker.worker_team?.name || "-"}
                      </TableCell>
                      <TableCell>
                        {worker.work_group ? (
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full flex-shrink-0" 
                              style={{ backgroundColor: worker.work_group.color }}
                            />
                            <span>{worker.work_group.name}</span>
                          </div>
                        ) : "-"}
                      </TableCell>
                      <TableCell>
                        {worker.lines_hour != null ? (
                          <span className={cn("tabular-nums", getPerformanceColor(worker.lines_hour, worker.department_id))}>
                            {worker.lines_hour.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {worker.trialPeriod?.isInTrialPeriod ? (
                          <Badge 
                            variant={worker.trialPeriod.isCritical ? "destructive" : "secondary"}
                            className="gap-1 text-xs"
                          >
                            {worker.trialPeriod.isCritical && <AlertTriangle className="h-3 w-3" />}
                            {formatTrialPeriodDisplay(worker.trialPeriod)}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(worker)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleEditWorker(worker)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Worker Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Trabajador</DialogTitle>
            <DialogDescription>
              Modificar los datos del trabajador
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Worker number with Salix link */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <Label className="text-muted-foreground text-xs">Número de fichar</Label>
                <div className="font-mono font-medium">{editingWorker?.worker_number}</div>
              </div>
              <a
                href={`https://salix.verdnatura.es/#/worker/${editingWorker?.worker_number}/calendar`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center gap-1 text-sm"
              >
                Ver en Salix
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="trabajador@email.com"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Equipo</Label>
                <Select value={editTeamId} onValueChange={setEditTeamId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar equipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin equipo</SelectItem>
                    {teams
                      .filter(t => t.department_id === editingWorker?.department_id)
                      .map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Grupo vacacional</Label>
                <Select value={editGroupId} onValueChange={setEditGroupId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar grupo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin grupo</SelectItem>
                    {workGroups
                      .filter(g => g.department_id === editingWorker?.department_id)
                      .map(g => (
                        <SelectItem key={g.id} value={g.id}>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: g.color }} />
                            {g.name}
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Status switches */}
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <Label htmlFor="is_on_leave" className="text-sm cursor-pointer">De baja</Label>
                </div>
                <Switch
                  id="is_on_leave"
                  checked={editIsOnLeave}
                  onCheckedChange={setEditIsOnLeave}
                />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Umbrella className="h-4 w-4 text-cyan-400" />
                  <Label htmlFor="is_on_vacation" className="text-sm cursor-pointer">Vacaciones</Label>
                </div>
                <Switch
                  id="is_on_vacation"
                  checked={editIsOnVacation}
                  onCheckedChange={setEditIsOnVacation}
                />
              </div>
            </div>

            {/* Altillo checkbox */}
            <div className="flex items-center justify-between p-3 border rounded-lg bg-amber-500/10 border-amber-500/30">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-amber-500" />
                <Label htmlFor="is_altillo" className="text-sm cursor-pointer">Altillo</Label>
                <span className="text-xs text-muted-foreground">(Lugar de trabajo: Altillo)</span>
              </div>
              <Switch
                id="is_altillo"
                checked={editIsAltillo}
                onCheckedChange={setEditIsAltillo}
              />
            </div>

            {/* Performance section */}
            {editingWorker?.lines_hour != null && (
              <div className="p-3 border rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <Label className="text-sm font-medium">Rendimiento</Label>
                  </div>
                  <span className={cn("font-mono font-bold tabular-nums text-lg", getPerformanceColor(editingWorker.lines_hour, editingWorker.department_id))}>
                    {editingWorker.lines_hour.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">líneas/h</span>
                  </span>
                </div>
                <a
                  href={`/admin/worker/${editingWorker.id}?tab=rendimiento`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  Ver histórico completo
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveWorker} disabled={saving || !editName.trim()}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
