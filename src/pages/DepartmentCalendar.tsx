import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowLeft, Save, Settings, CalendarDays, Copy, Wand2, Info, Search, Users, Plus, X, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { es } from "date-fns/locale";
import { format, eachDayOfInterval, startOfYear, endOfYear, isSaturday, isSunday, getYear } from "date-fns";
import { useManagerAuth } from "@/hooks/useManagerAuth";
import { HalfDayCalendar, DaySelection } from "@/components/HalfDayCalendar";
import LoadingScreen from "@/components/LoadingScreen";

type Department = {
  id: string;
  name: string;
  description: string | null;
  max_days_per_employee: number;
  manager_email: string | null;
  slug: string | null;
  require_all_days: boolean;
  auto_block_by_concurrency: boolean;
  max_concurrent_workers_global: number | null;
};

type Manager = {
  id: string;
  name: string;
};

type ManagerAssignment = {
  manager_id: string;
  department_id: string;
};

type WorkerWithGroup = {
  id: string;
  name: string;
  worker_number: string;
  worker_code?: string | null;
  team_name: string | null;
  group_name: string | null;
  group_color: string | null;
  max_free_days: number | null;
};

type RoleAlias = {
  id: string;
  department_id: string;
  alias_name: string;
};


const DepartmentCalendar = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, isAuthenticated, getSessionToken } = useManagerAuth();
  const [department, setDepartment] = useState<Department | null>(null);
  const [selectedDays, setSelectedDays] = useState<DaySelection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Editable fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [maxDays, setMaxDays] = useState(5);
  const [requireAllDays, setRequireAllDays] = useState(true);
  const [autoBlockByConcurrency, setAutoBlockByConcurrency] = useState(true);
  const [maxConcurrentWorkersGlobal, setMaxConcurrentWorkersGlobal] = useState<number | null>(null);
  const [managerEmail, setManagerEmail] = useState("");
  const [selectedManagerId, setSelectedManagerId] = useState<string>("");
  const [slug, setSlug] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  
  // Manual free days
  const [manualFreeDaysEnabled, setManualFreeDaysEnabled] = useState(false);
  const [manualFreeDaysValue, setManualFreeDaysValue] = useState<number | null>(null);
  
  // Managers list
  const [managers, setManagers] = useState<Manager[]>([]);
  const [assignments, setAssignments] = useState<ManagerAssignment[]>([]);
  
  // Annual calendar info
  const [annualBlockedDays, setAnnualBlockedDays] = useState<Set<string>>(new Set());
  const [annualCalendarYears, setAnnualCalendarYears] = useState<number[]>([]);
  
  // Worker search
  const [workers, setWorkers] = useState<WorkerWithGroup[]>([]);
  const [workerSearch, setWorkerSearch] = useState("");
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  
  // Role aliases
  const [roleAliases, setRoleAliases] = useState<RoleAlias[]>([]);
  const [newAliasName, setNewAliasName] = useState("");
  const [addingAlias, setAddingAlias] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      navigate("/login");
      return;
    }
    if (id) {
      fetchAllData();
    }
  }, [id, isAuthenticated, isAdmin, navigate]);

  const fetchAllData = async () => {
    setLoading(true);
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      toast.error("Sesión no válida");
      navigate("/login");
      return;
    }

    try {
      // Fetch all data in parallel via admin-operations
      const [deptResponse, managersResponse, assignmentsResponse] = await Promise.all([
        supabase.functions.invoke('admin-operations', {
          body: { action: 'getDepartments', sessionToken }
        }),
        supabase.functions.invoke('admin-operations', {
          body: { action: 'getManagers', sessionToken }
        }),
        supabase.functions.invoke('admin-operations', {
          body: { action: 'getAssignments', sessionToken }
        })
      ]);

      // Process departments
      if (deptResponse.data?.success && deptResponse.data?.departments) {
        const dept = deptResponse.data.departments.find((d: any) => d.id === id);
        if (dept) {
          setDepartment(dept);
          setName(dept.name);
          setDescription(dept.description || "");
          setMaxDays(dept.max_days_per_employee);
          setRequireAllDays(dept.require_all_days !== false);
          setAutoBlockByConcurrency(dept.auto_block_by_concurrency !== false);
          setMaxConcurrentWorkersGlobal(dept.max_concurrent_workers_global ?? null);
          setManagerEmail(dept.manager_email || "");
          setSlug(dept.slug || "");
          setManualFreeDaysEnabled(dept.manual_free_days_enabled || false);
          setManualFreeDaysValue(dept.manual_free_days_value ?? null);
        } else {
          toast.error("Departamento no encontrado");
          navigate("/admin/departments");
          return;
        }
      } else {
        toast.error("Error al cargar departamento");
        navigate("/admin/departments");
        return;
      }

      // Process managers
      if (managersResponse.data?.success && managersResponse.data?.managers) {
        const managersList = managersResponse.data.managers
          .filter((m: { role: string }) => m.role === 'manager')
          .map((m: { id: string; name: string }) => ({ id: m.id, name: m.name }));
        setManagers(managersList);
      }

      // Process assignments
      if (assignmentsResponse.data?.success && assignmentsResponse.data?.assignments) {
        const deptAssignments = assignmentsResponse.data.assignments.filter(
          (a: ManagerAssignment) => a.department_id === id
        );
        setAssignments(deptAssignments);
        if (deptAssignments.length > 0) {
          setSelectedManagerId(deptAssignments[0].manager_id);
        }
      }

      // Fetch available dates via edge function (secure)
      const availResponse = await supabase.functions.invoke('admin-operations', {
        body: { action: 'getDepartmentAvailabilities', sessionToken, data: { departmentId: id } }
      });

      if (availResponse.data?.success && availResponse.data?.availabilities) {
        const days: DaySelection[] = availResponse.data.availabilities.map((item: any) => ({
          date: item.date,
          halfDay: item.half_day || false,
        }));
        setSelectedDays(days);
      }

      // Fetch annual calendar info via edge function
      const currentYear = getYear(new Date());
      const calendarResponse = await supabase.functions.invoke('annual-calendar-operations', {
        body: { action: 'getCalendar', sessionToken, departmentId: id, year: currentYear }
      });

      if (calendarResponse.data?.success && calendarResponse.data?.calendar) {
        setAnnualCalendarYears([calendarResponse.data.calendar.year]);
        const blockedDates = new Set<string>();
        (calendarResponse.data.days || []).forEach((day: { date: string }) => {
          blockedDates.add(day.date);
        });
        setAnnualBlockedDays(blockedDates);
      } else {
        setAnnualCalendarYears([]);
      }

      // Fetch workers with their groups
      const workersResponse = await supabase.functions.invoke('admin-operations', {
        body: { action: 'getWorkersWithGroups', sessionToken, data: { departmentId: id } }
      });
      
      if (workersResponse.data?.success && workersResponse.data?.workers) {
        setWorkers(workersResponse.data.workers);
      }

      // Fetch role aliases
      const aliasesResponse = await supabase.functions.invoke('admin-operations', {
        body: { action: 'getDepartmentRoleAliases', sessionToken, data: { departmentId: id } }
      });
      
      if (aliasesResponse.data?.success && aliasesResponse.data?.aliases) {
        setRoleAliases(aliasesResponse.data.aliases);
      }

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error("Error al cargar datos");
    }

    setLoading(false);
  };


  const handleSave = async () => {
    if (!id) return;

    const sessionToken = getSessionToken();
    if (!sessionToken) {
      toast.error("Sesión no válida");
      return;
    }

    setSaving(true);

    try {
      // Update department settings
      const deptResponse = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'updateDepartment',
          sessionToken,
          data: {
            departmentId: id,
            name,
            description: description || null,
            max_days_per_employee: maxDays,
            require_all_days: requireAllDays,
            auto_block_by_concurrency: autoBlockByConcurrency,
            max_concurrent_workers_global: maxConcurrentWorkersGlobal,
            manager_email: managerEmail || null,
            manager_id: selectedManagerId || null,
            slug: slug || null,
            manual_free_days_enabled: manualFreeDaysEnabled,
            manual_free_days_value: manualFreeDaysEnabled ? manualFreeDaysValue : null,
          }
        }
      });

      if (deptResponse.error || !deptResponse.data?.success) {
        console.error('Update department error:', deptResponse.error || deptResponse.data?.error);
        toast.error(deptResponse.data?.error || "Error al guardar configuración");
        setSaving(false);
        return;
      }

      // Update calendar dates with half_day support
      const dates = selectedDays.map(day => ({
        date: day.date,
        half_day: day.halfDay,
      }));
      
      const calendarResponse = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'updateDepartmentAvailabilities',
          sessionToken,
          data: { departmentId: id, dates }
        }
      });

      if (calendarResponse.error || !calendarResponse.data?.success) {
        console.error('Save calendar error:', calendarResponse.error || calendarResponse.data?.error);
        toast.error(calendarResponse.data?.error || "Error al guardar calendario");
      } else {
        toast.success("Departamento actualizado exitosamente");
      }
    } catch (error) {
      console.error('Save error:', error);
      toast.error("Error al guardar");
    }

    setSaving(false);
  };

  const handleDayClick = (date: Date, halfDay: boolean, action: 'add' | 'remove' | 'convert') => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    if (action === 'add') {
      setSelectedDays(prev => [...prev, { date: dateStr, halfDay }]);
    } else if (action === 'remove') {
      setSelectedDays(prev => prev.filter(d => d.date !== dateStr));
    } else if (action === 'convert') {
      setSelectedDays(prev => prev.map(d => 
        d.date === dateStr ? { ...d, halfDay } : d
      ));
    }
  };

  const handleDuplicate = async () => {
    if (!id) return;

    const sessionToken = getSessionToken();
    if (!sessionToken) {
      toast.error("Sesión no válida");
      return;
    }

    setDuplicating(true);

    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'duplicateDepartment',
          sessionToken,
          data: { departmentId: id }
        }
      });

      if (response.error || !response.data?.success) {
        toast.error(response.data?.error || "Error al duplicar departamento");
      } else {
        toast.success("Departamento duplicado exitosamente");
        // Navigate to the new department
        navigate(`/admin/departments/${response.data.department.id}`);
      }
    } catch (error) {
      console.error('Duplicate error:', error);
      toast.error("Error al duplicar departamento");
    }

    setDuplicating(false);
  };

  const handleAddRoleAlias = async () => {
    if (!id || !newAliasName.trim()) return;

    const sessionToken = getSessionToken();
    if (!sessionToken) return;

    setAddingAlias(true);
    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'addDepartmentRoleAlias',
          sessionToken,
          data: { departmentId: id, aliasName: newAliasName.trim() }
        }
      });

      if (response.data?.success) {
        setRoleAliases([...roleAliases, response.data.alias]);
        setNewAliasName("");
        toast.success("Alias añadido");
      } else {
        toast.error(response.data?.error || "Error al añadir alias");
      }
    } catch (error) {
      toast.error("Error al añadir alias");
    }
    setAddingAlias(false);
  };

  const handleDeleteRoleAlias = async (aliasId: string) => {
    const sessionToken = getSessionToken();
    if (!sessionToken) return;

    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'deleteDepartmentRoleAlias',
          sessionToken,
          data: { aliasId }
        }
      });

      if (response.data?.success) {
        setRoleAliases(roleAliases.filter(a => a.id !== aliasId));
        toast.success("Alias eliminado");
      } else {
        toast.error(response.data?.error || "Error al eliminar alias");
      }
    } catch (error) {
      toast.error("Error al eliminar alias");
    }
  };


  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="glass-header">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" onClick={() => navigate("/admin/departments")} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver a Departamentos
          </Button>
          {department && (
            <div>
              <h1 className="text-2xl font-bold text-foreground">{department.name}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Configuración y calendario del departamento
              </p>
            </div>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Calendar Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                Días Disponibles para Vacaciones
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Selecciona los días que estarán disponibles para solicitar vacaciones
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Info: Synced with Annual Calendar */}
              {annualBlockedDays.size > 0 && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Wand2 className="h-4 w-4 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-primary">Sincronizado automáticamente</p>
                      <p className="text-xs text-muted-foreground">
                        {annualBlockedDays.size} días bloqueados (festivos, vacaciones, etc.). 
                        Los días disponibles se sincronizan automáticamente al guardar el Calendario Anual.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {annualBlockedDays.size === 0 && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                      <Info className="h-4 w-4 text-amber-600" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-amber-600">Sin Calendario Anual</p>
                      <p className="text-xs text-muted-foreground">
                        No hay un Calendario Anual configurado para este departamento. 
                        Considera crear uno primero para auto-detectar días bloqueados.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <HalfDayCalendar
                locale={es}
                selectedDays={selectedDays}
                onDayClick={handleDayClick}
                blockedDays={annualBlockedDays}
                showHalfDayOption={false}
                blockWeekends={true}
                className="rounded-lg border border-border/50 p-5 w-full"
              />

              {/* Legend */}
              <div className="space-y-3">
                <div className="flex flex-wrap gap-4 text-xs justify-center">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full bg-[hsl(var(--calendar-selected))]"></div>
                    <span className="text-muted-foreground">Habilitado</span>
                  </div>
                  {annualBlockedDays.size > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 rounded-full bg-destructive/20 border border-destructive/30"></div>
                      <span className="text-muted-foreground">Bloqueado (Cal. Anual)</span>
                    </div>
                  )}
                </div>
                
                
                <div className="text-center space-y-1">
                  <p className="text-sm text-muted-foreground">
                    Total: <span className="font-semibold text-foreground">{selectedDays.length}</span> días habilitados
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    Pulsa en el calendario para habilitar/deshabilitar días
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Settings Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                Configuración del Departamento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre del departamento</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre del departamento"
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción (opcional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descripción del departamento"
                  className="rounded-xl"
                />
              </div>

              {/* Role Aliases Section */}
              <div className="space-y-3 p-4 bg-secondary/30 rounded-xl border border-border/50">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-medium">Alias de roles (para importación CSV)</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Si en tu CSV aparece un nombre diferente al departamento (ej: "Auxiliar Cámara" en lugar de "Cámara"), 
                  añádelo aquí y se asignará automáticamente a este departamento durante la importación.
                </p>
                
                {/* Add new alias */}
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Ej: Auxiliar Cámara"
                    value={newAliasName}
                    onChange={(e) => setNewAliasName(e.target.value)}
                    className="flex-1 rounded-xl h-9"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddRoleAlias();
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={handleAddRoleAlias}
                    disabled={!newAliasName.trim() || addingAlias}
                    className="h-9"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Añadir
                  </Button>
                </div>
                
                {/* Existing aliases */}
                {roleAliases.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {roleAliases.map((alias) => (
                      <Badge
                        key={alias.id}
                        variant="secondary"
                        className="pl-3 pr-1 py-1 flex items-center gap-1"
                      >
                        <span>{alias.alias_name}</span>
                        <button
                          onClick={() => handleDeleteRoleAlias(alias.id)}
                          className="ml-1 p-0.5 rounded-full hover:bg-destructive/20 transition-colors"
                        >
                          <X className="h-3 w-3 text-destructive" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground/70 italic">
                    No hay alias configurados. El CSV solo reconocerá "{name}" como nombre de departamento.
                  </p>
                )}
              </div>

              {/* Manual free days toggle */}
              <div className="space-y-3 p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 flex-1 mr-4">
                    <Label htmlFor="manualFreeDays" className="text-sm font-medium cursor-pointer text-purple-400">
                      Días de libre disposición manuales
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {manualFreeDaysEnabled 
                        ? "Se usará el valor manual configurado para todos los trabajadores" 
                        : "Se calcula automáticamente según el grupo del trabajador en el Calendario Anual"}
                    </p>
                  </div>
                  <Switch
                    id="manualFreeDays"
                    checked={manualFreeDaysEnabled}
                    onCheckedChange={setManualFreeDaysEnabled}
                  />
                </div>
                
                {manualFreeDaysEnabled && (
                  <div className="flex items-center gap-3 pt-2 border-t border-purple-500/20">
                    <Input
                      type="number"
                      min="0"
                      max="30"
                      step="0.5"
                      placeholder="Ej: 9.5"
                      value={manualFreeDaysValue ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setManualFreeDaysValue(val === "" ? null : parseFloat(val));
                      }}
                      className="rounded-xl w-28"
                    />
                    <span className="text-sm text-muted-foreground">días para todos los trabajadores</span>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Días de libre configuración por trabajador
                </Label>
                <p className="text-xs text-muted-foreground">
                  {manualFreeDaysEnabled && manualFreeDaysValue !== null
                    ? `Valor fijo: ${manualFreeDaysValue} días (configuración manual)`
                    : "Se calcula automáticamente según el grupo del trabajador en el Calendario Anual"}
                </p>
                
                {/* Worker search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar trabajador..."
                    value={workerSearch}
                    onChange={(e) => setWorkerSearch(e.target.value)}
                    className="pl-9 rounded-xl"
                  />
                </div>
                
                {/* Workers list */}
                <div className="max-h-48 overflow-y-auto space-y-1 border border-border/50 rounded-xl p-2">
                  {workers.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      No hay trabajadores en este departamento
                    </p>
                  ) : (
                    workers
                      .filter(w => 
                        workerSearch === "" || 
                        w.name.toLowerCase().includes(workerSearch.toLowerCase()) ||
                        w.worker_number.toLowerCase().includes(workerSearch.toLowerCase()) ||
                        (w.worker_code && w.worker_code.toLowerCase().includes(workerSearch.toLowerCase()))
                      )
                      .slice(0, 10)
                      .map(worker => (
                        <div 
                          key={worker.id}
                          className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-secondary/50 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {worker.group_color && (
                              <div 
                                className="h-3 w-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: worker.group_color }}
                              />
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{worker.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Nº {worker.worker_number}
                                {worker.team_name && ` · ${worker.team_name}`}
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 ml-2">
                            <span className="text-sm font-semibold text-primary">
                              {worker.max_free_days !== null ? `${worker.max_free_days} días` : '-'}
                            </span>
                          </div>
                        </div>
                      ))
                  )}
                  {workers.filter(w => 
                    workerSearch === "" || 
                    w.name.toLowerCase().includes(workerSearch.toLowerCase()) ||
                    w.worker_number.toLowerCase().includes(workerSearch.toLowerCase())
                  ).length > 10 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      +{workers.filter(w => 
                        workerSearch === "" || 
                        w.name.toLowerCase().includes(workerSearch.toLowerCase()) ||
                        w.worker_number.toLowerCase().includes(workerSearch.toLowerCase())
                      ).length - 10} más...
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl">
                <div className="space-y-0.5">
                  <Label htmlFor="requireAllDays" className="text-sm font-medium cursor-pointer">
                    Obligar a marcar todos los días
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {requireAllDays 
                      ? "El trabajador debe seleccionar exactamente todos los días" 
                      : "El trabajador puede solicitar menos días y usar los restantes después"}
                  </p>
                </div>
                <input
                  type="checkbox"
                  id="requireAllDays"
                  checked={requireAllDays}
                  onChange={(e) => setRequireAllDays(e.target.checked)}
                  className="h-5 w-5 rounded border-border accent-primary cursor-pointer"
                />
              </div>

              {/* Toggle for automatic concurrency blocking */}
              <div className="flex items-center justify-between p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                <div className="space-y-0.5 flex-1 mr-4">
                  <Label htmlFor="autoBlockByConcurrency" className="text-sm font-medium cursor-pointer text-blue-400">
                    Bloqueo automático por límite de personal
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {autoBlockByConcurrency 
                      ? "El sistema bloquea automáticamente días cuando se alcanza el límite de ausencias permitidas" 
                      : "El bloqueo automático está desactivado - los trabajadores pueden solicitar cualquier día disponible"}
                  </p>
                </div>
                <input
                  type="checkbox"
                  id="autoBlockByConcurrency"
                  checked={autoBlockByConcurrency}
                  onChange={(e) => setAutoBlockByConcurrency(e.target.checked)}
                  className="h-5 w-5 rounded border-border accent-primary cursor-pointer"
                />
              </div>

              {autoBlockByConcurrency && (
                <div className="space-y-3">
                  <div className="p-3 bg-secondary/50 border border-border/50 rounded-xl">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Fórmula automática:</span> (nº trabajadores × días libres) ÷ días del periodo vacacional, redondeado al alza. Se aplica a nivel de grupo y departamento.
                    </p>
                  </div>
                  
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="maxConcurrentWorkersGlobal" className="text-sm font-medium text-amber-600">
                        Límite manual GLOBAL del departamento (opcional)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Bloquea el día cuando X personas <strong>de todo el departamento</strong> ya lo han solicitado. Sustituye al cálculo automático del departamento.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Input
                        id="maxConcurrentWorkersGlobal"
                        type="number"
                        min="1"
                        max="100"
                        placeholder="Ej: 5"
                        value={maxConcurrentWorkersGlobal ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMaxConcurrentWorkersGlobal(val === "" ? null : parseInt(val, 10));
                        }}
                        className="rounded-xl w-32"
                      />
                      <span className="text-sm text-muted-foreground">personas máximo por día</span>
                      {maxConcurrentWorkersGlobal !== null && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setMaxConcurrentWorkersGlobal(null)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Borrar
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                    <p className="text-xs text-blue-400">
                      <span className="font-medium">Límite por grupo:</span> También puedes configurar un límite manual por cada grupo vacacional desde el <strong>Calendario Anual</strong> → Editar grupo. Este límite bloquea cuando X personas del mismo grupo ya lo han solicitado.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="manager">Encargado asignado</Label>
                <Select value={selectedManagerId || "none"} onValueChange={(val) => setSelectedManagerId(val === "none" ? "" : val)}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Seleccionar encargado..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin asignar</SelectItem>
                    {managers.map((manager) => (
                      <SelectItem key={manager.id} value={manager.id}>
                        {manager.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">URL del formulario</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">vnprod.app/</span>
                  <Input
                    id="slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="mi-departamento"
                    className="rounded-xl flex-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Solo letras minúsculas, números y guiones
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Emails de notificaciones (opcional)</Label>
                <Textarea
                  id="email"
                  value={managerEmail}
                  onChange={(e) => setManagerEmail(e.target.value)}
                  placeholder="email1@ejemplo.com, email2@ejemplo.com"
                  className="rounded-xl min-h-[60px]"
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Separa múltiples emails con comas. Se enviarán notificaciones a todos cuando lleguen solicitudes.
                </p>
              </div>

              <div className="pt-4 border-t border-border/50 space-y-3">
                <Button
                  className="w-full"
                  onClick={handleSave}
                  disabled={saving || !name || !slug}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? "Guardando..." : "Guardar Todo"}
                </Button>
                
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleDuplicate}
                  disabled={duplicating}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  {duplicating ? "Duplicando..." : "Duplicar Departamento"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default DepartmentCalendar;
