import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Plus, Calendar, Copy, CheckCircle, ExternalLink, Trash2, UserCog, User, KeyRound, Loader2, Globe, Info, Eye, Users, AlertTriangle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { z } from "zod";
import { useManagerAuth } from "@/hooks/useManagerAuth";
import { PersonalCalendarsTab } from "@/components/PersonalCalendarsTab";
import LoadingPanel from "@/components/LoadingPanel";
import { SkeletonDepartmentGrid } from "@/components/SkeletonLoaders";
import { DepartmentSearchSelect } from "@/components/DepartmentSearchSelect";

type Department = {
  id: string;
  name: string;
  description: string | null;
  max_days_per_employee: number;
  manager_email: string | null;
  public_token: string;
  slug: string | null;
  created_at: string;
};

type Manager = {
  id: string;
  name: string;
  role: string;
};

type ManagerAssignment = {
  manager_id: string;
  department_id: string;
  managers: { name: string };
};

const emailSchema = z.string().trim().email();

const DepartmentsList = () => {
  const navigate = useNavigate();
  const { isAdmin, isAuthenticated, getSessionToken, isLoading: authLoading } = useManagerAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [assignments, setAssignments] = useState<ManagerAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    max_days_per_employee: 5,
    manager_email: "",
    manager_id: "",
  });
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [departmentToDelete, setDepartmentToDelete] = useState<Department | null>(null);
  const [filterDepartmentId, setFilterDepartmentId] = useState<string>("all");

  // Admin tool: free email
  const [freeEmailValue, setFreeEmailValue] = useState("");
  const [freeEmailLoading, setFreeEmailLoading] = useState(false);

  // Global free days settings
  const [globalFreeDaysEnabled, setGlobalFreeDaysEnabled] = useState(false);
  const [globalFreeDaysValue, setGlobalFreeDaysValue] = useState<number | null>(null);
  const [globalSettingsLoading, setGlobalSettingsLoading] = useState(false);
  const [globalSettingsSaving, setGlobalSettingsSaving] = useState(false);
  
  // Impact preview
  type ImpactWorker = {
    workerId: string;
    workerName: string;
    workerNumber: string;
    departmentName: string;
    usedDays: number;
    remainingDays: number;
    wouldHaveZero: boolean;
  };
  type ImpactSummary = {
    totalWorkers: number;
    workersWithZero: number;
    workersWithRemainingDays: number;
    proposedValue: number;
  };
  const [impactPreview, setImpactPreview] = useState<ImpactWorker[]>([]);
  const [impactSummary, setImpactSummary] = useState<ImpactSummary | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [showImpactPreview, setShowImpactPreview] = useState(false);

  // Filtered departments based on search
  const filteredDepartments = useMemo(() => {
    if (filterDepartmentId === "all") return departments;
    return departments.filter(d => d.id === filterDepartmentId);
  }, [departments, filterDepartmentId]);

  const fetchGlobalSettings = useCallback(async () => {
    const sessionToken = getSessionToken();
    if (!sessionToken) return;

    setGlobalSettingsLoading(true);
    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'getGlobalFreeDaysSettings',
          sessionToken
        }
      });

      if (response.data?.success) {
        setGlobalFreeDaysEnabled(response.data.enabled ?? false);
        setGlobalFreeDaysValue(response.data.value ?? null);
      }
    } catch (error) {
      console.error('Error fetching global settings:', error);
    }
    setGlobalSettingsLoading(false);
  }, [getSessionToken]);

  const handleSaveGlobalSettings = async () => {
    const sessionToken = getSessionToken();
    if (!sessionToken) return;

    if (globalFreeDaysEnabled && (globalFreeDaysValue === null || globalFreeDaysValue < 0)) {
      toast.error("Introduce un número válido de días");
      return;
    }

    setGlobalSettingsSaving(true);
    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'updateGlobalFreeDaysSettings',
          sessionToken,
          data: {
            enabled: globalFreeDaysEnabled,
            value: globalFreeDaysEnabled ? globalFreeDaysValue : null
          }
        }
      });

      if (response.data?.success) {
        toast.success("Configuración global guardada");
      } else {
        toast.error(response.data?.error || "Error al guardar");
      }
    } catch (error) {
      console.error('Error saving global settings:', error);
      toast.error("Error al guardar configuración");
    }
    setGlobalSettingsSaving(false);
  };

  const fetchImpactPreview = useCallback(async () => {
    if (globalFreeDaysValue === null || globalFreeDaysValue < 0) return;
    
    const sessionToken = getSessionToken();
    if (!sessionToken) return;

    setImpactLoading(true);
    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'getGlobalFreeDaysImpactPreview',
          sessionToken,
          data: { value: globalFreeDaysValue }
        }
      });

      if (response.data?.success) {
        setImpactPreview(response.data.preview || []);
        setImpactSummary(response.data.summary || null);
        setShowImpactPreview(true);
      }
    } catch (error) {
      console.error('Error fetching impact preview:', error);
    }
    setImpactLoading(false);
  }, [getSessionToken, globalFreeDaysValue]);

  

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !isAdmin) {
      navigate("/login");
      return;
    }
    fetchDepartments();
    fetchManagers();
    fetchAssignments();
    fetchGlobalSettings();
  }, [authLoading, isAuthenticated, isAdmin, navigate, fetchGlobalSettings]);

  const fetchDepartments = async () => {
    setLoading(true);
    const sessionToken = getSessionToken();

    if (!sessionToken) {
      setLoading(false);
      return;
    }

    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'getDepartments',
          sessionToken
        }
      });

      if (response.error || !response.data?.success) {
        console.error('Error fetching departments:', response.data?.error);
        toast.error("Error al cargar departamentos");
        setLoading(false);
        return;
      }

      setDepartments(response.data.departments || []);
    } catch (error) {
      console.error('Fetch departments error:', error);
      toast.error("Error al cargar departamentos");
    }
    setLoading(false);
  };

  const fetchManagers = async () => {
    const sessionToken = getSessionToken();

    if (!sessionToken) {
      return;
    }

    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'getManagers',
          sessionToken
        }
      });

      if (response.error || !response.data?.success) {
        console.error('Error fetching managers:', response.data?.error);
        return;
      }

      // Filter to only show managers (not admins) for assignment dropdown
      const allManagers = response.data.managers || [];
      const managersList = allManagers.filter((m: Manager & { role: string }) => m.role === 'manager');
      setManagers(managersList);
    } catch (error) {
      console.error('Fetch managers error:', error);
    }
  };

  const fetchAssignments = async () => {
    const sessionToken = getSessionToken();

    if (!sessionToken) {
      return;
    }

    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'getAssignments',
          sessionToken
        }
      });

      if (response.error || !response.data?.success) {
        console.error('Error fetching assignments:', response.data?.error);
        return;
      }

      setAssignments(response.data.assignments || []);
    } catch (error) {
      console.error('Fetch assignments error:', error);
    }
  };

  const getManagersForDepartment = (departmentId: string) => {
    return assignments
      .filter(a => a.department_id === departmentId)
      .map(a => a.managers?.name)
      .filter(Boolean);
  };

  const handleCreateDepartment = async () => {
    if (!formData.name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }

    const sessionToken = getSessionToken();
    if (!sessionToken) {
      toast.error("Sesión no válida");
      return;
    }

    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'createDepartment',
          sessionToken,
          data: {
            name: formData.name,
            description: formData.description || null,
            max_days_per_employee: formData.max_days_per_employee,
            manager_email: formData.manager_email || null,
            manager_id: formData.manager_id || null,
          }
        }
      });

      if (response.error || !response.data?.success) {
        console.error('Create error:', response.error || response.data?.error);
        toast.error(response.data?.error || "Error al crear departamento");
        return;
      }

      toast.success("Departamento creado exitosamente");
      setIsDialogOpen(false);
      setFormData({ name: "", description: "", max_days_per_employee: 5, manager_email: "", manager_id: "" });
      fetchDepartments();
      fetchAssignments();
    } catch (error) {
      console.error('Create error:', error);
      toast.error("Error al crear departamento");
    }
  };

  const getPublicUrl = (dept: Department) => {
    const baseUrl = "https://vnprod.app";
    if (dept.slug) {
      return `${baseUrl}/${dept.slug}`;
    }
    return `${baseUrl}/d/${dept.public_token}`;
  };

  const copyPublicUrl = (dept: Department) => {
    const url = getPublicUrl(dept);
    navigator.clipboard.writeText(url);
    setCopiedToken(dept.id);
    toast.success("Enlace copiado al portapapeles");
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const openPublicForm = () => {
    window.open('/vacaciones', '_blank');
  };

  const handleFreeEmail = async () => {
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      toast.error("Sesión no válida");
      return;
    }

    const parsed = emailSchema.safeParse(freeEmailValue);
    if (!parsed.success) {
      toast.error("Introduce un email válido");
      return;
    }

    setFreeEmailLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('worker-auth', {
        body: {
          action: 'adminDeleteUserByEmail',
          adminSessionToken: sessionToken,
          email: parsed.data,
        }
      });

      if (error || data?.error || data?.success === false) {
        toast.error(data?.error || error?.message || "No se pudo liberar el email");
        return;
      }

      toast.success(data?.message || "Email liberado");
      setFreeEmailValue("");
    } catch (e) {
      toast.error("No se pudo liberar el email");
    } finally {
      setFreeEmailLoading(false);
    }
  };

  const handleDuplicateDepartment = async (dept: Department) => {
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      toast.error("Sesión no válida");
      return;
    }

    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'duplicateDepartment',
          sessionToken,
          data: { departmentId: dept.id }
        }
      });

      if (response.error || !response.data?.success) {
        console.error('Duplicate error:', response.error || response.data?.error);
        toast.error(response.data?.error || "Error al duplicar departamento");
      } else {
        toast.success("Departamento duplicado");
        fetchDepartments();
        fetchAssignments();
      }
    } catch (error) {
      console.error('Duplicate error:', error);
      toast.error("Error al duplicar departamento");
    }
  };

  const handleDeleteDepartment = (dept: Department) => {
    setDepartmentToDelete(dept);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteDepartment = async () => {
    if (!departmentToDelete) return;

    const sessionToken = getSessionToken();
    if (!sessionToken) {
      toast.error("Sesión no válida");
      return;
    }

    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'deleteDepartment',
          sessionToken,
          data: { departmentId: departmentToDelete.id }
        }
      });

      if (response.error || !response.data?.success) {
        console.error('Delete error:', response.error || response.data?.error);
        toast.error(response.data?.error || "Error al eliminar departamento");
      } else {
        toast.success("Departamento eliminado");
        fetchDepartments();
        fetchAssignments();
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast.error("Error al eliminar departamento");
    }

    setDeleteDialogOpen(false);
    setDepartmentToDelete(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="glass-header">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="h-8 w-8 p-0 rounded-full">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-sm sm:text-lg font-semibold text-foreground tracking-tight">Departamentos</h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground font-light">Administra los departamentos</p>
            </div>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 rounded-full px-3 text-xs">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                <span className="hidden sm:inline">Nuevo Departamento</span>
                <span className="sm:hidden">Nuevo</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear Nuevo Departamento</DialogTitle>
                <DialogDescription>
                  Complete los datos para crear un nuevo departamento
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre *</Label>
                  <Input
                    id="name"
                    placeholder="Ej: Almacén, Atención al cliente"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descripción</Label>
                  <Textarea
                    id="description"
                    placeholder="Descripción opcional del departamento"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Encargado del departamento</Label>
                  <Select
                    value={formData.manager_id}
                    onValueChange={(value) => setFormData({ ...formData, manager_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un encargado" />
                    </SelectTrigger>
                    <SelectContent>
                      {managers.map(mgr => (
                        <SelectItem key={mgr.id} value={mgr.id}>
                          {mgr.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    El encargado podrá aprobar/rechazar solicitudes de este departamento
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manager_email">Email(s) del Encargado (notificaciones)</Label>
                  <Input
                    id="manager_email"
                    type="text"
                    placeholder="email1@verdnatura.es, email2@verdnatura.es"
                    value={formData.manager_email}
                    onChange={(e) => setFormData({ ...formData, manager_email: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Separar múltiples emails con comas. Recibirán notificaciones de nuevas solicitudes
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateDepartment}>
                  Crear Departamento
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4 sm:py-6">
        {/* Unified link for all workers */}
        <Card className="mb-4 sm:mb-6 border-primary/30 bg-primary/5">
          <CardContent className="py-3 sm:py-4 px-3 sm:px-4">
            <div className="flex flex-col gap-3">
              <div>
                <h3 className="font-semibold text-foreground text-sm sm:text-base">Enlace único para trabajadores</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">Comparte este enlace con todos los trabajadores</p>
              </div>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value="https://vnprod.app/vacaciones"
                  className="text-xs sm:text-sm flex-1 min-w-0"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText("https://vnprod.app/vacaciones");
                    toast.success("Enlace copiado al portapapeles");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Admin tool: free up an email for worker registration */}
        <Card className="mb-4 sm:mb-6">
          <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary flex-shrink-0" />
              <span>Liberar email de registro</span>
            </CardTitle>
            <CardDescription>
              Si un email “ya está registrado” aunque lo hayas quitado del trabajador, probablemente sigue existiendo una cuenta antigua.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <div className="flex-1 space-y-2 min-w-0">
                <Label htmlFor="free_email" className="text-xs sm:text-sm">Email</Label>
                <Input
                  id="free_email"
                  placeholder="email@dominio.com"
                  value={freeEmailValue}
                  onChange={(e) => setFreeEmailValue(e.target.value)}
                  className="text-sm"
                />
              </div>
              <Button
                className="w-full sm:w-auto flex-shrink-0"
                onClick={handleFreeEmail}
                disabled={freeEmailLoading}
              >
                {freeEmailLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Liberando...
                  </>
                ) : (
                  "Liberar"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Global Free Days Configuration */}
        <Card className="mb-4 sm:mb-6 border-primary/30">
          <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary flex-shrink-0" />
              <span>Días de Libre Disposición Global</span>
            </CardTitle>
            <CardDescription>
              Configura un número fijo de días de libre disposición para toda la empresa
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 space-y-4">
            {globalSettingsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Cargando configuración...</span>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="global-free-days-switch" className="text-sm font-medium">
                      Activar días globales
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Aplica para todos los departamentos
                    </p>
                  </div>
                  <Switch
                    id="global-free-days-switch"
                    checked={globalFreeDaysEnabled}
                    onCheckedChange={setGlobalFreeDaysEnabled}
                  />
                </div>

                {globalFreeDaysEnabled && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="global-free-days-value" className="text-sm">
                        Días de libre disposición
                      </Label>
                      <Input
                        id="global-free-days-value"
                        type="number"
                        min={0}
                        max={30}
                        step={0.5}
                        value={globalFreeDaysValue ?? ""}
                        onChange={(e) => setGlobalFreeDaysValue(e.target.value ? parseFloat(e.target.value) : null)}
                        className="max-w-[120px]"
                        placeholder="5"
                      />
                    </div>

                    <Alert className="bg-amber-500/10 border-amber-500/30">
                      <Info className="h-4 w-4 text-amber-600" />
                      <AlertDescription className="text-xs text-amber-700 dark:text-amber-400">
                        <strong>Importante:</strong> Los días ya aprobados se descuentan automáticamente. 
                        Si configuras 5 días y un trabajador ya tiene 3 aprobados, solo podrá solicitar 2 más.
                      </AlertDescription>
                    </Alert>

                    {/* Impact Preview Results */}
                    {showImpactPreview && impactSummary && (
                      <Collapsible defaultOpen className="space-y-3">
                        <CollapsibleTrigger className="w-full">
                          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-primary" />
                              <span className="text-sm font-medium">Resumen de Impacto</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="text-muted-foreground">
                                {impactSummary.totalWorkers} trabajadores
                              </span>
                              {impactSummary.workersWithZero > 0 && (
                                <Badge variant="destructive" className="text-xs">
                                  {impactSummary.workersWithZero} sin días
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="space-y-3">
                            {/* Summary Stats */}
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div className="p-2 bg-muted/30 rounded-lg">
                                <div className="text-lg font-bold text-foreground">{impactSummary.totalWorkers}</div>
                                <div className="text-xs text-muted-foreground">Total</div>
                              </div>
                              <div className="p-2 bg-primary/10 rounded-lg">
                                <div className="text-lg font-bold text-primary">{impactSummary.workersWithRemainingDays}</div>
                                <div className="text-xs text-muted-foreground">Con días</div>
                              </div>
                              <div className="p-2 bg-destructive/10 rounded-lg">
                                <div className="text-lg font-bold text-destructive">{impactSummary.workersWithZero}</div>
                                <div className="text-xs text-muted-foreground">Sin días</div>
                              </div>
                            </div>

                            {/* Workers with zero days warning */}
                            {impactSummary.workersWithZero > 0 && (
                              <Alert variant="destructive" className="bg-destructive/5">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertDescription className="text-xs">
                                  {impactSummary.workersWithZero} trabajador{impactSummary.workersWithZero !== 1 ? 'es' : ''} 
                                  {" "}ya {impactSummary.workersWithZero === 1 ? 'ha' : 'han'} agotado los {impactSummary.proposedValue} días 
                                  y no podr{impactSummary.workersWithZero === 1 ? 'á' : 'án'} solicitar más.
                                </AlertDescription>
                              </Alert>
                            )}

                            {/* Detailed table */}
                            <ScrollArea className="h-[200px] rounded-md border">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">Trabajador</TableHead>
                                    <TableHead className="text-xs">Departamento</TableHead>
                                    <TableHead className="text-xs text-right">Usados</TableHead>
                                    <TableHead className="text-xs text-right">Disponibles</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {impactPreview.map((worker) => (
                                    <TableRow key={worker.workerId} className={worker.wouldHaveZero ? "bg-destructive/5" : ""}>
                                      <TableCell className="text-xs py-2">
                                        <div>
                                          <span className="font-medium">{worker.workerName}</span>
                                          <span className="text-muted-foreground ml-1">#{worker.workerNumber}</span>
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-xs py-2 text-muted-foreground">
                                        {worker.departmentName}
                                      </TableCell>
                                      <TableCell className="text-xs py-2 text-right">
                                        {worker.usedDays}
                                      </TableCell>
                                      <TableCell className="text-xs py-2 text-right">
                                        <Badge 
                                          variant={worker.wouldHaveZero ? "destructive" : "secondary"}
                                          className="text-xs"
                                        >
                                          {worker.remainingDays}
                                        </Badge>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </ScrollArea>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </>
                )}

                {/* Action buttons - properly styled footer */}
                <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2 border-t border-border/50 mt-2">
                  {globalFreeDaysEnabled && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={fetchImpactPreview}
                      disabled={impactLoading || globalFreeDaysValue === null}
                      className="gap-2 text-muted-foreground hover:text-foreground"
                    >
                      {impactLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Calculando...
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4" />
                          Vista previa de impacto
                        </>
                      )}
                    </Button>
                  )}
                  <div className="flex-1" />
                  <Button
                    onClick={handleSaveGlobalSettings}
                    disabled={globalSettingsSaving}
                    size="sm"
                  >
                    {globalSettingsSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      "Guardar Configuración"
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="departments" className="space-y-4 sm:space-y-6">
          <TabsList className="grid w-full grid-cols-2 h-auto">
            <TabsTrigger value="departments" className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm py-2">
              <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span>Departamentos</span>
            </TabsTrigger>
            <TabsTrigger value="personal" className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm py-2">
              <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="truncate">Calendarios Personales</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="departments">
            {/* Department search filter */}
            {!loading && departments.length > 0 && (
              <div className="mb-4">
                <DepartmentSearchSelect
                  departments={departments}
                  value={filterDepartmentId}
                  onChange={setFilterDepartmentId}
                  includeAll={true}
                  placeholder="Buscar departamento..."
                  className="max-w-sm"
                />
              </div>
            )}

            {loading ? (
              <SkeletonDepartmentGrid count={6} />
            ) : departments.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <p className="text-muted-foreground mb-4">No hay departamentos creados</p>
                  <Button onClick={() => setIsDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Crear Primer Departamento
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 content-loaded">
                {filteredDepartments.map((dept, index) => {
                  const assignedManagers = getManagersForDepartment(dept.id);
                  return (
                    <Card key={dept.id} className="hover:shadow-lg transition-shadow overflow-hidden content-loaded-item" style={{ animationDelay: `${index * 60}ms` }}>
                      <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
                        <CardTitle className="text-primary text-base sm:text-lg">{dept.name}</CardTitle>
                        {dept.description && (
                          <CardDescription className="text-xs sm:text-sm">{dept.description}</CardDescription>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-3 sm:space-y-4 px-3 sm:px-6 pb-3 sm:pb-6">
                        {assignedManagers.length > 0 && (
                          <div className="flex items-center gap-2 text-xs sm:text-sm">
                            <UserCog className="h-4 w-4 text-primary flex-shrink-0" />
                            <span className="text-muted-foreground truncate">
                              {assignedManagers.length === 1 ? "Encargado" : "Encargados"}: <span className="font-semibold text-foreground">{assignedManagers.join(", ")}</span>
                            </span>
                          </div>
                        )}


                        <div className="flex flex-col sm:flex-row gap-2 pt-2">
                          <Button
                            variant="default"
                            size="sm"
                            className="flex-1 text-xs sm:text-sm h-9"
                            onClick={() => navigate(`/admin/departments/${dept.id}`)}
                          >
                            <Calendar className="h-4 w-4 mr-1.5 flex-shrink-0" />
                            <span className="truncate">Gestionar Calendario</span>
                          </Button>
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-9 w-9 flex-shrink-0"
                              onClick={() => openPublicForm()}
                              title="Abrir formulario"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-9 w-9 flex-shrink-0"
                              onClick={() => handleDuplicateDepartment(dept)}
                              title="Duplicar departamento"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-9 w-9 flex-shrink-0 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                              onClick={() => handleDeleteDepartment(dept)}
                              title="Eliminar departamento"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="personal">
            <PersonalCalendarsTab />
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Departamento</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar el departamento "{departmentToDelete?.name}"? 
              Se eliminarán todas las solicitudes y disponibilidades asociadas. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDeleteDepartment}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DepartmentsList;
