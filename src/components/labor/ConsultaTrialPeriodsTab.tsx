import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, AlertTriangle, Clock, ExternalLink } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { calculateTrialPeriod, formatTrialPeriodDisplay } from "@/lib/trialPeriod";

import { supabase } from "@/integrations/supabase/client";

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
  departments: Department[];
  selectedDepartment: string;
  onDepartmentChange: (deptId: string) => void;
};

export const ConsultaTrialPeriodsTab = ({ departments, selectedDepartment, onDepartmentChange }: Props) => {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);

  useEffect(() => {
    fetchWorkers();
  }, []);

  const fetchWorkers = async () => {
    setLoading(true);
    try {
      const sessionToken = localStorage.getItem("manager_session_token");
      if (!sessionToken) return;

      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "getAllWorkerGroups",
          sessionToken,
          data: {}
        }
      });

      if (!error && data?.success) {
        // Map workers with their start_contract_date
        const mappedWorkers = (data.workers || []).map((w: any) => ({
          id: w.id,
          name: w.name,
          worker_number: w.worker_number,
          department_id: w.department_id,
          worker_team_name: w.worker_team_name || null,
          work_group_name: w.work_group_name || null,
          start_contract_date: w.start_contract_date || null,
        }));
        setWorkers(mappedWorkers);
      }
    } catch (err) {
      console.error("Error fetching workers:", err);
    } finally {
      setLoading(false);
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

  if (loading) {
    return (
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Periodo de Prueba
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

  const counts = getDepartmentCounts(selectedDepartment);
  const filteredWorkers = getFilteredWorkers(selectedDepartment);

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Clock className="h-5 w-5 text-primary" />
            Periodo de Prueba
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
        <div className="space-y-4">
          {selectedDepartment && (
            <>
              {/* Search and filters */}
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <div className="relative flex-1 sm:max-w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nombre..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant={!showCriticalOnly ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setShowCriticalOnly(false)}
                  >
                    Todos ({counts.total})
                  </Badge>
                  <Badge
                    variant={showCriticalOnly ? "default" : "outline"}
                    className={cn(
                      "cursor-pointer gap-1",
                      showCriticalOnly
                        ? "bg-destructive hover:bg-destructive/90"
                        : "hover:bg-destructive/20 text-destructive"
                    )}
                    onClick={() => setShowCriticalOnly(true)}
                  >
                    <AlertTriangle className="h-3 w-3" />
                    &lt;5 días ({counts.critical})
                  </Badge>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="hidden md:table-cell">Equipo</TableHead>
                      <TableHead className="hidden lg:table-cell">Fecha Contrato</TableHead>
                      <TableHead>Días</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredWorkers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
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
                          <TableCell className="hidden md:table-cell">
                            {worker.worker_team_name || worker.work_group_name || "-"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {worker.start_contract_date
                              ? format(parseISO(worker.start_contract_date), "d MMM yyyy", { locale: es })
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={worker.trialPeriod?.isCritical ? "destructive" : "secondary"}
                              className="gap-1"
                            >
                              {worker.trialPeriod?.isCritical && (
                                <AlertTriangle className="h-3 w-3" />
                              )}
                              {formatTrialPeriodDisplay(worker.trialPeriod)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
