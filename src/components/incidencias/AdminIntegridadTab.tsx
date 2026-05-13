import { useState, useEffect } from "react";
import { Shield, HardDrive, FileWarning, Trash2, Clock, RefreshCw, Undo2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface StorageStats {
  totalFiles: number;
  totalSizeMB: number;
  orphanCount: number;
  orphanFiles: string[];
  deletedCount: number;
  recentLogs: Array<{
    id: string;
    action_type: string;
    actor_name: string;
    details: string | null;
    created_at: string;
  }>;
}

interface DeletedRecord {
  id: string;
  fecha: string;
  descripcion: string | null;
  deleted_at: string;
  workers: string[];
  department_name: string;
}

export function AdminIntegridadTab() {
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [deleted, setDeleted] = useState<DeletedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleted, setShowDeleted] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "getStorageStats", sessionToken },
      });
      if (data?.success) {
        setStats({
          totalFiles: data.totalFiles,
          totalSizeMB: data.totalSizeMB,
          orphanCount: data.orphanCount,
          orphanFiles: data.orphanFiles || [],
          deletedCount: data.deletedCount,
          recentLogs: data.recentLogs || [],
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchDeleted = async () => {
    const { data } = await supabase.functions.invoke("incidencias-operations", {
      body: { action: "listDeletedIncidencias", sessionToken },
    });
    if (data?.success) setDeleted(data.records || []);
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (showDeleted) fetchDeleted();
  }, [showDeleted]);

  const handleRestore = async (recordId: string) => {
    setRestoring(recordId);
    try {
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "restoreIncidencia", sessionToken, recordId },
      });
      if (data?.success) {
        toast.success("Incidencia restaurada");
        fetchDeleted();
        fetchStats();
      } else {
        toast.error(data?.error || "Error al restaurar");
      }
    } catch {
      toast.error("Error al restaurar");
    } finally {
      setRestoring(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-semibold">Integridad del sistema</h2>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStats} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <HardDrive className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.totalFiles || 0}</p>
                <p className="text-xs text-muted-foreground">Evidencias</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {stats?.totalSizeMB || 0} MB almacenados
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${(stats?.orphanCount || 0) > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
                <FileWarning className={`h-5 w-5 ${(stats?.orphanCount || 0) > 0 ? 'text-amber-500' : 'text-emerald-500'}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.orphanCount || 0}</p>
                <p className="text-xs text-muted-foreground">Huérfanos</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {(stats?.orphanCount || 0) === 0 ? 'Sin archivos sin referencia' : 'Archivos sin incidencia asociada'}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.deletedCount || 0}</p>
                <p className="text-xs text-muted-foreground">Eliminadas</p>
              </div>
            </div>
            {(stats?.deletedCount || 0) > 0 && (
              <Button variant="ghost" size="sm" className="text-xs p-0 h-auto" onClick={() => setShowDeleted(!showDeleted)}>
                {showDeleted ? 'Ocultar' : 'Ver / restaurar'}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.recentLogs?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Logs recientes</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">Últimas acciones</p>
          </CardContent>
        </Card>
      </div>

      {/* Deleted records */}
      {showDeleted && deleted.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              Incidencias eliminadas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {deleted.map(r => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{r.workers.join(', ') || 'Sin trabajadores'}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.department_name} · {new Date(r.fecha).toLocaleDateString('es-ES')}</p>
                  {r.descripcion && <p className="text-xs text-muted-foreground truncate mt-0.5">{r.descripcion}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary" className="text-[10px]">
                    Eliminada {new Date(r.deleted_at).toLocaleDateString('es-ES')}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={restoring === r.id}
                    onClick={() => handleRestore(r.id)}
                  >
                    {restoring === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                    Restaurar
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent audit logs */}
      {(stats?.recentLogs?.length || 0) > 0 && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Últimos logs de auditoría
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {stats!.recentLogs.map(log => (
                <div key={log.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{log.action_type}</Badge>
                      <span className="text-xs text-muted-foreground">{log.actor_name}</span>
                    </div>
                    {log.details && <p className="text-xs text-muted-foreground mt-0.5 truncate">{log.details}</p>}
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
