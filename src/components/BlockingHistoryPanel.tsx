import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Lock, Unlock, RefreshCw, Calendar, Users, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface BlockingLog {
  id: string;
  created_at: string;
  action_type: string;
  actor_name: string;
  actor_role: string;
  entity_type: string;
  entity_id: string | null;
  entity_data: {
    date?: string;
    department_id?: string;
    department_name?: string;
    reason?: string;
    is_unblocked?: boolean;
  } | null;
  details: string;
}

interface BlockingHistoryPanelProps {
  sessionToken: string;
  departmentId?: string;
}

const BlockingHistoryPanel = ({ sessionToken, departmentId }: BlockingHistoryPanelProps) => {
  const [logs, setLogs] = useState<BlockingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [departmentFilter, setDepartmentFilter] = useState(departmentId || 'all');
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  const fetchDepartments = async () => {
    try {
      const { data } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'getDepartments',
          sessionToken
        }
      });

      if (data?.success) {
        setDepartments(data.departments || []);
      }
    } catch (err) {
      console.error('Error fetching departments:', err);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-operations', {
        body: {
          action: 'getAuditLogs',
          sessionToken,
          data: {
            entityType: 'day_blocking',
            departmentId: departmentFilter !== 'all' ? departmentFilter : undefined,
            limit: 200
          }
        }
      });

      if (error) throw error;
      if (data?.success) {
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Error fetching blocking logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [departmentFilter]);

  const getActionIcon = (actionType: string) => {
    if (actionType.includes('block') && !actionType.includes('unblock')) {
      return <Lock className="h-4 w-4 text-destructive" />;
    }
    if (actionType.includes('unblock')) {
      return <Unlock className="h-4 w-4 text-green-500" />;
    }
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  const getActionBadgeVariant = (actionType: string): "default" | "destructive" | "outline" | "secondary" => {
    if (actionType.includes('block') && !actionType.includes('unblock')) return 'destructive';
    if (actionType.includes('unblock')) return 'default';
    return 'outline';
  };

  const getActionLabel = (actionType: string) => {
    const labels: Record<string, string> = {
      'day_blocked': 'Día bloqueado',
      'day_unblocked': 'Día desbloqueado',
      'day_blocked_auto': 'Bloqueo automático',
      'day_unblocked_manual': 'Desbloqueo manual',
    };
    return labels[actionType] || actionType.replace(/_/g, ' ');
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "EEEE d 'de' MMMM yyyy", { locale: es });
    } catch {
      return dateStr;
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="h-5 w-5 text-primary" />
            Historial de bloqueos
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder="Filtrar por departamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los departamentos</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name}
                  </SelectItem>
                ))}
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
            <Lock className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No hay historial de bloqueos</p>
            <p className="text-sm mt-1">Los bloqueos y desbloqueos de días aparecerán aquí</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
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
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <Badge variant={getActionBadgeVariant(log.action_type)} className="text-xs">
                          {getActionLabel(log.action_type)}
                        </Badge>
                        {log.entity_data?.department_name && (
                          <Badge variant="outline" className="text-xs flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {log.entity_data.department_name}
                          </Badge>
                        )}
                      </div>
                      
                      {log.entity_data?.date && (
                        <div className="flex items-center gap-2 text-sm text-foreground mb-1">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="capitalize">{formatDate(log.entity_data.date)}</span>
                        </div>
                      )}
                      
                      <p className="text-sm text-muted-foreground mb-2">{log.details}</p>
                      
                      {log.entity_data?.reason && (
                        <p className="text-xs text-muted-foreground italic">
                          Razón: {log.entity_data.reason}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                        <span className="font-medium">{log.actor_name}</span>
                        <span>•</span>
                        <span className="capitalize">{log.actor_role}</span>
                        <span>•</span>
                        <span>
                          {format(new Date(log.created_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                        </span>
                      </div>
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

export default BlockingHistoryPanel;
