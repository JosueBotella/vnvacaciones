import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Upload, Search, Clock, ChevronDown, ChevronRight, AlertTriangle,
  CheckCircle, Coffee, LogIn, LogOut, Timer, FileText, Users
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type SalixEntry = {
  id: string;
  worker_number: string;
  worker_name: string;
  department_name: string;
  punch_date: string;
  punch_time: string;
  direction: "in" | "middle" | "out";
  worker_id: string | null;
};

type WorkerPunches = {
  workerNumber: string;
  workerName: string;
  departmentName: string;
  workerId: string | null;
  entries: SalixEntry[];
  clockIn: string | null;
  clockOut: string | null;
  breaks: { start: string; end: string }[];
  totalWorkedMinutes: number;
  totalBreakMinutes: number;
  scheduledStart: string | null;
  delayMinutes: number;
};

type TeamSchedule = {
  worker_team_id: string | null;
  work_group_id: string | null;
  day_of_week: number;
  start_time: string | null;
  end_time: string | null;
  valid_from: string;
  valid_until: string | null;
  department_id: string;
  schedule_type: string;
};

type Worker = {
  id: string;
  name: string;
  worker_number: string;
  worker_team_id: string | null;
  department_id: string;
};

const timeToMinutes = (t: string): number => {
  const parts = t.split(":");
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
};

const formatTimeShort = (t: string): string => {
  const parts = t.split(":");
  return `${parts[0]}:${parts[1]}`;
};

const minutesToHM = (m: number): string => {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
};

