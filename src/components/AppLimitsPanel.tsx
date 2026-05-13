import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { Database, Lock, Unlock, AlertTriangle, Save, RefreshCw, TrendingUp, ChevronDown, Table2 } from 'lucide-react';
import { useAppSettings } from '@/hooks/useAppSettings';

interface AppSettings {
  id: string;
  max_rows: number;
  current_rows: number;
  is_locked: boolean;
  lock_reason: string | null;
  warning_threshold: number;
}

interface AppLimitsPanelProps {
  sessionToken: string;
}

export function AppLimitsPanel({ sessionToken }: AppLimitsPanelProps) {
  const { refreshSettings } = useAppSettings();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [tableCounts, setTableCounts] = useState<Record<string, number>>({});
  const [showTableDetails, setShowTableDetails] = useState(false);
  
  // Editable fields
  const [maxRows, setMaxRows] = useState<number>(50000);
  const [warningThreshold, setWarningThreshold] = useState<number>(80);
  const [isLocked, setIsLocked] = useState(false);
  const [lockReason, setLockReason] = useState('');

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching settings:', error);
        toast.error('Error al cargar configuración');
        return;
      }

      if (data) {
        const typedData = data as AppSettings;
        setSettings(typedData);
        setMaxRows(typedData.max_rows);
        setWarningThreshold(typedData.warning_threshold);
        setIsLocked(typedData.is_locked);
        setLockReason(typedData.lock_reason || '');
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateRowCount = async () => {
    setCalculating(true);
    try {
      const { data: response, error } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'calculateRowCount',
          sessionToken,
          data: {}
        }
      });

      if (error) {
        console.error('Error calculating rows:', error);
        toast.error('Error al calcular filas');
        return;
      }

      if (response?.success) {
        setTableCounts(response.tableCounts || {});
        
        if (response.settings) {
          const typedData = response.settings as AppSettings;
          setSettings(typedData);
          setMaxRows(typedData.max_rows);
          setWarningThreshold(typedData.warning_threshold);
          setIsLocked(typedData.is_locked);
          setLockReason(typedData.lock_reason || '');
        }
        
        await refreshSettings();
        toast.success(`Recuento completado: ${response.totalRows?.toLocaleString() || 0} filas`);
      }
    } catch (err) {
      console.error('Error:', err);
      toast.error('Error al calcular');
    } finally {
      setCalculating(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    // Auto-calculate on mount
    calculateRowCount();
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    
    setSaving(true);
    try {
      const { data: response, error } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'updateAppSettings',
          sessionToken,
          data: {
            id: settings.id,
            max_rows: maxRows,
            warning_threshold: warningThreshold,
            is_locked: isLocked,
            lock_reason: isLocked ? lockReason : null
          }
        }
      });

      if (error || !response?.success) {
        toast.error('Error al guardar configuración');
        return;
      }

      toast.success('Configuración guardada');
      await fetchSettings();
      await refreshSettings();
    } catch (err) {
      console.error('Error saving:', err);
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlock = async () => {
    setIsLocked(false);
    setLockReason('');
  };

  const handleLock = async () => {
    setIsLocked(true);
    setLockReason('Bloqueo manual por administrador');
  };

  if (loading && !settings) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No se encontró configuración de la aplicación
      </div>
    );
  }

  const usagePercentage = settings.max_rows > 0 ? (settings.current_rows / settings.max_rows) * 100 : 0;
  const isNearLimit = usagePercentage >= settings.warning_threshold;
  const isAtLimit = usagePercentage >= 100;

  // Table display names
  const tableNames: Record<string, string> = {
    'vacation_requests': 'Solicitudes de vacaciones',
    'vacation_request_dates': 'Fechas de solicitudes',
    'day_exception_requests': 'Solicitudes de excepción',
    'worker_day_exceptions': 'Excepciones aprobadas',
    'work_groups': 'Grupos de trabajo',
    'work_group_teams': 'Equipos en grupos',
    'workers': 'Trabajadores',
    'worker_teams': 'Equipos',
    'worker_comments': 'Comentarios',
    'departments': 'Departamentos',
    'department_availabilities': 'Disponibilidad departamentos',
    'department_day_overrides': 'Overrides de días',
    'department_correction_requests': 'Correcciones de departamento',
    'personal_calendars': 'Calendarios personales',
    'personal_calendar_availabilities': 'Disponibilidad personal',
    'annual_calendars': 'Calendarios anuales',
    'annual_calendar_days': 'Días de calendario anual',
    'custom_day_types': 'Tipos de día personalizados',
    'group_join_requests': 'Solicitudes de grupo'
  };

  return (
    <div className="space-y-6">
      {/* Usage Overview */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Uso de la Base de Datos</CardTitle>
                <CardDescription>Estado actual del plan gratuito</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={calculateRowCount} 
                disabled={calculating}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${calculating ? 'animate-spin' : ''}`} />
                Recalcular
              </Button>
              <Badge 
                variant={isAtLimit ? "destructive" : isNearLimit ? "secondary" : "outline"}
                className="text-sm"
              >
                {isAtLimit ? "Límite alcanzado" : isNearLimit ? "Cerca del límite" : "Normal"}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Filas utilizadas</span>
              <span className="font-medium">
                {settings.current_rows.toLocaleString()} / {settings.max_rows.toLocaleString()}
              </span>
            </div>
            <Progress 
              value={Math.min(usagePercentage, 100)} 
              className={`h-3 ${isAtLimit ? '[&>div]:bg-destructive' : isNearLimit ? '[&>div]:bg-amber-500' : ''}`}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{usagePercentage.toFixed(1)}% utilizado</span>
              <span>{Math.max(0, settings.max_rows - settings.current_rows).toLocaleString()} filas disponibles</span>
            </div>
          </div>

          {/* Table counts collapsible */}
          {Object.keys(tableCounts).length > 0 && (
            <Collapsible open={showTableDetails} onOpenChange={setShowTableDetails}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground hover:text-foreground">
                  <span className="flex items-center gap-2">
                    <Table2 className="h-4 w-4" />
                    Ver desglose por tablas
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showTableDetails ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="rounded-lg border bg-muted/30 divide-y divide-border/50 max-h-64 overflow-y-auto">
                  {Object.entries(tableCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([table, count]) => (
                      <div key={table} className="flex justify-between items-center px-3 py-2 text-sm">
                        <span className="text-muted-foreground">{tableNames[table] || table}</span>
                        <span className="font-medium tabular-nums">{count.toLocaleString()}</span>
                      </div>
                    ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {isNearLimit && !isAtLimit && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">Aviso de uso</p>
                <p className="text-amber-700 dark:text-amber-300">
                  Has superado el {settings.warning_threshold}% del límite. Considera actualizar el plan.
                </p>
              </div>
            </div>
          )}

          {isAtLimit && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <Lock className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-destructive">Límite alcanzado</p>
                <p className="text-destructive/80">
                  Se ha alcanzado el límite del plan. La aplicación entrará en modo solo lectura.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lock Status */}
      <Card className={settings.is_locked ? 'border-destructive/50' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {settings.is_locked ? (
                <div className="p-2 rounded-lg bg-destructive/10">
                  <Lock className="h-5 w-5 text-destructive" />
                </div>
              ) : (
                <div className="p-2 rounded-lg bg-primary/10">
                  <Unlock className="h-5 w-5 text-primary" />
                </div>
              )}
              <div>
                <CardTitle className="text-lg">Estado de Bloqueo</CardTitle>
                <CardDescription>
                  {settings.is_locked 
                    ? 'La aplicación está en modo solo lectura'
                    : 'La aplicación funciona con normalidad'
                  }
                </CardDescription>
              </div>
            </div>
            <Badge variant={settings.is_locked ? "destructive" : "default"}>
              {settings.is_locked ? "Bloqueada" : "Activa"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {settings.is_locked && settings.lock_reason && (
            <div className="mb-4 p-3 rounded-lg bg-muted text-sm">
              <span className="text-muted-foreground">Motivo: </span>
              <span>{settings.lock_reason}</span>
            </div>
          )}
          
          <div className="flex gap-3">
            {isLocked ? (
              <Button variant="outline" onClick={handleUnlock} className="gap-2">
                <Unlock className="h-4 w-4" />
                Desbloquear aplicación
              </Button>
            ) : (
              <Button variant="destructive" onClick={handleLock} className="gap-2">
                <Lock className="h-4 w-4" />
                Bloquear aplicación
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-lg">Configuración de Límites</CardTitle>
              <CardDescription>Ajusta los umbrales y límites de la aplicación</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="maxRows">Límite máximo de filas</Label>
              <Input
                id="maxRows"
                type="number"
                value={maxRows}
                onChange={(e) => setMaxRows(parseInt(e.target.value) || 0)}
                min={1000}
                step={1000}
              />
              <p className="text-xs text-muted-foreground">
                Filas permitidas antes del bloqueo automático
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="threshold">Umbral de aviso (%)</Label>
              <Input
                id="threshold"
                type="number"
                value={warningThreshold}
                onChange={(e) => setWarningThreshold(parseInt(e.target.value) || 80)}
                min={50}
                max={99}
              />
              <p className="text-xs text-muted-foreground">
                Porcentaje a partir del cual se muestra el aviso
              </p>
            </div>
          </div>

          {isLocked && (
            <div className="space-y-2">
              <Label htmlFor="lockReason">Motivo del bloqueo</Label>
              <Input
                id="lockReason"
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                placeholder="Ej: Límite del plan gratuito alcanzado"
              />
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t">
            <Button variant="outline" onClick={fetchSettings} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Recargar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar cambios
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
