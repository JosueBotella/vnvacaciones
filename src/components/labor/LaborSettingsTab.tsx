import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Settings, Clock, Timer, UserX, Save, Loader2, Info, Bell, Mail, Send, TrendingUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type LaborSettings = {
  id: string;
  courtesy_minutes: number;
  delay_threshold_minutes: number;
  absence_threshold_hours: number;
  alert_threshold_delays: number;
  alert_threshold_absences: number;
  alert_email: string | null;
  alerts_enabled: boolean;
  active_modules: {
    workers: boolean;
    schedules: boolean;
    timetracking: boolean;
    summaries: boolean;
    imports: boolean;
    settings: boolean;
  };
};

export function LaborSettingsTab() {
  const [settings, setSettings] = useState<LaborSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  // Performance thresholds
  type Department = { id: string; name: string };
  type PerformanceThreshold = { department_id: string; green_min: number; yellow_min: number };
  const [departments, setDepartments] = useState<Department[]>([]);
  const [perfThresholds, setPerfThresholds] = useState<Record<string, { green_min: number; yellow_min: number }>>({});
  const [savingPerf, setSavingPerf] = useState(false);

  // Form state
  const [courtesyMinutes, setCourtesyMinutes] = useState(5);
  const [delayThreshold, setDelayThreshold] = useState(10);
  const [absenceThreshold, setAbsenceThreshold] = useState(4);
  const [alertThresholdDelays, setAlertThresholdDelays] = useState(3);
  const [alertThresholdAbsences, setAlertThresholdAbsences] = useState(2);
  const [alertEmail, setAlertEmail] = useState("");
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [activeModules, setActiveModules] = useState({
    workers: true,
    schedules: true,
    timetracking: true,
    summaries: true,
    imports: true,
    settings: true
  });

  useEffect(() => {
    fetchSettings();
    fetchDepartmentsAndThresholds();
  }, []);

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from("labor_module_settings")
      .select("*")
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching settings:", error);
      toast.error("Error al cargar ajustes");
    }

    if (data) {
      setSettings(data as unknown as LaborSettings);
      setCourtesyMinutes(data.courtesy_minutes);
      setDelayThreshold(data.delay_threshold_minutes);
      setAbsenceThreshold(Number(data.absence_threshold_hours));
      setAlertThresholdDelays(data.alert_threshold_delays ?? 3);
      setAlertThresholdAbsences(data.alert_threshold_absences ?? 2);
      setAlertEmail(data.alert_email ?? "");
      setAlertsEnabled(data.alerts_enabled ?? false);
      const modules = data.active_modules as Record<string, boolean>;
      setActiveModules({
        workers: modules?.workers ?? true,
        schedules: modules?.schedules ?? true,
        timetracking: modules?.timetracking ?? true,
        summaries: modules?.summaries ?? true,
        imports: modules?.imports ?? true,
        settings: modules?.settings ?? true
      });
    }
    setLoading(false);
  };

  const fetchDepartmentsAndThresholds = async () => {
    const sessionToken = localStorage.getItem("manager_session_token");
    if (!sessionToken) return;

    // Fetch departments
    const { data: deptData } = await supabase.rpc("get_public_departments");
    const depts = (deptData || []).map((d: any) => ({ id: d.id, name: d.name }));
    depts.sort((a: Department, b: Department) => a.name.localeCompare(b.name));
    setDepartments(depts);

    // Fetch thresholds
    const { data: threshResp } = await supabase.functions.invoke("admin-operations", {
      body: { action: "getPerformanceThresholds", sessionToken }
    });
    if (threshResp?.success) {
      const map: Record<string, { green_min: number; yellow_min: number }> = {};
      for (const t of threshResp.thresholds) {
        map[t.department_id] = { green_min: t.green_min, yellow_min: t.yellow_min };
      }
      // Initialize missing departments with defaults
      for (const dept of depts) {
        if (!map[dept.id]) {
          map[dept.id] = { green_min: 80, yellow_min: 60 };
        }
      }
      setPerfThresholds(map);
    }
  };

  const handleSavePerfThresholds = async () => {
    setSavingPerf(true);
    const sessionToken = localStorage.getItem("manager_session_token");
    try {
      for (const [deptId, vals] of Object.entries(perfThresholds)) {
        await supabase.functions.invoke("admin-operations", {
          body: {
            action: "upsertPerformanceThreshold",
            sessionToken,
            data: { departmentId: deptId, greenMin: vals.green_min, yellowMin: vals.yellow_min }
          }
        });
      }
      toast.success("Umbrales de rendimiento guardados");
    } catch (err) {
      toast.error("Error al guardar umbrales");
    }
    setSavingPerf(false);
  };

  const handleSave = async () => {
    setSaving(true);

    const settingsData = {
      courtesy_minutes: courtesyMinutes,
      delay_threshold_minutes: delayThreshold,
      absence_threshold_hours: absenceThreshold,
      alert_threshold_delays: alertThresholdDelays,
      alert_threshold_absences: alertThresholdAbsences,
      alert_email: alertEmail || null,
      alerts_enabled: alertsEnabled,
      active_modules: activeModules,
      updated_at: new Date().toISOString()
    };

    let error;
    if (settings?.id) {
      const result = await supabase
        .from("labor_module_settings")
        .update(settingsData)
        .eq("id", settings.id);
      error = result.error;
    } else {
      const result = await supabase
        .from("labor_module_settings")
        .insert(settingsData);
      error = result.error;
    }

    if (error) {
      console.error("Error saving settings:", error);
      toast.error("Error al guardar ajustes");
    } else {
      toast.success("Ajustes guardados correctamente");
      fetchSettings();
    }

    setSaving(false);
  };

  const handleTestAlert = async () => {
    if (!alertEmail) {
      toast.error("Configura un email antes de probar");
      return;
    }
    
    setSendingTest(true);
    try {
      const response = await supabase.functions.invoke("send-labor-alert", {
        body: { checkPeriodDays: 7 }
      });
      
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      if (response.data?.alertsSent > 0) {
        toast.success(`Se enviaron alertas para ${response.data.alertsSent} trabajador(es)`);
      } else {
        toast.info(response.data?.message || "No hay incidencias que reportar");
      }
    } catch (error: any) {
      console.error("Error sending test alert:", error);
      toast.error("Error al enviar alerta de prueba");
    }
    setSendingTest(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Time Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-primary" />
            Umbrales de Tiempo
          </CardTitle>
          <CardDescription>
            Configura los márgenes para la detección de retrasos y ausencias
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Courtesy Minutes */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="courtesy">Minutos de Cortesía</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Margen de tiempo que se permite antes de considerar un fichaje como retraso. Por ejemplo, si la entrada es a las 8:00 y hay 5 minutos de cortesía, se considerará a tiempo hasta las 8:05.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id="courtesy"
                  type="number"
                  min={0}
                  max={30}
                  value={courtesyMinutes}
                  onChange={(e) => setCourtesyMinutes(parseInt(e.target.value) || 0)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">minutos</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Se permite hasta {courtesyMinutes} min de margen
              </p>
            </div>

            {/* Delay Threshold */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="delay">Umbral de Retraso</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Minutos de retraso a partir de los cuales se considera una incidencia significativa y se muestra en los informes de anomalías.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id="delay"
                  type="number"
                  min={1}
                  max={120}
                  value={delayThreshold}
                  onChange={(e) => setDelayThreshold(parseInt(e.target.value) || 10)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">minutos</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Retrasos ≥{delayThreshold} min se marcan como incidencia
              </p>
            </div>

            {/* Absence Threshold */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="absence">Umbral de Ausencia</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Horas sin fichaje de entrada a partir de las cuales se considera que el trabajador ha faltado a su turno.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id="absence"
                  type="number"
                  min={1}
                  max={12}
                  step={0.5}
                  value={absenceThreshold}
                  onChange={(e) => setAbsenceThreshold(parseFloat(e.target.value) || 4)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">horas</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Sin fichaje en {absenceThreshold}h = ausencia
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alert Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4 text-primary" />
            Alertas Automáticas
          </CardTitle>
          <CardDescription>
            Configura alertas por email cuando los trabajadores superen ciertos umbrales de incidencias
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable alerts toggle */}
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Alertas por Email</p>
                <p className="text-sm text-muted-foreground">Recibir notificaciones cuando se detecten incidencias</p>
              </div>
            </div>
            <Switch
              checked={alertsEnabled}
              onCheckedChange={setAlertsEnabled}
            />
          </div>

          {alertsEnabled && (
            <>
              <Separator />
              
              <div className="space-y-4">
                {/* Alert Email */}
                <div className="space-y-2">
                  <Label htmlFor="alertEmail">Email de Notificación</Label>
                  <Input
                    id="alertEmail"
                    type="email"
                    placeholder="rrhh@empresa.com"
                    value={alertEmail}
                    onChange={(e) => setAlertEmail(e.target.value)}
                    className="max-w-md"
                  />
                  <p className="text-xs text-muted-foreground">
                    Las alertas se enviarán a esta dirección
                  </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  {/* Delay threshold */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="alertDelays">Umbral de Retrasos</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-4 w-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Número de retrasos en el período de 7 días que activa una alerta.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        id="alertDelays"
                        type="number"
                        min={1}
                        max={20}
                        value={alertThresholdDelays}
                        onChange={(e) => setAlertThresholdDelays(parseInt(e.target.value) || 3)}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">retrasos</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Alerta si ≥{alertThresholdDelays} retrasos en 7 días
                    </p>
                  </div>

                  {/* Absence threshold */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="alertAbsences">Umbral de Ausencias</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-4 w-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Número de ausencias en el período de 7 días que activa una alerta.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        id="alertAbsences"
                        type="number"
                        min={1}
                        max={10}
                        value={alertThresholdAbsences}
                        onChange={(e) => setAlertThresholdAbsences(parseInt(e.target.value) || 2)}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">ausencias</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Alerta si ≥{alertThresholdAbsences} ausencias en 7 días
                    </p>
                  </div>
                </div>

                <div className="pt-4">
                  <Button 
                    variant="outline" 
                    onClick={handleTestAlert}
                    disabled={sendingTest || !alertEmail}
                  >
                    {sendingTest ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Enviar Alerta de Prueba
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Performance Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Umbrales de Rendimiento
          </CardTitle>
          <CardDescription>
            Configura los valores mínimos para la clasificación por colores del rendimiento (lines/hour) por departamento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Color legend */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span>≥ Verde</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <span>≥ Amarillo y &lt; Verde</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span>&lt; Amarillo</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Departamento</TableHead>
                  <TableHead className="w-[140px]">Verde (≥)</TableHead>
                  <TableHead className="w-[140px]">Amarillo (≥)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.map(dept => {
                  const vals = perfThresholds[dept.id] || { green_min: 80, yellow_min: 60 };
                  return (
                    <TableRow key={dept.id}>
                      <TableCell className="font-medium">{dept.name}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={vals.green_min}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value) || 0;
                            setPerfThresholds(prev => ({
                              ...prev,
                              [dept.id]: { ...prev[dept.id], green_min: v }
                            }));
                          }}
                          className="w-24"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={vals.yellow_min}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value) || 0;
                            setPerfThresholds(prev => ({
                              ...prev,
                              [dept.id]: { ...prev[dept.id], yellow_min: v }
                            }));
                          }}
                          className="w-24"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSavePerfThresholds} disabled={savingPerf} variant="outline" className="min-w-32">
              {savingPerf ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Guardar Umbrales
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Module Activation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4 text-primary" />
            Módulos Activos
          </CardTitle>
          <CardDescription>
            Activa o desactiva las secciones del módulo laboral
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Trabajadores</span>
              </div>
              <Switch
                checked={activeModules.workers}
                onCheckedChange={(checked) => setActiveModules({ ...activeModules, workers: checked })}
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Horarios</span>
              </div>
              <Switch
                checked={activeModules.schedules}
                onCheckedChange={(checked) => setActiveModules({ ...activeModules, schedules: checked })}
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Control Horario</span>
              </div>
              <Switch
                checked={activeModules.timetracking}
                onCheckedChange={(checked) => setActiveModules({ ...activeModules, timetracking: checked })}
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                <UserX className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Resúmenes</span>
              </div>
              <Switch
                checked={activeModules.summaries}
                onCheckedChange={(checked) => setActiveModules({ ...activeModules, summaries: checked })}
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Importaciones</span>
              </div>
              <Switch
                checked={activeModules.imports}
                onCheckedChange={(checked) => setActiveModules({ ...activeModules, imports: checked })}
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg opacity-50">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Ajustes</span>
              </div>
              <Switch checked={true} disabled />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="min-w-32">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Guardar Ajustes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
