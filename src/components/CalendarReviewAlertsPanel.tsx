import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { AlertTriangle, Check, Calendar, User, Building, Loader2, RefreshCw, CheckCheck } from "lucide-react";

type CalendarReviewAlert = {
  id: string;
  worker_id: string;
  department_id: string;
  worker_number: string;
  worker_name: string;
  reason: string;
  is_resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  department_name?: string;
};

type CalendarReviewAlertsPanelProps = {
  getSessionToken: () => string | null;
  onAlertResolved?: () => void;
};

export const CalendarReviewAlertsPanel = ({ 
  getSessionToken,
  onAlertResolved 
}: CalendarReviewAlertsPanelProps) => {
  const [alerts, setAlerts] = useState<CalendarReviewAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());
  const [resolvingAll, setResolvingAll] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  const fetchAlerts = async () => {
    const sessionToken = getSessionToken();
    if (!sessionToken) return;

    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('admin-operations', {
        body: { action: 'getCalendarReviewAlerts', sessionToken }
      });

      if (data?.success) {
        setAlerts(data.alerts || []);
      }
    } catch (error) {
      console.error('Error fetching calendar review alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const handleResolve = async (alertId: string) => {
    const sessionToken = getSessionToken();
    if (!sessionToken) return;

    setResolvingIds(prev => new Set(prev).add(alertId));

    try {
      const { data } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'resolveCalendarReviewAlert',
          sessionToken,
          data: { alertId }
        }
      });

      if (data?.success) {
        toast.success('Alerta resuelta correctamente');
        setAlerts(prev => prev.map(a => 
          a.id === alertId 
            ? { ...a, is_resolved: true, resolved_at: new Date().toISOString(), resolved_by: 'Admin' }
            : a
        ));
        onAlertResolved?.();
      } else {
        toast.error(data?.error || 'Error al resolver la alerta');
      }
    } catch (error) {
      toast.error('Error al resolver la alerta');
    } finally {
      setResolvingIds(prev => {
        const next = new Set(prev);
        next.delete(alertId);
        return next;
      });
    }
  };

  const handleResolveAll = async () => {
    const sessionToken = getSessionToken();
    if (!sessionToken) return;

    const pendingIds = pendingAlerts.map(a => a.id);
    if (pendingIds.length === 0) return;

    setResolvingAll(true);

    try {
      const { data } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'resolveAllCalendarReviewAlerts',
          sessionToken,
          data: { alertIds: pendingIds }
        }
      });

      if (data?.success) {
        toast.success(`${data.resolvedCount || pendingIds.length} alertas resueltas correctamente`);
        setAlerts(prev => prev.map(a => 
          pendingIds.includes(a.id)
            ? { ...a, is_resolved: true, resolved_at: new Date().toISOString(), resolved_by: 'Admin' }
            : a
        ));
        onAlertResolved?.();
      } else {
        toast.error(data?.error || 'Error al resolver las alertas');
      }
    } catch (error) {
      toast.error('Error al resolver las alertas');
    } finally {
      setResolvingAll(false);
    }
  };

  const pendingAlerts = alerts.filter(a => !a.is_resolved);
  const resolvedAlerts = alerts.filter(a => a.is_resolved);
  const displayedAlerts = showResolved ? resolvedAlerts : pendingAlerts;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p>Cargando alertas...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col max-h-[calc(100vh-250px)]">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between space-y-0 pb-4 shrink-0">
        <div>
          <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
            <Calendar className="h-5 w-5 text-amber-500" />
            Revisión de Calendarios
            {pendingAlerts.length > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {pendingAlerts.length} pendiente{pendingAlerts.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Empleados que requieren revisión de su calendario de vacaciones
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!showResolved && pendingAlerts.length > 0 && (
            <Button
              variant="default"
              size="sm"
              onClick={handleResolveAll}
              disabled={resolvingAll}
              className="gap-1"
            >
              {resolvingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="h-4 w-4" />
              )}
              Resolver todas ({pendingAlerts.length})
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAlerts}
            className="gap-1"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </Button>
          <Button
            variant={showResolved ? "default" : "outline"}
            size="sm"
            onClick={() => setShowResolved(!showResolved)}
            className="gap-1"
          >
            {showResolved ? "Ver pendientes" : `Ver resueltas (${resolvedAlerts.length})`}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden pb-4">
        {displayedAlerts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {showResolved 
              ? "No hay alertas resueltas" 
              : "No hay alertas pendientes de revisión"}
          </div>
        ) : (
          <ScrollArea className="h-full pr-4">
            <div className="space-y-3">
              {displayedAlerts.map(alert => (
                <div 
                  key={alert.id}
                  className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                    alert.is_resolved 
                      ? 'bg-muted/20 border-border/30' 
                      : 'bg-amber-500/10 border-amber-500/30'
                  }`}
                >
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <User className={`h-4 w-4 ${alert.is_resolved ? 'text-muted-foreground' : 'text-amber-500'}`} />
                      <span className={`font-mono text-sm font-medium ${alert.is_resolved ? 'text-muted-foreground' : 'text-amber-400'}`}>
                        {alert.worker_number}
                      </span>
                      <span className={`font-medium ${alert.is_resolved ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {alert.worker_name}
                      </span>
                      {alert.department_name && (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <Building className="h-3 w-3" />
                          {alert.department_name}
                        </Badge>
                      )}
                    </div>
                    <p className={`text-sm ${alert.is_resolved ? 'text-muted-foreground' : 'text-amber-500/80'}`}>
                      {alert.reason}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Creada: {format(new Date(alert.created_at), "d 'de' MMMM 'a las' HH:mm", { locale: es })}
                      {alert.is_resolved && alert.resolved_at && (
                        <>
                          {' · '}Resuelta: {format(new Date(alert.resolved_at), "d 'de' MMMM 'a las' HH:mm", { locale: es })}
                          {alert.resolved_by && ` por ${alert.resolved_by}`}
                        </>
                      )}
                    </p>
                  </div>

                  {!alert.is_resolved && (
                    <Button
                      size="sm"
                      onClick={() => handleResolve(alert.id)}
                      disabled={resolvingIds.has(alert.id) || resolvingAll}
                      className="gap-1 shrink-0 ml-4"
                    >
                      {resolvingIds.has(alert.id) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Calendario revisado
                    </Button>
                  )}

                  {alert.is_resolved && (
                    <Badge variant="secondary" className="gap-1 shrink-0 ml-4">
                      <Check className="h-3 w-3" />
                      Resuelto
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default CalendarReviewAlertsPanel;
