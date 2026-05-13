import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, Legend, PieChart, Pie, Cell, AreaChart, Area, ReferenceLine
} from "recharts";
import { 
  TrendingUp, TrendingDown, Clock, UserX, Users, CalendarIcon, 
  ArrowUpRight, ArrowDownRight, Minus, BarChart3, Loader2, AlertTriangle, Search, User, ChevronDown, ChevronUp, FileText,
  Activity, Trophy, AlertCircle
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  format, subWeeks, subMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth, 
  getWeek, eachWeekOfInterval, eachMonthOfInterval, parseISO, differenceInDays, eachDayOfInterval
} from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

type TimeEntry = {
  id: string;
  worker_id: string;
  entry_date: string;
  clock_in: string | null;
  clock_out: string | null;
  delay_minutes: number | null;
  is_absence: boolean;
  observation: string | null;
};

type Worker = {
  id: string;
  name: string;
  worker_number: string;
  worker_code: string | null;
  department_id: string;
  is_on_leave: boolean;
  is_on_vacation: boolean;
};

type Department = {
  id: string;
  name: string;
};

type ComparisonMode = "weeks" | "months" | "custom";

type DateRange = {
  from: Date | undefined;
  to: Date | undefined;
};

export function LaborDashboardTab({ onNavigateTab }: { onNavigateTab?: (tab: string) => void } = {}) {
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [allEntries, setAllEntries] = useState<TimeEntry[]>([]);
  const [delayThreshold, setDelayThreshold] = useState(10);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("weeks");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [selectedWorker, setSelectedWorker] = useState<string>("all");
  const [workerSearch, setWorkerSearch] = useState("");
  const [workerPopoverOpen, setWorkerPopoverOpen] = useState(false);
  const [showTimeEntries, setShowTimeEntries] = useState(true);
  const [perfData, setPerfData] = useState<{ workers: any[]; history: any[]; thresholds: any[]; departments: any[] } | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);
  const [historyDateRange, setHistoryDateRange] = useState<DateRange>({
    from: subMonths(new Date(), 1),
    to: new Date()
  });
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subWeeks(new Date(), 2),
    to: new Date()
  });

  useEffect(() => {
    fetchData();
    fetchPerformanceData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    // Fetch last 12 weeks of data for comparison
    const endDate = new Date();
    const startDate = subMonths(endDate, 3);
    
    const sessionToken = localStorage.getItem("manager_session_token");
    
    // Use edge function to bypass RLS
    const { data: response, error } = await supabase.functions.invoke("admin-operations", {
      body: {
        action: "getLaborDashboardData",
        sessionToken,
        data: {
          startDate: format(startDate, "yyyy-MM-dd"),
          endDate: format(endDate, "yyyy-MM-dd")
        }
      }
    });

    if (error) {
      console.error("Error fetching dashboard data:", error);
      setLoading(false);
      return;
    }

    if (response?.success) {
      setWorkers(response.workers || []);
      setDepartments(response.departments || []);
      setAllEntries(response.entries || []);
      if (response.settings?.delay_threshold_minutes) {
        setDelayThreshold(response.settings.delay_threshold_minutes);
      }
    } else {
      console.error("Dashboard data fetch failed:", response?.error);
    }
    
    setLoading(false);
  };

  const fetchPerformanceData = async () => {
    setPerfLoading(true);
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
      setPerfLoading(false);
    }
  };

  // Filter workers by department and specific worker
  const filteredWorkerIds = useMemo(() => {
    // If a specific worker is selected, return only that worker
    if (selectedWorker !== "all") return [selectedWorker];
    // Otherwise filter by department
    if (selectedDepartment === "all") return workers.map(w => w.id);
    return workers.filter(w => w.department_id === selectedDepartment).map(w => w.id);
  }, [workers, selectedDepartment, selectedWorker]);

  // Workers filtered by department for the dropdown
  const workersInDepartment = useMemo(() => {
    const filtered = selectedDepartment === "all" 
      ? workers 
      : workers.filter(w => w.department_id === selectedDepartment);
    
    // Apply search filter
    if (workerSearch) {
      const search = workerSearch.toLowerCase();
      return filtered.filter(w => 
        w.name.toLowerCase().includes(search) || 
        w.worker_number.toLowerCase().includes(search) ||
        (w.worker_code && w.worker_code.toLowerCase().includes(search))
      );
    }
    return filtered;
  }, [workers, selectedDepartment, workerSearch]);

  // Reset worker selection when department changes
  useEffect(() => {
    setSelectedWorker("all");
    setWorkerSearch("");
  }, [selectedDepartment]);

  // Time entries for selected worker (for detailed view) with date filter
  const selectedWorkerEntries = useMemo(() => {
    if (selectedWorker === "all") return [];
    return allEntries
      .filter(e => {
        if (e.worker_id !== selectedWorker) return false;
        const entryDate = parseISO(e.entry_date);
        if (historyDateRange.from && entryDate < historyDateRange.from) return false;
        if (historyDateRange.to && entryDate > historyDateRange.to) return false;
        return true;
      })
      .sort((a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime());
  }, [allEntries, selectedWorker, historyDateRange]);

  // Current and previous period calculations
  const periodData = useMemo(() => {
    const now = new Date();
    
    if (comparisonMode === "custom" && dateRange.from && dateRange.to) {
      const currentStart = dateRange.from;
      const currentEnd = dateRange.to;
      const rangeDays = differenceInDays(currentEnd, currentStart);
      const previousEnd = subWeeks(currentStart, 0);
      previousEnd.setDate(previousEnd.getDate() - 1);
      const previousStart = new Date(previousEnd);
      previousStart.setDate(previousStart.getDate() - rangeDays);
      
      return {
        currentLabel: `${format(currentStart, "dd/MM", { locale: es })} - ${format(currentEnd, "dd/MM", { locale: es })}`,
        previousLabel: `${format(previousStart, "dd/MM", { locale: es })} - ${format(previousEnd, "dd/MM", { locale: es })}`,
        currentStart,
        currentEnd,
        previousStart,
        previousEnd
      };
    } else if (comparisonMode === "weeks") {
      const currentStart = startOfWeek(now, { weekStartsOn: 1 });
      const currentEnd = endOfWeek(now, { weekStartsOn: 1 });
      const previousStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      const previousEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      
      return {
        currentLabel: `Semana ${getWeek(now, { weekStartsOn: 1 })}`,
        previousLabel: `Semana ${getWeek(subWeeks(now, 1), { weekStartsOn: 1 })}`,
        currentStart,
        currentEnd,
        previousStart,
        previousEnd
      };
    } else {
      const currentStart = startOfMonth(now);
      const currentEnd = endOfMonth(now);
      const previousStart = startOfMonth(subMonths(now, 1));
      const previousEnd = endOfMonth(subMonths(now, 1));
      
      return {
        currentLabel: format(now, "MMMM yyyy", { locale: es }),
        previousLabel: format(subMonths(now, 1), "MMMM yyyy", { locale: es }),
        currentStart,
        currentEnd,
        previousStart,
        previousEnd
      };
    }
  }, [comparisonMode, dateRange]);

  // Calculate stats for a period
  const calculatePeriodStats = (entries: TimeEntry[]) => {
    const delays = entries.filter(e => (e.delay_minutes || 0) >= delayThreshold).length;
    const absences = entries.filter(e => e.is_absence).length;
    const totalDelayMinutes = entries.reduce((sum, e) => sum + (e.delay_minutes || 0), 0);
    const totalEntries = entries.length;
    const avgDelay = totalEntries > 0 ? Math.round(totalDelayMinutes / totalEntries) : 0;
    
    return { delays, absences, totalDelayMinutes, totalEntries, avgDelay };
  };

  // Current period stats
  const currentStats = useMemo(() => {
    const entries = allEntries.filter(e => {
      const date = parseISO(e.entry_date);
      return date >= periodData.currentStart && 
             date <= periodData.currentEnd &&
             filteredWorkerIds.includes(e.worker_id);
    });
    return calculatePeriodStats(entries);
  }, [allEntries, periodData, filteredWorkerIds, delayThreshold]);

  // Previous period stats
  const previousStats = useMemo(() => {
    const entries = allEntries.filter(e => {
      const date = parseISO(e.entry_date);
      return date >= periodData.previousStart && 
             date <= periodData.previousEnd &&
             filteredWorkerIds.includes(e.worker_id);
    });
    return calculatePeriodStats(entries);
  }, [allEntries, periodData, filteredWorkerIds, delayThreshold]);

  // Calculate percentage change
  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  // Trend data for charts
  const trendData = useMemo(() => {
    const now = new Date();
    
    if (comparisonMode === "custom" && dateRange.from && dateRange.to) {
      const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
      
      return days.map(day => {
        const dayEntries = allEntries.filter(e => {
          const date = parseISO(e.entry_date);
          return format(date, "yyyy-MM-dd") === format(day, "yyyy-MM-dd") && filteredWorkerIds.includes(e.worker_id);
        });
        
        const stats = calculatePeriodStats(dayEntries);
        
        return {
          label: format(day, "dd/MM", { locale: es }),
          fullLabel: format(day, "EEEE, d MMMM", { locale: es }),
          delays: stats.delays,
          absences: stats.absences,
          avgDelay: stats.avgDelay,
          total: stats.delays + stats.absences
        };
      });
    } else if (comparisonMode === "weeks") {
      const weeks = eachWeekOfInterval(
        { start: subWeeks(now, 7), end: now },
        { weekStartsOn: 1 }
      );
      
      return weeks.map(weekStart => {
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
        const weekEntries = allEntries.filter(e => {
          const date = parseISO(e.entry_date);
          return date >= weekStart && date <= weekEnd && filteredWorkerIds.includes(e.worker_id);
        });
        
        const stats = calculatePeriodStats(weekEntries);
        
        return {
          label: `S${getWeek(weekStart, { weekStartsOn: 1 })}`,
          fullLabel: `Semana ${getWeek(weekStart, { weekStartsOn: 1 })}`,
          delays: stats.delays,
          absences: stats.absences,
          avgDelay: stats.avgDelay,
          total: stats.delays + stats.absences
        };
      });
    } else {
      const months = eachMonthOfInterval({ start: subMonths(now, 5), end: now });
      
      return months.map(monthStart => {
        const monthEnd = endOfMonth(monthStart);
        const monthEntries = allEntries.filter(e => {
          const date = parseISO(e.entry_date);
          return date >= monthStart && date <= monthEnd && filteredWorkerIds.includes(e.worker_id);
        });
        
        const stats = calculatePeriodStats(monthEntries);
        
        return {
          label: format(monthStart, "MMM", { locale: es }),
          fullLabel: format(monthStart, "MMMM yyyy", { locale: es }),
          delays: stats.delays,
          absences: stats.absences,
          avgDelay: stats.avgDelay,
          total: stats.delays + stats.absences
        };
      });
    }
  }, [allEntries, comparisonMode, filteredWorkerIds, delayThreshold, dateRange]);

  // Top workers with incidents
  const topIncidentWorkers = useMemo(() => {
    const workerStats = new Map<string, { delays: number; absences: number; name: string; number: string }>();
    
    const recentEntries = allEntries.filter(e => {
      const date = parseISO(e.entry_date);
      return date >= periodData.currentStart && 
             date <= periodData.currentEnd &&
             filteredWorkerIds.includes(e.worker_id);
    });

    recentEntries.forEach(entry => {
      const worker = workers.find(w => w.id === entry.worker_id);
      if (!worker) return;
      
      const current = workerStats.get(entry.worker_id) || { delays: 0, absences: 0, name: worker.name, number: worker.worker_number };
      
      if ((entry.delay_minutes || 0) >= delayThreshold) current.delays++;
      if (entry.is_absence) current.absences++;
      
      workerStats.set(entry.worker_id, current);
    });

    return Array.from(workerStats.entries())
      .map(([id, stats]) => ({ id, ...stats, total: stats.delays + stats.absences }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [allEntries, workers, periodData, filteredWorkerIds, delayThreshold]);

  // Department breakdown
  const departmentBreakdown = useMemo(() => {
    if (selectedDepartment !== "all") return [];
    
    return departments.map(dept => {
      const deptWorkerIds = workers.filter(w => w.department_id === dept.id).map(w => w.id);
      const deptEntries = allEntries.filter(e => {
        const date = parseISO(e.entry_date);
        return date >= periodData.currentStart && 
               date <= periodData.currentEnd &&
               deptWorkerIds.includes(e.worker_id);
      });
      
      const stats = calculatePeriodStats(deptEntries);
      
      return {
        name: dept.name,
        delays: stats.delays,
        absences: stats.absences,
        total: stats.delays + stats.absences
      };
    }).filter(d => d.total > 0).sort((a, b) => b.total - a.total);
  }, [departments, workers, allEntries, periodData, selectedDepartment, delayThreshold]);

  // Incident distribution for pie chart
  const incidentDistribution = useMemo(() => [
    { name: "Retrasos", value: currentStats.delays, color: "hsl(var(--chart-2))" },
    { name: "Ausencias", value: currentStats.absences, color: "hsl(var(--chart-1))" }
  ], [currentStats]);

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const renderChangeIndicator = (change: number, invertColors = false) => {
    const isPositive = change > 0;
    const isNegative = change < 0;
    const goodChange = invertColors ? isPositive : isNegative;
    const badChange = invertColors ? isNegative : isPositive;
    
    if (change === 0) {
      return (
        <div className="flex items-center gap-1 text-muted-foreground text-sm">
          <Minus className="h-3 w-3" />
          <span>Sin cambios</span>
        </div>
      );
    }
    
    return (
      <div className={`flex items-center gap-1 text-sm ${goodChange ? "text-green-600" : "text-red-600"}`}>
        {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
        <span>{Math.abs(change)}% vs anterior</span>
      </div>
    );
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload;
      return (
        <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
          <p className="font-medium mb-2">{data?.fullLabel || label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name}: <strong>{entry.value}</strong>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeWorkers = workers.filter(w => !w.is_on_leave && !w.is_on_vacation).length;
  const workersOnLeave = workers.filter(w => w.is_on_leave).length;
  const leavePercentage = workers.length > 0 ? ((workersOnLeave / workers.length) * 100).toFixed(1) : "0";
  const delaysChange = calculateChange(currentStats.delays, previousStats.delays);
  const absencesChange = calculateChange(currentStats.absences, previousStats.absences);
  const avgDelayChange = calculateChange(currentStats.avgDelay, previousStats.avgDelay);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Dashboard de Métricas</h2>
            <p className="text-sm text-muted-foreground">Comparativas y tendencias de incidencias</p>
          </div>
        </div>
        
        {/* Filters Row */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
            {/* Period Mode */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Período</label>
              <Select value={comparisonMode} onValueChange={(v) => setComparisonMode(v as ComparisonMode)}>
                <SelectTrigger className="h-9 w-full bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weeks">Semanal</SelectItem>
                  <SelectItem value="months">Mensual</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Date Range or Label */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Rango</label>
              {comparisonMode === "custom" ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "h-9 w-full justify-start text-left font-normal bg-background",
                        !dateRange.from && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                      <span className="truncate">
                        {dateRange.from && dateRange.to ? (
                          `${format(dateRange.from, "dd/MM", { locale: es })} - ${format(dateRange.to, "dd/MM", { locale: es })}`
                        ) : (
                          "Seleccionar"
                        )}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="range"
                      selected={{ from: dateRange.from, to: dateRange.to }}
                      onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                      numberOfMonths={2}
                      locale={es}
                      disabled={(date) => date > new Date()}
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              ) : (
                <div className="h-9 px-3 flex items-center rounded-md border bg-background text-sm">
                  {periodData.currentLabel}
                </div>
              )}
            </div>
            
            {/* Department Filter */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Departamento</label>
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger className="h-9 w-full bg-background">
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

            {/* Worker Filter */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Trabajador</label>
              <Popover open={workerPopoverOpen} onOpenChange={setWorkerPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-9 w-full justify-start text-left font-normal bg-background",
                      selectedWorker !== "all" && "border-primary text-primary"
                    )}
                  >
                    <User className="mr-2 h-4 w-4 flex-shrink-0" />
                    <span className="truncate">
                      {selectedWorker !== "all" 
                        ? workers.find(w => w.id === selectedWorker)?.name || "Trabajador"
                        : "Todos"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-0" align="end">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar trabajador..."
                        value={workerSearch}
                        onChange={(e) => setWorkerSearch(e.target.value)}
                        className="pl-8 h-9"
                      />
                    </div>
                  </div>
                  <ScrollArea className="h-[200px]">
                    <div className="p-1">
                      <Button
                        variant={selectedWorker === "all" ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-start font-normal h-8"
                        onClick={() => {
                          setSelectedWorker("all");
                          setWorkerSearch("");
                          setWorkerPopoverOpen(false);
                        }}
                      >
                        <Users className="mr-2 h-4 w-4" />
                        Todos los trabajadores
                      </Button>
                      {workersInDepartment.slice(0, 50).map(worker => (
                        <Button
                          key={worker.id}
                          variant={selectedWorker === worker.id ? "secondary" : "ghost"}
                          size="sm"
                          className="w-full justify-start font-normal h-8"
                          onClick={() => {
                            setSelectedWorker(worker.id);
                            setWorkerSearch("");
                            setWorkerPopoverOpen(false);
                          }}
                        >
                          <span className="truncate">{worker.name}</span>
                          <Badge variant="outline" className="ml-auto text-[10px] px-1.5">
                            {worker.worker_number}
                          </Badge>
                        </Button>
                      ))}
                      {workersInDepartment.length > 50 && (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          +{workersInDepartment.length - 50} más. Usa el buscador.
                        </p>
                      )}
                      {workersInDepartment.length === 0 && workerSearch && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No se encontraron trabajadores
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Worker Section */}
      {selectedWorker !== "all" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">{workers.find(w => w.id === selectedWorker)?.name}</CardTitle>
                  <CardDescription>
                    Nº {workers.find(w => w.id === selectedWorker)?.worker_number}
                    {" • "}
                    {departments.find(d => d.id === workers.find(w => w.id === selectedWorker)?.department_id)?.name || "Sin departamento"}
                  </CardDescription>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setSelectedWorker("all")}
              >
                Ver todos
              </Button>
            </div>
          </CardHeader>
          
          {/* History Section with Date Filters */}
          <CardContent className="pt-0">
            <Collapsible open={showTimeEntries} onOpenChange={setShowTimeEntries}>
              <div className="border rounded-lg">
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Historial de Fichajes</span>
                      <Badge variant="secondary" className="text-xs">
                        {selectedWorkerEntries.length} registros
                      </Badge>
                    </div>
                    {showTimeEntries ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  {/* Date Filters for History */}
                  <div className="px-3 pb-3 border-t pt-3">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className="text-xs text-muted-foreground">Filtrar por fecha:</span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                          >
                            <CalendarIcon className="mr-1.5 h-3 w-3" />
                            {historyDateRange.from ? format(historyDateRange.from, "dd/MM/yy", { locale: es }) : "Desde"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={historyDateRange.from}
                            onSelect={(date) => setHistoryDateRange(prev => ({ ...prev, from: date }))}
                            locale={es}
                            disabled={(date) => date > new Date() || (historyDateRange.to && date > historyDateRange.to)}
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                      <span className="text-xs text-muted-foreground">—</span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                          >
                            <CalendarIcon className="mr-1.5 h-3 w-3" />
                            {historyDateRange.to ? format(historyDateRange.to, "dd/MM/yy", { locale: es }) : "Hasta"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={historyDateRange.to}
                            onSelect={(date) => setHistoryDateRange(prev => ({ ...prev, to: date }))}
                            locale={es}
                            disabled={(date) => date > new Date() || (historyDateRange.from && date < historyDateRange.from)}
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                      <div className="flex gap-1 ml-auto">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setHistoryDateRange({ from: subWeeks(new Date(), 1), to: new Date() })}
                        >
                          1 sem
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setHistoryDateRange({ from: subMonths(new Date(), 1), to: new Date() })}
                        >
                          1 mes
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setHistoryDateRange({ from: subMonths(new Date(), 3), to: new Date() })}
                        >
                          3 meses
                        </Button>
                      </div>
                    </div>
                    
                    {/* Table */}
                    {selectedWorkerEntries.length > 0 ? (
                      <ScrollArea className="h-[350px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[100px] text-xs">Fecha</TableHead>
                              <TableHead className="w-[80px] text-xs">Entrada</TableHead>
                              <TableHead className="w-[80px] text-xs">Salida</TableHead>
                              <TableHead className="w-[80px] text-xs">Retraso</TableHead>
                              <TableHead className="w-[80px] text-xs">Estado</TableHead>
                              <TableHead className="text-xs">Observación</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedWorkerEntries.map((entry) => {
                              const hasDelay = (entry.delay_minutes || 0) >= delayThreshold;
                              return (
                                <TableRow key={entry.id}>
                                  <TableCell className="text-xs font-medium py-2">
                                    {format(parseISO(entry.entry_date), "dd/MM/yy", { locale: es })}
                                  </TableCell>
                                  <TableCell className="py-2">
                                    {entry.clock_in ? (
                                      <span className="font-mono text-xs">{entry.clock_in.slice(0, 5)}</span>
                                    ) : (
                                      <span className="text-muted-foreground text-xs">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="py-2">
                                    {entry.clock_out ? (
                                      <span className="font-mono text-xs">{entry.clock_out.slice(0, 5)}</span>
                                    ) : (
                                      <span className="text-muted-foreground text-xs">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="py-2">
                                    {entry.delay_minutes ? (
                                      <span className={cn(
                                        "font-mono text-xs",
                                        hasDelay && "text-orange-600 font-medium"
                                      )}>
                                        {entry.delay_minutes}m
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground text-xs">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="py-2">
                                    {entry.is_absence ? (
                                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Ausencia</Badge>
                                    ) : hasDelay ? (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-500 text-orange-600">Retraso</Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-500 text-green-600">OK</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="max-w-[150px] truncate text-xs text-muted-foreground py-2">
                                    {entry.observation || "-"}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    ) : (
                      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                        No hay registros en el rango seleccionado
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Retrasos</p>
                <p className="text-3xl font-bold mt-1">{currentStats.delays}</p>
                {renderChangeIndicator(delaysChange)}
              </div>
              <div className={`p-2 rounded-lg ${delaysChange > 0 ? "bg-red-100 dark:bg-red-900/30" : "bg-green-100 dark:bg-green-900/30"}`}>
                <Clock className={`h-5 w-5 ${delaysChange > 0 ? "text-red-600" : "text-green-600"}`} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{periodData.currentLabel}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ausencias</p>
                <p className="text-3xl font-bold mt-1">{currentStats.absences}</p>
                {renderChangeIndicator(absencesChange)}
              </div>
              <div className={`p-2 rounded-lg ${absencesChange > 0 ? "bg-red-100 dark:bg-red-900/30" : "bg-green-100 dark:bg-green-900/30"}`}>
                <UserX className={`h-5 w-5 ${absencesChange > 0 ? "text-red-600" : "text-green-600"}`} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{periodData.currentLabel}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Promedio Retraso</p>
                <p className="text-3xl font-bold mt-1">{currentStats.avgDelay}<span className="text-lg">m</span></p>
                {renderChangeIndicator(avgDelayChange)}
              </div>
              <div className={`p-2 rounded-lg ${avgDelayChange > 0 ? "bg-amber-100 dark:bg-amber-900/30" : "bg-green-100 dark:bg-green-900/30"}`}>
                <TrendingUp className={`h-5 w-5 ${avgDelayChange > 0 ? "text-amber-600" : "text-green-600"}`} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">por fichaje</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Trabajadores de Baja</p>
                <p className="text-3xl font-bold mt-1">{workersOnLeave}</p>
                <p className="text-xs text-muted-foreground">{leavePercentage}% del total</p>
              </div>
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">de {workers.length} empleados</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Trabajadores Activos</p>
                <p className="text-3xl font-bold mt-1">{activeWorkers}</p>
                <p className="text-xs text-muted-foreground">de {workers.length} totales</p>
              </div>
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{currentStats.totalEntries} fichajes registrados</p>
          </CardContent>
        </Card>
      </div>

      {/* Comparison Summary */}
      <Card className="bg-muted/30">
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{periodData.previousLabel}:</span>
              <Badge variant="outline">{previousStats.delays} retrasos</Badge>
              <Badge variant="outline">{previousStats.absences} ausencias</Badge>
            </div>
            <div className="text-muted-foreground">→</div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{periodData.currentLabel}:</span>
              <Badge variant="secondary" className="bg-primary/10">{currentStats.delays} retrasos</Badge>
              <Badge variant="secondary" className="bg-primary/10">{currentStats.absences} ausencias</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Trend Line Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              Tendencia de Incidencias
            </CardTitle>
            <CardDescription>
              Evolución en las últimas {comparisonMode === "weeks" ? "8 semanas" : "6 meses"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorDelays" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorAbsences" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} iconType="circle" />
                  <Area
                    type="monotone"
                    dataKey="delays"
                    name="Retrasos"
                    stroke="hsl(var(--chart-2))"
                    fillOpacity={1}
                    fill="url(#colorDelays)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="absences"
                    name="Ausencias"
                    stroke="hsl(var(--chart-1))"
                    fillOpacity={1}
                    fill="url(#colorAbsences)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Bar Chart Comparison */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-primary" />
              Comparativa por Período
            </CardTitle>
            <CardDescription>
              Incidencias totales por {comparisonMode === "weeks" ? "semana" : "mes"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} iconType="circle" />
                  <Bar dataKey="delays" name="Retrasos" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="absences" name="Ausencias" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===================== PERFORMANCE SECTION ===================== */}
      {perfData && perfData.workers.length > 0 && (() => {
        // Filter by selected department
        const filteredPerfWorkers = selectedDepartment === "all"
          ? perfData.workers
          : perfData.workers.filter((w: any) => w.department_id === selectedDepartment);

        if (filteredPerfWorkers.length === 0) return null;

        const BENCHMARK = 80;
        const values = filteredPerfWorkers.map((w: any) => Number(w.lines_hour));
        const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
        const avgPct = (avg / BENCHMARK) * 100;

        const greenCount = filteredPerfWorkers.filter((w: any) => (Number(w.lines_hour) / BENCHMARK) * 100 >= 100).length;
        const yellowCount = filteredPerfWorkers.filter((w: any) => { const p = (Number(w.lines_hour) / BENCHMARK) * 100; return p >= 75 && p < 100; }).length;
        const orangeCount = filteredPerfWorkers.filter((w: any) => { const p = (Number(w.lines_hour) / BENCHMARK) * 100; return p >= 50 && p < 75; }).length;
        const redCount = filteredPerfWorkers.filter((w: any) => (Number(w.lines_hour) / BENCHMARK) * 100 < 50).length;
        const total = filteredPerfWorkers.length;

        // Previous values from history
        const getWorkerPrevious = (workerId: string) => {
          const entries = perfData.history
            .filter((h: any) => h.worker_id === workerId)
            .sort((a: any, b: any) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());
          return entries.length >= 2 ? Number(entries[1].lines_hour) : null;
        };

        // Top/bottom rankings
        const ranked = filteredPerfWorkers
          .map((w: any) => {
            const prev = getWorkerPrevious(w.id);
            const diff = prev !== null ? Number(w.lines_hour) - prev : null;
            const dept = perfData.departments.find((d: any) => d.id === w.department_id);
            const lh = Number(w.lines_hour);
            const pct = (lh / BENCHMARK) * 100;
            return { ...w, lines_hour: lh, pct, prev, diff, deptName: dept?.name || "" };
          })
          .sort((a: any, b: any) => b.lines_hour - a.lines_hour);

        const top5 = ranked.slice(0, 5);
        const bottom5 = [...ranked].reverse().slice(0, 5);

        // Evolution timeline from history
        const dateMap = new Map<string, number[]>();
        const relevantWorkerIds = new Set(filteredPerfWorkers.map((w: any) => w.id));
        perfData.history
          .filter((h: any) => relevantWorkerIds.has(h.worker_id))
          .forEach((h: any) => {
            const d = h.recorded_at;
            if (!dateMap.has(d)) dateMap.set(d, []);
            dateMap.get(d)!.push(Number(h.lines_hour));
          });
        const evolutionData = Array.from(dateMap.entries())
          .map(([date, vals]) => ({
            date: format(parseISO(date), "dd/MM", { locale: es }),
            fullDate: format(parseISO(date), "dd MMM yyyy", { locale: es }),
            avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100,
          }))
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(-20);

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

        return (
          <>
            {/* Performance Header */}
            <div className="flex items-center gap-2 mt-2">
              <Activity className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Rendimiento Sacado H (80 l/h = 100%)</h3>
              <Badge variant="secondary" className="text-xs">{total} trabajadores</Badge>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <Card>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Media</p>
                      <p className={cn("text-2xl font-bold mt-1 tabular-nums", getColorClass(avgPct))}>
                        {avg.toFixed(2)} <span className="text-sm font-normal">l/h</span>
                      </p>
                      <p className={cn("text-xs mt-0.5 tabular-nums", getColorClass(avgPct))}>{avgPct.toFixed(0)}%</p>
                    </div>
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Activity className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4">
                  <p className="text-sm text-muted-foreground">≥100% (Verde)</p>
                  <p className="text-2xl font-bold mt-1 text-primary">{greenCount}</p>
                  <p className="text-xs text-muted-foreground">{total > 0 ? ((greenCount / total) * 100).toFixed(0) : 0}%</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4">
                  <p className="text-sm text-muted-foreground">75-99% (Amarillo)</p>
                  <p className="text-2xl font-bold mt-1 text-amber-500">{yellowCount}</p>
                  <p className="text-xs text-muted-foreground">{total > 0 ? ((yellowCount / total) * 100).toFixed(0) : 0}%</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4">
                  <p className="text-sm text-muted-foreground">50-74% (Naranja)</p>
                  <p className="text-2xl font-bold mt-1 text-orange-500">{orangeCount}</p>
                  <p className="text-xs text-muted-foreground">{total > 0 ? ((orangeCount / total) * 100).toFixed(0) : 0}%</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4">
                  <p className="text-sm text-muted-foreground">&lt;50% (Rojo)</p>
                  <p className="text-2xl font-bold mt-1 text-destructive">{redCount}</p>
                  <p className="text-xs text-muted-foreground">{total > 0 ? ((redCount / total) * 100).toFixed(0) : 0}%</p>
                </CardContent>
              </Card>
            </div>

            {/* Evolution */}
            {evolutionData.length >= 2 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Evolución del Rendimiento Medio
                  </CardTitle>
                  <CardDescription>Por fecha de importación</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={evolutionData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorPerf" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                        <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" domain={['auto', 'auto']} />
                        <Tooltip
                          formatter={(value: number) => [`${value.toFixed(2)} l/h (${((value / BENCHMARK) * 100).toFixed(0)}%)`, "Media"]}
                          labelFormatter={(label, payload) => payload?.[0]?.payload?.fullDate || label}
                          contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                        />
                        <ReferenceLine y={BENCHMARK} stroke="hsl(var(--chart-2))" strokeDasharray="5 5" label={{ value: "100% (80 l/h)", fontSize: 10 }} />
                        <ReferenceLine y={BENCHMARK * 0.75} stroke="hsl(var(--chart-4))" strokeDasharray="5 5" label={{ value: "75%", fontSize: 10 }} />
                        <Area
                          type="monotone"
                          dataKey="avg"
                          stroke="hsl(var(--primary))"
                          fillOpacity={1}
                          fill="url(#colorPerf)"
                          strokeWidth={2}
                          dot={{ r: 3, fill: "hsl(var(--primary))" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Rankings */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Top 5 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Trophy className="h-4 w-4 text-primary" />
                    Top 5 — Mejor Rendimiento
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {top5.map((w: any, i: number) => (
                      <div key={w.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            "text-lg font-bold w-6 text-center",
                            i === 0 ? "text-amber-500" : i === 1 ? "text-gray-400" : i === 2 ? "text-amber-700" : "text-muted-foreground"
                          )}>{i + 1}</span>
                          <div>
                            <p className="font-medium text-sm">{w.name}</p>
                            <a
                              href={`https://salix.verdnatura.es/#!/worker/${w.worker_number}/summary`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
                            >
                              #{w.worker_number} {selectedDepartment === "all" && w.deptName ? `• ${w.deptName}` : ""}
                            </a>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn("font-mono font-bold tabular-nums text-sm", getColorClass(w.pct))}>
                            {w.lines_hour.toFixed(2)} <span className="text-xs font-normal">({w.pct.toFixed(0)}%)</span>
                          </span>
                          {w.diff !== null && (
                            <span className={cn(
                              "text-xs flex items-center gap-0.5",
                              w.diff > 0 ? "text-primary" : w.diff < 0 ? "text-destructive" : "text-muted-foreground"
                            )}>
                              {w.diff > 0 ? <TrendingUp className="h-3 w-3" /> : w.diff < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                              {w.diff > 0 ? "+" : ""}{w.diff.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Bottom 5 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    5 Peores — Menor Rendimiento
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {bottom5.map((w: any, i: number) => (
                      <div key={w.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-destructive w-6 text-center">{i + 1}</span>
                          <div>
                            <p className="font-medium text-sm">{w.name}</p>
                            <a
                              href={`https://salix.verdnatura.es/#!/worker/${w.worker_number}/summary`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
                            >
                              #{w.worker_number} {selectedDepartment === "all" && w.deptName ? `• ${w.deptName}` : ""}
                            </a>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn("font-mono font-bold tabular-nums text-sm", getColorClass(w.pct))}>
                            {w.lines_hour.toFixed(2)} <span className="text-xs font-normal">({w.pct.toFixed(0)}%)</span>
                          </span>
                          {w.diff !== null && (
                            <span className={cn(
                              "text-xs flex items-center gap-0.5",
                              w.diff > 0 ? "text-primary" : w.diff < 0 ? "text-destructive" : "text-muted-foreground"
                            )}>
                              {w.diff > 0 ? <TrendingUp className="h-3 w-3" /> : w.diff < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                              {w.diff > 0 ? "+" : ""}{w.diff.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Link to full table */}
            {onNavigateTab && (
              <div className="flex justify-center">
                <Button variant="outline" onClick={() => onNavigateTab("performance")} className="gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Ver tabla completa de rendimiento →
                </Button>
              </div>
            )}
          </>
        );
      })()}

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Distribution Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Distribución de Incidencias</CardTitle>
            <CardDescription>{periodData.currentLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={incidentDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {incidentDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 mt-2">
              {incidentDistribution.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span>{item.name}: {item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Workers with Incidents */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Trabajadores con más Incidencias
            </CardTitle>
            <CardDescription>{periodData.currentLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            {topIncidentWorkers.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">
                No hay incidencias en este período
              </p>
            ) : (
              <div className="space-y-3">
                {topIncidentWorkers.map((worker, index) => (
                  <div key={worker.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-muted-foreground w-6">{index + 1}</span>
                      <div>
                        <p className="font-medium text-sm">{worker.name}</p>
                        <p className="text-xs text-muted-foreground">#{worker.number}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {worker.delays > 0 && (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                          <Clock className="h-3 w-3 mr-1" />
                          {worker.delays}
                        </Badge>
                      )}
                      {worker.absences > 0 && (
                        <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20">
                          <UserX className="h-3 w-3 mr-1" />
                          {worker.absences}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Department Breakdown */}
        {selectedDepartment === "all" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Incidencias por Departamento</CardTitle>
              <CardDescription>{periodData.currentLabel}</CardDescription>
            </CardHeader>
            <CardContent>
              {departmentBreakdown.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  No hay incidencias en este período
                </p>
              ) : (
                <div className="space-y-3">
                  {departmentBreakdown.slice(0, 5).map((dept, index) => (
                    <div key={dept.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{dept.name}</span>
                        <span className="text-muted-foreground">{dept.total} total</span>
                      </div>
                      <div className="flex gap-1 h-2">
                        <div 
                          className="bg-amber-500 rounded-l" 
                          style={{ width: `${(dept.delays / dept.total) * 100}%` }}
                          title={`${dept.delays} retrasos`}
                        />
                        <div 
                          className="bg-red-500 rounded-r" 
                          style={{ width: `${(dept.absences / dept.total) * 100}%` }}
                          title={`${dept.absences} ausencias`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
