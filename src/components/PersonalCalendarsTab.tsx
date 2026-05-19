import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Calendar, Copy, CheckCircle, ExternalLink, Trash2, User, Building2 } from "lucide-react";
import { useManagerAuth } from "@/modules/auth/hooks/useManagerAuth";
import { DepartmentSearchSelect } from "@/components/DepartmentSearchSelect";

type PersonalCalendar = {
  id: string;
  department_id: string;
  worker_name: string;
  worker_number: string;
  slug: string | null;
  public_token: string;
  max_days: number;
  created_at: string;
};

type Department = {
  id: string;
  name: string;
};

type Worker = {
  id: string;
  name: string;
  worker_number: string;
  department_id: string;
};

export const PersonalCalendarsTab = () => {
  const navigate = useNavigate();
  const { getSessionToken } = useManagerAuth();
  const [calendars, setCalendars] = useState<PersonalCalendar[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filterDepartmentId, setFilterDepartmentId] = useState<string>("");
  const [formData, setFormData] = useState({
    department_id: "",
    worker_id: "",
    max_days: 5,
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [calendarToDelete, setCalendarToDelete] = useState<PersonalCalendar | null>(null);

  useEffect(() => {
    fetchCalendars();
    fetchDepartments();
  }, []);

  // Group calendars by department
  const groupedCalendars = useMemo(() => {
    const filtered = filterDepartmentId 
      ? calendars.filter(cal => cal.department_id === filterDepartmentId)
      : calendars;
    
    const grouped = new Map<string, { department: Department | null; calendars: PersonalCalendar[] }>();
    
    filtered.forEach(cal => {
      const dept = departments.find(d => d.id === cal.department_id);
      if (!grouped.has(cal.department_id)) {
        grouped.set(cal.department_id, { department: dept || null, calendars: [] });
      }
      grouped.get(cal.department_id)!.calendars.push(cal);
    });
    
    // Sort by department name
    return Array.from(grouped.entries())
      .sort((a, b) => {
        const nameA = a[1].department?.name || 'ZZZ';
        const nameB = b[1].department?.name || 'ZZZ';
        return nameA.localeCompare(nameB);
      });
  }, [calendars, departments, filterDepartmentId]);

  const departmentsWithCalendars = useMemo(() => {
    const deptIds = new Set(calendars.map(cal => cal.department_id));
    return departments.filter(dept => deptIds.has(dept.id));
  }, [calendars, departments]);

  const fetchCalendars = async () => {
    setLoading(true);
    const sessionToken = getSessionToken();
    
    if (!sessionToken) {
      setLoading(false);
      return;
    }

    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'getPersonalCalendars',
          sessionToken
        }
      });

      if (response.error || !response.data?.success) {
        console.error('Error fetching personal calendars:', response.data?.error);
        toast.error("Error al cargar calendarios personales");
        setLoading(false);
        return;
      }

      setCalendars(response.data.calendars || []);
    } catch (error) {
      console.error('Fetch personal calendars error:', error);
      toast.error("Error al cargar calendarios personales");
    }
    setLoading(false);
  };

  const fetchDepartments = async () => {
    const sessionToken = getSessionToken();
    
    if (!sessionToken) return;

    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'getDepartments',
          sessionToken
        }
      });

      if (response.error || !response.data?.success) {
        console.error('Error fetching departments:', response.data?.error);
        return;
      }

      setDepartments(response.data.departments || []);
    } catch (error) {
      console.error('Fetch departments error:', error);
    }
  };

  const fetchWorkersByDepartment = async (departmentId: string) => {
    setLoadingWorkers(true);
    const sessionToken = getSessionToken();
    
    if (!sessionToken) {
      setLoadingWorkers(false);
      return;
    }

    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'getWorkers',
          sessionToken,
          data: { departmentId }
        }
      });

      if (response.error || !response.data?.success) {
        console.error('Error fetching workers:', response.data?.error);
        setLoadingWorkers(false);
        return;
      }

      setWorkers(response.data.workers || []);
    } catch (error) {
      console.error('Fetch workers error:', error);
    }
    setLoadingWorkers(false);
  };

  const handleDepartmentChange = (departmentId: string) => {
    setFormData({ ...formData, department_id: departmentId, worker_id: "" });
    setWorkers([]);
    if (departmentId) {
      fetchWorkersByDepartment(departmentId);
    }
  };

  const handleWorkerChange = (workerId: string) => {
    setFormData({ ...formData, worker_id: workerId });
  };

  const getSelectedWorker = () => {
    return workers.find(w => w.id === formData.worker_id);
  };

  const handleCreateCalendar = async () => {
    if (!formData.department_id) {
      toast.error("Selecciona un departamento");
      return;
    }
    if (!formData.worker_id) {
      toast.error("Selecciona un trabajador");
      return;
    }

    const selectedWorker = getSelectedWorker();
    if (!selectedWorker) {
      toast.error("Trabajador no encontrado");
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
          action: 'createPersonalCalendar',
          sessionToken,
          data: {
            department_id: formData.department_id,
            worker_name: selectedWorker.name,
            worker_number: selectedWorker.worker_number,
            max_days: formData.max_days,
          }
        }
      });

      if (response.error || !response.data?.success) {
        console.error('Create error:', response.error || response.data?.error);
        toast.error(response.data?.error || "Error al crear calendario personal");
        return;
      }

      toast.success("Calendario personal creado exitosamente");
      setIsDialogOpen(false);
      setFormData({ department_id: "", worker_id: "", max_days: 5 });
      setWorkers([]);
      fetchCalendars();
    } catch (error) {
      console.error('Create error:', error);
      toast.error("Error al crear calendario personal");
    }
  };

  const getPublicUrl = (cal: PersonalCalendar) => {
    const baseUrl = "https://vnprod.app";
    if (cal.slug) {
      return `${baseUrl}/p/${cal.slug}`;
    }
    return `${baseUrl}/p/${cal.public_token}`;
  };

  const copyPublicUrl = (cal: PersonalCalendar) => {
    const url = getPublicUrl(cal);
    navigator.clipboard.writeText(url);
    setCopiedId(cal.id);
    toast.success("Enlace copiado al portapapeles");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openPublicForm = (cal: PersonalCalendar) => {
    const path = cal.slug ? `/p/${cal.slug}` : `/p/${cal.public_token}`;
    window.open(path, '_blank');
  };

  const handleDeleteCalendar = (cal: PersonalCalendar) => {
    setCalendarToDelete(cal);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteCalendar = async () => {
    if (!calendarToDelete) return;

    const sessionToken = getSessionToken();
    if (!sessionToken) {
      toast.error("Sesión no válida");
      return;
    }

    try {
      const response = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'deletePersonalCalendar',
          sessionToken,
          data: { calendarId: calendarToDelete.id }
        }
      });

      if (response.error || !response.data?.success) {
        console.error('Delete error:', response.error || response.data?.error);
        toast.error(response.data?.error || "Error al eliminar calendario personal");
      } else {
        toast.success("Calendario personal eliminado");
        fetchCalendars();
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast.error("Error al eliminar calendario personal");
    }

    setDeleteDialogOpen(false);
    setCalendarToDelete(null);
  };

  const getDepartmentName = (departmentId: string) => {
    const dept = departments.find(d => d.id === departmentId);
    return dept?.name || "Desconocido";
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Calendarios Personales</h2>
          <p className="text-sm text-muted-foreground">
            Calendarios especiales para trabajadores específicos
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-9">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Calendario Personal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear Calendario Personal</DialogTitle>
              <DialogDescription>
                Crea un calendario especial para un trabajador específico
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Departamento *</Label>
                <Select
                  value={formData.department_id}
                  onValueChange={handleDepartmentChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map(dept => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  El encargado de este departamento gestionará las solicitudes
                </p>
              </div>

              {formData.department_id && (
                <div className="space-y-2">
                  <Label>Trabajador *</Label>
                  <Select
                    value={formData.worker_id}
                    onValueChange={handleWorkerChange}
                    disabled={loadingWorkers}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={loadingWorkers ? "Cargando trabajadores..." : "Selecciona un trabajador"} />
                    </SelectTrigger>
                    <SelectContent>
                      {workers.map(worker => (
                        <SelectItem key={worker.id} value={worker.id}>
                          {worker.name} ({worker.worker_number})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    El calendario será exclusivo para este trabajador
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="max_days">Máximo de días</Label>
                <Input
                  id="max_days"
                  type="number"
                  min="1"
                  max="30"
                  value={formData.max_days}
                  onChange={(e) => setFormData({ ...formData, max_days: parseInt(e.target.value) })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateCalendar}>
                Crear Calendario
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando...</div>
      ) : calendars.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">No hay calendarios personales creados</p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Crear Primer Calendario Personal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Filter by department */}
          <div className="flex items-center gap-3">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <div className="w-64">
              <DepartmentSearchSelect
                departments={departmentsWithCalendars}
                value={filterDepartmentId}
                onChange={setFilterDepartmentId}
                placeholder="Filtrar por departamento"
                includeAll={true}
              />
            </div>
            {filterDepartmentId && (
              <span className="text-sm text-muted-foreground">
                {groupedCalendars.reduce((acc, [_, group]) => acc + group.calendars.length, 0)} calendario(s)
              </span>
            )}
          </div>

          {/* Grouped calendars */}
          {groupedCalendars.map(([deptId, group]) => (
            <div key={deptId} className="space-y-3">
              <div className="flex items-center gap-2 border-b border-border pb-2">
                <Building2 className="h-4 w-4 text-primary" />
                <h3 className="font-medium text-foreground">
                  {group.department?.name || "Departamento desconocido"}
                </h3>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {group.calendars.length}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {group.calendars.map((cal) => (
                  <Card key={cal.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-primary flex items-center gap-2 text-base">
                        <User className="h-4 w-4" />
                        {cal.worker_name}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Nº Trabajador: {cal.worker_number}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          Máximo <span className="font-semibold text-foreground">{cal.max_days}</span> días
                        </span>
                      </div>

                      <div className="pt-3 border-t border-border/50 space-y-2">
                        <Label className="text-xs text-muted-foreground">Enlace personal</Label>
                        <div className="flex gap-2">
                          <Input
                            readOnly
                            value={getPublicUrl(cal)}
                            className="text-xs h-8"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0"
                            onClick={() => copyPublicUrl(cal)}
                          >
                            {copiedId === cal.id ? (
                              <CheckCircle className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="default"
                          size="sm"
                          className="flex-1"
                          onClick={() => navigate(`/admin/personal-calendars/${cal.id}`)}
                        >
                          <Calendar className="h-3.5 w-3.5 mr-1.5" />
                          Gestionar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0"
                          onClick={() => openPublicForm(cal)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                          onClick={() => handleDeleteCalendar(cal)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Calendario Personal</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar el calendario de <span className="font-semibold">{calendarToDelete?.worker_name}</span>?
              <br /><br />
              Esta acción eliminará todas las fechas disponibles configuradas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDeleteCalendar}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
