import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Download, 
  RefreshCw, 
  Calendar, 
  Database, 
  FileJson, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Loader2,
  HardDrive,
  Play
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface BackupRecord {
  id: string;
  backup_date: string;
  file_name: string;
  file_size_bytes: number | null;
  tables_count: number | null;
  total_records: number | null;
  storage_files_count: number | null;
  status: "completed" | "failed" | "in_progress";
  error_message: string | null;
  download_url: string | null;
  expires_at: string | null;
  triggered_by: string | null;
  created_at: string;
}

interface BackupPanelProps {
  sessionToken: string;
}

export function BackupPanel({ sessionToken }: BackupPanelProps) {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningBackup, setRunningBackup] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const fetchBackups = async () => {
    try {
      const { data: response, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "getBackupHistory",
          sessionToken,
          data: {}
        }
      });

      if (error || !response?.success) {
        console.error("Error fetching backups:", error || response?.error);
        return;
      }

      setBackups(response.backups || []);
    } catch (err) {
      console.error("Error fetching backups:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, [sessionToken]);

  const runManualBackup = async () => {
    if (runningBackup) return;

    setRunningBackup(true);
    toast.info("Iniciando backup manual...");

    try {
      const { data: response, error } = await supabase.functions.invoke("daily-backup", {
        body: {
          triggered_by: "manual",
        }
      });

      if (error) {
        throw error;
      }

      if (response?.success) {
        toast.success(`Backup completado: ${response.total_records?.toLocaleString()} registros exportados`);
        fetchBackups();
      } else {
        throw new Error(response?.error || "Error desconocido");
      }
    } catch (err) {
      console.error("Error running backup:", err);
      toast.error("Error al ejecutar el backup");
    } finally {
      setRunningBackup(false);
    }
  };

  const downloadFile = async (url: string, fileName: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error("Error al descargar el archivo");
    }
  };

  const handleDownload = async (backup: BackupRecord) => {
    setRegeneratingId(backup.id);
    try {
      // Always regenerate to get a fresh URL
      const { data: response, error } = await supabase.functions.invoke("admin-operations", {
        body: { action: "regenerateBackupUrl", sessionToken, data: { file_name: backup.file_name } }
      });
      if (error || !response?.success) throw new Error(response?.error || "Error");
      setBackups(prev => prev.map(b => b.id === backup.id 
        ? { ...b, download_url: response.download_url, expires_at: response.expires_at } 
        : b
      ));
      await downloadFile(response.download_url, backup.file_name);
    } catch (err) {
      console.error("Error downloading backup:", err);
      toast.error("Error al descargar el backup");
    } finally {
      setRegeneratingId(null);
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const isUrlExpired = (expiresAt: string | null) => {
    if (!expiresAt) return true;
    return new Date(expiresAt) < new Date();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-green-500/10 text-green-600 border-green-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            Completado
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Fallido
          </Badge>
        );
      case "in_progress":
        return (
          <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-200">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            En progreso
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Calculate stats
  const lastSuccessfulBackup = backups.find(b => b.status === "completed");
  const totalBackups = backups.filter(b => b.status === "completed").length;
  const failedBackups = backups.filter(b => b.status === "failed").length;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Último backup</p>
                <p className="font-semibold">
                  {lastSuccessfulBackup 
                    ? formatDistanceToNow(new Date(lastSuccessfulBackup.created_at), { addSuffix: true, locale: es })
                    : "Nunca"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Database className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Registros respaldados</p>
                <p className="font-semibold">
                  {lastSuccessfulBackup?.total_records?.toLocaleString() || "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <HardDrive className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tamaño último backup</p>
                <p className="font-semibold">
                  {formatFileSize(lastSuccessfulBackup?.file_size_bytes ?? null)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <FileJson className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total backups</p>
                <p className="font-semibold">
                  {totalBackups} completados
                  {failedBackups > 0 && (
                    <span className="text-destructive text-xs ml-1">({failedBackups} fallidos)</span>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Gestión de Backups</CardTitle>
              <CardDescription>
                Copias de seguridad diarias automáticas a las 3:00 AM
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchBackups}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
              <Button
                size="sm"
                onClick={runManualBackup}
                disabled={runningBackup}
                className="bg-primary hover:bg-primary-hover"
              >
                {runningBackup ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Ejecutar backup manual
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No hay backups registrados</p>
              <p className="text-sm">Ejecuta un backup manual para comenzar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {backups.map((backup) => (
                <div
                  key={backup.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-muted">
                      <FileJson className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{backup.file_name}</p>
                        {getStatusBadge(backup.status)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(backup.created_at), "d MMM yyyy, HH:mm", { locale: es })}
                        </span>
                        {backup.tables_count && (
                          <span>{backup.tables_count} tablas</span>
                        )}
                        {backup.total_records && (
                          <span>{backup.total_records.toLocaleString()} registros</span>
                        )}
                        <span>{formatFileSize(backup.file_size_bytes)}</span>
                        <Badge variant="outline" className="text-xs">
                          {backup.triggered_by === "manual" ? "Manual" : "Automático"}
                        </Badge>
                      </div>
                      {backup.error_message && (
                        <p className="text-xs text-destructive mt-1">{backup.error_message}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {backup.status === "completed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(backup)}
                        disabled={regeneratingId === backup.id}
                      >
                        {regeneratingId === backup.id ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        Descargar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-muted/50 border-dashed">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div className="text-sm">
              <p className="font-medium mb-1">Información sobre los backups</p>
              <ul className="text-muted-foreground space-y-1">
                <li>• Los backups se ejecutan automáticamente cada día a las 3:00 AM</li>
                <li>• Incluyen todas las tablas de la base de datos en formato JSON</li>
                <li>• Los enlaces de descarga son válidos durante 24 horas</li>
                <li>• Los backups antiguos (+30 días) se eliminan automáticamente</li>
                <li>• Los archivos de storage (justificantes, assets) se listan pero no se copian físicamente</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
