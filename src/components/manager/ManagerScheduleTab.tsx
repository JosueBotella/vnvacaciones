import { useCallback, useEffect, useMemo, useState } from "react";
import { DeptPills } from "@/components/DeptPills";
import { DepartmentSearchSelect } from "@/components/DepartmentSearchSelect";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  AlertCircle, 
  ChevronDown,
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Copy, 
  ExternalLink, 
  GripVertical, 
  Loader2, 
  Lock, 
  Save, 
  Timer,
  Users,
  X 
} from "lucide-react";
import {
  addDays,
  addWeeks,
  format,
  getISOWeek,
  getISOWeekYear,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

type Department = {
  id: string;
  name: string;
};

type WorkerTeam = {
  id: string;
  name: string;
  department_id: string;
  sort_order?: number;
  display_name?: string | null;
};

type Worker = {
  id: string;
  name: string;
  worker_number: string;
  worker_team_id?: string | null;
  department_id: string;
  work_group_id: string | null;
};

type WorkGroup = {
  id: string;
  name: string;
  color: string;
  department_id: string;
};

type DepartmentShift = {
  id: string;
  name: string;
  shift_key: string;
  color: string;
  start_time: string | null;
  end_time: string | null;
  is_rest: boolean;
  sort_order: number;
};

type ScheduleCell = {
  type: string;
  start?: string | null;
  end?: string | null;
};

type WeeklySchedule = {
  id: string;
  year: number;
  week_number: number;
  configuration: Record<string, Record<string, ScheduleCell>>;
};

type ScheduleChange = {
  dayKey: string;
  dayName: string;
  dayDate: string;
  teamId: string;
  teamName: string;
  fromShift: string;
  toShift: string;
  customStartTime?: string;
  customEndTime?: string;
  changeType: "move" | "time";
};

// Grouped team representation for UI
type GroupedTeam = {
  type: "parent" | "team";
  parentLetter: string;
  teams: WorkerTeam[];
  // For single team type
  team?: WorkerTeam;
};

// Sunday-first display (0=Sun, 1=Mon, ..., 6=Sat)
const DAY_HEADERS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DAY_KEYS = ["0", "1", "2", "3", "4", "5", "6"];
const DAY_NAMES_FULL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function getSalixTimeControlUrl(workerNumber: string) {
  return `https://salix.verdnatura.es/#/worker/${workerNumber}/time-control`;
}

function getTeamBadgeLabel(teamName: string): string {
  const trimmed = (teamName || "").trim();
  const match = trimmed.match(/([A-Z0-9]+)\s*$/i);
  if (match) return match[1].toUpperCase();
  return trimmed.substring(0, 2).toUpperCase() || "?";
}

// Extract parent letter from team name (e.g., "A1" -> "A", "B2" -> "B")
function getParentLetter(teamName: string): string | null {
  const label = getTeamBadgeLabel(teamName);
  const match = label.match(/^([A-Z]+)\d+$/i);
  return match ? match[1].toUpperCase() : null;
}

// Extract number from team name (e.g., "A1" -> 1, "B2" -> 2)
function getTeamNumber(teamName: string): number | null {
  const label = getTeamBadgeLabel(teamName);
  const match = label.match(/^[A-Z]+(\d+)$/i);
  return match ? parseInt(match[1], 10) : null;
}

function formatTime(time: string | null | undefined): string {
  if (!time) return "";
  return time.substring(0, 5);
}

export function ManagerScheduleTab({
  departments,
  workers,
  workGroups,
  workerTeams,
  readOnly = false,
  externalSelectedDepartment,
}: {
  departments: Department[];
  workers: Worker[];
  workGroups: WorkGroup[];
  workerTeams: WorkerTeam[];
  readOnly?: boolean;
  externalSelectedDepartment?: string;
}) {
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>(departments[0]?.id ?? "");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState<WeeklySchedule | null>(null);
  const [localSchedule, setLocalSchedule] = useState<WeeklySchedule | null>(null);
  const [deptShifts, setDeptShifts] = useState<DepartmentShift[]>([]);
  const [deptConfigs, setDeptConfigs] = useState<Record<string, boolean>>({});
  const [deptLocks, setDeptLocks] = useState<Record<string, boolean>>({});

  const [pendingChanges, setPendingChanges] = useState<ScheduleChange[]>([]);
  const [dragOverCell, setDragOverCell] = useState<{ shiftKey: string; dayKey: string } | null>(null);
  
  // Bulk time editing
  const [bulkEditingCell, setBulkEditingCell] = useState<{ shiftKey: string; dayKey: string } | null>(null);
  const [bulkTempStartTime, setBulkTempStartTime] = useState("");
  const [bulkTempEndTime, setBulkTempEndTime] = useState("");
  
  // Workers modal
  const [workersModalData, setWorkersModalData] = useState<{
    title: string;
    workers: Worker[];
    teams?: WorkerTeam[];
    showTeamBreakdown?: boolean;
    shiftKey?: string;
    dayKey?: string;
  } | null>(null);
  
  // Group time editing in modal
  const [groupTimeEditStart, setGroupTimeEditStart] = useState("");
  const [groupTimeEditEnd, setGroupTimeEditEnd] = useState("");
  
  // Expanded parent groups in each cell
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  const selectedDepartment = useMemo(
    () => departments.find((d) => d.id === selectedDepartmentId) ?? null,
    [departments, selectedDepartmentId]
  );

  const isoWeek = useMemo(() => getISOWeek(weekStart), [weekStart]);
  const isoYear = useMemo(() => getISOWeekYear(weekStart), [weekStart]);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const getTeamDisplayName = useCallback((team: WorkerTeam): string => {
    const displayName = team.display_name?.trim();
    if (displayName) return displayName;
    return team.name;
  }, []);

  // Get display name for a parent group letter
  const getGroupDisplayName = useCallback((parentLetter: string): string => {
    const teamsForParent = workerTeams.filter(t => t.department_id === selectedDepartmentId && getParentLetter(t.name) === parentLetter);
    const customDisplayName = teamsForParent.find(t => t.display_name?.trim())?.display_name?.trim();
    if (customDisplayName) return customDisplayName;
    if (teamsForParent.length === 1 && teamsForParent[0]) return getTeamDisplayName(teamsForParent[0]);
    return parentLetter;
  }, [workerTeams, selectedDepartmentId, getTeamDisplayName]);

  // Filter teams by current department
  const deptTeams = useMemo(() => {
    return workerTeams
      .filter((t) => t.department_id === selectedDepartmentId)
      .sort((a, b) => {
        const orderA = (a as any).sort_order ?? 0;
        const orderB = (b as any).sort_order ?? 0;
        return orderA - orderB || a.name.localeCompare(b.name);
      });
  }, [workerTeams, selectedDepartmentId]);

  // Workers indexed by team
  const workersByTeam = useMemo(() => {
    const map: Record<string, Worker[]> = {};
    for (const w of workers) {
      if (w.department_id !== selectedDepartmentId) continue;
      if (!w.worker_team_id) continue;
      if (!map[w.worker_team_id]) map[w.worker_team_id] = [];
      map[w.worker_team_id].push(w);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [workers, selectedDepartmentId]);

  // Get day date from dayKey
  const getDayDate = useCallback((dayKey: string): Date => {
    const idx = parseInt(dayKey, 10);
    return idx === 0 ? addDays(weekStart, -1) : addDays(weekStart, idx - 1);
  }, [weekStart]);

  // Get shift label from shift_key
  const getShiftLabel = useCallback((shiftKey: string): string => {
    const shift = deptShifts.find(s => s.shift_key === shiftKey);
    return shift?.name || shiftKey;
  }, [deptShifts]);

  // Sync selectedDepartmentId when departments prop changes or when controlled externally
  useEffect(() => {
    if (!departments.length) return;
    const nextDeptId = externalSelectedDepartment || departments[0].id;
    if (selectedDepartmentId !== nextDeptId) {
      setSelectedDepartmentId(nextDeptId);
    }
  }, [departments, externalSelectedDepartment, selectedDepartmentId]);

  // Reset changes when department or week changes
  useEffect(() => {
    setPendingChanges([]);
    setLocalSchedule(null);
    setExpandedParents(new Set());
  }, [selectedDepartmentId, isoWeek, isoYear]);

  // Load department configs once
  useEffect(() => {
    const sessionToken = localStorage.getItem("manager_session_token");
    if (!sessionToken || !selectedDepartmentId) return;

    (async () => {
      try {
        const { data: resp, error } = await supabase.functions.invoke("admin-operations", {
          body: { action: "getDepartmentConfigs", sessionToken, data: {} },
        });
        if (!error && resp?.success) {
          setDeptConfigs(resp.configs || {});
          setDeptLocks(resp.locks || {});
        }
      } catch (e) {
        console.error("Error loading department configs:", e);
      }
    })();
  }, [selectedDepartmentId, departments.length]);

  // Load schedule and shifts when department or week changes
  useEffect(() => {
    let cancelled = false;
    const sessionToken = localStorage.getItem("manager_session_token");
    if (!sessionToken || !selectedDepartmentId) return;

    setLoading(true);

    (async () => {
      try {
        const [shiftsResp, scheduleResp] = await Promise.all([
          supabase.functions.invoke("admin-operations", {
            body: { action: "getDepartmentShifts", sessionToken, data: { departmentId: selectedDepartmentId } },
          }),
          supabase.functions.invoke("admin-operations", {
            body: {
              action: "getWeeklySchedule",
              sessionToken,
              data: { departmentId: selectedDepartmentId, year: isoYear, weekNumber: isoWeek },
            },
          }),
        ]);

        if (cancelled) return;

        if (shiftsResp.data?.success) {
          const shifts = (shiftsResp.data.shifts || []) as DepartmentShift[];
          shifts.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
          setDeptShifts(shifts);
        }

        const resp = scheduleResp.data;
        if (!scheduleResp.error && resp?.success) {
          const sched = resp.schedule
            ? {
                ...resp.schedule,
                configuration: resp.schedule.configuration as WeeklySchedule["configuration"],
              }
            : null;
          setSchedule(sched);
          setLocalSchedule(sched ? JSON.parse(JSON.stringify(sched)) : null);
        } else {
          console.error("getWeeklySchedule error:", resp?.error || scheduleResp.error);
          setSchedule(null);
          setLocalSchedule(null);
        }
      } catch (e) {
        if (cancelled) return;
        console.error("Error fetching manager schedule:", e);
        setSchedule(null);
        setLocalSchedule(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedDepartmentId, isoWeek, isoYear]);

  // Distinct fallback colors for teams without a work group color
  const TEAM_FALLBACK_COLORS = [
    "#dc2626", "#2563eb", "#16a34a", "#9333ea", "#ea580c",
    "#0891b2", "#c026d3", "#ca8a04", "#4f46e5", "#059669",
    "#e11d48", "#0d9488", "#7c3aed", "#d97706", "#0284c7", "#65a30d",
  ];

  // Get work group color for a team (via workers), with distinct fallback
  const getTeamColor = (teamId: string): string => {
    const teamWorkers = workersByTeam[teamId] || [];
    if (teamWorkers.length > 0) {
      const firstWorker = teamWorkers[0];
      if (firstWorker.work_group_id) {
        const group = workGroups.find((g) => g.id === firstWorker.work_group_id);
        if (group?.color) return group.color;
      }
    }
    // Fallback: assign a distinct color based on team index
    const idx = deptTeams.findIndex(t => t.id === teamId);
    return TEAM_FALLBACK_COLORS[idx >= 0 ? idx % TEAM_FALLBACK_COLORS.length : 0];
  };

  // Get shift times display
  const getShiftTimeDisplay = (shift: DepartmentShift): string => {
    if (shift.is_rest) return "";
    const start = formatTime(shift.start_time);
    const end = formatTime(shift.end_time);
    if (!start && !end) return "";
    return `${start || "inicio"} - ${end || "fin"}`;
  };

  // Build shift → day → teams matrix (PDF-style layout) using localSchedule
  const shiftMatrix = useMemo(() => {
    const scheduleToUse = localSchedule || schedule;
    if (!scheduleToUse?.configuration) return new Map<string, Map<string, WorkerTeam[]>>();

    const matrix = new Map<string, Map<string, WorkerTeam[]>>();

    // Initialize matrix with all shifts
    for (const shift of deptShifts) {
      matrix.set(shift.shift_key, new Map());
      for (const dayKey of DAY_KEYS) {
        matrix.get(shift.shift_key)!.set(dayKey, []);
      }
    }

    // Populate matrix with teams
    for (const dayKey of DAY_KEYS) {
      const dayConfig = scheduleToUse.configuration[dayKey] || {};
      for (const team of deptTeams) {
        const cell = dayConfig[team.id];
        if (cell?.type) {
          const shiftKey = cell.type;
          if (matrix.has(shiftKey)) {
            matrix.get(shiftKey)!.get(dayKey)!.push(team);
          }
        }
      }
    }

    return matrix;
  }, [localSchedule, schedule, deptShifts, deptTeams]);

  // Group teams by parent letter for smart collapsing
  const groupTeamsForCell = useCallback((teams: WorkerTeam[], shiftKey: string, dayKey: string): GroupedTeam[] => {
    if (teams.length === 0) return [];

    // Group teams by parent letter
    const byParent: Record<string, WorkerTeam[]> = {};
    const standalone: WorkerTeam[] = [];

    for (const team of teams) {
      const parent = getParentLetter(team.name);
      if (parent) {
        if (!byParent[parent]) byParent[parent] = [];
        byParent[parent].push(team);
      } else {
        standalone.push(team);
      }
    }

    const result: GroupedTeam[] = [];

    // Check if parent groups should be collapsed
    // A group collapses if ALL subgroups of that parent are present
    for (const [parentLetter, parentTeams] of Object.entries(byParent)) {
      // Find all teams in the department with this parent letter
      const allDeptTeamsWithParent = deptTeams.filter(t => getParentLetter(t.name) === parentLetter);
      
      // Check if all subgroups are in this cell
      const allPresent = allDeptTeamsWithParent.length > 0 && 
        allDeptTeamsWithParent.every(t => parentTeams.some(pt => pt.id === t.id));
      
      // Check if this parent is expanded
      const cellKey = `${shiftKey}-${dayKey}-${parentLetter}`;
      const isExpanded = expandedParents.has(cellKey);

      if (allPresent && parentTeams.length > 1 && !isExpanded) {
        // Show as collapsed parent group
        result.push({
          type: "parent",
          parentLetter,
          teams: parentTeams.sort((a, b) => {
            const numA = getTeamNumber(a.name) ?? 0;
            const numB = getTeamNumber(b.name) ?? 0;
            return numA - numB;
          }),
        });
      } else {
        // Show individual teams
        for (const team of parentTeams) {
          result.push({
            type: "team",
            parentLetter,
            teams: [team],
            team,
          });
        }
      }
    }

    // Add standalone teams
    for (const team of standalone) {
      result.push({
        type: "team",
        parentLetter: "",
        teams: [team],
        team,
      });
    }

    // Sort: parents first by letter, then individual teams by number
    result.sort((a, b) => {
      if (a.type === "parent" && b.type !== "parent") return -1;
      if (a.type !== "parent" && b.type === "parent") return 1;
      if (a.parentLetter !== b.parentLetter) {
        return a.parentLetter.localeCompare(b.parentLetter);
      }
      // Both same parent letter - sort by team number
      const numA = a.team ? getTeamNumber(a.team.name) : 0;
      const numB = b.team ? getTeamNumber(b.team.name) : 0;
      return (numA ?? 0) - (numB ?? 0);
    });

    return result;
  }, [deptTeams, expandedParents]);

  // Filter to only show shifts that have teams assigned
  const activeShifts = useMemo(() => {
    return deptShifts.filter((shift) => {
      const shiftDays = shiftMatrix.get(shift.shift_key);
      if (!shiftDays) return false;
      for (const teams of shiftDays.values()) {
        if (teams.length > 0) return true;
      }
      return false;
    });
  }, [deptShifts, shiftMatrix]);

  // Get custom time for a cell if it exists
  const getCellCustomTime = (teamId: string, dayKey: string): { start?: string; end?: string } | null => {
    const scheduleToUse = localSchedule || schedule;
    if (!scheduleToUse?.configuration) return null;
    const cell = scheduleToUse.configuration[dayKey]?.[teamId];
    if (!cell) return null;
    if (cell.start || cell.end) {
      return { start: cell.start || undefined, end: cell.end || undefined };
    }
    return null;
  };

  // Toggle parent group expansion
  const toggleParentExpansion = (shiftKey: string, dayKey: string, parentLetter: string) => {
    const cellKey = `${shiftKey}-${dayKey}-${parentLetter}`;
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(cellKey)) {
        next.delete(cellKey);
      } else {
        next.add(cellKey);
      }
      return next;
    });
  };

  // Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, teamId: string, teamName: string, fromShift: string, dayKey: string) => {
    e.dataTransfer.setData("teamId", teamId);
    e.dataTransfer.setData("teamName", teamName);
    e.dataTransfer.setData("fromShift", fromShift);
    e.dataTransfer.setData("dayKey", dayKey);
    e.dataTransfer.effectAllowed = "move";
  };

  // Drag start for parent groups (moves all teams in the group)
  const handleParentDragStart = (e: React.DragEvent, group: GroupedTeam, fromShift: string, dayKey: string) => {
    // Store parent group data for multi-team move
    const teamIds = group.teams.map(t => t.id).join(",");
    const teamNames = group.teams.map(t => t.name).join(",");
    e.dataTransfer.setData("teamId", teamIds);
    e.dataTransfer.setData("teamName", teamNames);
    e.dataTransfer.setData("fromShift", fromShift);
    e.dataTransfer.setData("dayKey", dayKey);
    e.dataTransfer.setData("isParentGroup", "true");
    e.dataTransfer.setData("parentLetter", group.parentLetter);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, shiftKey: string, dayKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCell({ shiftKey, dayKey });
  };

  const handleDragLeave = () => {
    setDragOverCell(null);
  };

  const handleDrop = (e: React.DragEvent, toShift: string, dayKey: string) => {
    e.preventDefault();
    setDragOverCell(null);

    const teamIds = e.dataTransfer.getData("teamId");
    const teamNames = e.dataTransfer.getData("teamName");
    const fromShift = e.dataTransfer.getData("fromShift");
    const origDayKey = e.dataTransfer.getData("dayKey");
    const isParentGroup = e.dataTransfer.getData("isParentGroup") === "true";
    const parentLetter = e.dataTransfer.getData("parentLetter");

    // Only allow drop on same day, different shift
    if (origDayKey !== dayKey) {
      toast.error("Solo puedes mover equipos dentro del mismo día");
      return;
    }

    if (fromShift === toShift) return;

    // Handle parent group moves (multiple teams)
    if (isParentGroup && teamIds.includes(",")) {
      const ids = teamIds.split(",");
      const names = teamNames.split(",");
      moveMultipleTeamsToShift(ids, names, fromShift, toShift, dayKey, parentLetter);
    } else {
      moveTeamToShift(teamIds, teamNames, fromShift, toShift, dayKey);
    }
  };

  // Move multiple teams at once (for parent groups)
  const moveMultipleTeamsToShift = (
    teamIds: string[], 
    teamNames: string[], 
    fromShift: string, 
    toShift: string, 
    dayKey: string,
    parentLetter: string
  ) => {
    if (!localSchedule) return;

    const newConfig = JSON.parse(JSON.stringify(localSchedule.configuration));
    if (!newConfig[dayKey]) newConfig[dayKey] = {};
    
    const dayDate = getDayDate(dayKey);
    const newChanges: ScheduleChange[] = [];

    for (let i = 0; i < teamIds.length; i++) {
      const teamId = teamIds[i];
      const teamName = teamNames[i];
      
      const existingCell = newConfig[dayKey][teamId] || {};
      newConfig[dayKey][teamId] = {
        ...existingCell,
        type: toShift,
      };

      newChanges.push({
        dayKey,
        dayName: DAY_NAMES_FULL[parseInt(dayKey, 10)],
        dayDate: format(dayDate, "d MMM", { locale: es }),
        teamId,
        teamName,
        fromShift,
        toShift,
        changeType: "move",
      });
    }

    setLocalSchedule({ ...localSchedule, configuration: newConfig });

    // Update pending changes
    setPendingChanges(prev => {
      const movedIds = new Set(teamIds);
      const filtered = prev.filter(c => !(movedIds.has(c.teamId) && c.dayKey === dayKey && c.changeType === "move"));
      return [...filtered, ...newChanges];
    });

    toast.success(`${getGroupDisplayName(parentLetter)} movido a ${getShiftLabel(toShift)}`);
  };

  const moveTeamToShift = (teamId: string, teamName: string, fromShift: string, toShift: string, dayKey: string) => {
    if (!localSchedule) return;

    const newConfig = JSON.parse(JSON.stringify(localSchedule.configuration));
    
    // Update the team's shift
    if (!newConfig[dayKey]) newConfig[dayKey] = {};
    const existingCell = newConfig[dayKey][teamId] || {};
    newConfig[dayKey][teamId] = {
      ...existingCell,
      type: toShift,
    };

    setLocalSchedule({ ...localSchedule, configuration: newConfig });

    // Record the change
    const dayDate = getDayDate(dayKey);
    const newChange: ScheduleChange = {
      dayKey,
      dayName: DAY_NAMES_FULL[parseInt(dayKey, 10)],
      dayDate: format(dayDate, "d MMM", { locale: es }),
      teamId,
      teamName,
      fromShift,
      toShift,
      changeType: "move",
    };

    // Remove any existing move change for same team/day, then add new one
    setPendingChanges(prev => {
      const filtered = prev.filter(c => !(c.teamId === teamId && c.dayKey === dayKey && c.changeType === "move"));
      return [...filtered, newChange];
    });

    toast.success(`${teamName} movido a ${getShiftLabel(toShift)}`);
  };

  // Bulk time editing handlers
  const openBulkTimeEditor = (shiftKey: string, dayKey: string) => {
    const shift = deptShifts.find(s => s.shift_key === shiftKey);
    setBulkTempStartTime(formatTime(shift?.start_time) || "");
    setBulkTempEndTime(formatTime(shift?.end_time) || "");
    setBulkEditingCell({ shiftKey, dayKey });
  };

  const saveBulkTimeEdit = () => {
    if (!bulkEditingCell || !localSchedule) return;

    const { shiftKey, dayKey } = bulkEditingCell;
    const teams = shiftMatrix.get(shiftKey)?.get(dayKey) || [];
    
    if (teams.length === 0) {
      setBulkEditingCell(null);
      return;
    }

    const newConfig = JSON.parse(JSON.stringify(localSchedule.configuration));
    if (!newConfig[dayKey]) newConfig[dayKey] = {};
    
    const dayDate = getDayDate(dayKey);
    const newChanges: ScheduleChange[] = [];

    for (const team of teams) {
      if (!newConfig[dayKey][team.id]) newConfig[dayKey][team.id] = { type: shiftKey };
      newConfig[dayKey][team.id].start = bulkTempStartTime || null;
      newConfig[dayKey][team.id].end = bulkTempEndTime || null;

      newChanges.push({
        dayKey,
        dayName: DAY_NAMES_FULL[parseInt(dayKey, 10)],
        dayDate: format(dayDate, "d MMM", { locale: es }),
        teamId: team.id,
        teamName: team.name,
        fromShift: shiftKey,
        toShift: shiftKey,
        customStartTime: bulkTempStartTime,
        customEndTime: bulkTempEndTime,
        changeType: "time",
      });
    }

    setLocalSchedule({ ...localSchedule, configuration: newConfig });

    // Update pending changes - remove old time changes for these teams, add new ones
    setPendingChanges(prev => {
      const teamIds = new Set(teams.map(t => t.id));
      const filtered = prev.filter(c => !(teamIds.has(c.teamId) && c.dayKey === dayKey && c.changeType === "time"));
      return [...filtered, ...newChanges];
    });

    setBulkEditingCell(null);
    toast.success(`Horario aplicado a ${teams.length} equipo${teams.length !== 1 ? "s" : ""}`);
  };

  // Open workers modal for a team or parent group
  const openWorkersModal = (group: GroupedTeam, shiftKey?: string, dayKey?: string) => {
    const allWorkers: Worker[] = [];
    for (const team of group.teams) {
      const teamWorkers = workersByTeam[team.id] || [];
      allWorkers.push(...teamWorkers);
    }
    allWorkers.sort((a, b) => a.name.localeCompare(b.name));

    const title = group.type === "parent"
      ? getGroupDisplayName(group.parentLetter)
      : group.team ? getTeamDisplayName(group.team) : "Equipo";

    // Get current time from first team if exists
    const firstTeamId = group.teams[0]?.id;
    const currentTime = firstTeamId && dayKey ? getCellCustomTime(firstTeamId, dayKey) : null;
    
    setGroupTimeEditStart(currentTime?.start || "");
    setGroupTimeEditEnd(currentTime?.end || "");

    setWorkersModalData({
      title,
      workers: allWorkers,
      teams: group.teams,
      showTeamBreakdown: group.type === "parent" && group.teams.length > 1,
      shiftKey,
      dayKey,
    });
  };

  // Save group time edit from modal
  const saveGroupTimeEdit = () => {
    if (!workersModalData?.teams || !workersModalData.dayKey || !localSchedule) return;

    const { teams, dayKey, shiftKey } = workersModalData;
    const newConfig = JSON.parse(JSON.stringify(localSchedule.configuration));
    if (!newConfig[dayKey]) newConfig[dayKey] = {};

    const dayDate = getDayDate(dayKey);
    const newChanges: ScheduleChange[] = [];

    for (const team of teams) {
      const currentCell = newConfig[dayKey][team.id] || { type: shiftKey || "descanso" };
      newConfig[dayKey][team.id] = {
        ...currentCell,
        start: groupTimeEditStart || null,
        end: groupTimeEditEnd || null,
      };

      newChanges.push({
        dayKey,
        dayName: DAY_NAMES_FULL[parseInt(dayKey, 10)],
        dayDate: format(dayDate, "d MMM", { locale: es }),
        teamId: team.id,
        teamName: team.name,
        fromShift: currentCell.type || shiftKey || "",
        toShift: currentCell.type || shiftKey || "",
        customStartTime: groupTimeEditStart,
        customEndTime: groupTimeEditEnd,
        changeType: "time",
      });
    }

    setLocalSchedule({ ...localSchedule, configuration: newConfig });

    // Update pending changes
    setPendingChanges(prev => {
      const teamIds = new Set(teams.map(t => t.id));
      const filtered = prev.filter(c => !(teamIds.has(c.teamId) && c.dayKey === dayKey && c.changeType === "time"));
      return [...filtered, ...newChanges];
    });

    setWorkersModalData(null);
    toast.success(`Horario aplicado a ${teams.length} equipo${teams.length !== 1 ? "s" : ""}`);
  };

  // Save changes to backend
  const saveChanges = async () => {
    if (!localSchedule || pendingChanges.length === 0) return;

    const sessionToken = localStorage.getItem("manager_session_token");
    if (!sessionToken) return;

    setSaving(true);
    try {
      // Build descriptive notes for admin history
      const changesSummary = pendingChanges.map(c => {
        if (c.changeType === "move") {
          return `${c.dayName}: ${getTeamBadgeLabel(c.teamName)} ${getShiftLabel(c.fromShift)} → ${getShiftLabel(c.toShift)}`;
        } else {
          return `${c.dayName}: ${getTeamBadgeLabel(c.teamName)} horario ${c.customStartTime}-${c.customEndTime}`;
        }
      }).join("; ");
      
      const { data, error } = await supabase.functions.invoke("admin-operations", {
        body: {
          action: "upsertWeeklySchedule",
          sessionToken,
          data: {
            departmentId: selectedDepartmentId,
            year: isoYear,
            weekNumber: isoWeek,
            configuration: localSchedule.configuration,
            notes: `[Encargado] ${changesSummary}`,
          },
        },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || "Error al guardar");
      }

      setSchedule(localSchedule);
      setPendingChanges([]);
      toast.success("Cambios guardados correctamente");
    } catch (e: any) {
      console.error("Error saving schedule:", e);
      toast.error(e.message || "Error al guardar los cambios");
    } finally {
      setSaving(false);
    }
  };

  // Discard changes
  const discardChanges = () => {
    setLocalSchedule(schedule ? JSON.parse(JSON.stringify(schedule)) : null);
    setPendingChanges([]);
    setExpandedParents(new Set());
    toast.info("Cambios descartados");
  };

  // Generate WhatsApp message
  const generateWhatsAppMessage = (): string => {
    const weekRange = `${format(weekStart, "d MMM", { locale: es })} - ${format(weekEnd, "d MMM yyyy", { locale: es })}`;

    let message = `📋 *ACTUALIZACIONES DE HORARIO*\n\n`;
    message += `📅 Semana ${isoWeek} (${weekRange})\n\n`;
    message += `━━━━━━━━━━━━\n\n`;

    // Group changes by day
    const changesByDay: Record<string, ScheduleChange[]> = {};
    for (const change of pendingChanges) {
      if (!changesByDay[change.dayKey]) changesByDay[change.dayKey] = [];
      changesByDay[change.dayKey].push(change);
    }

    const sortedDays = Object.keys(changesByDay).sort((a, b) => {
      return parseInt(a, 10) - parseInt(b, 10);
    });

    for (const dayKey of sortedDays) {
      const changes = changesByDay[dayKey];
      const firstChange = changes[0];
      message += `🔄 *${firstChange.dayName} ${firstChange.dayDate}*\n\n`;

      // Group changes by type and parent group for smarter consolidation
      const moveChanges = changes.filter(c => c.changeType === "move");
      const timeChanges = changes.filter(c => c.changeType === "time");

      // Process move changes - group by parent letter if all subgroups have same change
      if (moveChanges.length > 0) {
        const groupedMoves = groupChangesForWhatsApp(moveChanges, "move");
        for (const grouped of groupedMoves) {
          message += `   • *${grouped.label}*: ${getShiftLabel(grouped.fromShift!)} → ${getShiftLabel(grouped.toShift!)}\n`;
        }
        message += `\n`;
      }

      // Process time changes - group by parent letter if all subgroups have same change
      if (timeChanges.length > 0) {
        const groupedTimes = groupChangesForWhatsApp(timeChanges, "time");
        for (const grouped of groupedTimes) {
          const timeStr = `${grouped.customStartTime || "inicio"} - ${grouped.customEndTime || "fin"}`;
          message += `   • *${grouped.label}*: ${timeStr}\n`;
        }
        message += `\n`;
      }
    }

    message += `━━━━━━━━━━━━\n\n`;
    message += `📍 ¿No sabes tu grupo?\n👉 https://vnprod.app/mi-grupo\n\n`;
    message += `💬 Cualquier duda, contacta con tu encargado.`;

    return message;
  };

  // Helper to group changes by parent letter for WhatsApp message
  type GroupedChange = {
    label: string;
    teams: string[];
    fromShift?: string;
    toShift?: string;
    customStartTime?: string;
    customEndTime?: string;
  };

  const groupChangesForWhatsApp = (changes: ScheduleChange[], type: "move" | "time"): GroupedChange[] => {
    // Group by parent letter
    const byParent: Record<string, ScheduleChange[]> = {};
    const standalone: ScheduleChange[] = [];

    for (const change of changes) {
      const parent = getParentLetter(change.teamName);
      if (parent) {
        if (!byParent[parent]) byParent[parent] = [];
        byParent[parent].push(change);
      } else {
        standalone.push(change);
      }
    }

    const result: GroupedChange[] = [];

    // Check each parent group
    for (const [parentLetter, parentChanges] of Object.entries(byParent)) {
      // Get all department teams with this parent
      const allDeptTeamsWithParent = deptTeams.filter(t => getParentLetter(t.name) === parentLetter);
      
      // Check if all subgroups are represented and have the same change
      const allPresent = allDeptTeamsWithParent.length > 0 &&
        allDeptTeamsWithParent.length === parentChanges.length;

      if (type === "move") {
        // All must have same from/to shift
        const allSameChange = allPresent && parentChanges.every(c => 
          c.fromShift === parentChanges[0].fromShift && 
          c.toShift === parentChanges[0].toShift
        );

        if (allSameChange && parentChanges.length > 1) {
          // Consolidate into parent group - parent bold, subgroups italic
          const subLabels = parentChanges
            .map(c => getTeamBadgeLabel(c.teamName))
            .sort((a, b) => {
              const numA = parseInt(a.replace(/\D/g, '')) || 0;
              const numB = parseInt(b.replace(/\D/g, '')) || 0;
              return numA - numB;
            })
            .join(", ");
          result.push({
            label: `${parentLetter} (_${subLabels}_)`,
            teams: parentChanges.map(c => c.teamName),
            fromShift: parentChanges[0].fromShift,
            toShift: parentChanges[0].toShift,
          });
        } else {
          // Add individually
          for (const change of parentChanges) {
            result.push({
              label: getTeamBadgeLabel(change.teamName),
              teams: [change.teamName],
              fromShift: change.fromShift,
              toShift: change.toShift,
            });
          }
        }
      } else {
        // Time changes - all must have same times
        const allSameChange = allPresent && parentChanges.every(c =>
          c.customStartTime === parentChanges[0].customStartTime &&
          c.customEndTime === parentChanges[0].customEndTime
        );

        if (allSameChange && parentChanges.length > 1) {
          const subLabels = parentChanges
            .map(c => getTeamBadgeLabel(c.teamName))
            .sort((a, b) => {
              const numA = parseInt(a.replace(/\D/g, '')) || 0;
              const numB = parseInt(b.replace(/\D/g, '')) || 0;
              return numA - numB;
            })
            .join(", ");
          result.push({
            label: `${parentLetter} (_${subLabels}_)`,
            teams: parentChanges.map(c => c.teamName),
            customStartTime: parentChanges[0].customStartTime,
            customEndTime: parentChanges[0].customEndTime,
          });
        } else {
          for (const change of parentChanges) {
            result.push({
              label: getTeamBadgeLabel(change.teamName),
              teams: [change.teamName],
              customStartTime: change.customStartTime,
              customEndTime: change.customEndTime,
            });
          }
        }
      }
    }

    // Add standalone changes
    for (const change of standalone) {
      if (type === "move") {
        result.push({
          label: getTeamBadgeLabel(change.teamName),
          teams: [change.teamName],
          fromShift: change.fromShift,
          toShift: change.toShift,
        });
      } else {
        result.push({
          label: getTeamBadgeLabel(change.teamName),
          teams: [change.teamName],
          customStartTime: change.customStartTime,
          customEndTime: change.customEndTime,
        });
      }
    }

    return result;
  };

  const copyToClipboard = async () => {
    const message = generateWhatsAppMessage();
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Mensaje copiado al portapapeles");
    } catch (e) {
      toast.error("Error al copiar");
    }
  };

  const scheduleConfigured = deptConfigs[selectedDepartmentId] ?? true;
  const isLocked = deptLocks[selectedDepartmentId] ?? false;
  const hasScheduleData = !!localSchedule;
  const hasChanges = pendingChanges.length > 0;
  // readOnly prop takes precedence - if true, no editing allowed regardless of lock state
  const canEdit = !readOnly && !isLocked;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg md:text-xl font-semibold tracking-tight">Horarios</h2>
          <p className="text-sm text-muted-foreground">
            Vista semanal por turnos {canEdit && "· Arrastra equipos para cambiar turno"}
          </p>
        </div>

        {!externalSelectedDepartment && departments.length > 1 && (
          departments.length > 5 ? (
            <DepartmentSearchSelect
              departments={departments}
              value={selectedDepartmentId}
              onChange={(val) => setSelectedDepartmentId(val)}
              includeAll={false}
              placeholder="Seleccionar departamento..."
              className="sm:max-w-xs"
            />
          ) : (
            <DeptPills
              departments={departments}
              selected={selectedDepartmentId}
              onChange={setSelectedDepartmentId}
              includeAll={false}
            />
          )
        )}
      </div>

      {/* Lock Banner */}
      {isLocked && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 text-destructive">
              <Lock className="h-4 w-4" />
              <span className="text-sm font-medium">
                Este departamento está bloqueado para modificaciones
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Changes Bar */}
      {hasChanges && canEdit && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-sm font-medium">
                  {pendingChanges.length} cambio{pendingChanges.length !== 1 ? "s" : ""} pendiente{pendingChanges.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={discardChanges}
                  className="h-8 text-xs"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Descartar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyToClipboard}
                  className="h-8 text-xs"
                >
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  Copiar WhatsApp
                </Button>
                <Button
                  size="sm"
                  onClick={saveChanges}
                  disabled={saving}
                  className="h-8 text-xs"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5 mr-1" />
                  )}
                  Guardar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Card */}
      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-3 border-b border-border/30">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">
              {selectedDepartment?.name ?? "Departamento"}
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-8 px-3 font-medium"
                onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
              >
                S{isoWeek}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {format(weekStart, "d MMM", { locale: es })} - {format(weekEnd, "d MMM yyyy", { locale: es })}
          </p>
        </CardHeader>

        <CardContent className="pt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !hasScheduleData && !scheduleConfigured ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
              <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No hay ningún horario activo</p>
              <p className="text-xs text-muted-foreground/70">Contacta con administración</p>
            </div>
          ) : !hasScheduleData ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
              <AlertCircle className="h-8 w-8 text-amber-500/70" />
              <p className="text-sm text-muted-foreground">Semana no publicada</p>
            </div>
          ) : activeShifts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
              <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Sin turnos asignados</p>
            </div>
          ) : (
            <>
            {/* Desktop table */}
            <div className="overflow-x-auto -mx-4 px-4 hidden md:block">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-left text-xs font-medium text-muted-foreground pb-3 pr-3 w-32">
                      Turno
                    </th>
                    {DAY_HEADERS.map((day, idx) => {
                      const date = idx === 0 ? addDays(weekStart, -1) : addDays(weekStart, idx - 1);
                      return (
                        <th key={day} className="text-center pb-3 px-1">
                          <div className="text-xs font-medium text-muted-foreground">{day}</div>
                          <div className="text-[10px] text-muted-foreground/70">{format(date, "d")}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {activeShifts.map((shift) => (
                    <tr key={shift.id} className="border-t border-border/20">
                      <td className="py-2.5 pr-3">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: shift.color || "#888" }}
                            />
                            <span className="text-xs font-medium truncate">{shift.name}</span>
                          </div>
                          {getShiftTimeDisplay(shift) && (
                            <span className="text-[10px] text-muted-foreground ml-4.5 pl-[18px]">
                              {getShiftTimeDisplay(shift)}
                            </span>
                          )}
                        </div>
                      </td>
                      {DAY_KEYS.map((dayKey) => {
                        const teams = shiftMatrix.get(shift.shift_key)?.get(dayKey) || [];
                        const groupedTeams = groupTeamsForCell(teams, shift.shift_key, dayKey);
                        const isDragOver = dragOverCell?.shiftKey === shift.shift_key && dragOverCell?.dayKey === dayKey;
                        const hasTeams = teams.length > 0;
                        
                        return (
                          <td 
                            key={dayKey} 
                            className={`py-2 px-1 align-top transition-colors ${
                              isDragOver ? "bg-primary/10" : ""
                            }`}
                            onDragOver={canEdit ? (e) => handleDragOver(e, shift.shift_key, dayKey) : undefined}
                            onDragLeave={canEdit ? handleDragLeave : undefined}
                            onDrop={canEdit ? (e) => handleDrop(e, shift.shift_key, dayKey) : undefined}
                          >
                            <div className="flex flex-col gap-1 items-center min-h-[28px]">
                              {/* Bulk time edit button */}
                              {canEdit && hasTeams && !shift.is_rest && (
                                <Popover 
                                  open={bulkEditingCell?.shiftKey === shift.shift_key && bulkEditingCell?.dayKey === dayKey}
                                  onOpenChange={(open) => {
                                    if (!open) setBulkEditingCell(null);
                                  }}
                                >
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 opacity-50 hover:opacity-100 transition-opacity"
                                      onClick={() => openBulkTimeEditor(shift.shift_key, dayKey)}
                                      title="Cambiar hora para todos los equipos"
                                    >
                                      <Timer className="h-3 w-3" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-64 p-3" align="center">
                                    <div className="space-y-3">
                                      <div className="text-sm font-medium flex items-center gap-2">
                                        <Timer className="h-4 w-4" />
                                        Hora para todos ({teams.length})
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                          <Label className="text-xs">Inicio</Label>
                                          <Input
                                            type="time"
                                            value={bulkTempStartTime}
                                            onChange={(e) => setBulkTempStartTime(e.target.value)}
                                            className="h-8 text-xs"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs">Fin</Label>
                                          <Input
                                            type="time"
                                            value={bulkTempEndTime}
                                            onChange={(e) => setBulkTempEndTime(e.target.value)}
                                            className="h-8 text-xs"
                                          />
                                        </div>
                                      </div>
                                      <div className="flex gap-2">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="flex-1 h-7 text-xs"
                                          onClick={() => setBulkEditingCell(null)}
                                        >
                                          Cancelar
                                        </Button>
                                        <Button
                                          size="sm"
                                          className="flex-1 h-7 text-xs"
                                          onClick={saveBulkTimeEdit}
                                        >
                                          Aplicar a todos
                                        </Button>
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              )}
                              
                              {/* Team badges */}
                              <div className="flex flex-wrap gap-1 justify-center">
                                {groupedTeams.map((group, groupIdx) => {
                                  if (group.type === "parent") {
                                    // Collapsed parent group
                                    const totalWorkers = group.teams.reduce((sum, t) => sum + (workersByTeam[t.id]?.length || 0), 0);
                                    const firstTeamColor = getTeamColor(group.teams[0]?.id);
                                    const hasCustomTime = group.teams.some(t => getCellCustomTime(t.id, dayKey));
                                    
                                    return (
                                      <div 
                                        key={`parent-${group.parentLetter}`} 
                                        className={`flex flex-col items-center gap-0.5 ${canEdit ? "cursor-grab active:cursor-grabbing" : ""}`}
                                        draggable={canEdit}
                                        onDragStart={canEdit ? (e) => handleParentDragStart(e, group, shift.shift_key, dayKey) : undefined}
                                        title={canEdit 
                                          ? `${getGroupDisplayName(group.parentLetter)} (${totalWorkers}) - Arrastra para mover todo el grupo`
                                          : `${getGroupDisplayName(group.parentLetter)} (${totalWorkers})`
                                        }
                                      >
                                        <Badge
                                          variant="outline"
                                          className={`text-[10px] px-1.5 py-0.5 cursor-pointer select-none hover:bg-accent transition-colors whitespace-nowrap overflow-hidden text-ellipsis max-w-full ${
                                            hasCustomTime ? "ring-1 ring-amber-500/50" : ""
                                          }`}
                                          style={firstTeamColor ? { borderColor: firstTeamColor, color: firstTeamColor } : undefined}
                                          onClick={() => openWorkersModal(group, shift.shift_key, dayKey)}
                                        >
                                          {canEdit && <GripVertical className="h-2.5 w-2.5 mr-0.5 shrink-0 opacity-40 group-hover:opacity-70" />}
                                          <Users className="h-2.5 w-2.5 mr-0.5 shrink-0 opacity-70" />
                                          <span className="truncate">{getGroupDisplayName(group.parentLetter)}</span>
                                          <span className="text-[8px] ml-0.5 opacity-70 shrink-0">({totalWorkers})</span>
                                          {hasCustomTime && (
                                            <Clock className="h-2 w-2 ml-0.5 text-amber-500" />
                                          )}
                                        </Badge>
                                        {canEdit && (
                                          <button
                                            className="text-[9px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleParentExpansion(shift.shift_key, dayKey, group.parentLetter);
                                            }}
                                          >
                                            <ChevronDown className="h-2.5 w-2.5" />
                                            Abrir
                                          </button>
                                        )}
                                      </div>
                                    );
                                  } else {
                                    // Individual team
                                    const team = group.team!;
                                    const color = getTeamColor(team.id);
                                    const workerCount = workersByTeam[team.id]?.length || 0;
                                    const customTime = getCellCustomTime(team.id, dayKey);
                                    const hasCustomTime = !!customTime;
                                    const cellData = localSchedule?.configuration?.[dayKey]?.[team.id] as any;
                                    const partialCount = cellData?.partial_count;

                                    return (
                                      <div
                                        key={team.id}
                                        draggable={canEdit}
                                        onDragStart={canEdit ? (e) => handleDragStart(e, team.id, team.name, shift.shift_key, dayKey) : undefined}
                                        className={`group relative ${canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
                                        title={canEdit 
                                          ? `${getTeamDisplayName(team)} (${partialCount ? `${partialCount} de ` : ''}${workerCount}) - Arrastra para mover, click para ver trabajadores`
                                          : `${getTeamDisplayName(team)} (${partialCount ? `${partialCount} de ` : ''}${workerCount})`
                                        }
                                      >
                                        <Badge
                                          variant="outline"
                                          className={`text-[10px] px-1.5 py-0.5 transition-colors select-none whitespace-nowrap overflow-hidden text-ellipsis max-w-full ${
                                            canEdit ? "hover:bg-accent cursor-pointer" : "opacity-70"
                                          } ${hasCustomTime ? "ring-1 ring-amber-500/50" : ""}`}
                                          style={color ? { borderColor: color, color } : undefined}
                                          onClick={() => openWorkersModal(group, shift.shift_key, dayKey)}
                                        >
                                          {canEdit && <GripVertical className="h-2.5 w-2.5 mr-0.5 shrink-0 opacity-40 group-hover:opacity-70" />}
                                          <span className="truncate">
                                            {partialCount ? `${partialCount} de ` : ''}{getTeamDisplayName(team)}
                                          </span>
                                          {hasCustomTime && (
                                            <Clock className="h-2 w-2 ml-0.5 text-amber-500" />
                                          )}
                                        </Badge>
                                      </div>
                                    );
                                  }
                                })}
                              </div>

                              {/* Special hours indicator - show when any team in this cell has times different from shift defaults */}
                              {(() => {
                                if (shift.is_rest || teams.length === 0) return null;
                                const scheduleToUse = localSchedule || schedule;
                                if (!scheduleToUse?.configuration) return null;
                                
                                // Collect unique custom times for teams in this cell
                                const specialTimes = new Set<string>();
                                for (const team of teams) {
                                  const cell = scheduleToUse.configuration[dayKey]?.[team.id];
                                  if (!cell) continue;
                                  const cellStart = cell.start ? formatTime(cell.start) : null;
                                  const cellEnd = cell.end ? formatTime(cell.end) : null;
                                  const shiftStart = formatTime(shift.start_time);
                                  const shiftEnd = formatTime(shift.end_time);
                                  
                                  if ((cellStart && cellStart !== shiftStart) || (cellEnd && cellEnd !== shiftEnd)) {
                                    const displayStart = cellStart || shiftStart || "inicio";
                                    const displayEnd = cellEnd || shiftEnd || "fin";
                                    specialTimes.add(`${displayStart} - ${displayEnd}`);
                                  }
                                }
                                
                                if (specialTimes.size === 0) return null;
                                
                                return (
                                  <div className="flex flex-col items-center gap-0.5 mt-0.5">
                                    {Array.from(specialTimes).map((timeStr, i) => (
                                      <span key={i} className="text-[9px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-0.5">
                                        <Clock className="h-2.5 w-2.5" />
                                        {timeStr}
                                      </span>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Legend */}
              <div className="mt-4 pt-3 border-t border-border/20 hidden md:block">
                <div className="flex flex-wrap gap-4 text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <GripVertical className="h-3 w-3" />
                    <span>Arrastra para cambiar turno</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Timer className="h-3 w-3" />
                    <span>Editar hora de todos</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-amber-500" />
                    <span>Horario especial</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3 w-3" />
                    <span>Grupo completo (click para abrir)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile layout - vertical cards */}
            <div className="md:hidden space-y-3 -mx-4 px-1">
              {activeShifts.map((shift) => {
                return (
                  <div key={`mobile-${shift.id}`} className="rounded-xl border border-border/50 overflow-hidden">
                    {/* Shift header */}
                    <div className="flex items-center gap-2 bg-muted/30 px-3 py-2 border-b border-border/30">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: shift.color || "#888" }}
                      />
                      <span className="text-xs font-medium">{shift.name}</span>
                      {getShiftTimeDisplay(shift) && (
                        <span className="text-[10px] text-muted-foreground">{getShiftTimeDisplay(shift)}</span>
                      )}
                    </div>

                    {/* Days */}
                    <div className="divide-y divide-border/20">
                      {DAY_KEYS.map((dayKey) => {
                        const teams = shiftMatrix.get(shift.shift_key)?.get(dayKey) || [];
                        const groupedTeams = groupTeamsForCell(teams, shift.shift_key, dayKey);
                        if (teams.length === 0) return null;

                        const date = parseInt(dayKey, 10) === 0 ? addDays(weekStart, -1) : addDays(weekStart, parseInt(dayKey, 10) - 1);
                        const isWeekend = dayKey === "0" || dayKey === "6";

                        return (
                          <div
                            key={dayKey}
                            className={`flex items-start gap-3 px-3 py-2 ${isWeekend ? "bg-muted/10" : ""}`}
                          >
                            {/* Day label */}
                            <div className="w-10 shrink-0 pt-0.5">
                              <div className="text-xs font-medium text-foreground">{DAY_HEADERS[parseInt(dayKey, 10)]}</div>
                              <div className="text-[10px] text-muted-foreground/70">{format(date, "d")}</div>
                            </div>

                            {/* Teams */}
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap gap-1">
                                {groupedTeams.map((group) => {
                                  if (group.type === "parent") {
                                    const totalWorkers = group.teams.reduce((sum, t) => sum + (workersByTeam[t.id]?.length || 0), 0);
                                    const firstTeamColor = getTeamColor(group.teams[0]?.id);
                                    return (
                                      <Badge
                                        key={`parent-${group.parentLetter}`}
                                        variant="outline"
                                        className="text-[10px] px-1.5 py-0.5 cursor-pointer hover:bg-accent transition-colors"
                                        style={firstTeamColor ? { borderColor: firstTeamColor, color: firstTeamColor } : undefined}
                                        onClick={() => openWorkersModal(group, shift.shift_key, dayKey)}
                                      >
                                        <Users className="h-2.5 w-2.5 mr-0.5 shrink-0 opacity-70" />
                                        <span className="truncate">{getGroupDisplayName(group.parentLetter)}</span>
                                        <span className="text-[8px] ml-0.5 opacity-70 shrink-0">({totalWorkers})</span>
                                      </Badge>
                                    );
                                  } else {
                                    const team = group.team!;
                                    const color = getTeamColor(team.id);
                                    const customTime = getCellCustomTime(team.id, dayKey);
                                    const cellData = localSchedule?.configuration?.[dayKey]?.[team.id] as any;
                                    const partialCount = cellData?.partial_count;
                                    return (
                                      <Badge
                                        key={team.id}
                                        variant="outline"
                                        className={`text-[10px] px-1.5 py-0.5 cursor-pointer hover:bg-accent transition-colors ${customTime ? "ring-1 ring-amber-500/50" : ""}`}
                                        style={color ? { borderColor: color, color } : undefined}
                                        onClick={() => openWorkersModal(group, shift.shift_key, dayKey)}
                                      >
                                        <span className="truncate">
                                          {partialCount ? `${partialCount} de ` : ''}{getTeamDisplayName(team)}
                                        </span>
                                        {customTime && <Clock className="h-2 w-2 ml-0.5 text-amber-500" />}
                                      </Badge>
                                    );
                                  }
                                })}
                              </div>

                              {/* Special times */}
                              {(() => {
                                if (shift.is_rest || teams.length === 0) return null;
                                const scheduleToUse = localSchedule || schedule;
                                if (!scheduleToUse?.configuration) return null;
                                const specialTimes = new Set<string>();
                                for (const team of teams) {
                                  const cell = scheduleToUse.configuration[dayKey]?.[team.id];
                                  if (!cell) continue;
                                  const cellStart = cell.start ? formatTime(cell.start) : null;
                                  const cellEnd = cell.end ? formatTime(cell.end) : null;
                                  const shiftStart = formatTime(shift.start_time);
                                  const shiftEnd = formatTime(shift.end_time);
                                  if ((cellStart && cellStart !== shiftStart) || (cellEnd && cellEnd !== shiftEnd)) {
                                    specialTimes.add(`${cellStart || shiftStart || "inicio"} - ${cellEnd || shiftEnd || "fin"}`);
                                  }
                                }
                                if (specialTimes.size === 0) return null;
                                return (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {Array.from(specialTimes).map((timeStr, i) => (
                                      <span key={i} className="text-[9px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-0.5">
                                        <Clock className="h-2.5 w-2.5" />
                                        {timeStr}
                                      </span>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Workers modal */}
      <Dialog open={!!workersModalData} onOpenChange={(o) => !o && setWorkersModalData(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              {workersModalData?.title}
              <span className="text-muted-foreground font-normal text-sm">
                ({workersModalData?.workers.length} trabajador{workersModalData?.workers.length !== 1 ? "es" : ""})
              </span>
            </DialogTitle>
          </DialogHeader>

          {/* Time editing section for this group - only show when editable */}
          {canEdit && workersModalData?.dayKey && workersModalData?.teams && (
            <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4 text-amber-500" />
                Editar horario del grupo
                <span className="text-xs text-muted-foreground font-normal">
                  ({DAY_NAMES_FULL[parseInt(workersModalData.dayKey, 10)]})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Inicio</Label>
                  <Input
                    type="time"
                    value={groupTimeEditStart}
                    onChange={(e) => setGroupTimeEditStart(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fin</Label>
                  <Input
                    type="time"
                    value={groupTimeEditEnd}
                    onChange={(e) => setGroupTimeEditEnd(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
              <Button
                size="sm"
                className="w-full"
                onClick={saveGroupTimeEdit}
              >
                <Timer className="h-4 w-4 mr-1.5" />
                Aplicar a {workersModalData.teams.length} equipo{workersModalData.teams.length !== 1 ? "s" : ""}
              </Button>
            </div>
          )}

          {workersModalData?.showTeamBreakdown && workersModalData.teams ? (
            // Show breakdown by subgroup
            <div className="space-y-4 max-h-[50vh] overflow-y-auto -mx-2 px-2">
              {workersModalData.teams.map((team) => {
                const teamWorkers = workersByTeam[team.id] || [];
                const teamColor = getTeamColor(team.id);
                
                return (
                  <div key={team.id} className="space-y-1">
                    <div className="flex items-center gap-2 pb-1 border-b border-border/30">
                      {teamColor && (
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: teamColor }} />
                      )}
                      <span className="text-sm font-medium">{getTeamDisplayName(team)}</span>
                      <span className="text-xs text-muted-foreground">({teamWorkers.length})</span>
                    </div>
                    {teamWorkers.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-1 pl-4">Sin trabajadores</p>
                    ) : (
                      <div className="pl-4">
                        {teamWorkers.map((w) => {
                          const workerGroup = w.work_group_id ? workGroups.find((g) => g.id === w.work_group_id) : null;
                          return (
                            <a
                              key={w.id}
                              href={getSalixTimeControlUrl(w.worker_number)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 transition-colors group"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {workerGroup?.color && (
                                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: workerGroup.color }} />
                                )}
                                <span className="truncate">{w.name}</span>
                              </div>
                              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            // Simple list of workers
            workersModalData?.workers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Sin trabajadores asignados</p>
            ) : (
              <div className="space-y-1 max-h-[40vh] overflow-y-auto -mx-2 px-2">
                {workersModalData?.workers.map((w) => {
                  const workerGroup = w.work_group_id ? workGroups.find((g) => g.id === w.work_group_id) : null;
                  return (
                    <a
                      key={w.id}
                      href={getSalixTimeControlUrl(w.worker_number)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 transition-colors group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {workerGroup?.color && (
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: workerGroup.color }} />
                        )}
                        <span className="truncate">{w.name}</span>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </a>
                  );
                })}
              </div>
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
