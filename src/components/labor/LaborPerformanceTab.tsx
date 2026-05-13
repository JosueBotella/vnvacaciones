import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Search, TrendingUp, TrendingDown, Minus, Loader2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const BENCHMARK = 80;

type ColorLevel = "all" | "green" | "yellow" | "orange" | "red";

const getColorClass = (pct: number) => {
  if (pct >= 100) return "text-primary";
  if (pct >= 75) return "text-amber-500";
  if (pct >= 50) return "text-orange-500";
  return "text-destructive";
};

const getBarColor = (pct: number) => {
  if (pct >= 100) return "bg-primary";
  if (pct >= 75) return "bg-amber-500";
  if (pct >= 50) return "bg-orange-500";
  return "bg-destructive";
};

const getColorLevel = (pct: number): ColorLevel => {
  if (pct >= 100) return "green";
  if (pct >= 75) return "yellow";
  if (pct >= 50) return "orange";
  return "red";
};

export function LaborPerformanceTab() {
  const [loading, setLoading] = useState(true);
  const [perfData, setPerfData] = useState<{ workers: any[]; history: any[]; departments: any[] } | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [colorFilter, setColorFilter] = useState<ColorLevel>("all");
  const [sortBy, setSortBy] = useState<"performance" | "name" | "number">("performance");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const sessionToken = localStorage.getItem("manager_session_token");
      const { data: response } = await supabase.functions.invoke("admin-operations", {
        body: { action: "getPerformanceDashboard", sessionToken, data: {} },
      });
      if (response?.success) {
        setPerfData(response);
      }
    } catch (err) {
      console.error("Error fetching performance data:", err);
    } finally {
      setLoading(false);
    }
  };

  // Available departments from perf data
  const availableDepartments = useMemo(() => {
    if (!perfData) return [];
    const deptIds = new Set(perfData.workers.map((w: any) => w.department_id));
    return perfData.departments.filter((d: any) => deptIds.has(d.id)).sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [perfData]);

  // Build ranked list with all computed fields
  const allRanked = useMemo(() => {
    if (!perfData || perfData.workers.length === 0) return [];

    const getWorkerPrevious = (workerId: string) => {
      const entries = perfData.history
        .filter((h: any) => h.worker_id === workerId)
        .sort((a: any, b: any) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());
      return entries.length >= 2 ? Number(entries[1].lines_hour) : null;
    };

    return perfData.workers
      .map((w: any) => {
        const prev = getWorkerPrevious(w.id);
        const lh = Number(w.lines_hour);
        const pct = (lh / BENCHMARK) * 100;
        const diff = prev !== null ? lh - prev : null;
        const dept = perfData.departments.find((d: any) => d.id === w.department_id);
        return { ...w, lines_hour: lh, pct, prev, diff, deptName: dept?.name || "", colorLevel: getColorLevel(pct) };
      })
      .sort((a: any, b: any) => b.lines_hour - a.lines_hour);
  }, [perfData]);

  // Filtered + sorted
  const filtered = useMemo(() => {
    let result = [...allRanked];

    // Department filter
    if (departmentFilter !== "all") {
      result = result.filter(w => w.department_id === departmentFilter);
    }

    // Color level filter
    if (colorFilter !== "all") {
      result = result.filter(w => w.colorLevel === colorFilter);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(w =>
        w.name.toLowerCase().includes(q) ||
        w.worker_number.toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "performance") cmp = a.lines_hour - b.lines_hour;
      else if (sortBy === "name") cmp = a.name.localeCompare(b.name);
      else cmp = a.worker_number.localeCompare(b.worker_number);
      return sortDir === "desc" ? -cmp : cmp;
    });

    return result;
  }, [allRanked, departmentFilter, colorFilter, search, sortBy, sortDir]);

  // Stats
  const stats = useMemo(() => {
    const total = filtered.length;
    const green = filtered.filter(w => w.colorLevel === "green").length;
    const yellow = filtered.filter(w => w.colorLevel === "yellow").length;
    const orange = filtered.filter(w => w.colorLevel === "orange").length;
    const red = filtered.filter(w => w.colorLevel === "red").length;
    const avg = total > 0 ? filtered.reduce((a, b) => a + b.lines_hour, 0) / total : 0;
    return { total, green, yellow, orange, red, avg, avgPct: (avg / BENCHMARK) * 100 };
  }, [filtered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!perfData || allRanked.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No hay datos de rendimiento disponibles.</p>
          <p className="text-sm">Importa un CSV de rendimiento desde la pestaña Importaciones.</p>
        </CardContent>
      </Card>
    );
  }

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortBy(col);
      setSortDir(col === "name" || col === "number" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ col }: { col: typeof sortBy }) => {
    if (sortBy !== col) return null;
    return sortDir === "desc"
      ? <TrendingDown className="h-3 w-3 inline ml-0.5" />
      : <TrendingUp className="h-3 w-3 inline ml-0.5" />;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Tabla de Rendimiento</h2>
        <Badge variant="secondary" className="text-xs">80 l/h = 100%</Badge>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground">Media</p>
            <p className={cn("text-xl font-bold tabular-nums mt-0.5", getColorClass(stats.avgPct))}>
              {stats.avg.toFixed(1)} <span className="text-xs font-normal">l/h</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-bold mt-0.5">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-primary">≥100%</p>
            <p className="text-xl font-bold text-primary mt-0.5">{stats.green}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-amber-500">75-99%</p>
            <p className="text-xl font-bold text-amber-500 mt-0.5">{stats.yellow}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-orange-500">50-74%</p>
            <p className="text-xl font-bold text-orange-500 mt-0.5">{stats.orange}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-destructive">&lt;50%</p>
            <p className="text-xl font-bold text-destructive mt-0.5">{stats.red}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o nº trabajador..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Departamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los departamentos</SelectItem>
                {availableDepartments.map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={colorFilter} onValueChange={(v) => setColorFilter(v as ColorLevel)}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Nivel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los niveles</SelectItem>
                <SelectItem value="green">🟢 ≥100%</SelectItem>
                <SelectItem value="yellow">🟡 75-99%</SelectItem>
                <SelectItem value="orange">🟠 50-74%</SelectItem>
                <SelectItem value="red">🔴 &lt;50%</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Mostrando {filtered.length} de {allRanked.length} trabajadores
          </p>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-xs">#</TableHead>
                <TableHead
                  className="text-xs cursor-pointer hover:text-foreground select-none"
                  onClick={() => toggleSort("number")}
                >
                  Nº <SortIcon col="number" />
                </TableHead>
                <TableHead
                  className="text-xs cursor-pointer hover:text-foreground select-none"
                  onClick={() => toggleSort("name")}
                >
                  Nombre <SortIcon col="name" />
                </TableHead>
                <TableHead className="text-xs">Departamento</TableHead>
                <TableHead className="text-xs w-[180px]">Rendimiento</TableHead>
                <TableHead
                  className="text-xs text-right cursor-pointer hover:text-foreground select-none"
                  onClick={() => toggleSort("performance")}
                >
                  L/H <SortIcon col="performance" />
                </TableHead>
                <TableHead className="text-xs text-right">%</TableHead>
                <TableHead className="text-xs text-right">Δ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No se encontraron resultados con los filtros actuales
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((w, i) => (
                  <TableRow key={w.id}>
                    <TableCell className="text-xs font-mono text-muted-foreground py-1.5">{i + 1}</TableCell>
                    <TableCell className="text-xs py-1.5">
                      <a
                        href={`https://salix.verdnatura.es/#!/worker/${w.worker_number}/summary`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono hover:text-primary transition-colors"
                      >
                        {w.worker_number}
                      </a>
                    </TableCell>
                    <TableCell className="text-xs py-1.5 font-medium">{w.name}</TableCell>
                    <TableCell className="text-xs py-1.5 text-muted-foreground">{w.deptName}</TableCell>
                    <TableCell className="py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", getBarColor(w.pct))}
                            style={{ width: `${Math.min(w.pct, 150) / 1.5}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className={cn("text-xs py-1.5 text-right font-mono font-bold tabular-nums", getColorClass(w.pct))}>
                      {w.lines_hour.toFixed(2)}
                    </TableCell>
                    <TableCell className={cn("text-xs py-1.5 text-right font-mono font-bold tabular-nums", getColorClass(w.pct))}>
                      {w.pct.toFixed(0)}%
                    </TableCell>
                    <TableCell className="text-xs py-1.5 text-right">
                      {w.diff !== null ? (
                        <span className={cn(
                          "flex items-center justify-end gap-0.5",
                          w.diff > 0 ? "text-primary" : w.diff < 0 ? "text-destructive" : "text-muted-foreground"
                        )}>
                          {w.diff > 0 ? <TrendingUp className="h-3 w-3" /> : w.diff < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                          {w.diff > 0 ? "+" : ""}{w.diff.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
