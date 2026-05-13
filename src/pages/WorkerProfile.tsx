import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ArrowLeft,
  User,
  Calendar,
  Clock,
  MessageSquare,
  Settings,
  Save,
  ExternalLink,
  Eye,
  Send,
  Trash2,
  KeyRound,
  Loader2,
  Search,
  ChevronDown,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { useManagerAuth } from "@/hooks/useManagerAuth";
import { ThemeToggle } from "@/components/ThemeToggle";
import LoadingScreen from "@/components/LoadingScreen";
import { LogoLink } from "@/components/LogoLink";
import { EmbeddedAnnualCalendar } from "@/components/EmbeddedAnnualCalendar";
import { WorkerCommentsTab } from "@/components/WorkerCommentsTab";
import { EmbeddedWorkerSchedule } from "@/components/EmbeddedWorkerSchedule";
import { WorkerPerformanceHistory } from "@/components/labor/WorkerPerformanceHistory";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Worker = {
  id: string;
  department_id: string;
  worker_team_id: string | null;
  work_group_id: string | null;
  worker_number: string;
  worker_code: string | null;
  name: string;
  email: string | null;
  is_on_leave: boolean;
  is_on_vacation: boolean;
  is_responsable: boolean;
  user_id: string | null;
  vacation_days_adjustment: number;
  pending_vacation_days: number;
};

type Department = {
  id: string;
  name: string;
  slug?: string;
};

type WorkerTeam = {
  id: string;
  department_id: string;
  name: string;
};

type WorkGroup = {
  id: string;
  department_id: string;
  name: string;
  color: string;
};

