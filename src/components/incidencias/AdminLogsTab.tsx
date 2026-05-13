import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Loader2, Filter, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  crear_incidencia: { label: "Crear", color: "#3b82f6" },
  evaluar_ia: { label: "IA", color: "#8b5cf6" },
  editar_admin: { label: "Editar", color: "#f59e0b" },
  aprobar_propuesta: { label: "Aprobar", color: "#93d600" },
  rechazar_propuesta: { label: "Rechazar", color: "#ef4444" },
  enviar_email: { label: "Email", color: "#06b6d4" },
  solicitud_edicion: { label: "Sol. edición", color: "#f97316" },
  solicitud_borrado: { label: "Sol. borrado", color: "#dc2626" },
  regenerar_borrador: { label: "Regenerar", color: "#a855f7" },
};

const ACTION_OPTIONS = Object.entries(ACTION_LABELS).map(([k, v]) => ({ value: k, label: v.label }));

export function AdminLogsTab() {
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [actorFilter, setActorFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async (offset = 0, append = false) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "listIncidenciasLogs",
          sessionToken,
          limit: 50,
          offset,
          actionType: actionFilter !== "all" ? actionFilter : undefined,
          actorName: actorFilter || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
      });
      const newLogs = data?.logs || [];
      if (append) setLogs(prev => [...prev, ...newLogs]);
      else setLogs(newLogs);
      setHasMore(newLogs.length >= 50);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [sessionToken, actionFilter, actorFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Filter className="h-5 w-5 text-primary" /> Logs de Incidencias
        </h2>
        <Button variant="outline" size="sm" onClick={() => load()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refrescar
        </Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="rounded-xl"><SelectValue placeholder="Acción" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {ACTION_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Actor..." value={actorFilter} onChange={e => setActorFilter(e.target.value)} className="rounded-xl" />
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="rounded-xl" placeholder="Desde" />
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="rounded-xl" placeholder="Hasta" />
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : logs.length === 0 ? (
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground">Sin logs</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {logs.map((log: any) => {
            const actionInfo = ACTION_LABELS[log.action_type] || { label: log.action_type, color: '#6b7280' };
            const isExpanded = expandedId === log.id;
            return (
              <Card key={log.id} className="rounded-2xl border-border/50">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="text-[10px] px-2 py-0.5 shrink-0" style={{ backgroundColor: actionInfo.color + '20', color: actionInfo.color }}>
                      {actionInfo.label}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{log.actor_name} <span className="text-muted-foreground font-normal">({log.actor_role})</span></p>
                      {log.details && <p className="text-xs text-muted-foreground truncate">{log.details}</p>}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: es })}
                    </span>
                    {log.cambios_json && (
                      <button onClick={() => setExpandedId(isExpanded ? null : log.id)} className="p-1 text-muted-foreground">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                  {isExpanded && log.cambios_json && (
                    <pre className="mt-2 p-2 bg-muted/50 rounded-lg text-xs overflow-x-auto">{JSON.stringify(log.cambios_json, null, 2)}</pre>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {hasMore && (
            <Button variant="outline" onClick={() => load(logs.length, true)} disabled={loadingMore} className="w-full h-10 rounded-xl">
              {loadingMore ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Cargar más
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
