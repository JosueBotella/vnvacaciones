import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HalfDayCalendar, DaySelection } from "@/components/HalfDayCalendar";
import { toast } from "sonner";
import { ArrowLeft, Save, Copy, CheckCircle, User, Mail } from "lucide-react";
import { useManagerAuth } from "@/hooks/useManagerAuth";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import LoadingScreen from "@/components/LoadingScreen";

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

const PersonalCalendarEdit = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, isAuthenticated, getSessionToken } = useManagerAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calendar, setCalendar] = useState<PersonalCalendar | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDays, setSelectedDays] = useState<DaySelection[]>([]);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [formData, setFormData] = useState({
    worker_name: "",
    worker_number: "",
    worker_email: "",
    max_days: 5,
    slug: "",
    department_id: "",
  });

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      navigate("/login");
      return;
    }
    fetchAllData();
  }, [id, isAuthenticated, isAdmin, navigate]);

  const fetchAllData = async () => {
    setLoading(true);
    const sessionToken = getSessionToken();
    
    if (!sessionToken || !id) {
      setLoading(false);
      return;
    }

    try {
      // Fetch calendar details, departments, and availabilities in parallel
      const [calendarRes, deptsRes, availRes] = await Promise.all([
        supabase.functions.invoke('admin-operations', {
          body: { action: 'getPersonalCalendar', sessionToken, data: { calendarId: id } }
        }),
        supabase.functions.invoke('admin-operations', {
          body: { action: 'getDepartments', sessionToken }
        }),
        supabase.functions.invoke('admin-operations', {
          body: { action: 'getPersonalCalendarAvailabilities', sessionToken, data: { calendarId: id } }
        })
      ]);

      if (calendarRes.error || !calendarRes.data?.success) {
        toast.error("Error al cargar el calendario");
        navigate("/admin/departments");
        return;
      }

      const calendarData = calendarRes.data.calendar;
      setCalendar(calendarData);
      setFormData({
        worker_name: calendarData.worker_name || "",
        worker_number: calendarData.worker_number || "",
        worker_email: calendarData.worker_email || "",
        max_days: calendarData.max_days || 5,
        slug: calendarData.slug || "",
        department_id: calendarData.department_id || "",
      });

      if (deptsRes.data?.success) {
        setDepartments(deptsRes.data.departments || []);
      }

      if (availRes.data?.success) {
        const days: DaySelection[] = (availRes.data.availabilities || []).map((a: { date: string; half_day?: boolean }) => ({
          date: a.date,
          halfDay: a.half_day || false,
        }));
        setSelectedDays(days);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error("Error al cargar datos");
    }
    setLoading(false);
  };

  const handleDayClick = (date: Date, halfDay: boolean, action: 'add' | 'remove' | 'convert') => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    if (action === 'add') {
      setSelectedDays([...selectedDays, { date: dateStr, halfDay }]);
    } else if (action === 'remove') {
      setSelectedDays(selectedDays.filter(d => d.date !== dateStr));
    } else if (action === 'convert') {
      setSelectedDays(selectedDays.map(d => 
        d.date === dateStr ? { ...d, halfDay } : d
      ));
    }
  };

  // Calculate total days (half days = 0.5)
  const totalSelectedDays = selectedDays.reduce((acc, d) => acc + (d.halfDay ? 0.5 : 1), 0);

  const handleSave = async () => {
    if (!id) return;
    
    setSaving(true);
    const sessionToken = getSessionToken();
    
    if (!sessionToken) {
      toast.error("Sesión no válida");
      setSaving(false);
      return;
    }

    try {
      // Update calendar details
      const updateRes = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'updatePersonalCalendar',
          sessionToken,
          data: {
            calendarId: id,
            worker_name: formData.worker_name,
            worker_number: formData.worker_number,
            worker_email: formData.worker_email,
            max_days: formData.max_days,
            slug: formData.slug || null,
            department_id: formData.department_id,
          }
        }
      });

      if (updateRes.error || !updateRes.data?.success) {
        toast.error(updateRes.data?.error || "Error al guardar cambios");
        setSaving(false);
        return;
      }

      // Update availabilities with half_day support
      const availRes = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'updatePersonalCalendarAvailabilities',
          sessionToken,
          data: { 
            calendarId: id, 
            dates: selectedDays.map(d => ({ date: d.date, halfDay: d.halfDay }))
          }
        }
      });

      if (availRes.error || !availRes.data?.success) {
        toast.error(availRes.data?.error || "Error al guardar fechas");
        setSaving(false);
        return;
      }

      toast.success("Cambios guardados exitosamente");
    } catch (error) {
      console.error('Save error:', error);
      toast.error("Error al guardar");
    }
    setSaving(false);
  };

  const getPublicUrl = () => {
    if (!calendar) return "";
    const baseUrl = "https://vnprod.app";
    if (formData.slug) {
      return `${baseUrl}/p/${formData.slug}`;
    }
    return `${baseUrl}/p/${calendar.public_token}`;
  };

  const copyPublicUrl = () => {
    navigator.clipboard.writeText(getPublicUrl());
    setCopiedUrl(true);
    toast.success("Enlace copiado al portapapeles");
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="glass-header">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/departments")} className="mb-3 sm:mb-4 h-8 sm:h-9 px-2 sm:px-3">
            <ArrowLeft className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="text-sm">Volver</span>
          </Button>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <User className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground">
                  {calendar?.worker_name || "Calendario Personal"}
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">
                  Nº Trabajador: {calendar?.worker_number}
                </p>
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Calendar */}
          <Card>
            <CardHeader>
              <CardTitle>Fechas Disponibles</CardTitle>
              <p className="text-sm text-muted-foreground">
                Selecciona las fechas disponibles para vacaciones ({totalSelectedDays} días seleccionados)
              </p>
            </CardHeader>
            <CardContent className="flex justify-center">
              <HalfDayCalendar
                locale={es}
                selectedDays={selectedDays}
                onDayClick={handleDayClick}
                showHalfDayOption={true}
                className="rounded-md border"
              />
            </CardContent>
          </Card>

          {/* Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Configuración</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Departamento</Label>
                <Select
                  value={formData.department_id}
                  onValueChange={(value) => setFormData({ ...formData, department_id: value })}
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="worker_name">Nombre del trabajador</Label>
                <Input
                  id="worker_name"
                  value={formData.worker_name}
                  onChange={(e) => setFormData({ ...formData, worker_name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="worker_number">Número de trabajador</Label>
                <Input
                  id="worker_number"
                  value={formData.worker_number}
                  onChange={(e) => setFormData({ ...formData, worker_number: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  El trabajador deberá introducir este número para verificar su identidad
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="worker_email" className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  Email del trabajador
                </Label>
                <Input
                  id="worker_email"
                  type="email"
                  placeholder="ejemplo@correo.com"
                  value={formData.worker_email}
                  onChange={(e) => setFormData({ ...formData, worker_email: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Se guardará en la ficha del trabajador. Necesario para enviar notificaciones de modificaciones.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_days">Máximo de días</Label>
                <Input
                  id="max_days"
                  type="number"
                  min="0.5"
                  max="30"
                  step="0.5"
                  value={formData.max_days}
                  onChange={(e) => setFormData({ ...formData, max_days: parseFloat(e.target.value) || 5 })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">URL personalizada (opcional)</Label>
                <Input
                  id="slug"
                  placeholder="ej: juan-garcia"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Si lo dejas vacío, se usará el token automático
                </p>
              </div>

              <div className="pt-4 border-t border-border/50 space-y-2">
                <Label className="text-xs text-muted-foreground">Enlace personal</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={getPublicUrl()}
                    className="text-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copyPublicUrl}
                  >
                    {copiedUrl ? (
                      <CheckCircle className="h-4 w-4 text-primary" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default PersonalCalendarEdit;
