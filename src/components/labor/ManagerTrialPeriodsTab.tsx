import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Search, AlertTriangle, Clock, ExternalLink, Loader2, History, CheckCircle2, XCircle, Send, HourglassIcon } from "lucide-react";
import { DeptPills } from "@/components/DeptPills";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { calculateTrialPeriod, formatTrialPeriodDisplay } from "@/lib/trialPeriod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Worker = {
  id: string;
  name: string;
  worker_number: string;
  department_id: string;
  department_name?: string;
  worker_team_name?: string;
  work_group_name?: string;
  start_contract_date: string | null;
};

type Department = {
  id: string;
  name: string;
};

type Props = {
  workers: Worker[];
  departments: Department[];
  loading: boolean;
  sessionToken?: string;
  externalSelectedDepartment?: string;
};

export const ManagerTrialPeriodsTab = ({ workers, departments, loading, sessionToken, externalSelectedDepartment }: Props) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);
  const [selectedDepartmentInternal, setSelectedDepartmentInternal] = useState<string>("all");

  const selectedDepartment = externalSelectedDepartment || selectedDepartmentInternal;
  const setSelectedDepartment = setSelectedDepartmentInternal;
  const [nsppDialog, setNsppDialog] = useState<{ worker: any } | null>(null);
  const [nsppJustificacion, setNsppJustificacion] = useState("");
  const [nsppLoading, setNsppLoading] = useState(false);
  const [nsppHistory, setNsppHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Keep selected department valid when department list changes
  useEffect(() => {
    if (externalSelectedDepartment) return;
    if (selectedDepartmentInternal === "all") return;
    if (departments.length > 0 && !departments.find((d) => d.id === selectedDepartment)) {
      setSelectedDepartment("all");
    }
  }, [departments, selectedDepartment]);

  const loadNsppHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const sess = sessionToken || localStorage.getItem("manager_session_token") || "";
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: { action: "listManagerNSPP", sessionToken: sess },
      });
      setNsppHistory(data?.propuestas || []);
    } catch {
      // silent
    } finally {
      setHistoryLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => { loadNsppHistory(); }, [loadNsppHistory]);

  const handleNsppSubmit = async () => {
    if (!nsppDialog || !nsppJustificacion.trim()) return;
    setNsppLoading(true);
    try {
      const sess = sessionToken || localStorage.getItem("manager_session_token") || "";
      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "createNSPPPropuesta",
          sessionToken: sess,
          departmentId: nsppDialog.worker.department_id,
          workerName: nsppDialog.worker.name,
          workerNumber: nsppDialog.worker.worker_number,
          startContractDate: nsppDialog.worker.start_contract_date,
          daysRemaining: nsppDialog.worker.trialPeriod?.daysRemaining ?? null,
          justificacion: nsppJustificacion,
        },
      });
      if (data?.success) {
        toast.success("Propuesta NSPP enviada correctamente");
        setNsppDialog(null);
        setNsppJustificacion("");
        loadNsppHistory();
      } else {
        toast.error(data?.error || "Error al enviar la propuesta");
      }
    } catch {
      toast.error("Error al enviar la propuesta NSPP");
    } finally {
      setNsppLoading(false);
    }
  };

  // Filter workers in trial period and calculate remaining days
  const workersInTrialPeriod = useMemo(() => {
    return workers
      .map((worker) => {
        const trialPeriod = calculateTrialPeriod(worker.start_contract_date);
        return {
          ...worker,
          trialPeriod,
        };
      })
      .filter((w) => w.trialPeriod?.isInTrialPeriod)
      .sort((a, b) => (a.trialPeriod?.daysRemaining || 0) - (b.trialPeriod?.daysRemaining || 0));
  }, [workers]);

  // Get workers for selected department
  const getWorkersForDepartment = (deptId: string) => {
    return workersInTrialPeriod.filter(w => w.department_id === deptId);
  };

  // Apply filters for current department
  const getFilteredWorkers = (deptId: string) => {
    let result = getWorkersForDepartment(deptId);

    // Critical filter
    if (showCriticalOnly) {
      result = result.filter((w) => w.trialPeriod?.isCritical);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (w) =>
          w.name.toLowerCase().includes(query) ||
          w.worker_number.toLowerCase().includes(query)
      );
    }

    return result;
  };

  const getAllFilteredWorkers = () => {
    let result = [...workersInTrialPeriod];
    if (showCriticalOnly) {
      result = result.filter((w) => w.trialPeriod?.isCritical);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (w) =>
          w.name.toLowerCase().includes(query) ||
          w.worker_number.toLowerCase().includes(query)
      );
    }
    return result;
  };

  // Calculate counts per department
  const getDepartmentCounts = (deptId: string) => {
    const deptWorkers = getWorkersForDepartment(deptId);
    return {
      total: deptWorkers.length,
      critical: deptWorkers.filter(w => w.trialPeriod?.isCritical).length,
    };
  };

  // Total counts
  const totalCounts = useMemo(() => ({
    total: workersInTrialPeriod.length,
    critical: workersInTrialPeriod.filter(w => w.trialPeriod?.isCritical).length,
  }), [workersInTrialPeriod]);

  const deptCounts = useMemo(() => {
    const result: Record<string, number> = {};
    departments.forEach(d => {
      result[d.id] = getDepartmentCounts(d.id).total;
    });
    return result;
  }, [departments, workersInTrialPeriod]);

  if (loading) {
    return (
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Periodo Prueba
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderWorkerTable = (deptId: string | "all") => {
    const filteredWorkers = deptId === "all" ? getAllFilteredWorkers() : getFilteredWorkers(deptId);
    const counts = deptId === "all"
      ? { total: workersInTrialPeriod.length, critical: totalCounts.critical }
      : getDepartmentCounts(deptId);

    return (
      <div className="space-y-3">
        {/* Department header - minimal (hide when showing all) */}
        {deptId !== "all" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <h3 className="font-medium text-foreground">
              {departments.find(d => d.id === deptId)?.name}
            </h3>
            <span className="text-xs">{counts.total} trab.</span>
            {counts.critical > 0 && (
              <span className="text-xs text-destructive">{counts.critical} crítico{counts.critical !== 1 ? "s" : ""}</span>
            )}
          </div>
        )}

        {/* Search and filters */}
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1 sm:max-w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setShowCriticalOnly(false)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                !showCriticalOnly
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              Todos ({counts.total})
            </button>
            <button
              onClick={() => setShowCriticalOnly(true)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                showCriticalOnly
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              &lt;5d ({counts.critical})
            </button>
          </div>
        </div>

        {/* Mobile card list */}
        <div className="space-y-2 md:hidden">
          {filteredWorkers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {counts.total === 0
                ? "No hay trabajadores en periodo de prueba"
                : "No se encontraron trabajadores con los filtros aplicados"}
            </div>
          ) : (
            filteredWorkers.map((worker) => (
              <div
                key={worker.id}
                className={cn(
                  "rounded-xl border p-3 flex items-center justify-between gap-3",
                  worker.trialPeriod?.isCritical
                    ? "border-destructive/30 bg-destructive/5"
                    : "border-border bg-card"
                )}
              >
                <div className="min-w-0 flex-1">
                  <a
                    href={`https://salix.verdnatura.es/#/worker/${worker.worker_number}/summary`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "font-medium text-sm hover:underline flex items-center gap-1",
                      worker.trialPeriod?.isCritical ? "text-destructive" : "text-primary"
                    )}
                  >
                    <span className="truncate">{worker.name}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-muted-foreground">#{worker.worker_number}</span>
                    {(worker.worker_team_name || worker.work_group_name) && (
                      <span className="text-[11px] text-muted-foreground">· {worker.worker_team_name || worker.work_group_name}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn(
                    "text-sm font-semibold tabular-nums",
                    worker.trialPeriod?.isCritical ? "text-destructive" : "text-muted-foreground"
                  )}>
                    {worker.trialPeriod?.daysRemaining ?? 0}d
                  </span>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 rounded-lg text-xs"
                    onClick={() => { setNsppDialog({ worker }); setNsppJustificacion(""); }}
                  >
                    NSPP
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Equipo</TableHead>
                <TableHead className="hidden lg:table-cell">Fecha Contrato</TableHead>
                <TableHead>Días</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredWorkers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {counts.total === 0
                      ? "No hay trabajadores en periodo de prueba"
                      : "No se encontraron trabajadores con los filtros aplicados"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredWorkers.map((worker) => (
                  <TableRow
                    key={worker.id}
                    className={cn(
                      worker.trialPeriod?.isCritical && "bg-destructive/10 hover:bg-destructive/15"
                    )}
                  >
                    <TableCell>
                      <a
                        href={`https://salix.verdnatura.es/#/worker/${worker.worker_number}/summary`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          "font-medium hover:underline flex items-center gap-1",
                          worker.trialPeriod?.isCritical ? "text-destructive" : "text-primary"
                        )}
                      >
                        {worker.name}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      <p className="text-xs text-muted-foreground">#{worker.worker_number}</p>
                    </TableCell>
                    <TableCell>
                      {worker.worker_team_name || worker.work_group_name || "-"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {worker.start_contract_date
                        ? format(parseISO(worker.start_contract_date), "d MMM yyyy", { locale: es })
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <span className={cn(
                        "text-sm font-medium tabular-nums",
                        worker.trialPeriod?.isCritical ? "text-destructive" : "text-muted-foreground"
                      )}>
                        {worker.trialPeriod?.daysRemaining ?? 0}d
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 rounded-lg text-xs gap-1"
                        onClick={() => { setNsppDialog({ worker }); setNsppJustificacion(""); }}
                      >
                        Marcar NSPP
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };



  return (
    <div className="space-y-4">
      <Card className="shadow-md">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Clock className="h-5 w-5 text-primary" />
              Periodo Prueba
            </CardTitle>
            <Badge variant="secondary">
              {totalCounts.total}
            </Badge>
            {totalCounts.critical > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {totalCounts.critical} crítico{totalCounts.critical !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {workersInTrialPeriod.length === 0 ? (
            <div className="text-center py-6 sm:py-8 text-muted-foreground">
              No hay trabajadores en periodo de prueba
            </div>
          ) : (
            <div className="space-y-4">
              {!externalSelectedDepartment && (
                <DeptPills
                  departments={departments}
                  selected={selectedDepartment}
                  onChange={setSelectedDepartment}
                  includeAll={true}
                  totalCount={totalCounts.total}
                  counts={deptCounts}
                />
              )}
              {renderWorkerTable(selectedDepartment)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* NSPP History Card */}
      <Card className="shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <History className="h-5 w-5 text-primary" />
            Historial NSPP
            {nsppHistory.length > 0 && (
              <Badge variant="secondary" className="ml-1">{nsppHistory.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : nsppHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No hay propuestas NSPP enviadas aún
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trabajador</TableHead>
                    <TableHead className="hidden sm:table-cell">Enviado</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="hidden md:table-cell">Justificación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nsppHistory.map((p) => {
                    const estadoBadge = () => {
                      switch (p.estado) {
                        case 'pendiente':
                          return <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30"><HourglassIcon className="h-3 w-3" />Pendiente</Badge>;
                        case 'aprobada':
                          return <Badge variant="outline" className="gap-1 text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/30"><CheckCircle2 className="h-3 w-3" />Aprobada</Badge>;
                        case 'enviada':
                          return <Badge variant="outline" className="gap-1 text-primary border-primary/30 bg-primary/5"><Send className="h-3 w-3" />Enviada</Badge>;
                        case 'rechazada':
                          return <Badge variant="outline" className="gap-1 text-destructive border-destructive/30 bg-destructive/5"><XCircle className="h-3 w-3" />Rechazada</Badge>;
                        default:
                          return <Badge variant="outline">{p.estado}</Badge>;
                      }
                    };
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <a
                            href={`https://salix.verdnatura.es/#/worker/${p.nspp_worker_number}/summary`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-primary hover:underline flex items-center gap-1"
                          >
                            {p.nspp_worker_name || "—"}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          {p.nspp_worker_number && (
                            <p className="text-xs text-muted-foreground">#{p.nspp_worker_number}</p>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground whitespace-nowrap">
                          {p.created_at
                            ? formatDistanceToNow(parseISO(p.created_at), { addSuffix: true, locale: es })
                            : "—"}
                        </TableCell>
                        <TableCell>{estadoBadge()}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-xs">
                          {p.nspp_justificacion
                            ? p.nspp_justificacion.length > 100
                              ? p.nspp_justificacion.slice(0, 100) + "…"
                              : p.nspp_justificacion
                            : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>


      <Dialog open={!!nsppDialog} onOpenChange={open => { if (!open) { setNsppDialog(null); setNsppJustificacion(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Marcar NSPP — No Supera el Periodo de Prueba
            </DialogTitle>
          </DialogHeader>
          {nsppDialog && (
            <div className="space-y-4">
              <div className="rounded-xl bg-muted/60 p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Trabajador:</span> <strong>{nsppDialog.worker.name}</strong></p>
                <p><span className="text-muted-foreground">Ficha:</span> #{nsppDialog.worker.worker_number}</p>
                {nsppDialog.worker.trialPeriod?.daysRemaining != null && (
                  <p><span className="text-muted-foreground">Días restantes:</span> <span className="text-destructive font-semibold">{nsppDialog.worker.trialPeriod.daysRemaining}</span></p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Justificación de no superación del periodo de prueba *
                </Label>
                <Textarea
                  value={nsppJustificacion}
                  onChange={e => setNsppJustificacion(e.target.value)}
                  placeholder="Explica claramente los motivos por los que el trabajador no supera el periodo de prueba: rendimiento, actitud, aptitudes, incumplimientos observados..."
                  className="min-h-[140px] rounded-xl text-sm"
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground">
                  Esta justificación será visible para el admin y se incluirá en el documento legal NSPP (Art. 14.2 ET).
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNsppDialog(null); setNsppJustificacion(""); }}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={handleNsppSubmit}
              disabled={nsppLoading || nsppJustificacion.trim().length < 20}
            >
              {nsppLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Enviar propuesta NSPP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
