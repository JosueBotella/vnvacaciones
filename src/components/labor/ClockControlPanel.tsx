import { useState, useMemo, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  Settings, ChevronDown, ChevronRight, Search,
  Clock, Coffee, LogIn, LogOut, Save, Shield,
  Filter, ExternalLink, UtensilsCrossed, Sunrise, IceCream2,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────

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

type BreakInfo = {
  start: string;
  end: string;
  durationMin: number;
  type: "almuerzo" | "comida" | "merienda";
  isExcessive: boolean;
};

type WorkerAnalysis = {
  workerNumber: string;
  workerName: string;
  departmentName: string;
  workerId: string | null;
  teamId: string | null;
  teamName: string;
  clockIn: string | null;
  clockOut: string | null;
  scheduledStart: string | null;
  delayMinutes: number;
  isLate: boolean;
  breaks: BreakInfo[];
  totalBreakMinutes: number;
  breakCount: number;
  hasBreakIssue: boolean;
  status: "ok" | "late" | "break_excess" | "both";
};

type TeamGroup = {
  teamId: string | null;
  teamName: string;
  workers: WorkerAnalysis[];
  okCount: number;
  issueCount: number;
};

type DepartmentGroup = {
  name: string;
  teams: TeamGroup[];
  allWorkers: WorkerAnalysis[];
  okCount: number;
  lateCount: number;
  breakExcessCount: number;
  totalCount: number;
  okPercent: number;
};

type ControlSettings = {
  entry_tolerance_minutes: number;
  max_breaks_count: number;
  break_almuerzo_max_minutes: number;
  break_comida_max_minutes: number;
  break_merienda_max_minutes: number;
  max_total_break_minutes: number;
};

type TeamInfo = { id: string; name: string; department_id: string };
type Worker = { id: string; name: string; worker_number: string; worker_team_id: string | null; department_id: string };
type TeamSchedule = { worker_team_id: string | null; day_of_week: number; start_time: string | null; valid_from: string; valid_until: string | null };

type StatusFilter = "all" | "issues" | "late" | "break_excess";

// ── Helpers ────────────────────────────────────────────

const toTitleCase = (s: string): string =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const timeToMinutes = (t: string): number => {
  const p = t.split(":");
  return parseInt(p[0]) * 60 + parseInt(p[1]);
};

const fmt = (t: string | null): string => {
  if (!t) return "—";
  const p = t.split(":");
  return `${p[0]}:${p[1]}`;
};

const minutesToHM = (m: number): string => {
  if (m <= 0) return "0m";
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}h${min > 0 ? ` ${min}m` : ""}` : `${min}m`;
};

const salixWorkerUrl = (num: string) =>
  `https://salix.verdnatura.es/#!/worker/${num}/summary`;

const classifyBreakType = (durationMin: number): "almuerzo" | "comida" | "merienda" => {
  if (durationMin > 25) return "comida";
  return "almuerzo";
};

const DEFAULT_SETTINGS: ControlSettings = {
  entry_tolerance_minutes: 5,
  max_breaks_count: 1,
  break_almuerzo_max_minutes: 20,
  break_comida_max_minutes: 60,
  break_merienda_max_minutes: 20,
  max_total_break_minutes: 100,
};

// ── Component ──────────────────────────────────────────

export const ClockControlPanel = ({ selectedDate }: { selectedDate: string }) => {
  const [loading, setLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [entries, setEntries] = useState<SalixEntry[]>([]);
  const [schedules, setSchedules] = useState<TeamSchedule[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<ControlSettings>(DEFAULT_SETTINGS);
  const [selectedDepts, setSelectedDepts] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  // Weekly schedule config for partial_count awareness
  const [weeklyConfigs, setWeeklyConfigs] = useState<Record<string, any>>({});
  const [weeklyShiftConfigs, setWeeklyShiftConfigs] = useState<any[]>([]);

  // ── Data loading ─────────────────────────────────────

  useEffect(() => {
    const fetchMeta = async () => {
      const sessionToken = localStorage.getItem("manager_session_token");
      const [schedulesRes, workersRes, settingsRes, teamsRes] = await Promise.all([
        supabase.from("team_schedules").select("*"),
        supabase.functions.invoke("admin-operations", {
          body: { action: "getWorkers", sessionToken, data: {} },
        }),
        supabase.from("clock_control_settings").select("*").limit(1).maybeSingle(),
        supabase.from("worker_teams").select("id, name, department_id"),
      ]);
      setSchedules((schedulesRes.data || []) as TeamSchedule[]);
      if (workersRes.data?.success) setWorkers(workersRes.data.workers || []);
      if (settingsRes.data) {
        setSettings({
          entry_tolerance_minutes: settingsRes.data.entry_tolerance_minutes ?? 5,
          max_breaks_count: settingsRes.data.max_breaks_count ?? 1,
          break_almuerzo_max_minutes: (settingsRes.data as any).break_almuerzo_max_minutes ?? 20,
          break_comida_max_minutes: (settingsRes.data as any).break_comida_max_minutes ?? 60,
          break_merienda_max_minutes: (settingsRes.data as any).break_merienda_max_minutes ?? 20,
          max_total_break_minutes: (settingsRes.data as any).max_total_break_minutes ?? 100,
        });
      }
      setTeams((teamsRes.data || []) as TeamInfo[]);
    };
    fetchMeta();
  }, []);

  useEffect(() => { fetchEntries(); }, [selectedDate]);

  // Fetch weekly schedule config for the selected date (for partial_count awareness)
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
        // Merge all department configs into one map keyed by department_id
        const configs: Record<string, any> = {};
        for (const row of rows) {
          configs[row.department_id] = row.configuration;
        }
        setWeeklyConfigs(configs);
      } else {
        setWeeklyConfigs({});
      }

      // Also fetch shift configs for shift start/end times
      const { data: shifts } = await supabase
        .from("weekly_shift_configs" as any)
        .select("department_id, shift_key, start_time, end_time, is_rest")
        .eq("year", yr)
        .eq("week_number", weekNum);
      setWeeklyShiftConfigs(shifts || []);
    };
    fetchWeeklyConfig();
  }, [selectedDate]);

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const { data: res } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "getSalixClockEntries",
          sessionToken: localStorage.getItem("manager_session_token"),
          data: { punchDate: selectedDate, departmentName: "all" },
        },
      });
      if (res?.success) setEntries(res.entries || []);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const { error } = await supabase
        .from("clock_control_settings" as any)
        .update({
          entry_tolerance_minutes: settings.entry_tolerance_minutes,
          max_breaks_count: settings.max_breaks_count,
          break_almuerzo_max_minutes: settings.break_almuerzo_max_minutes,
          break_comida_max_minutes: settings.break_comida_max_minutes,
          break_merienda_max_minutes: settings.break_merienda_max_minutes,
          max_total_break_minutes: settings.max_total_break_minutes,
          updated_at: new Date().toISOString(),
        } as any)
        .not("id", "is", null);
      if (error) throw error;
      toast.success("Configuración guardada");
    } catch (err) { console.error(err); toast.error("Error al guardar"); }
    setSavingSettings(false);
  };

  const updateSetting = (key: keyof ControlSettings, val: number) =>
    setSettings((prev) => ({ ...prev, [key]: val }));

  // ── Scheduled start lookup (partial_count aware) ─────

  const getScheduledStart = useCallback(
    (workerId: string | null, clockIn: string | null): string | null => {
      if (!workerId) return null;
      const worker = workers.find((w) => w.id === workerId);
      if (!worker?.worker_team_id) return null;
      const dateObj = new Date(selectedDate + "T12:00:00");
      const dayOfWeek = dateObj.getDay();
      const dayKey = String(dayOfWeek);

      // Primary: team_schedules lookup
      const teamSchedule = schedules.find(
        (s) =>
          s.worker_team_id === worker.worker_team_id &&
          s.day_of_week === dayOfWeek &&
          s.start_time &&
          selectedDate >= s.valid_from &&
          (!s.valid_until || selectedDate <= s.valid_until)
      );
      const baseStart = teamSchedule?.start_time || null;

      // Check weekly config for partial assignments
      // If this team appears in a DIFFERENT shift with partial_count,
      // and the worker's clock-in is closer to that shift, use it instead
      const deptId = worker.department_id || (teams.find(t => t.id === worker.worker_team_id)?.department_id);
      const weekConfig = deptId ? weeklyConfigs[deptId] : null;
      
      if (weekConfig && typeof weekConfig === 'object' && clockIn) {
        const dayConfig = weekConfig[dayKey];
        if (dayConfig && typeof dayConfig === 'object') {
          const teamCell = dayConfig[worker.worker_team_id];
          // Find ALL shifts this team appears in (including partial assignments in other teams' cells)
          const possibleStarts: string[] = [];
          
          // The team's own cell start time
          if (teamCell?.start) {
            possibleStarts.push(teamCell.start);
          }
          
          // Check if this team has a partial_count assigned to a different shift
          // Look through all team entries in this day for partial assignments matching this team
          if (teamCell?.partial_count && teamCell.partial_count > 0 && teamCell?.start) {
            // This team itself has a partial assignment — its main start is already captured
            // The partial workers come at the same time as the team's assigned shift
            possibleStarts.push(teamCell.start);
          }

          // Also check: is this team's ID present in any OTHER configuration entry
          // with a different shift type? (team may have dual assignments via partial)
          for (const [otherTeamId, otherVal] of Object.entries(dayConfig)) {
            if (otherTeamId === worker.worker_team_id) continue;
            // Not relevant - partial is per-team, not cross-team
          }
          
          // If we have multiple possible start times, pick the closest to clock-in
          if (possibleStarts.length > 1 && clockIn) {
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

      // Also check: if no base schedule but the weekly config has this team with a start time
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
    [workers, schedules, selectedDate, weeklyConfigs, teams]
  );

  const getTeamInfo = useCallback(
    (workerId: string | null): { teamId: string | null; teamName: string } => {
      if (!workerId) return { teamId: null, teamName: "Sin equipo" };
      const worker = workers.find((w) => w.id === workerId);
      if (!worker?.worker_team_id) return { teamId: null, teamName: "Sin equipo" };
      const team = teams.find((t) => t.id === worker.worker_team_id);
      return { teamId: worker.worker_team_id, teamName: team?.name || "Sin equipo" };
    },
    [workers, teams]
  );

  // ── Analysis ─────────────────────────────────────────

  const departmentGroups = useMemo((): DepartmentGroup[] => {
    const grouped = new Map<string, SalixEntry[]>();
    for (const e of entries) {
      const key = e.worker_number;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(e);
    }

    const workerAnalyses: WorkerAnalysis[] = [];
    for (const [wn, ents] of grouped) {
      const sorted = [...ents].sort((a, b) => a.punch_time.localeCompare(b.punch_time));
      const first = sorted[0];

      const clockIn = sorted.find((e) => e.direction === "in")?.punch_time || null;
      const clockOut = sorted.find((e) => e.direction === "out")?.punch_time || null;

      const middles = sorted.filter((e) => e.direction === "middle");
      const breaks: BreakInfo[] = [];
      for (let i = 0; i < middles.length - 1; i += 2) {
        const dur = timeToMinutes(middles[i + 1].punch_time) - timeToMinutes(middles[i].punch_time);
        const bType = classifyBreakType(dur);
        const limit = bType === "comida"
          ? settings.break_comida_max_minutes
          : settings.break_almuerzo_max_minutes;
        breaks.push({
          start: middles[i].punch_time,
          end: middles[i + 1].punch_time,
          durationMin: dur,
          type: bType,
          isExcessive: dur > limit,
        });
      }

      const totalBreakMinutes = breaks.reduce((s, b) => s + b.durationMin, 0);
      const breakCount = breaks.length;

      const scheduledStart = getScheduledStart(first.worker_id, clockIn);
      let delayMinutes = 0;
      if (clockIn && scheduledStart) {
        const delay = timeToMinutes(clockIn) - timeToMinutes(scheduledStart);
        delayMinutes = delay > 0 ? delay : 0;
      }

      const isLate = delayMinutes > settings.entry_tolerance_minutes;
      const hasBreakIssue =
        breaks.some((b) => b.isExcessive) ||
        breakCount > settings.max_breaks_count ||
        totalBreakMinutes > settings.max_total_break_minutes;

      const { teamId, teamName } = getTeamInfo(first.worker_id);

      let status: WorkerAnalysis["status"] = "ok";
      if (isLate && hasBreakIssue) status = "both";
      else if (isLate) status = "late";
      else if (hasBreakIssue) status = "break_excess";

      workerAnalyses.push({
        workerNumber: wn,
        workerName: toTitleCase(first.worker_name),
        departmentName: toTitleCase(first.department_name),
        workerId: first.worker_id,
        teamId,
        teamName,
        clockIn,
        clockOut,
        scheduledStart,
        delayMinutes,
        isLate,
        breaks,
        totalBreakMinutes,
        breakCount,
        hasBreakIssue,
        status,
      });
    }

    // Apply search + status filter
    const filtered = workerAnalyses.filter((w) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!w.workerName.toLowerCase().includes(q) && !w.workerNumber.includes(q)) return false;
      }
      if (statusFilter === "all") return true;
      if (statusFilter === "issues") return w.status !== "ok";
      if (statusFilter === "late") return w.isLate;
      if (statusFilter === "break_excess") return w.hasBreakIssue;
      return true;
    });

    // Group by department
    const deptMap = new Map<string, WorkerAnalysis[]>();
    for (const wa of filtered) {
      const dept = wa.departmentName || "Sin departamento";
      if (!deptMap.has(dept)) deptMap.set(dept, []);
      deptMap.get(dept)!.push(wa);
    }

    const groups: DepartmentGroup[] = [];
    for (const [name, wrkrs] of deptMap) {
      const teamMap = new Map<string, WorkerAnalysis[]>();
      for (const w of wrkrs) {
        const tk = w.teamName;
        if (!teamMap.has(tk)) teamMap.set(tk, []);
        teamMap.get(tk)!.push(w);
      }

      const teamsArr: TeamGroup[] = [];
      for (const [tn, tw] of teamMap) {
        const sortedW = [...tw].sort((a, b) => {
          const o = { both: 0, late: 1, break_excess: 2, ok: 3 };
          return o[a.status] - o[b.status];
        });
        teamsArr.push({
          teamId: sortedW[0]?.teamId || null,
          teamName: tn,
          workers: sortedW,
          okCount: sortedW.filter((w) => w.status === "ok").length,
          issueCount: sortedW.filter((w) => w.status !== "ok").length,
        });
      }
      teamsArr.sort((a, b) => {
        if (a.teamName === "Sin equipo") return 1;
        if (b.teamName === "Sin equipo") return -1;
        return a.teamName.localeCompare(b.teamName);
      });

      const okCount = wrkrs.filter((w) => w.status === "ok").length;
      groups.push({
        name,
        teams: teamsArr,
        allWorkers: wrkrs,
        okCount,
        lateCount: wrkrs.filter((w) => w.isLate).length,
        breakExcessCount: wrkrs.filter((w) => w.hasBreakIssue).length,
        totalCount: wrkrs.length,
        okPercent: wrkrs.length > 0 ? Math.round((okCount / wrkrs.length) * 100) : 100,
      });
    }

    return groups.sort((a, b) => a.okPercent - b.okPercent);
  }, [entries, getScheduledStart, getTeamInfo, settings, statusFilter, searchQuery]);

  // Initialize selected departments
  useEffect(() => {
    if (departmentGroups.length > 0 && selectedDepts.size === 0) {
      setSelectedDepts(new Set(departmentGroups.map((d) => d.name)));
    }
  }, [departmentGroups]);

  const allDeptNames = useMemo(
    () => [...new Set(departmentGroups.map((d) => d.name))].sort(),
    [departmentGroups]
  );

  const visibleGroups = useMemo(
    () => departmentGroups.filter((d) => selectedDepts.has(d.name)),
    [departmentGroups, selectedDepts]
  );

  const globalStats = useMemo(() => {
    const all = departmentGroups.flatMap((g) => g.allWorkers);
    return {
      total: all.length,
      ok: all.filter((w) => w.status === "ok").length,
      late: all.filter((w) => w.isLate).length,
      breakExcess: all.filter((w) => w.hasBreakIssue).length,
    };
  }, [departmentGroups]);

  const toggleDept = (name: string) => {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  // ── Render ───────────────────────────────────────────

  if (loading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Shield className="h-8 w-8 mb-3 opacity-30" />
        <p className="text-sm font-medium">Sin fichadas para esta fecha</p>
        <p className="text-xs mt-1 opacity-60">Importa un CSV de Salix para empezar</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Summary pills ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <Pill value={globalStats.total} label="total" />
        <span className="text-muted-foreground/30">·</span>
        <Pill value={globalStats.ok} label="ok" dotColor="bg-emerald-500" />
        <span className="text-muted-foreground/30">·</span>
        <Pill value={globalStats.late} label="retrasos" dotColor="bg-amber-500" />
        <span className="text-muted-foreground/30">·</span>
        <Pill value={globalStats.breakExcess} label="descansos" dotColor="bg-orange-500" />
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input
            placeholder="Buscar trabajador..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm bg-muted/30 border-0 focus-visible:ring-1"
          />
        </div>

        {/* Department filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <Filter className="h-3.5 w-3.5" />
              Dptos ({selectedDepts.size}/{allDeptNames.length})
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 max-h-72 overflow-y-auto" align="start">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Departamentos</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={() => setSelectedDepts(new Set(allDeptNames))}>Todos</Button>
                <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={() => setSelectedDepts(new Set())}>Ninguno</Button>
              </div>
            </div>
            <div className="space-y-0.5">
              {allDeptNames.map((dn) => (
                <label key={dn} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50 cursor-pointer text-xs">
                  <Checkbox
                    checked={selectedDepts.has(dn)}
                    onCheckedChange={(checked) => {
                      setSelectedDepts((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(dn); else next.delete(dn);
                        return next;
                      });
                    }}
                  />
                  {dn}
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Status pills */}
        <div className="flex gap-1 ml-auto">
          {([
            { key: "all", label: "Todos" },
            { key: "issues", label: "Problemas" },
            { key: "late", label: "Retrasos" },
            { key: "break_excess", label: "Descansos" },
          ] as { key: StatusFilter; label: string }[]).map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                statusFilter === f.key
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Settings */}
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setSettingsOpen(true)}>
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Settings Sheet ── */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent className="w-80 sm:w-96">
          <SheetHeader>
            <SheetTitle className="text-base">Configuración</SheetTitle>
            <SheetDescription className="text-xs">Umbrales de puntualidad y descansos</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            {/* Entry */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <LogIn className="h-3.5 w-3.5" /> Entrada
              </h4>
              <SettingRow label="Tolerancia" value={settings.entry_tolerance_minutes} onChange={(v) => updateSetting("entry_tolerance_minutes", v)} suffix="min" max={60} />
            </div>

            {/* Breaks */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Coffee className="h-3.5 w-3.5" /> Descansos
              </h4>
              <div className="space-y-3">
                <SettingRow label="Almuerzo máx" value={settings.break_almuerzo_max_minutes} onChange={(v) => updateSetting("break_almuerzo_max_minutes", v)} suffix="min" icon={<Sunrise className="h-3 w-3 text-amber-500" />} max={60} />
                <SettingRow label="Comida máx" value={settings.break_comida_max_minutes} onChange={(v) => updateSetting("break_comida_max_minutes", v)} suffix="min" icon={<UtensilsCrossed className="h-3 w-3 text-orange-500" />} max={120} />
                <SettingRow label="Merienda máx" value={settings.break_merienda_max_minutes} onChange={(v) => updateSetting("break_merienda_max_minutes", v)} suffix="min" icon={<IceCream2 className="h-3 w-3 text-pink-500" />} max={60} />
              </div>
            </div>

            {/* Limits */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" /> Límites
              </h4>
              <div className="space-y-3">
                <SettingRow label="Máx descansos" value={settings.max_breaks_count} onChange={(v) => updateSetting("max_breaks_count", v)} max={10} />
                <SettingRow label="Máx total" value={settings.max_total_break_minutes} onChange={(v) => updateSetting("max_total_break_minutes", v)} suffix="min" max={180} />
              </div>
            </div>

            <Button className="w-full" size="sm" onClick={saveSettings} disabled={savingSettings}>
              <Save className="h-4 w-4 mr-1.5" />
              {savingSettings ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Department groups ── */}
      <div className="space-y-2">
        {visibleGroups.map((dept) => {
          const isExpanded = expandedDepts.has(dept.name);
          return (
            <div key={dept.name} className="rounded-lg border bg-card overflow-hidden">
              <Collapsible open={isExpanded} onOpenChange={() => toggleDept(dept.name)}>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer">
                    {isExpanded
                      ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    }
                    <span className="text-sm font-medium truncate">{dept.name}</span>

                    {/* Inline progress bar */}
                    <div className="flex-1 mx-2 hidden sm:block">
                      <div className="h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${dept.okPercent}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                      <span className="text-emerald-600 font-medium">{dept.okCount}</span>
                      <span>/</span>
                      <span>{dept.totalCount}</span>
                      {dept.lateCount > 0 && (
                        <span className="flex items-center gap-0.5 text-amber-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          {dept.lateCount}
                        </span>
                      )}
                      {dept.breakExcessCount > 0 && (
                        <span className="flex items-center gap-0.5 text-orange-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                          {dept.breakExcessCount}
                        </span>
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t">
                    {dept.teams.map((team) => (
                      <div key={team.teamName}>
                        {/* Team header */}
                        {dept.teams.length > 1 && (
                          <div className={cn(
                            "flex items-center justify-between px-4 py-1.5 text-xs",
                            team.teamName === "Sin equipo"
                              ? "border-l-2 border-l-muted-foreground/20 bg-muted/20"
                              : "border-l-2 border-l-primary/30 bg-muted/30"
                          )}>
                            <span className="font-medium text-muted-foreground">{team.teamName}</span>
                            <span className="text-muted-foreground/60">{team.okCount}/{team.workers.length}</span>
                          </div>
                        )}
                        {/* Worker rows */}
                        {team.workers.map((w) => (
                          <WorkerRow key={w.workerNumber} w={w} />
                        ))}
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          );
        })}

        {visibleGroups.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground/60">
            Sin resultados. Ajusta los filtros.
          </div>
        )}
      </div>
    </div>
  );
};

// ── Sub-components ─────────────────────────────────────

function Pill({ value, label, dotColor }: { value: number; label: string; dotColor?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      {dotColor && <span className={cn("h-2 w-2 rounded-full", dotColor)} />}
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </span>
  );
}

function SettingRow({ label, value, onChange, suffix, icon, max = 999 }: {
  label: string; value: number; onChange: (v: number) => void; suffix?: string; icon?: React.ReactNode; max?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-xs flex items-center gap-1.5 text-muted-foreground">{icon}{label}</Label>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          min={0}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-7 w-16 text-xs text-center"
        />
        {suffix && <span className="text-[10px] text-muted-foreground w-6">{suffix}</span>}
      </div>
    </div>
  );
}

function WorkerRow({ w }: { w: WorkerAnalysis }) {
  const statusDot = (() => {
    switch (w.status) {
      case "both": return "bg-destructive";
      case "late": return "bg-amber-500";
      case "break_excess": return "bg-orange-500";
      default: return "bg-emerald-500";
    }
  })();

  const rowBg = w.status !== "ok" ? "bg-muted/20" : "";

  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-2 border-t border-border/50 text-sm hover:bg-muted/30 transition-colors",
      rowBg
    )}>
      {/* Status dot */}
      <span className={cn("h-2 w-2 rounded-full shrink-0", statusDot)} />

      {/* Name + Salix link */}
      <div className="min-w-0 flex-1">
        <span className="font-medium text-sm">{w.workerName}</span>
        <a
          href={salixWorkerUrl(w.workerNumber)}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-2 text-xs text-muted-foreground hover:text-primary font-mono inline-flex items-center gap-0.5"
        >
          {w.workerNumber}
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>

      {/* Entry time */}
      <div className="flex items-center gap-1 text-xs font-mono shrink-0">
        <LogIn className="h-3 w-3 text-muted-foreground/50" />
        <span>{fmt(w.clockIn)}</span>
        {w.scheduledStart && (
          <span className="text-muted-foreground/40 hidden sm:inline">({fmt(w.scheduledStart)})</span>
        )}
      </div>

      {/* Delay indicator */}
      <div className="w-14 text-center shrink-0">
        {w.isLate ? (
          <span className="text-xs font-semibold text-amber-600">+{w.delayMinutes}m</span>
        ) : w.scheduledStart ? (
          <span className="text-emerald-500 text-xs">✓</span>
        ) : (
          <span className="text-muted-foreground/30 text-xs">—</span>
        )}
      </div>

      {/* Break info */}
      <div className="w-20 text-center shrink-0 hidden sm:block">
        {w.breaks.length > 0 ? (
          <div className="flex items-center justify-center gap-1">
            {w.breaks.map((b, i) => (
              <span
                key={i}
                className={cn(
                  "text-[10px] font-mono px-1 py-0.5 rounded",
                  b.isExcessive ? "bg-orange-500/15 text-orange-600 font-semibold" : "text-muted-foreground"
                )}
                title={`${b.type}: ${fmt(b.start)}–${fmt(b.end)}`}
              >
                {minutesToHM(b.durationMin)}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground/30 text-xs">—</span>
        )}
      </div>

      {/* Exit time */}
      <div className="flex items-center gap-1 text-xs font-mono shrink-0 text-muted-foreground">
        <LogOut className="h-3 w-3 text-muted-foreground/50" />
        <span>{fmt(w.clockOut)}</span>
      </div>
    </div>
  );
}
