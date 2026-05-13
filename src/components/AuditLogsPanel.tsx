import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, History, Trash2, Edit, UserPlus, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AuditLog {
  id: string;
  created_at: string;
  action_type: string;
  actor_name: string;
  actor_role: string;
  entity_type: string;
  entity_id: string | null;
  entity_data: any;
  details: string;
}

interface AuditLogsPanelProps {
  sessionToken: string;
}

const AuditLogsPanel = ({ sessionToken }: AuditLogsPanelProps) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityTypeFilter, setEntityTypeFilter] = useState('all');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'getAuditLogs',
          sessionToken,
          data: {
            entityType: entityTypeFilter,
            limit: 200
          }
        }
      });

      if (error) throw error;
      if (data?.success) {
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [entityTypeFilter]);

  const getActionIcon = (actionType: string) => {
    if (actionType.includes('delete')) return <Trash2 className="h-4 w-4 text-destructive" />;
    if (actionType.includes('update')) return <Edit className="h-4 w-4 text-amber-500" />;
    if (actionType.includes('complete') || actionType.includes('create')) return <UserPlus className="h-4 w-4 text-primary" />;
    if (actionType.includes('approve')) return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (actionType.includes('reject')) return <XCircle className="h-4 w-4 text-destructive" />;
    return <History className="h-4 w-4 text-muted-foreground" />;
  };

  const getActionBadgeVariant = (actionType: string): "default" | "destructive" | "outline" | "secondary" => {
    if (actionType.includes('delete')) return 'destructive';
    if (actionType.includes('update')) return 'secondary';
    if (actionType.includes('complete') || actionType.includes('create')) return 'default';
    return 'outline';
  };

  const getActionLabel = (actionType: string) => {
    const labels: Record<string, string> = {
      'delete_vacation_request': 'Solicitud eliminada',
      'update_vacation_request': 'Solicitud modificada',
      'delete_group_join_request': 'Solicitud de grupo eliminada',
      'complete_group_join_request': 'Trabajador incorporado',
      'create_worker': 'Trabajador creado',
      'update_worker': 'Trabajador modificado',
      'delete_worker': 'Trabajador eliminado',
      'create_department': 'Departamento creado',
      'update_department': 'Departamento modificado',
      'delete_department': 'Departamento eliminado',
    };
    return labels[actionType] || actionType.replace(/_/g, ' ');
  };

  const getEntityTypeLabel = (entityType: string) => {
    const labels: Record<string, string> = {
      'vacation_request': 'Solicitud de vacaciones',
      'group_join_request': 'Solicitud de grupo',
      'worker': 'Trabajador',
      'department': 'Departamento',
      'manager': 'Encargado',
    };
    return labels[entityType] || entityType;
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5 text-primary" />
            Historial de auditoría
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Filtrar por tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="vacation_request">Solicitudes de vacaciones</SelectItem>
                <SelectItem value="group_join_request">Solicitudes de grupo</SelectItem>
                <SelectItem value="worker">Trabajadores</SelectItem>
                <SelectItem value="department">Departamentos</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={fetchLogs}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No hay registros de auditoría</p>
          </div>
        ) : (
          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="p-4 rounded-lg border border-border/50 bg-card hover:bg-accent/5 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {getActionIcon(log.action_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant={getActionBadgeVariant(log.action_type)} className="text-xs">
                          {getActionLabel(log.action_type)}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {getEntityTypeLabel(log.entity_type)}
                        </Badge>
                      </div>
                      <p className="text-sm text-foreground mb-1">{log.details}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium">{log.actor_name}</span>
                        <span>•</span>
                        <span className="capitalize">{log.actor_role}</span>
                        <span>•</span>
                        <span>
                          {format(new Date(log.created_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                        </span>
                      </div>
                      {log.entity_data && (
                        <details className="mt-2">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                            Ver datos
                          </summary>
                          <pre className="mt-2 p-2 rounded bg-muted text-xs overflow-x-auto">
                            {JSON.stringify(log.entity_data, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default AuditLogsPanel;