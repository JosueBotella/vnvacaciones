import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Search, Filter, ArrowUpDown, X, Users } from "lucide-react";
import { DepartmentSearchSelect } from "@/components/DepartmentSearchSelect";

interface WorkerBalance {
  id: string;
  worker_number: string;
  worker_code: string | null;
  name: string;
  department_id: string;
  department_name: string;
  team_id: string | null;
  team_name: string | null;
  group_id: string | null;
  group_name: string | null;
  group_color: string | null;
  balance_hours: number | null;
  balance_updated: string | null;
  is_on_leave: boolean;
  is_on_vacation: boolean;
}

interface Department {
  id: string;
  name: string;
}

function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function BalanceListTab() {
  const { toast } = useToast();
  const [workers, setWorkers] = useState<WorkerBalance[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [balanceFilter, setBalanceFilter] = useState<"all" | "negative" | "positive" | "zero">("all");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | "alpha">("asc");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const sessionToken = localStorage.getItem("manager_session_token") || localStorage.getItem("managerSessionToken");
      if (!sessionToken) {
        throw new Error("No session token");
      }

      const { data, error } = await supabase.functions.invoke("hour-balance-operations", {
        body: { action: "getBalances", sessionToken },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      setWorkers(data.data || []);

      // Extract unique departments
      const uniqueDepts = new Map<string, string>();
      data.data?.forEach((w: WorkerBalance) => {
        if (w.department_id && w.department_name) {
          uniqueDepts.set(w.department_id, w.department_name);
        }
      });
      setDepartments(
        Array.from(uniqueDepts.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch (error: any) {
      console.error("Error fetching balances:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudieron cargar los balances",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredWorkers = useMemo(() => {
    let result = [...workers];

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

    // Department filter
    if (selectedDepartment !== "all") {
      result = result.filter((w) => w.department_id === selectedDepartment);
    }

    // Balance filter
    if (balanceFilter === "negative") {
      result = result.filter((w) => w.balance_hours !== null && w.balance_hours < 0);
    } else if (balanceFilter === "positive") {
      result = result.filter((w) => w.balance_hours !== null && w.balance_hours > 0);
    } else if (balanceFilter === "zero") {
      result = result.filter((w) => w.balance_hours === 0);
    }

    // Sort
    if (sortOrder === "asc") {
      result.sort((a, b) => (a.balance_hours ?? 0) - (b.balance_hours ?? 0));
    } else if (sortOrder === "desc") {
      result.sort((a, b) => (b.balance_hours ?? 0) - (a.balance_hours ?? 0));
    } else {
      result.sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [workers, searchQuery, selectedDepartment, balanceFilter, sortOrder]);

  const stats = useMemo(() => {
    const withBalance = workers.filter((w) => w.balance_hours !== null);
    return {
      total: workers.length,
      withBalance: withBalance.length,
      negative: withBalance.filter((w) => w.balance_hours! < 0).length,
      positive: withBalance.filter((w) => w.balance_hours! > 0).length,
      zero: withBalance.filter((w) => w.balance_hours === 0).length,
    };
  }, [workers]);

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedDepartment("all");
    setBalanceFilter("all");
    setSortOrder("asc");
  };

  const hasActiveFilters = searchQuery || selectedDepartment !== "all" || balanceFilter !== "all";

  const formatBalance = (hours: number | null): string => {
    if (hours === null) return "-";
    const sign = hours >= 0 ? "+" : "";
    return `${sign}${Math.round(hours)}h`;
  };

  const getBalanceBadge = (hours: number | null) => {
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
      <Card>
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

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl">Balance de Horas</CardTitle>
              <Badge variant="secondary" className="ml-2">
                <Users className="h-3 w-3 mr-1" />
                {filteredWorkers.length}
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar trabajador..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button
                variant={showFilters ? "secondary" : "outline"}
                size="icon"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Department filter - always visible */}
          <div className="w-full sm:max-w-xs">
            <DepartmentSearchSelect
              departments={departments.map(d => ({ id: d.id, name: d.name }))}
              value={selectedDepartment}
              onChange={(val) => setSelectedDepartment(val)}
              placeholder="Filtrar por departamento"
              includeAll={true}
            />
          </div>
        </div>

        {/* Stats badges */}
        <div className="flex flex-wrap gap-2">
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
          <Badge
            variant={balanceFilter === "zero" ? "secondary" : "outline"}
            className="cursor-pointer"
            onClick={() => setBalanceFilter("zero")}
          >
            Cero: {stats.zero}
          </Badge>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-4 p-4 bg-muted/50 rounded-lg">

            <div className="flex items-center gap-2">
              <Button
                variant={sortOrder === "asc" ? "secondary" : "outline"}
                size="sm"
                onClick={() => setSortOrder("asc")}
              >
                <ArrowUpDown className="h-3 w-3 mr-1" />
                - a +
              </Button>
              <Button
                variant={sortOrder === "desc" ? "secondary" : "outline"}
                size="sm"
                onClick={() => setSortOrder("desc")}
              >
                <ArrowUpDown className="h-3 w-3 mr-1" />
                + a -
              </Button>
              <Button
                variant={sortOrder === "alpha" ? "secondary" : "outline"}
                size="sm"
                onClick={() => setSortOrder("alpha")}
              >
                A-Z
              </Button>
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-3 w-3 mr-1" />
                Limpiar
              </Button>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent>
        {filteredWorkers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {workers.length === 0
              ? "No hay datos de balance. Importa un CSV para comenzar."
              : "No se encontraron trabajadores con los filtros aplicados."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="hidden md:table-cell">Departamento</TableHead>
                  <TableHead className="hidden lg:table-cell">Equipo</TableHead>
                  <TableHead className="hidden lg:table-cell text-center">Grupo</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWorkers.map((worker) => (
                  <TableRow 
                    key={worker.id}
                    className="border-b border-border/50 transition-colors hover:bg-muted/30"
                  >
                    <TableCell>
                      <div>
                        <a
                          href={`https://salix.verdnatura.es/#/worker/${worker.worker_number}/time-control`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-foreground hover:text-primary hover:underline transition-colors"
                        >
                          {worker.name}
                          {worker.worker_code && (
                            <span className="ml-1 text-xs text-muted-foreground font-mono">[{worker.worker_code}]</span>
                          )}
                        </a>
                        <div className="text-xs text-muted-foreground md:hidden">
                          {worker.department_name}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {worker.department_name}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {worker.team_name || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {worker.group_color ? (
                        <div 
                          className="w-3 h-3 rounded-full mx-auto" 
                          style={{ backgroundColor: worker.group_color }}
                          title={worker.group_name || "Grupo vacacional"}
                        />
                      ) : (
                        <span className="text-muted-foreground text-center block">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {getBalanceBadge(worker.balance_hours)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
