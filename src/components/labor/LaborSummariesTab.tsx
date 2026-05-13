import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Clock, UserX, Calendar, ChevronLeft, ChevronRight, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths, getWeek } from "date-fns";
import { es } from "date-fns/locale";
import { TrendCharts } from "./TrendCharts";

type Worker = {
  id: string;
  name: string;
  worker_number: string;
  department_id: string;
};

type Department = {
  id: string;
  name: string;
};

type TimeEntry = {
  id: string;
  worker_id: string;
  entry_date: string;
  delay_minutes: number | null;
  is_absence: boolean;
};

type WorkerSummary = {
  workerId: string;
  workerName: string;
  workerNumber: string;
  totalDelays: number;
  totalDelayMinutes: number;
  totalAbsences: number;
  workedDays: number;
};

type ViewMode = "weekly" | "monthly";

export function LaborSummariesTab() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [delayThreshold, setDelayThreshold] = useState(10);

  // Calculate date range based on view mode
  const dateRange = useMemo(() => {
    if (viewMode === "weekly") {
      return {
        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
        end: endOfWeek(currentDate, { weekStartsOn: 1 })
      };
    } else {
      return {
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate)
      };
    }
  }, [viewMode, currentDate]);

  const periodLabel = useMemo(() => {
    if (viewMode === "weekly") {
      const weekNum = getWeek(currentDate, { weekStartsOn: 1 });
      return `Semana ${weekNum} - ${format(dateRange.start, "d MMM", { locale: es })} al ${format(dateRange.end, "d MMM yyyy", { locale: es })}`;
    } else {
      return format(currentDate, "MMMM yyyy", { locale: es });
    }
  }, [viewMode, currentDate, dateRange]);

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data } = await supabase
      .from("labor_module_settings")
      .select("delay_threshold_minutes")
      .limit(1)
      .single();
    
    if (data) {
      setDelayThreshold(data.delay_threshold_minutes);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    
    const startDate = format(dateRange.start, "yyyy-MM-dd");
    const endDate = format(dateRange.end, "yyyy-MM-dd");
    
    const [workersRes, deptsRes, entriesRes] = await Promise.all([
      supabase.from("workers").select("id, name, worker_number, department_id").is("deleted_at", null),
      supabase.from("departments").select("id, name"),
      supabase.from("time_entries").select("id, worker_id, entry_date, delay_minutes, is_absence")
        .gte("entry_date", startDate)
        .lte("entry_date", endDate)
    ]);

    if (workersRes.data) setWorkers(workersRes.data);
    if (deptsRes.data) setDepartments(deptsRes.data);
    if (entriesRes.data) setTimeEntries(entriesRes.data);
    
    setLoading(false);
  };

  const handlePrevious = () => {
    if (viewMode === "weekly") {
      setCurrentDate(subWeeks(currentDate, 1));
    } else {
      setCurrentDate(subMonths(currentDate, 1));
    }
  };

  const handleNext = () => {
    const now = new Date();
    if (viewMode === "weekly") {
      const nextWeekStart = startOfWeek(new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000), { weekStartsOn: 1 });
      if (nextWeekStart <= now) {
        setCurrentDate(new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000));
      }
    } else {
      const nextMonthStart = startOfMonth(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
      if (nextMonthStart <= now) {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
      }
    }
  };

  // Filter workers by department
  const filteredWorkers = useMemo(() => {
    if (selectedDepartment === "all") return workers;
    return workers.filter(w => w.department_id === selectedDepartment);
  }, [workers, selectedDepartment]);

  // Calculate summaries per worker
  const workerSummaries = useMemo((): WorkerSummary[] => {
    return filteredWorkers.map(worker => {
      const workerEntries = timeEntries.filter(e => e.worker_id === worker.id);
      
      const delayEntries = workerEntries.filter(e => (e.delay_minutes || 0) >= delayThreshold);
      const totalDelays = delayEntries.length;
      const totalDelayMinutes = workerEntries.reduce((sum, e) => sum + (e.delay_minutes || 0), 0);
      const totalAbsences = workerEntries.filter(e => e.is_absence).length;
      const workedDays = workerEntries.filter(e => !e.is_absence).length;

      return {
        workerId: worker.id,
        workerName: worker.name,
        workerNumber: worker.worker_number,
        totalDelays,
        totalDelayMinutes,
        totalAbsences,
        workedDays
      };
    }).sort((a, b) => (b.totalDelays + b.totalAbsences) - (a.totalDelays + a.totalAbsences));
  }, [filteredWorkers, timeEntries, delayThreshold]);

  // Department summaries
  const departmentSummaries = useMemo(() => {
    return departments.map(dept => {
      const deptWorkers = workers.filter(w => w.department_id === dept.id);
      const deptWorkerIds = deptWorkers.map(w => w.id);
      const deptEntries = timeEntries.filter(e => deptWorkerIds.includes(e.worker_id));
      
      const delayEntries = deptEntries.filter(e => (e.delay_minutes || 0) >= delayThreshold);
      const totalDelays = delayEntries.length;
      const totalDelayMinutes = deptEntries.reduce((sum, e) => sum + (e.delay_minutes || 0), 0);
      const totalAbsences = deptEntries.filter(e => e.is_absence).length;
      const workersWithIssues = new Set(deptEntries.filter(e => e.is_absence || (e.delay_minutes || 0) >= delayThreshold).map(e => e.worker_id)).size;

      return {
        id: dept.id,
        name: dept.name,
        totalWorkers: deptWorkers.length,
        totalDelays,
        totalDelayMinutes,
        totalAbsences,
        workersWithIssues
      };
    }).sort((a, b) => (b.totalDelays + b.totalAbsences) - (a.totalDelays + a.totalAbsences));
  }, [departments, workers, timeEntries, delayThreshold]);

  // Global stats
  const globalStats = useMemo(() => {
    const delayEntries = timeEntries.filter(e => (e.delay_minutes || 0) >= delayThreshold);
    return {
      totalDelays: delayEntries.length,
      totalDelayMinutes: timeEntries.reduce((sum, e) => sum + (e.delay_minutes || 0), 0),
      totalAbsences: timeEntries.filter(e => e.is_absence).length,
      totalEntries: timeEntries.length,
      workersWithDelays: new Set(delayEntries.map(e => e.worker_id)).size,
      workersWithAbsences: new Set(timeEntries.filter(e => e.is_absence).map(e => e.worker_id)).size
    };
  }, [timeEntries, delayThreshold]);

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Semanal</SelectItem>
              <SelectItem value="monthly">Mensual</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Departamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los departamentos</SelectItem>
              {departments.map(dept => (
                <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevious}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[200px] text-center capitalize">
            {periodLabel}
          </span>
          <Button variant="outline" size="icon" onClick={handleNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Global Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Retrasos</p>
                    <p className="text-2xl font-bold">{globalStats.totalDelays}</p>
                    <p className="text-xs text-muted-foreground">{globalStats.workersWithDelays} trabajadores</p>
                  </div>
                  <Clock className="h-8 w-8 text-amber-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Tiempo Total Retraso</p>
                    <p className="text-2xl font-bold">{formatMinutes(globalStats.totalDelayMinutes)}</p>
                    <p className="text-xs text-muted-foreground">acumulado</p>
                  </div>
                  <TrendingDown className="h-8 w-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Ausencias</p>
                    <p className="text-2xl font-bold">{globalStats.totalAbsences}</p>
                    <p className="text-xs text-muted-foreground">{globalStats.workersWithAbsences} trabajadores</p>
                  </div>
                  <UserX className="h-8 w-8 text-red-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Fichajes Registrados</p>
                    <p className="text-2xl font-bold">{globalStats.totalEntries}</p>
                    <p className="text-xs text-muted-foreground">en el período</p>
                  </div>
                  <Calendar className="h-8 w-8 text-primary" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Trend Charts */}
          <TrendCharts 
            timeEntries={timeEntries} 
            viewMode={viewMode} 
            dateRange={dateRange}
            delayThreshold={delayThreshold}
          />
          {selectedDepartment === "all" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4" />
                  Resumen por Departamento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Departamento</TableHead>
                      <TableHead className="text-center">Trabajadores</TableHead>
                      <TableHead className="text-center">Retrasos</TableHead>
                      <TableHead className="text-center">Tiempo Retraso</TableHead>
                      <TableHead className="text-center">Ausencias</TableHead>
                      <TableHead className="text-center">Con Incidencias</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {departmentSummaries.map(dept => (
                      <TableRow key={dept.id}>
                        <TableCell className="font-medium">{dept.name}</TableCell>
                        <TableCell className="text-center">{dept.totalWorkers}</TableCell>
                        <TableCell className="text-center">
                          {dept.totalDelays > 0 ? (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                              {dept.totalDelays}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          {formatMinutes(dept.totalDelayMinutes)}
                        </TableCell>
                        <TableCell className="text-center">
                          {dept.totalAbsences > 0 ? (
                            <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20">
                              {dept.totalAbsences}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">
                          {dept.workersWithIssues} / {dept.totalWorkers}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Worker Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4" />
                Detalle por Trabajador
              </CardTitle>
            </CardHeader>
            <CardContent>
              {workerSummaries.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No hay datos para el período seleccionado
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trabajador</TableHead>
                      <TableHead className="text-center">Días Trabajados</TableHead>
                      <TableHead className="text-center">Retrasos</TableHead>
                      <TableHead className="text-center">Tiempo Retraso</TableHead>
                      <TableHead className="text-center">Ausencias</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workerSummaries.map(summary => (
                      <TableRow key={summary.workerId}>
                        <TableCell>
                          <div>
                            <span className="font-medium">{summary.workerName}</span>
                            <span className="text-xs text-muted-foreground ml-2">#{summary.workerNumber}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{summary.workedDays}</TableCell>
                        <TableCell className="text-center">
                          {summary.totalDelays > 0 ? (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                              <Clock className="h-3 w-3 mr-1" />
                              {summary.totalDelays}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          {formatMinutes(summary.totalDelayMinutes)}
                        </TableCell>
                        <TableCell className="text-center">
                          {summary.totalAbsences > 0 ? (
                            <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20">
                              <UserX className="h-3 w-3 mr-1" />
                              {summary.totalAbsences}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
