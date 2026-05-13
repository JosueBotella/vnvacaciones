import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  UserMinus,
  RotateCcw,
  Trash2,
  Loader2,
  History,
  Calendar,
  User,
  Building2,
  Users,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useLanguage } from "@/hooks/useLanguage";

type Department = {
  id: string;
  name: string;
};

type DeletedWorker = {
  id: string;
  worker_number: string;
  name: string;
  email: string | null;
  department_id: string;
  deleted_at: string;
  deleted_by: string | null;
  deletion_reason: string | null;
  departments: { name: string } | null;
  worker_teams: { name: string } | null;
};

type Props = {
  departments: Department[];
  getSessionToken: () => string | null;
  onWorkerRestored?: () => void;
};

export default function DeletedWorkersHistoryPanel({
  departments,
  getSessionToken,
  onWorkerRestored,
}: Props) {
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(true);
  const [deletedWorkers, setDeletedWorkers] = useState<DeletedWorker[]>([]);
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState<string>("all");
  const [processingWorkerId, setProcessingWorkerId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    type: "restore" | "permanent_delete";
    worker: DeletedWorker;
  } | null>(null);

  const fetchDeletedWorkers = useCallback(async () => {
    const sessionToken = getSessionToken();
    if (!sessionToken) return;

    setIsLoading(true);
    try {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "getDeletedWorkers",
          sessionToken,
          data: selectedDepartmentFilter !== "all" ? { departmentId: selectedDepartmentFilter } : {},
        },
      });

      if (data?.success) {
        setDeletedWorkers(data.deletedWorkers || []);
      } else {
        toast.error("Error al cargar historial de bajas");
      }
    } catch (err) {
      console.error("Error fetching deleted workers:", err);
      toast.error("Error de conexión");
    } finally {
      setIsLoading(false);
    }
  }, [getSessionToken, selectedDepartmentFilter]);

  useEffect(() => {
    fetchDeletedWorkers();
  }, [fetchDeletedWorkers]);

  const handleRestore = async (worker: DeletedWorker) => {
    const sessionToken = getSessionToken();
    if (!sessionToken) return;

    setProcessingWorkerId(worker.id);
    try {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "restoreWorker",
          sessionToken,
          data: { workerId: worker.id },
        },
      });

      if (data?.success) {
        toast.success(`${worker.name} restaurado correctamente`);
        setDeletedWorkers((prev) => prev.filter((w) => w.id !== worker.id));
        onWorkerRestored?.();
      } else {
        toast.error(data?.error || "Error al restaurar trabajador");
      }
    } catch (err) {
      console.error("Error restoring worker:", err);
      toast.error("Error de conexión");
    } finally {
      setProcessingWorkerId(null);
      setConfirmDialog(null);
    }
  };

  const handlePermanentDelete = async (worker: DeletedWorker) => {
    const sessionToken = getSessionToken();
    if (!sessionToken) return;

    setProcessingWorkerId(worker.id);
    try {
      const { data } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "permanentlyDeleteWorker",
          sessionToken,
          data: { workerId: worker.id },
        },
      });

      if (data?.success) {
        toast.success(`${worker.name} eliminado permanentemente`);
        setDeletedWorkers((prev) => prev.filter((w) => w.id !== worker.id));
      } else {
        toast.error(data?.error || "Error al eliminar trabajador");
      }
    } catch (err) {
      console.error("Error permanently deleting worker:", err);
      toast.error("Error de conexión");
    } finally {
      setProcessingWorkerId(null);
      setConfirmDialog(null);
    }
  };

  const filteredWorkers = deletedWorkers.filter((w) =>
    selectedDepartmentFilter === "all" ? true : w.department_id === selectedDepartmentFilter
  );

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          Historial de Bajas
        </CardTitle>
        <CardDescription>
          Trabajadores dados de baja que pueden ser restaurados
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm text-muted-foreground mb-1.5 block">
              Departamento
            </label>
            <Select
              value={selectedDepartmentFilter}
              onValueChange={setSelectedDepartmentFilter}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos los departamentos" />
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
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchDeletedWorkers}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              <span className="ml-2">Actualizar</span>
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-2">
          <Badge variant="outline" className="bg-red-500/10 text-red-500">
            <UserMinus className="w-3 h-3 mr-1" />
            {filteredWorkers.length} trabajador(es) en historial
          </Badge>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredWorkers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>No hay trabajadores dados de baja</p>
          </div>
        ) : (
          <div className="rounded-md border max-h-[500px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-background sticky top-0 z-10 border-b">
                <tr>
                  <th className="p-3 text-left font-medium">Nº</th>
                  <th className="p-3 text-left font-medium">Nombre</th>
                  <th className="p-3 text-left font-medium">Departamento</th>
                  <th className="p-3 text-left font-medium">Fecha de baja</th>
                  <th className="p-3 text-left font-medium">Motivo</th>
                  <th className="p-3 text-left font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkers.map((worker) => (
                  <tr key={worker.id} className="border-t">
                    <td className="p-3 font-mono">
                      <a
                        href={`https://salix.verdnatura.es/#!/worker/${worker.worker_number}/summary`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1"
                      >
                        {worker.worker_number}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col">
                        <span className="font-medium">{worker.name}</span>
                        {worker.email && (
                          <span className="text-xs text-muted-foreground">
                            {worker.email}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3 h-3 text-muted-foreground" />
                        {worker.departments?.name || "—"}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3 h-3 text-muted-foreground" />
                        <div className="flex flex-col">
                          <span>
                            {format(new Date(worker.deleted_at), "dd MMM yyyy", {
                              locale: es,
                            })}
                          </span>
                          {worker.deleted_by && (
                            <span className="text-xs text-muted-foreground">
                              por {worker.deleted_by}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="text-muted-foreground text-sm">
                        {worker.deletion_reason || "—"}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setConfirmDialog({ type: "restore", worker })
                          }
                          disabled={processingWorkerId === worker.id}
                          className="gap-1 text-green-600 hover:text-green-700 hover:bg-green-500/10"
                        >
                          {processingWorkerId === worker.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3 h-3" />
                          )}
                          Restaurar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setConfirmDialog({ type: "permanent_delete", worker })
                          }
                          disabled={processingWorkerId === worker.id}
                          className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Confirmation Dialogs */}
        <AlertDialog
          open={confirmDialog !== null}
          onOpenChange={() => setConfirmDialog(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmDialog?.type === "restore"
                  ? "¿Restaurar trabajador?"
                  : "¿Eliminar permanentemente?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmDialog?.type === "restore" ? (
                  <>
                    Se restaurará a <strong>{confirmDialog?.worker.name}</strong> (
                    {confirmDialog?.worker.worker_number}) al sistema. Podrá volver
                    a aparecer en la gestión de grupos y solicitar vacaciones.
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-medium">Esta acción es irreversible</span>
                    </div>
                    <p>
                      Se eliminará permanentemente a{" "}
                      <strong>{confirmDialog?.worker.name}</strong> (
                      {confirmDialog?.worker.worker_number}) del sistema. No podrá
                      ser recuperado.
                    </p>
                  </div>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (confirmDialog?.type === "restore") {
                    handleRestore(confirmDialog.worker);
                  } else if (confirmDialog?.type === "permanent_delete") {
                    handlePermanentDelete(confirmDialog.worker);
                  }
                }}
                className={
                  confirmDialog?.type === "permanent_delete"
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    : ""
                }
              >
                {confirmDialog?.type === "restore"
                  ? "Restaurar"
                  : "Eliminar permanentemente"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