const WorkerProfile = () => {
  const navigate = useNavigate();
  const { workerId } = useParams<{ workerId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin, isAuthenticated, getSessionToken, manager } = useManagerAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const [allWorkers, setAllWorkers] = useState<Worker[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [workerTeams, setWorkerTeams] = useState<WorkerTeam[]>([]);
  const [workGroups, setWorkGroups] = useState<WorkGroup[]>([]);
  
  // Edit form state
  const [editName, setEditName] = useState("");
  const [editNumber, setEditNumber] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editTeamId, setEditTeamId] = useState<string>("");
  const [editWorkGroupId, setEditWorkGroupId] = useState<string>("");
  const [editOnLeave, setEditOnLeave] = useState(false);
  const [editOnVacation, setEditOnVacation] = useState(false);
  const [editIsResponsable, setEditIsResponsable] = useState(false);
  const [editVacationAdjustment, setEditVacationAdjustment] = useState("0");
  const [editDepartmentId, setEditDepartmentId] = useState<string>("");
  
  // Worker selector
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorSearch, setSelectorSearch] = useState("");
  
  // Active tab
  const activeTab = searchParams.get("tab") || "datos";
  
  // Delete confirmation
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [resettingCredentials, setResettingCredentials] = useState(false);
  const [effectiveDepartment, setEffectiveDepartment] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    fetchInitialData();
  }, [isAuthenticated, workerId]);

  const fetchInitialData = async () => {
    const sessionToken = getSessionToken();
    if (!sessionToken || !workerId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch all data in parallel
      const [workerRes, deptsRes] = await Promise.all([
        supabase.functions.invoke("admin-operations", {
          body: { action: "getWorkerProfile", sessionToken, data: { workerId } },
        }),
        supabase.functions.invoke("admin-operations", {
          body: { action: isAdmin ? "getDepartments" : "getManagerDepartments", sessionToken },
        }),
      ]);

      if (workerRes.data?.success && workerRes.data.worker) {
        const w = workerRes.data.worker as Worker;
        setWorker(w);
        setDepartment(workerRes.data.department || null);
        setWorkerTeams(workerRes.data.workerTeams || []);
        setWorkGroups(workerRes.data.workGroups || []);
        setAllWorkers(workerRes.data.allWorkers || []);
        
        // Resolve effective department for responsables
        if (w.is_responsable) {
          const teams = (workerRes.data.workerTeams || []) as WorkerTeam[];
          // Find a team where this worker is responsable (check via workerRes data or separate query)
          // The backend handles resolution, but we need the effective dept name for display
          const sessionToken = getSessionToken();
          if (sessionToken) {
            const { data: resolveData } = await supabase.functions.invoke("admin-operations", {
              body: { action: "resolveWorkerEffectiveDepartment", sessionToken, data: { workerId: w.id } },
            });
            if (resolveData?.success && resolveData.effectiveDepartmentId && resolveData.effectiveDepartmentId !== w.department_id) {
              setEffectiveDepartment({ id: resolveData.effectiveDepartmentId, name: resolveData.effectiveDepartmentName || "" });
            } else {
              setEffectiveDepartment(null);
            }
          }
        } else {
          setEffectiveDepartment(null);
        }
        
        // Initialize form
        setEditName(w.name);
        setEditNumber(w.worker_number);
        setEditCode(w.worker_code || "");
        setEditEmail(w.email || "");
        setEditTeamId(w.worker_team_id || "none");
        setEditWorkGroupId(w.work_group_id || "none");
        setEditOnLeave(w.is_on_leave);
        setEditOnVacation(w.is_on_vacation);
        setEditIsResponsable(w.is_responsable || false);
        setEditVacationAdjustment(String(w.vacation_days_adjustment || 0));
        setEditDepartmentId(w.department_id);
      }

      if (deptsRes.data?.success) {
        setDepartments(deptsRes.data.departments || []);
      }
    } catch (error) {
      console.error("Error fetching worker profile:", error);
      toast.error("Error al cargar el perfil del trabajador");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const sessionToken = getSessionToken();
    if (!sessionToken || !worker) return;

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "updateWorker",
          sessionToken,
          data: {
            workerId: worker.id,
            name: editName.trim(),
            worker_number: editNumber.trim(),
            worker_code: editCode.trim() || null,
            email: editEmail.trim() || null,
            worker_team_id: editTeamId === "none" ? null : editTeamId,
            work_group_id: editWorkGroupId === "none" ? null : editWorkGroupId,
            is_on_leave: editOnLeave,
            is_on_vacation: editOnVacation,
            is_responsable: editIsResponsable,
            vacation_days_adjustment: parseInt(editVacationAdjustment) || 0,
            department_id: editDepartmentId,
          },
        },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || "Error al guardar");
      }

      toast.success("Trabajador actualizado correctamente");
      
      // Refresh data
      await fetchInitialData();
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error(err.message || "Error al guardar los cambios");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const sessionToken = getSessionToken();
    if (!sessionToken || !worker) return;

    try {
      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "deleteWorker",
          sessionToken,
          data: { workerId: worker.id },
        },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || "Error al eliminar");
      }

      toast.success("Trabajador eliminado correctamente");
      navigate("/admin/groups?tab=workers");
    } catch (err: any) {
      console.error("Delete error:", err);
      toast.error(err.message || "Error al eliminar el trabajador");
    }
  };

  const handleResetCredentials = async () => {
    const sessionToken = getSessionToken();
    if (!sessionToken || !worker) return;

    setResettingCredentials(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "resetWorkerCredentials",
          sessionToken,
          data: { workerId: worker.id },
        },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || "Error al resetear");
      }

      toast.success("Credenciales reseteadas correctamente");
      await fetchInitialData();
    } catch (err: any) {
      console.error("Reset error:", err);
      toast.error(err.message || "Error al resetear las credenciales");
    } finally {
      setResettingCredentials(false);
    }
  };

  const handleImpersonate = (mode: "calendar" | "schedule" | "vacation") => {
    if (!worker) return;
    const url = mode === "calendar" 
      ? `/mi-calendario?viewAs=${worker.worker_number}`
      : mode === "schedule"
        ? `/mi-horario?viewAs=${worker.worker_number}`
        : `/vacaciones?viewAs=${worker.worker_number}`;
    window.open(url, "_blank");
  };

  const handleWorkerChange = (newWorkerId: string) => {
    navigate(`/admin/worker/${newWorkerId}?tab=${activeTab}`);
  };

  const setActiveTab = (tab: string) => {
    setSearchParams({ tab });
  };

  // Filter workers for selector
  const filteredWorkers = allWorkers.filter(w => {
    if (!selectorSearch) return true;
    const search = selectorSearch.toLowerCase();
    return w.name.toLowerCase().includes(search) || w.worker_number.toLowerCase().includes(search) || (w.worker_code && w.worker_code.toLowerCase().includes(search));
  });

  // Get current department's teams and groups
  const currentTeams = workerTeams.filter(t => t.department_id === editDepartmentId);
  const currentGroups = workGroups.filter(g => g.department_id === editDepartmentId);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!worker) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Trabajador no encontrado</p>
          <Button onClick={() => navigate("/admin/groups")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
        </div>
      </div>
    );
  }

  const workGroup = workGroups.find(g => g.id === worker.work_group_id);
  const team = workerTeams.find(t => t.id === worker.worker_team_id);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass-header">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin/groups?tab=workers")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <LogoLink to="/admin" className="h-7 w-auto" />
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Badge variant="outline" className="hidden sm:flex">
              {manager?.name}
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Worker Selector & Impersonation */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Worker Selector */}
          <Popover open={selectorOpen} onOpenChange={setSelectorOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full sm:w-80 justify-between">
                <div className="flex items-center gap-2 truncate">
                  <span className="font-mono text-primary font-semibold">
                    #{worker.worker_number}
                  </span>
                  <span className="truncate">{worker.name}</span>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <Command>
                <CommandInput 
                  placeholder="Buscar trabajador..." 
                  value={selectorSearch}
                  onValueChange={setSelectorSearch}
                />
                <CommandList>
                  <CommandEmpty>No se encontraron trabajadores</CommandEmpty>
                  <CommandGroup>
                    <ScrollArea className="h-64">
                      {filteredWorkers.map((w) => (
                        <CommandItem
                          key={w.id}
                          value={`${w.worker_number}-${w.name}`}
                          onSelect={() => {
                            handleWorkerChange(w.id);
                            setSelectorOpen(false);
                            setSelectorSearch("");
                          }}
                          className="cursor-pointer"
                        >
                          <span className="font-mono text-primary font-semibold mr-2">
                            #{w.worker_number}
                          </span>
                          <span className={w.id === worker.id ? "font-medium" : ""}>
                            {w.name}
                          </span>
                        </CommandItem>
                      ))}
                    </ScrollArea>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Impersonation Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleImpersonate("vacation")}
              className="gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ver Formulario</span>
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleImpersonate("calendar")}
              className="gap-1.5"
            >
              <Calendar className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ver Calendario</span>
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleImpersonate("schedule")}
              className="gap-1.5"
            >
              <Clock className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ver Horario</span>
            </Button>
          </div>
        </div>

        {/* Worker Info Summary */}
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap items-center gap-3">
              {department && (
                <Badge variant="secondary">{department.name}</Badge>
              )}
              {team && (
                <Badge variant="outline">{team.name}</Badge>
              )}
              {workGroup && (
                <Badge style={{ backgroundColor: workGroup.color, color: "#fff" }}>
                  {workGroup.name}
                </Badge>
              )}
              {worker.is_on_leave && (
                <Badge variant="destructive">De baja</Badge>
              )}
              {worker.is_on_vacation && (
                <Badge className="bg-cyan-500/20 text-cyan-500">Vacaciones</Badge>
              )}
              {worker.is_responsable && (
                <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30">Responsable</Badge>
              )}
              {worker.user_id && (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500">
                  Registrado
                </Badge>
              )}
              <div className="ml-auto text-sm text-muted-foreground">
                {worker.pending_vacation_days || 0} días pendientes
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="datos" className="gap-1.5">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Datos</span>
            </TabsTrigger>
            <TabsTrigger value="rendimiento" className="gap-1.5">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Rendimiento</span>
            </TabsTrigger>
            <TabsTrigger value="calendario" className="gap-1.5">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Calendario</span>
            </TabsTrigger>
            <TabsTrigger value="horario" className="gap-1.5">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Horario</span>
            </TabsTrigger>
            <TabsTrigger value="comentarios" className="gap-1.5">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Comentarios</span>
            </TabsTrigger>
            <TabsTrigger value="acciones" className="gap-1.5">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Acciones</span>
            </TabsTrigger>
          </TabsList>

          {/* Datos Tab */}
          <TabsContent value="datos" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <User className="h-5 w-5" />
                  Información del Trabajador
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nombre</Label>
                    <Input
                      id="name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Nombre completo"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="number">Número de Trabajador</Label>
                    <Input
                      id="number"
                      value={editNumber}
                      onChange={(e) => setEditNumber(e.target.value)}
                      placeholder="Ej: 14522"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="code">Siglas</Label>
                    <Input
                      id="code"
                      value={editCode}
                      onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                      placeholder="Ej: PAM"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email (opcional)</Label>
                    <Input
                      id="email"
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="email@ejemplo.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Departamento</Label>
                    <Select value={editDepartmentId} onValueChange={setEditDepartmentId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar departamento" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((dept) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Equipo de Trabajo</Label>
                    <Select value={editTeamId} onValueChange={setEditTeamId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sin equipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin equipo</SelectItem>
                        {currentTeams.map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Grupo Vacacional</Label>
                    <Select value={editWorkGroupId} onValueChange={setEditWorkGroupId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sin grupo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin grupo</SelectItem>
                        {currentGroups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: group.color }}
                              />
                              {group.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <Label htmlFor="onLeave" className="cursor-pointer">De baja</Label>
                    <Switch
                      id="onLeave"
                      checked={editOnLeave}
                      onCheckedChange={setEditOnLeave}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <Label htmlFor="onVacation" className="cursor-pointer">De vacaciones</Label>
                    <Switch
                      id="onVacation"
                      checked={editOnVacation}
                      onCheckedChange={setEditOnVacation}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                    <Label htmlFor="isResponsable" className="cursor-pointer">Responsable</Label>
                    <Switch
                      id="isResponsable"
                      checked={editIsResponsable}
                      onCheckedChange={setEditIsResponsable}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adjustment">Ajuste días vacaciones</Label>
                    <Input
                      id="adjustment"
                      type="number"
                      value={editVacationAdjustment}
                      onChange={(e) => setEditVacationAdjustment(e.target.value)}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={saving} className="gap-2">
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Guardar Cambios
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Salix Link */}
            <Card>
              <CardContent className="py-4">
                <a
                  href={`https://salix.verdnatura.es/#/worker/${worker.worker_number}/calendar`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  Ver en Salix
                </a>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Rendimiento Tab */}
          <TabsContent value="rendimiento">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TrendingUp className="h-5 w-5" />
                  Rendimiento — Líneas/hora
                </CardTitle>
              </CardHeader>
              <CardContent>
                <WorkerPerformanceHistory
                  workerId={worker.id}
                  sessionToken={getSessionToken() || ""}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Calendario Tab */}
          <TabsContent value="calendario">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="h-5 w-5" />
                  Calendario Anual - {effectiveDepartment ? effectiveDepartment.name : department?.name}
                  {effectiveDepartment && (
                    <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600 dark:text-amber-400">
                      Responsable · Dpto. {effectiveDepartment.name}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(effectiveDepartment?.id || worker.department_id) ? (
                  <EmbeddedAnnualCalendar 
                    departmentId={effectiveDepartment?.id || worker.department_id}
                    departmentSlug={department?.slug}
                  />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    El trabajador no tiene departamento asignado
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Horario Tab */}
          <TabsContent value="horario">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="h-5 w-5" />
                  Horario Semanal
                  {effectiveDepartment && (
                    <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600 dark:text-amber-400">
                      Responsable · Dpto. {effectiveDepartment.name}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <EmbeddedWorkerSchedule 
                  workerId={worker.id}
                  workerTeamId={worker.worker_team_id}
                  departmentId={effectiveDepartment?.id || worker.department_id}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Comentarios Tab */}
          <TabsContent value="comentarios">
            <WorkerCommentsTab 
              workerId={worker.id}
              workerName={worker.name}
            />
          </TabsContent>

          {/* Acciones Tab */}
          <TabsContent value="acciones" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Settings className="h-5 w-5" />
                  Acciones del Trabajador
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Reset Credentials */}
                {worker.user_id && (
                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                    <div>
                      <p className="font-medium">Resetear Credenciales</p>
                      <p className="text-sm text-muted-foreground">
                        El trabajador deberá crear una nueva contraseña
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleResetCredentials}
                      disabled={resettingCredentials}
                      className="gap-2"
                    >
                      {resettingCredentials ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <KeyRound className="h-4 w-4" />
                      )}
                      Resetear
                    </Button>
                  </div>
                )}

                {/* Modify Calendar */}
                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                  <div>
                    <p className="font-medium">Modificar Calendario Personal</p>
                    <p className="text-sm text-muted-foreground">
                      Crear una solicitud de modificación del calendario
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/admin/worker-calendar/${worker.id}`)}
                    className="gap-2"
                  >
                    <Calendar className="h-4 w-4" />
                    Modificar
                  </Button>
                </div>

                {/* Delete Worker */}
                <div className="flex items-center justify-between p-4 bg-destructive/10 rounded-lg border border-destructive/30">
                  <div>
                    <p className="font-medium text-destructive">Eliminar Trabajador</p>
                    <p className="text-sm text-muted-foreground">
                      Esta acción no se puede deshacer
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    onClick={() => setShowDeleteDialog(true)}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar trabajador?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar a <strong>{worker.name}</strong> (#{worker.worker_number}).
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WorkerProfile;