export const SalixClockPanel = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [entries, setEntries] = useState<SalixEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedDept, setSelectedDept] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [availableDepts, setAvailableDepts] = useState<string[]>([]);
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<TeamSchedule[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [hasData, setHasData] = useState(false);
  // Weekly schedule config for partial_count awareness
  const [weeklyConfigs, setWeeklyConfigs] = useState<Record<string, any>>({});

  // Fetch schedules and workers on mount
  useEffect(() => {
    const fetchMeta = async () => {
      const [schedulesRes, workersRes] = await Promise.all([
        supabase.from("team_schedules").select("*"),
        supabase.functions.invoke("admin-operations", {
          body: {
            action: "getWorkers",
            sessionToken: localStorage.getItem("manager_session_token"),
            data: {},
          },
        }),
      ]);
      setSchedules((schedulesRes.data || []) as TeamSchedule[]);
      if (workersRes.data?.success) setWorkers(workersRes.data.workers || []);

      // Check available dates
      const { data: datesRes } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "getSalixAvailableDates",
          sessionToken: localStorage.getItem("manager_session_token"),
          data: {},
        },
      });
      if (datesRes?.success && datesRes.dates?.length > 0) {
        setAvailableDates(datesRes.dates);
        setHasData(true);
        setSelectedDate(datesRes.dates[0]);
      }
    };
    fetchMeta();
  }, []);

  // Fetch weekly schedule config for partial_count awareness
  useEffect(() => {
    const fetchWeeklyConfig = async () => {
      const dateObj = new Date(selectedDate + "T12:00:00");
      const dayNum = dateObj.getUTCDay() || 7;
      const thu = new Date(dateObj);
      thu.setUTCDate(dateObj.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
      const weekNum = Math.ceil((((thu.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      const yr = thu.getUTCFullYear();

      const { data: rows } = await supabase
        .from("weekly_schedules")
        .select("configuration, department_id")
        .eq("year", yr)
        .eq("week_number", weekNum);

      if (rows && rows.length > 0) {
        const configs: Record<string, any> = {};
        for (const row of rows) {
          configs[row.department_id] = row.configuration;
        }
        setWeeklyConfigs(configs);
      } else {
        setWeeklyConfigs({});
      }
    };
    fetchWeeklyConfig();
  }, [selectedDate]);

  // Fetch entries when date changes
  useEffect(() => {
    if (hasData) fetchEntries();
  }, [selectedDate, selectedDept, hasData]);

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const { data: res } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "getSalixClockEntries",
          sessionToken: localStorage.getItem("manager_session_token"),
          data: { punchDate: selectedDate, departmentName: selectedDept },
        },
      });
      if (res?.success) {
        setEntries(res.entries || []);
        if (res.availableDepartments) setAvailableDepts(res.availableDepartments);
        if (res.availableDates) setAvailableDates(res.availableDates);
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al cargar fichadas");
    }
    setLoading(false);
  };

  // Get scheduled start for a worker on the selected date (partial_count aware)
  const getScheduledStart = useCallback(
    (workerId: string | null, clockIn: string | null): string | null => {
      if (!workerId) return null;
      const worker = workers.find((w) => w.id === workerId);
      if (!worker?.worker_team_id) return null;

      const dateObj = new Date(selectedDate + "T12:00:00");
      const dayOfWeek = dateObj.getDay();
      const dayKey = String(dayOfWeek);

      const schedule = schedules.find(
        (s) =>
          s.worker_team_id === worker.worker_team_id &&
          s.day_of_week === dayOfWeek &&
          s.start_time &&
          selectedDate >= s.valid_from &&
          (!s.valid_until || selectedDate <= s.valid_until)
      );
      const baseStart = schedule?.start_time || null;

      // Check weekly config for partial assignments
      const deptId = worker.department_id;
      const weekConfig = deptId ? weeklyConfigs[deptId] : null;

      if (weekConfig && typeof weekConfig === 'object' && clockIn) {
        const dayConfig = weekConfig[dayKey];
        if (dayConfig && typeof dayConfig === 'object') {
          const teamCell = dayConfig[worker.worker_team_id];
          if (teamCell?.start && teamCell.type !== 'rest' && teamCell.type !== 'vacation') {
            // If the team has a partial_count, the worker might be on this shift
            // Use the closest start time to the actual clock-in
            const possibleStarts: string[] = [];
            if (baseStart) possibleStarts.push(baseStart);
            if (teamCell.start !== baseStart) possibleStarts.push(teamCell.start);

            if (possibleStarts.length > 1) {
              const clockInMin = timeToMinutes(clockIn);
              let closest = possibleStarts[0];
              let minDiff = Math.abs(clockInMin - timeToMinutes(possibleStarts[0]));
              for (let i = 1; i < possibleStarts.length; i++) {
                const diff = Math.abs(clockInMin - timeToMinutes(possibleStarts[i]));
                if (diff < minDiff) {
                  minDiff = diff;
                  closest = possibleStarts[i];
                }
              }
              return closest;
            }
          }
        }
      }

      // Fallback: use weekly config if no team_schedule
      if (!baseStart && weekConfig) {
        const dayConfig = weekConfig[dayKey];
        if (dayConfig && typeof dayConfig === 'object') {
          const teamCell = dayConfig[worker.worker_team_id];
          if (teamCell?.start && teamCell.type !== 'rest' && teamCell.type !== 'vacation') {
            return teamCell.start;
          }
        }
      }

      return baseStart;
    },
    [workers, schedules, selectedDate, weeklyConfigs]
  );

  // Group entries by worker
  const workerPunches = useMemo((): WorkerPunches[] => {
    const grouped = new Map<string, SalixEntry[]>();
    for (const e of entries) {
      const key = e.worker_number;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(e);
    }

    const result: WorkerPunches[] = [];
    for (const [wn, ents] of grouped) {
      const sorted = [...ents].sort((a, b) => a.punch_time.localeCompare(b.punch_time));
      const first = sorted[0];

      const clockIn = sorted.find((e) => e.direction === "in")?.punch_time || null;
      const clockOut = sorted.find((e) => e.direction === "out")?.punch_time || null;

      // Pair middles as breaks
      const middles = sorted.filter((e) => e.direction === "middle");
      const breaks: { start: string; end: string }[] = [];
      for (let i = 0; i < middles.length - 1; i += 2) {
        breaks.push({ start: middles[i].punch_time, end: middles[i + 1].punch_time });
      }

      // Calculate total break minutes
      const totalBreakMinutes = breaks.reduce((sum, b) => {
        return sum + (timeToMinutes(b.end) - timeToMinutes(b.start));
      }, 0);

      // Calculate total worked minutes
      let totalWorkedMinutes = 0;
      if (clockIn && clockOut) {
        totalWorkedMinutes = timeToMinutes(clockOut) - timeToMinutes(clockIn) - totalBreakMinutes;
      }

      const scheduledStart = getScheduledStart(first.worker_id, clockIn);
      let delayMinutes = 0;
      if (clockIn && scheduledStart) {
        const delay = timeToMinutes(clockIn) - timeToMinutes(scheduledStart);
        delayMinutes = delay > 0 ? delay : 0;
      }

      result.push({
        workerNumber: wn,
        workerName: first.worker_name,
        departmentName: first.department_name,
        workerId: first.worker_id,
        entries: sorted,
        clockIn,
        clockOut,
        breaks,
        totalWorkedMinutes,
        totalBreakMinutes,
        scheduledStart,
        delayMinutes,
      });
    }

    return result.sort((a, b) => a.workerName.localeCompare(b.workerName));
  }, [entries, getScheduledStart]);

  // Filter
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return workerPunches;
    const q = searchQuery.toLowerCase();
    return workerPunches.filter(
      (w) =>
        w.workerName.toLowerCase().includes(q) ||
        w.workerNumber.includes(q) ||
        w.departmentName.toLowerCase().includes(q)
    );
  }, [workerPunches, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const delays = workerPunches.filter((w) => w.delayMinutes > 0).length;
    const noSchedule = workerPunches.filter((w) => !w.scheduledStart).length;
    const withSchedule = workerPunches.filter((w) => w.scheduledStart).length;
    return { total: workerPunches.length, delays, noSchedule, withSchedule };
  }, [workerPunches]);

  // CSV Import
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.trim().split(/\r?\n/);
      const header = lines[0];
      const dataLines = lines.slice(1);

      // Parse CSV
      const parsed: any[] = [];
      for (const line of dataLines) {
        const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
        if (cols.length < 6) continue;

        parsed.push({
          worker_number: cols[0],
          worker_name: cols[1],
          department_name: cols[2],
          punch_date: cols[3],
          punch_time: cols[4],
          direction: cols[5],
        });
      }

      if (parsed.length === 0) {
        toast.error("No se encontraron fichadas en el CSV");
        setImporting(false);
        return;
      }

      // Send to edge function
      const { data: res } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "importSalixClock",
          sessionToken: localStorage.getItem("manager_session_token"),
          data: { entries: parsed },
        },
      });

      if (res?.success) {
        toast.success(
          `Importadas ${res.imported} fichadas. ${res.matched} vinculadas, ${res.unmatched} sin vincular.`
        );
        setHasData(true);
        // Set the date to the first imported date
        const firstDate = parsed[0]?.punch_date;
        if (firstDate) setSelectedDate(firstDate);
        if (fileInputRef.current) fileInputRef.current.value = "";
        fetchEntries();
        // Refresh available dates
        const { data: datesRes } = await supabase.functions.invoke("admin-operations", {
          body: {
            action: "getSalixAvailableDates",
            sessionToken: localStorage.getItem("manager_session_token"),
            data: {},
          },
        });
        if (datesRes?.success) setAvailableDates(datesRes.dates || []);
      } else {
        toast.error(res?.error || "Error al importar");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al procesar el CSV");
    }
    setImporting(false);
  };

  const getDirectionIcon = (dir: string) => {
    switch (dir) {
      case "in": return <LogIn className="h-3.5 w-3.5 text-green-500" />;
      case "out": return <LogOut className="h-3.5 w-3.5 text-red-500" />;
      case "middle": return <Coffee className="h-3.5 w-3.5 text-amber-500" />;
      default: return null;
    }
  };

  const getDirectionLabel = (dir: string, idx: number, middles: SalixEntry[]) => {
    if (dir === "in") return "Entrada";
    if (dir === "out") return "Salida";
    // For middles, determine if it's break-start or break-end
    const middleIdx = middles.findIndex((m) => m.punch_time === middles[idx]?.punch_time);
    return middleIdx % 2 === 0 ? "Sale descanso" : "Vuelve descanso";
  };

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5 text-primary" />
              Fichadas Salix
            </CardTitle>
            <CardDescription>
              Importa y consulta fichadas del CSV de Salix con comparativa de horarios
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload className="h-4 w-4 mr-1" />
            {importing ? "Importando..." : "Cargar CSV"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={selectedDate} onValueChange={setSelectedDate}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Fecha" />
            </SelectTrigger>
            <SelectContent>
              {availableDates.map((d) => (
                <SelectItem key={d} value={d}>
                  {format(new Date(d + "T12:00:00"), "EEEE dd/MM/yyyy", { locale: es })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedDept} onValueChange={setSelectedDept}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Departamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los dptos.</SelectItem>
              {availableDepts.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, número o dpto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {/* Stats */}
        {hasData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-lg border bg-card p-3 text-center">
              <div className="text-2xl font-bold text-foreground">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Trabajadores</div>
            </div>
            <div className="rounded-lg border bg-card p-3 text-center">
              <div className="text-2xl font-bold text-foreground">{stats.withSchedule}</div>
              <div className="text-xs text-muted-foreground">Con horario</div>
            </div>
            <div className="rounded-lg border bg-card p-3 text-center">
              <div className={cn("text-2xl font-bold", stats.delays > 0 ? "text-amber-500" : "text-foreground")}>
                {stats.delays}
              </div>
              <div className="text-xs text-muted-foreground">Con retraso</div>
            </div>
            <div className="rounded-lg border bg-card p-3 text-center">
              <div className="text-2xl font-bold text-muted-foreground">{stats.noSchedule}</div>
              <div className="text-xs text-muted-foreground">Sin horario</div>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        )}

        {/* No data */}
        {!loading && !hasData && (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No hay fichadas importadas</p>
            <p className="text-sm mt-1">Importa un CSV de Salix para empezar</p>
          </div>
        )}

        {/* Table */}
        {!loading && hasData && filtered.length > 0 && (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Trabajador</TableHead>
                  <TableHead className="hidden sm:table-cell">Departamento</TableHead>
                  <TableHead>Entrada</TableHead>
                  <TableHead className="hidden md:table-cell">Descansos</TableHead>
                  <TableHead>Salida</TableHead>
                  <TableHead className="hidden md:table-cell">Horario</TableHead>
                  <TableHead>Retraso</TableHead>
                  <TableHead className="hidden lg:table-cell">T. Efectivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((wp) => {
                  const isExpanded = expandedWorker === wp.workerNumber;
                  const middles = wp.entries.filter((e) => e.direction === "middle");

                  return (
                    <Collapsible key={wp.workerNumber} open={isExpanded} onOpenChange={() => setExpandedWorker(isExpanded ? null : wp.workerNumber)} asChild>
                      <>
                        <CollapsibleTrigger asChild>
                          <TableRow
                            className={cn(
                              "cursor-pointer transition-colors",
                              wp.delayMinutes > 0 && "bg-amber-500/5 hover:bg-amber-500/10",
                              !wp.scheduledStart && wp.workerId && "opacity-70"
                            )}
                          >
                            <TableCell className="w-8 p-2">
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-sm">{wp.workerName}</div>
                              <div className="text-xs text-muted-foreground">{wp.workerNumber}</div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                              {wp.departmentName}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <LogIn className="h-3 w-3 text-green-500" />
                                <span className="text-sm font-mono">
                                  {wp.clockIn ? formatTimeShort(wp.clockIn) : "—"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              {wp.breaks.length > 0 ? (
                                <Badge variant="outline" className="text-xs font-mono">
                                  <Coffee className="h-3 w-3 mr-1" />
                                  {wp.breaks.length}× ({minutesToHM(wp.totalBreakMinutes)})
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <LogOut className="h-3 w-3 text-red-500" />
                                <span className="text-sm font-mono">
                                  {wp.clockOut ? formatTimeShort(wp.clockOut) : "—"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              {wp.scheduledStart ? (
                                <span className="text-sm font-mono text-muted-foreground">
                                  {formatTimeShort(wp.scheduledStart)}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {wp.delayMinutes > 0 ? (
                                <Badge className="bg-amber-500/20 text-amber-600 border-0 text-xs">
                                  <Timer className="h-3 w-3 mr-0.5" />
                                  +{wp.delayMinutes}min
                                </Badge>
                              ) : wp.scheduledStart ? (
                                <Badge variant="outline" className="border-green-500/30 text-green-600 text-xs">
                                  <CheckCircle className="h-3 w-3 mr-0.5" />
                                  OK
                                </Badge>
                              ) : null}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              {wp.totalWorkedMinutes > 0 ? (
                                <span className="text-sm font-mono font-medium">
                                  {minutesToHM(wp.totalWorkedMinutes)}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        </CollapsibleTrigger>
                        <CollapsibleContent asChild>
                          <TableRow>
                            <TableCell colSpan={9} className="p-0 bg-muted/30">
                              <div className="p-4 space-y-3">
                                {/* Timeline */}
                                <div className="flex items-center gap-1 flex-wrap">
                                  {wp.entries.map((e, i) => {
                                    const middleIdx = e.direction === "middle"
                                      ? middles.indexOf(e)
                                      : -1;
                                    const isBreakStart = e.direction === "middle" && middleIdx % 2 === 0;
                                    const isBreakEnd = e.direction === "middle" && middleIdx % 2 === 1;

                                    return (
                                      <div key={e.id} className="flex items-center gap-1">
                                        {i > 0 && (
                                          <div className="w-4 h-px bg-border" />
                                        )}
                                        <div
                                          className={cn(
                                            "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-mono",
                                            e.direction === "in" && "bg-green-500/10 text-green-600",
                                            e.direction === "out" && "bg-red-500/10 text-red-600",
                                            isBreakStart && "bg-amber-500/10 text-amber-600",
                                            isBreakEnd && "bg-blue-500/10 text-blue-600"
                                          )}
                                        >
                                          {getDirectionIcon(e.direction)}
                                          {formatTimeShort(e.punch_time)}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* Schedule comparison */}
                                <div className="flex flex-wrap gap-4 text-sm">
                                  {wp.scheduledStart && (
                                    <div className="flex items-center gap-1.5 text-muted-foreground">
                                      <Clock className="h-3.5 w-3.5" />
                                      Horario programado: <span className="font-mono font-medium text-foreground">{formatTimeShort(wp.scheduledStart)}</span>
                                      {wp.delayMinutes > 0 && (
                                        <span className="text-amber-500 font-medium">
                                          (+{wp.delayMinutes} min retraso)
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {wp.totalWorkedMinutes > 0 && (
                                    <div className="flex items-center gap-1.5 text-muted-foreground">
                                      <Timer className="h-3.5 w-3.5" />
                                      Tiempo efectivo: <span className="font-mono font-medium text-foreground">{minutesToHM(wp.totalWorkedMinutes)}</span>
                                    </div>
                                  )}
                                  {wp.totalBreakMinutes > 0 && (
                                    <div className="flex items-center gap-1.5 text-muted-foreground">
                                      <Coffee className="h-3.5 w-3.5" />
                                      Descanso: <span className="font-mono font-medium text-foreground">{minutesToHM(wp.totalBreakMinutes)}</span>
                                    </div>
                                  )}
                                  {!wp.workerId && (
                                    <div className="flex items-center gap-1.5 text-amber-500">
                                      <AlertTriangle className="h-3.5 w-3.5" />
                                      Trabajador no vinculado en el sistema
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {!loading && hasData && filtered.length === 0 && entries.length > 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>No hay resultados para la búsqueda</p>
          </div>
        )}

        {!loading && hasData && entries.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>No hay fichadas para esta fecha</p>
          </div>
        )}
      </CardContent>

    </Card>
  );
};
