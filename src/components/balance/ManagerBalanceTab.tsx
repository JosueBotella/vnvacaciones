import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DeptPills } from "@/components/DeptPills";
import { supabase } from "@/integrations/supabase/client";
import { Search, Users, ArrowUpDown } from "lucide-react";

interface WorkerBalance {
  id: string;
  worker_number: string;
  worker_code?: string | null;
  name: string;
  department_id: string;
  department_name: string;
  team_name: string | null;
  group_name: string | null;
  group_color: string | null;
  balance_hours: number | null;
}

interface Department {
  id: string;
  name: string;
}

interface Props {
  departmentIds: string[];
  departments: Department[];
  externalSelectedDepartment?: string;
  workerTeamIds?: string[];
}

function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function ManagerBalanceTab({ departmentIds, departments, externalSelectedDepartment, workerTeamIds }: Props) {
  const [workers, setWorkers] = useState<WorkerBalance[]>([]);
  const [lastImportAt, setLastImportAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [balanceFilter, setBalanceFilter] = useState<"all" | "negative" | "positive">("all");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [selectedDepartmentInternal, setSelectedDepartmentInternal] = useState<string>(() =>
    departments.length > 0 ? departments[0].id : ""
  );

  const selectedDepartment = externalSelectedDepartment || selectedDepartmentInternal;
  const setSelectedDepartment = setSelectedDepartmentInternal;

  // Update selected department when departments change (only for internal mode)
  useEffect(() => {
    if (externalSelectedDepartment) return;
    if (departments.length > 0 && !departments.find(d => d.id === selectedDepartmentInternal)) {
      setSelectedDepartmentInternal(departments[0].id);
    }
  }, [departments, selectedDepartmentInternal, externalSelectedDepartment]);

  // Stable keys for deps to avoid infinite re-renders
  const deptKey = departmentIds.join(",");
  const teamKey = workerTeamIds?.join(",") ?? "";

  useEffect(() => {
    if (departmentIds.length > 0) {
      fetchBalances();
    } else {
      setIsLoading(false);
    }
  }, [deptKey, teamKey]);

  const fetchBalances = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const sessionToken = localStorage.getItem("manager_session_token");
      if (!sessionToken) {
        throw new Error("No session token");
      }

      const { data, error: fnError } = await supabase.functions.invoke("hour-balance-operations", {
        body: {
          action: "getManagerBalances",
          sessionToken,
          departmentIds,
          workerTeamIds,
        },
      });

      if (fnError) throw fnError;
      if (!data.success) throw new Error(data.error);

      setWorkers(data.data || []);
      setLastImportAt(data.lastImportAt || null);
    } catch (err: any) {
      console.error("Error fetching balances:", err);
      setError(err.message || "No se pudieron cargar los balances");
    } finally {
      setIsLoading(false);
    }
  };

  const getWorkersForDepartment = (deptId: string) => {
    return workers.filter(w => w.department_id === deptId);
  };

  const getFilteredWorkers = (deptId: string) => {
    let result = getWorkersForDepartment(deptId);

    // Search filter
    if (searchQuery) {
      const normalized = normalizeForSearch(searchQuery);
      result = result.filter(
        (w) =>
          normalizeForSearch(w.name).includes(normalized) ||
          normalizeForSearch(w.worker_number).includes(normalized) ||
          (w.worker_code && normalizeForSearch(w.worker_code).includes(normalized))
      );
    }

    // Balance filter
    if (balanceFilter === "negative") {
      result = result.filter((w) => w.balance_hours !== null && w.balance_hours < 0);
    } else if (balanceFilter === "positive") {
      result = result.filter((w) => w.balance_hours !== null && w.balance_hours > 0);
    }

    // Sort
    if (sortOrder === "asc") {
      result.sort((a, b) => (a.balance_hours ?? 0) - (b.balance_hours ?? 0));
    } else {
      result.sort((a, b) => (b.balance_hours ?? 0) - (a.balance_hours ?? 0));
    }

    return result;
  };

  const getDepartmentStats = (deptId: string) => {
    const deptWorkers = getWorkersForDepartment(deptId);
    const withBalance = deptWorkers.filter((w) => w.balance_hours !== null);
    return {
      total: deptWorkers.length,
      withBalance: withBalance.length,
      negative: withBalance.filter((w) => w.balance_hours! < 0).length,
      positive: withBalance.filter((w) => w.balance_hours! > 0).length,
    };
  };

  const totalStats = useMemo(() => {
    const withBalance = workers.filter((w) => w.balance_hours !== null);
    return {
      total: workers.length,
      withBalance: withBalance.length,
      negative: withBalance.filter((w) => w.balance_hours! < 0).length,
      positive: withBalance.filter((w) => w.balance_hours! > 0).length,
    };
  }, [workers]);

  const formatBalance = (hours: number | null): string => {
    if (hours === null) return "-";
    const sign = hours >= 0 ? "+" : "";
    return `${sign}${Math.round(hours)}h`;
  };

  const getBalanceDisplay = (hours: number | null) => {
    if (hours === null) {
      return <span className="text-muted-foreground text-sm">-</span>;
    }
    if (hours < 0) {
      return (
        <Badge variant="outline" className="font-medium text-destructive border-destructive/30 bg-destructive/10">
          {formatBalance(hours)}
        </Badge>
      );
    }
    if (hours > 0) {
      return (
        <Badge variant="outline" className="font-medium text-primary border-primary/30 bg-primary/10">
          {formatBalance(hours)}
        </Badge>
      );
    }
    return <Badge variant="outline" className="font-medium text-muted-foreground">0h</Badge>;
  };

  if (isLoading) {
    return (
      <Card className="shadow-md">
        <CardHeader>
          <Skeleton className="h-8 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-md">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const renderWorkerList = (deptId: string) => {
    const filteredWorkers = getFilteredWorkers(deptId);
    const stats = getDepartmentStats(deptId);

    return (
      <div className="space-y-4">
        {/* Department header */}
        <div className="flex items-center gap-3 border-b border-border/50 pb-2">
          <h3 className="font-semibold text-base text-foreground">
            {departments.find(d => d.id === deptId)?.name}
          </h3>
          <Badge variant="secondary">
            <Users className="h-3 w-3 mr-1" />
            {stats.total} trabajadores
          </Badge>
        </div>

        {/* Search and filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar trabajador..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 rounded-xl"
            />
          </div>
        </div>

        {/* Quick filter badges */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={balanceFilter === "all" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setBalanceFilter("all")}
          >
            Todos: {stats.withBalance}
          </Badge>
          <Badge
            variant={balanceFilter === "negative" ? "destructive" : "outline"}
            className="cursor-pointer"
            onClick={() => setBalanceFilter("negative")}
          >
            Negativos: {stats.negative}
          </Badge>
          <Badge
            variant={balanceFilter === "positive" ? "default" : "outline"}
            className={`cursor-pointer ${balanceFilter === "positive" ? "bg-primary" : ""}`}
            onClick={() => setBalanceFilter("positive")}
          >
            Positivos: {stats.positive}
          </Badge>

          <div className="ml-auto flex gap-2">
            <Button
              variant={sortOrder === "asc" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setSortOrder("asc")}
              className="rounded-lg"
            >
              <ArrowUpDown className="h-3 w-3 mr-1" />
              - a +
            </Button>
            <Button
              variant={sortOrder === "desc" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setSortOrder("desc")}
              className="rounded-lg"
            >
              <ArrowUpDown className="h-3 w-3 mr-1" />
              + a -
            </Button>
          </div>
        </div>

        {/* Worker list */}
        {filteredWorkers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {stats.total === 0
              ? "No hay datos de balance disponibles."
              : "No se encontraron trabajadores con los filtros aplicados."}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredWorkers.map((worker) => (
              <div
                key={worker.id}
                className="flex items-center justify-between p-4 rounded-xl border bg-card transition-colors hover:bg-muted/30"
              >
                <div className="min-w-0 flex-1 flex items-center gap-3">
                  {worker.group_color && (
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: worker.group_color }}
                      title={worker.group_name || "Grupo vacacional"}
                    />
                  )}
                  <div className="min-w-0">
                    <a
                      href={`https://salix.verdnatura.es/#/worker/${worker.worker_number}/time-control`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium truncate block hover:text-primary hover:underline transition-colors"
                    >
                      {worker.name}
                    </a>
                    <p className="text-xs text-muted-foreground truncate">
                      {worker.team_name && worker.team_name}
                    </p>
                  </div>
                </div>
                <div className="ml-4 flex-shrink-0">
                  {getBalanceDisplay(worker.balance_hours)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="shadow-md">
      <CardHeader className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="text-lg md:text-xl">
              Balance de Horas
            </CardTitle>
            <CardDescription>
              Consulta el balance de horas de tus trabajadores
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start">
            {lastImportAt && (
              <Badge variant="outline" className="font-normal text-muted-foreground">
                Actualizado el {new Date(lastImportAt).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })}
              </Badge>
            )}
            <Badge variant="secondary">
              <Users className="h-3 w-3 mr-1" />
              {totalStats.total} trabajadores
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {workers.length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-muted-foreground">
            No hay datos de balance disponibles
          </div>
        ) : (
          <div className="space-y-4">
            {!externalSelectedDepartment && (
              <DeptPills
                departments={departments}
                selected={selectedDepartment}
                onChange={setSelectedDepartment}
                includeAll={false}
                counts={departments.reduce((acc, d) => {
                  acc[d.id] = getDepartmentStats(d.id).total;
                  return acc;
                }, {} as Record<string, number>)}
              />
            )}
            {selectedDepartment
              ? renderWorkerList(selectedDepartment)
              : departments.length === 1
                ? renderWorkerList(departments[0].id)
                : <div className="text-center py-6 text-muted-foreground">No hay departamentos asignados</div>
            }
          </div>
        )}
      </CardContent>
    </Card>
  );
}
